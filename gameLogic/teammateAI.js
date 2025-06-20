import { generateUniqueId } from '../utils/idGenerator.js';
import { EntityType } from '../types.js';
import { TEAMMATE_DETECTION_RADIUS, TEAMMATE_SHOOT_RANGE, TEAMMATE_SHOOT_COOLDOWN_MS, TEAMMATE_BULLET_SPEED, TEAMMATE_BULLET_DAMAGE_MIN, TEAMMATE_BULLET_DAMAGE_MAX, TEAMMATE_BULLET_COLOR, TEAMMATE_BULLET_MAX_TRAVEL_DISTANCE, BULLET_SIZE, AI_TARGET_ARRIVAL_THRESHOLD, TEAMMATE_FORMATION_POSITION_TOLERANCE, ALL_TEAMMATE_FORMATION_OFFSETS, GAME_LOOP_INTERVAL, STUCK_TIMEOUT_TICKS, TEAMMATE_SIZE, AI_PATIENCE_THRESHOLD, AI_EVASIVE_MANEUVER_COOLDOWN_MS, AI_EVASIVE_DODGE_CHANCE, AI_EVASIVE_STRAFE_DISTANCE, AI_UNDER_FIRE_DURATION_TICKS, GUNSHOT_VOLUME, PLAYER_STATIONARY_THRESHOLD_TICKS, PLAYER_MOVEMENT_HISTORY_MIN_FOR_SMOOTHING, TEAMMATE_FORMATION_TARGET_LERP_FACTOR } from '../constants.js';
import { hasLineOfSight, isPositionWalkable } from './mapGenerator.js';
import { processAIMovement, triggerAIEvasiveManeuver, predictTargetPosition } from './aiUtils.js';
import { getAverageMovementVector } from '../utils/vectorUtils.js';
import { playTeammateShootSound } from '../utils/audioUtils.js';

const getFormationTargetPosition = (
    teammate,
    formationBasePosition,
    playerOrientationVector, 
    activeTeammatesInSquad,
    formationShape,
    TILE_SIZE
) => {
    const formationOffsets = ALL_TEAMMATE_FORMATION_OFFSETS[formationShape];
    const teammateIndex = activeTeammatesInSquad.findIndex(t => t.id === teammate.id);

    const baseOffset = (teammateIndex !== -1 && formationOffsets[teammateIndex % formationOffsets.length])
        ? formationOffsets[teammateIndex % formationOffsets.length]
        : { x: (activeTeammatesInSquad.length + 1) * TILE_SIZE * -1.5, y: 0 };

    const pvx = playerOrientationVector.x;
    const pvy = playerOrientationVector.y;

    const rotatedOffsetX = baseOffset.x * pvx - baseOffset.y * pvy;
    const rotatedOffsetY = baseOffset.x * pvy + baseOffset.y * pvx;

    return {
        x: formationBasePosition.x + rotatedOffsetX - teammate.width / 2,
        y: formationBasePosition.y + rotatedOffsetY - teammate.height / 2,
    };
};


const update = (
    teammates,
    player, 
    playerOriginalPositionThisTick, 
    enemies,
    map,
    allCharacters,
    newGameTime,
    TILE_SIZE,
    currentFormationShape,
    gameTime
) => {
    const newBullets = [];
    const isPlayerConsideredStationary = player.stationaryTicks >= PLAYER_STATIONARY_THRESHOLD_TICKS;
    const activeTeammatesForFormation = teammates.filter(t => t.health > 0);
    const playerAvgMovementForOrientation = getAverageMovementVector(player.movementVectorHistory, player.lastMovementVector, PLAYER_MOVEMENT_HISTORY_MIN_FOR_SMOOTHING);
    const playerCenter = { x: player.x + player.width / 2, y: player.y + player.height / 2 };
    const mapPixelWidth = map.widthTiles * TILE_SIZE;
    const mapPixelHeight = map.heightTiles * TILE_SIZE;


    const updatedTeammates = teammates.map(tm => {
        if (tm.health <= 0) return tm;
        let teammate = { ...tm }; 
        const originalPosForTick = {x: tm.x, y: tm.y};

        // --- AI COLLISION AVOIDANCE LOGIC ---
        // Only apply if not performing evasive maneuver
        if (!teammate.isPerformingEvasiveManeuver) {
            // Avoid other teammates (repulsion)
            for (const other of teammates) {
                if (other.id === teammate.id || other.health <= 0) continue;
                const dx = teammate.x - other.x;
                const dy = teammate.y - other.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const minDist = TEAMMATE_SIZE * 0.9; // Slightly less than size to allow some overlap
                if (dist > 0 && dist < minDist) {
                    // Repulsion force: push away from other teammate
                    const pushStrength = 0.25 * (minDist - dist) / minDist; // Scaled repulsion
                    teammate.x += (dx / dist) * pushStrength * TEAMMATE_SIZE;
                    teammate.y += (dy / dist) * pushStrength * TEAMMATE_SIZE;
                }
            }
            // Avoid being inside walls/objects (nudge out if not walkable)
            const walkableResult = isPositionWalkable({ x: teammate.x, y: teammate.y }, teammate.width, teammate.height, map, teammate.id, allCharacters.filter(c => c.id !== teammate.id));
            if (!walkableResult.isWalkable) {
                // Try to nudge in a random direction until walkable (up to 8 tries)
                let nudged = false;
                for (let attempt = 0; attempt < 8; attempt++) {
                    const angle = Math.random() * 2 * Math.PI;
                    const nudgeDist = TEAMMATE_SIZE * 0.5;
                    const nx = teammate.x + Math.cos(angle) * nudgeDist;
                    const ny = teammate.y + Math.sin(angle) * nudgeDist;
                    if (isPositionWalkable({ x: nx, y: ny }, teammate.width, teammate.height, map, teammate.id, allCharacters.filter(c => c.id !== teammate.id)).isWalkable) {
                        teammate.x = nx;
                        teammate.y = ny;
                        nudged = true;
                        break;
                    }
                }
                // If still not walkable, leave as is (failsafe: will be handled by stuck logic elsewhere)
            }
        }

        if (teammate.isPerformingEvasiveManeuver && teammate.evasiveManeuverTarget) {
            const { newX, newY, moved: evasionMoved } = processAIMovement(teammate, teammate.evasiveManeuverTarget, map, allCharacters, newGameTime, TILE_SIZE);
            teammate.x = newX; teammate.y = newY;
            if (evasionMoved) teammate.lastMovedTime = newGameTime;

            const distToEvasionTarget = Math.sqrt(Math.pow(teammate.x - teammate.evasiveManeuverTarget.x, 2) + Math.pow(teammate.y - teammate.evasiveManeuverTarget.y, 2));
            if (distToEvasionTarget < AI_TARGET_ARRIVAL_THRESHOLD * 2 || newGameTime > teammate.lastEvasiveManeuverTime + AI_UNDER_FIRE_DURATION_TICKS * 2) {
                teammate.isPerformingEvasiveManeuver = false;
                teammate.evasiveManeuverTarget = null;
                if (!teammate.isHoldingPosition) {
                    teammate.targetPosition = teammate.preEvasionTarget;
                    teammate.waypointQueue = teammate.preEvasionWaypointQueue || [];
                    teammate.commandedMoveTime = teammate.preEvasionCommandedMoveTime;
                }
                teammate.preEvasionTarget = null;
                teammate.preEvasionWaypointQueue = null;
                teammate.preEvasionCommandedMoveTime = null;
                teammate.currentPath = null;
                teammate.effectiveFormationTarget = null;
            }
            return teammate; 
        }
        
        if (teammate.isHoldingPosition && teammate.commandedMoveTime !== null && teammate.holdPositionTarget) {
            const distToHoldTarget = Math.sqrt(Math.pow(teammate.x - teammate.holdPositionTarget.x, 2) + Math.pow(teammate.y - teammate.holdPositionTarget.y, 2));
            if (distToHoldTarget <= AI_TARGET_ARRIVAL_THRESHOLD) {
                teammate.commandedMoveTime = null; 
                teammate.currentPath = null;
                teammate.currentPathIndex = 0;
            }
        }

        let closestVisibleEnemy = null;
        let minDistanceToEnemy = teammate.detectionRange;

        for (const enemy of enemies) {
            if (enemy.health <= 0) continue;
            const distToEnemy = Math.sqrt(Math.pow(teammate.x - enemy.x, 2) + Math.pow(teammate.y - enemy.y, 2));
            if (distToEnemy < minDistanceToEnemy) {
                if (hasLineOfSight({ x: teammate.x + teammate.width / 2, y: teammate.y + teammate.height / 2 }, { x: enemy.x + enemy.width / 2, y: enemy.y + enemy.height / 2 }, map)) {
                    minDistanceToEnemy = distToEnemy;
                    closestVisibleEnemy = enemy;
                }
            }
        }
        teammate.targetEntityId = closestVisibleEnemy ? closestVisibleEnemy.id : null;

        if (closestVisibleEnemy && teammate.targetEntityId === closestVisibleEnemy.id) {
            const cooldownInTicks = TEAMMATE_SHOOT_COOLDOWN_MS / GAME_LOOP_INTERVAL;
            if (minDistanceToEnemy <= teammate.shootRange && newGameTime - teammate.lastShotTime > cooldownInTicks) {
                
                const shooterCenterPos = { x: teammate.x + teammate.width / 2, y: teammate.y + teammate.height / 2 };
                const predictedEnemyPos = predictTargetPosition(shooterCenterPos, closestVisibleEnemy, TEAMMATE_BULLET_SPEED);

                const dxToPredicted = predictedEnemyPos.x - shooterCenterPos.x;
                const dyToPredicted = predictedEnemyPos.y - shooterCenterPos.y;
                const distToPredicted = Math.sqrt(dxToPredicted * dxToPredicted + dyToPredicted * dyToPredicted);

                const bulletDx = distToPredicted > 0 ? (dxToPredicted / distToPredicted) * TEAMMATE_BULLET_SPEED : 0;
                const bulletDy = distToPredicted > 0 ? (dyToPredicted / distToPredicted) * TEAMMATE_BULLET_SPEED : 0;
                  // Calculate random damage within teammate's damage range
                const randomDamage = Math.floor(Math.random() * (TEAMMATE_BULLET_DAMAGE_MAX - TEAMMATE_BULLET_DAMAGE_MIN + 1)) + TEAMMATE_BULLET_DAMAGE_MIN;
                
                newBullets.push({
                    id: generateUniqueId(`bullet-tm-${teammate.id}`), type: EntityType.BULLET,
                    x: shooterCenterPos.x - BULLET_SIZE / 2, y: shooterCenterPos.y - BULLET_SIZE / 2,
                    width: BULLET_SIZE, height: BULLET_SIZE, color: TEAMMATE_BULLET_COLOR,
                    dx: bulletDx, dy: bulletDy, ownerId: teammate.id, damage: randomDamage,
                    maxTravelDistance: TEAMMATE_BULLET_MAX_TRAVEL_DISTANCE, traveledDistance: 0,
                });
                teammate.lastShotTime = newGameTime;
                playTeammateShootSound(GUNSHOT_VOLUME * 0.8);
            }
        }
        
        let finalTargetPos = null;

        if (teammate.isHoldingPosition && teammate.holdPositionTarget) {
            teammate.effectiveFormationTarget = null;
            const distToHoldSpot = Math.sqrt(Math.pow(teammate.x - teammate.holdPositionTarget.x, 2) + Math.pow(teammate.y - teammate.holdPositionTarget.y, 2));
            if (distToHoldSpot > AI_TARGET_ARRIVAL_THRESHOLD) {
                finalTargetPos = teammate.holdPositionTarget;
            } else {
                finalTargetPos = null; 
            }
        } else if (teammate.waypointQueue.length > 0) { 
            teammate.effectiveFormationTarget = null;
            finalTargetPos = teammate.waypointQueue[0];
            const distToWaypoint = Math.sqrt(Math.pow(teammate.x - finalTargetPos.x, 2) + Math.pow(teammate.y - finalTargetPos.y, 2));
            if (distToWaypoint <= AI_TARGET_ARRIVAL_THRESHOLD) {
                const completedWaypoint = teammate.waypointQueue.shift();
                teammate.currentPath = null;
                teammate.currentPathIndex = 0;
                if (teammate.waypointQueue.length > 0) {
                    finalTargetPos = teammate.waypointQueue[0];
                } else { 
                    if (completedWaypoint) {
                        teammate.isHoldingPosition = true;
                        teammate.holdPositionTarget = completedWaypoint;
                        finalTargetPos = completedWaypoint; 
                    } else {
                        finalTargetPos = null; 
                    }
                    teammate.commandedMoveTime = null; 
                }
            }
        } else if (teammate.commandedMoveTime !== null && teammate.targetPosition) { 
            teammate.effectiveFormationTarget = null;
            finalTargetPos = teammate.targetPosition;
        } else {
            const idealFormationSpot = getFormationTargetPosition(
                teammate,
                playerCenter,
                playerAvgMovementForOrientation,
                activeTeammatesForFormation,
                currentFormationShape,
                TILE_SIZE
            );

            if (teammate.effectiveFormationTarget === null) {
                teammate.effectiveFormationTarget = { x: teammate.x, y: teammate.y };
            }
            teammate.effectiveFormationTarget.x += (idealFormationSpot.x - teammate.effectiveFormationTarget.x) * TEAMMATE_FORMATION_TARGET_LERP_FACTOR;
            teammate.effectiveFormationTarget.y += (idealFormationSpot.y - teammate.effectiveFormationTarget.y) * TEAMMATE_FORMATION_TARGET_LERP_FACTOR;
            
            teammate.effectiveFormationTarget.x = Math.max(0, Math.min(teammate.effectiveFormationTarget.x, mapPixelWidth - teammate.width));
            teammate.effectiveFormationTarget.y = Math.max(0, Math.min(teammate.effectiveFormationTarget.y, mapPixelHeight - teammate.height));
            
            const smoothedFormationTarget = teammate.effectiveFormationTarget;

            const distToSmoothedTarget = Math.sqrt(Math.pow(teammate.x - smoothedFormationTarget.x, 2) + Math.pow(teammate.y - smoothedFormationTarget.y, 2));
            if (distToSmoothedTarget > TEAMMATE_FORMATION_POSITION_TOLERANCE) {
                finalTargetPos = smoothedFormationTarget;
            } else {
                finalTargetPos = null; 
            }
        }

        teammate.targetPosition = finalTargetPos;

        let movementResult = { newX: teammate.x, newY: teammate.y, moved: false, blockedByCharacterId: null };
        if (finalTargetPos) {
            movementResult = processAIMovement(teammate, finalTargetPos, map, allCharacters, newGameTime, TILE_SIZE);
            teammate.x = movementResult.newX;
            teammate.y = movementResult.newY;
        } 
        
        if (movementResult.moved) { 
            if (finalTargetPos && teammate.commandedMoveTime !== null && !teammate.isHoldingPosition && teammate.waypointQueue.length === 0) {
                const distToFinalAfterMovement = Math.sqrt(Math.pow(teammate.x - finalTargetPos.x, 2) + Math.pow(teammate.y - finalTargetPos.y, 2));
                if (distToFinalAfterMovement <= AI_TARGET_ARRIVAL_THRESHOLD) {
                    teammate.commandedMoveTime = null; 
                    teammate.currentPath = null;
                    teammate.currentPathIndex = 0;
                }
            }
            if (Math.abs(teammate.x - originalPosForTick.x) > 0.1 || Math.abs(teammate.y - originalPosForTick.y) > 0.1) {
                teammate.stuckCounter = 0;
                teammate.lastMovedTime = newGameTime;
            } else if (!finalTargetPos) {
                 teammate.stuckCounter = 0;
            } else {
                 teammate.stuckCounter++;
            }
        } else if (finalTargetPos) {
            teammate.stuckCounter++;
            const { blockedByCharacterId } = movementResult;

            if (blockedByCharacterId) {
                const blocker = allCharacters.find(c => c.id === blockedByCharacterId && c.type !== EntityType.INTEL_ITEM);
                if (blocker && blocker.health > 0 && (blocker.type === EntityType.TEAMMATE || blocker.type === EntityType.PLAYER)) {
                    if (teammate.stuckCounter >= AI_PATIENCE_THRESHOLD / 3 && 
                        teammate.stuckCounter < STUCK_TIMEOUT_TICKS &&
                        !teammate.isPerformingEvasiveManeuver) {
                        // If blocked by another teammate or player, just stay in place and wait
                        teammate.currentPath = null;
                        teammate.currentPathIndex = 0;
                    }
                }
            }

            if (teammate.stuckCounter >= STUCK_TIMEOUT_TICKS) {
                teammate.stuckCounter = 0;
                teammate.currentPath = null;
                teammate.currentPathIndex = 0;
                teammate.effectiveFormationTarget = null;

                if (teammate.isPerformingEvasiveManeuver) {
                    teammate.isPerformingEvasiveManeuver = false; teammate.evasiveManeuverTarget = null;
                } else if (teammate.isHoldingPosition) {
                    // If stuck while holding, just clear path
                } else if (!teammate.commandedMoveTime && teammate.waypointQueue.length === 0 && !teammate.targetEntityId) {
                    // In formation mode, just clear path
                } else {
                    if (teammate.waypointQueue.length > 0) { /* Potentially clear head of queue if stuck on it */ }
                    else if (teammate.targetEntityId) { /* No easy fix other than path clear */ }
                    else { teammate.targetPosition = null; teammate.commandedMoveTime = null;}
                }
            }
        } else { 
             teammate.stuckCounter = 0;
        }
        return teammate;
    });

    return { updatedTeammates, newBullets };
};

const handleRecall = (
    teammates,
    player,
    currentFormationShape,
    gameTime,
    TILE_SIZE
) => {
    const activeTeammatesInSquad = teammates.filter(t => t.health > 0);
    const playerAvgMovementForOrientation = getAverageMovementVector(player.movementVectorHistory, player.lastMovementVector, PLAYER_MOVEMENT_HISTORY_MIN_FOR_SMOOTHING);
    const playerCenter = { x: player.x + player.width / 2, y: player.y + player.height / 2 };

    return teammates.map(tm => {
        if (tm.health > 0) {
            const recallTargetPos = getFormationTargetPosition(
                tm, 
                playerCenter, 
                playerAvgMovementForOrientation,
                activeTeammatesInSquad, 
                currentFormationShape, 
                TILE_SIZE
            );
            return {
                ...tm,
                targetPosition: recallTargetPos, 
                targetEntityId: null,
                commandedMoveTime: gameTime, 
                currentPath: null,
                currentPathIndex: 0,
                waypointQueue: [], 
                isHoldingPosition: false, 
                holdPositionTarget: null, 
                isPerformingEvasiveManeuver: false, 
                evasiveManeuverTarget: null,
                effectiveFormationTarget: null,
            };
        }
        return tm;
    });
};

const handleMoveOrder = (
    teammates,
    selectedTeammateIds,
    targetPosition,
    isShiftPressed,
    currentFormationShape,
    player,
    gameTime,
    TILE_SIZE
) => {
    const selectedTeammates = teammates.filter(tm => selectedTeammateIds.includes(tm.id) && tm.health > 0);
    if (selectedTeammates.length === 0) return teammates;

    const playerAvgMovementForOrientation = getAverageMovementVector(player.movementVectorHistory, player.lastMovementVector, PLAYER_MOVEMENT_HISTORY_MIN_FOR_SMOOTHING);

    const updatedTeammates = teammates.map(tm => {
        if (!selectedTeammateIds.includes(tm.id)) {
            return tm;
        }

        const newTm = { ...tm };

        const formationTargetPos = getFormationTargetPosition(
            newTm,
            targetPosition,
            playerAvgMovementForOrientation,
            selectedTeammates,
            currentFormationShape,
            TILE_SIZE
        );

        if (isShiftPressed) {
            newTm.waypointQueue = [...newTm.waypointQueue, formationTargetPos];
            if (newTm.waypointQueue.length === 1) { 
                newTm.targetPosition = formationTargetPos;
            }
            newTm.isHoldingPosition = false;
            newTm.holdPositionTarget = null;
        } else {
            newTm.targetPosition = formationTargetPos;
            newTm.isHoldingPosition = true;
            newTm.holdPositionTarget = formationTargetPos;
            newTm.waypointQueue = [];
        }

        newTm.targetEntityId = null;
        newTm.commandedMoveTime = gameTime;
        newTm.currentPath = null;
        newTm.currentPathIndex = 0;
        newTm.effectiveFormationTarget = null;

        return newTm;
    });
    return updatedTeammates;
};

const handleDefendOrder = (
    teammates,
    defendPosition,
    radiusTiles,
    map,
    gameTime,
    TILE_SIZE
) => {
    // Filter out dead teammates first
    const activeTeammates = teammates.filter(tm => tm.health > 0);
    
    const findWalkablePosition = (baseX, baseY, searchRadius = 2) => {
        // First check the exact position
        const exactPosResult = isPositionWalkable(
            { x: baseX, y: baseY }, 
            TEAMMATE_SIZE, 
            TEAMMATE_SIZE, 
            map,
            undefined, // characterIdToIgnore
            [] // empty array for allCharacters since we only care about terrain
        );
        if (exactPosResult.isWalkable) {
            return { x: baseX, y: baseY };
        }
        // If not walkable, spiral outward looking for a walkable spot
        for (let r = 1; r <= searchRadius * TILE_SIZE; r++) {
            for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
                const testX = baseX + Math.cos(angle) * r;
                const testY = baseY + Math.sin(angle) * r;
                const testResult = isPositionWalkable(
                    { x: testX, y: testY }, 
                    TEAMMATE_SIZE, 
                    TEAMMATE_SIZE, 
                    map,
                    undefined, // characterIdToIgnore
                    [] // empty array for allCharacters since we only care about terrain
                );
                if (testResult.isWalkable) {
                    return { x: testX, y: testY };
                }
            }
        }
        // If no walkable position found, return the original position and let the AI pathfinding handle it
        return { x: baseX, y: baseY };
    };

    const updatedTeammates = teammates.map(tm => {
        if (tm.health > 0) {
            // Calculate the index of this teammate among active teammates
            const activeIndex = activeTeammates.findIndex(t => t.id === tm.id);
            // Calculate the angle for this teammate to be evenly spaced around the circle
            const angle = (activeIndex * (2 * Math.PI)) / activeTeammates.length;
            const dist = radiusTiles * TILE_SIZE;
            const initialX = defendPosition.x + Math.cos(angle) * dist;
            const initialY = defendPosition.y + Math.sin(angle) * dist;
            const defendTargetPos = findWalkablePosition(initialX, initialY, radiusTiles);
            return {
                ...tm,
                targetPosition: defendTargetPos, 
                targetEntityId: null,
                commandedMoveTime: gameTime, 
                currentPath: null,
                currentPathIndex: 0,
                waypointQueue: [], 
                isHoldingPosition: false, 
                holdPositionTarget: null, 
                isPerformingEvasiveManeuver: false, 
                evasiveManeuverTarget: null,
                effectiveFormationTarget: null,
            };
        }
        return tm;
    });

    return updatedTeammates;
};

// Rename 'update' to 'updateTeammatesAI' for export consistency
const updateTeammatesAI = update;

export {
    updateTeammatesAI,
    handleRecall,
    handleMoveOrder,
    handleDefendOrder,
};
