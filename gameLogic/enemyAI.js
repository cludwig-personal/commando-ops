import { generateUniqueId } from '../utils/idGenerator.js';
import { EntityType, EnemyVariant, TileType, FormationShape } from '../types.js';
import { 
    ENEMY_DETECTION_RADIUS, ENEMY_SHOOT_RANGE, ENEMY_SOLDIER_SHOOT_COOLDOWN_MS, 
    ENEMY_BULLET_SPEED, ENEMY_BULLET_DAMAGE_MIN, ENEMY_BULLET_DAMAGE_MAX, ENEMY_BULLET_COLOR,
    ENEMY_SQUAD_PATROL_IDLE_TIME_MS, ENEMY_SQUAD_PATROL_MAX_DISTANCE, ENEMY_COMBAT_STRAFE_DISTANCE, 
    BULLET_SIZE, ENEMY_SOLDIER_BULLET_MAX_TRAVEL_DISTANCE, ENEMY_GRENADIER_BULLET_MAX_TRAVEL_DISTANCE,
    ENEMY_BOSS_BULLET_MAX_TRAVEL_DISTANCE, GAME_LOOP_INTERVAL, STUCK_TIMEOUT_TICKS,
    STUCK_RECOVERY_PATROL_RADIUS, AI_TARGET_ARRIVAL_THRESHOLD, RESPAWN_DELAY_TICKS, 
    ENEMY_SIZE, ENEMY_COLORS, ENEMY_HEALTH_SOLDIER, ENEMY_HEALTH_GRENADIER, ENEMY_SPEED, 
    ENEMY_SIGHTED_SOUND_COOLDOWN_MS, ENEMY_SIGHTED_SOUND_CHANCE, BASE_SOUND_NOTE_ENEMY_SIGHTED, 
    AI_EVASIVE_MANEUVER_COOLDOWN_MS, AI_EVASIVE_DODGE_CHANCE, AI_EVASIVE_STRAFE_DISTANCE, 
    AI_UNDER_FIRE_DURATION_TICKS, GUNSHOT_VOLUME, ENEMY_HEAVY_GUNSHOT_VOLUME, VOICE_SOUND_VOLUME,    TEAMMATE_DETECTION_RADIUS, ENEMY_GRENADIER_SHOOT_COOLDOWN_MS, ENEMY_GRENADIER_BULLET_SPEED, 
    ENEMY_GRENADIER_BULLET_DAMAGE_MIN, ENEMY_GRENADIER_BULLET_DAMAGE_MAX, ENEMY_GRENADIER_SHOOT_RANGE, 
    ENEMY_BOSS_SHOOT_COOLDOWN_MS, ENEMY_BOSS_BULLET_DAMAGE_MIN, ENEMY_BOSS_BULLET_DAMAGE_MAX, 
    ENEMY_HV_BOSS_BULLET_DAMAGE_MIN, ENEMY_HV_BOSS_BULLET_DAMAGE_MAX,
    ENEMY_SPEED_MULTIPLIER_SOLDIER, ENEMY_SPEED_MULTIPLIER_GRENADIER, ENEMY_SPEED_MULTIPLIER_BOSS, ENEMY_SPEED_MULTIPLIER_HV_BOSS,
    MAX_ENEMY_SQUADS, ENEMY_SQUAD_COMPOSITION, ENEMY_SQUAD_FORMATION_SHAPES,
    ALL_ENEMY_SQUAD_FORMATION_OFFSETS, SQUAD_FORMATION_POSITION_TOLERANCE,
    SQUAD_REGROUP_MAX_SPREAD_DISTANCE, SQUAD_REGROUP_COHESION_RADIUS, SQUAD_REGROUP_CHECK_INTERVAL_TICKS,
    SQUAD_REGROUP_DURATION_MAX_TICKS, SQUAD_POST_COMBAT_REGROUP_GRACE_PERIOD_TICKS, MAX_GENERIC_BOSSES
} from '../constants.js';
import { hasLineOfSight, isPositionWalkable } from './mapGenerator.js';
import { processAIMovement, triggerAIEvasiveManeuver, predictTargetPosition } from './aiUtils.js';
import { playEnemySoldierShootSound, playEnemyHeavyShootSound, playEnemySightedAlertSound } from '../utils/audioUtils.js';
import { spawnSingleEnemy } from '../gameLogic/initialization.js'; 
import { getSectors } from './sectorUtils.js';

function getEnemyFormationPosition(
    enemyMember, 
    squadFocalPoint, 
    squadOrientationVector,
    assignedSlotIndex, 
    formationShape,
    TILE_SIZE
) {
    const formationOffsets = ALL_ENEMY_SQUAD_FORMATION_OFFSETS[formationShape];
    const baseOffset = formationOffsets[assignedSlotIndex % formationOffsets.length];

    const ovx = squadOrientationVector.x;
    const ovy = squadOrientationVector.y;

    const rotatedOffsetX = baseOffset.x * ovx - baseOffset.y * ovy;
    const rotatedOffsetY = baseOffset.x * ovy + baseOffset.y * ovx;

    return {
        x: squadFocalPoint.x + rotatedOffsetX - enemyMember.width / 2,
        y: squadFocalPoint.y + rotatedOffsetY - enemyMember.height / 2,
    };
}


function spawnNewEnemySquad(currentEnemies, currentSquads, map, playerAndTeammates, TILE_SIZE, gameTime) {
    console.log(`[enemyAI.js] Attempting to spawn new enemy squad. Current squads: ${currentSquads.length}`);
    const newSquadId = generateUniqueId(`squad-respawn-${gameTime}`);
    
    let charactersToAvoidForSpawn = [...playerAndTeammates, ...currentEnemies];
    const playerActualPosX = playerAndTeammates[0].x; 
    const playerActualPosY = playerAndTeammates[0].y;
    const minSpawnDistFromPlayerForSquad = map.tileSize * 25; 
    const squadSpawnAttempts = 15;

    for (let attempt = 0; attempt < squadSpawnAttempts; attempt++) {
        const randTileXAnchor = Math.floor(Math.random() * (map.widthTiles - 6)) + 3;
        const randTileYAnchor = Math.floor(Math.random() * (map.heightTiles - 6)) + 3;
        const squadAnchorPoint = { 
            x: randTileXAnchor * map.tileSize + map.tileSize / 2, 
            y: randTileYAnchor * map.tileSize + map.tileSize / 2 
        };

        const distToPlayer = Math.sqrt(Math.pow(squadAnchorPoint.x - playerActualPosX, 2) + Math.pow(squadAnchorPoint.y - playerActualPosY, 2));
        if (distToPlayer < minSpawnDistFromPlayerForSquad) continue;

        const formationShape = ENEMY_SQUAD_FORMATION_SHAPES[Math.floor(Math.random() * ENEMY_SQUAD_FORMATION_SHAPES.length)];
        const testOrientations = [{x:0,y:1},{x:0,y:-1},{x:1,y:0},{x:-1,y:0}];
        const orientationVector = testOrientations[Math.floor(Math.random() * testOrientations.length)];

        const memberPositionsToCreate = [];
        const tempPlacedMembersForThisSquadAttempt = [];
        let allMembersPlaceableInFormation = true;

        const squadCompositionWithSlots = [
            { variant: EnemyVariant.GRENADIER, slotIndex: 0, width: ENEMY_SIZE, height: ENEMY_SIZE },
            { variant: EnemyVariant.SOLDIER, slotIndex: 1, width: ENEMY_SIZE, height: ENEMY_SIZE },
            { variant: EnemyVariant.SOLDIER, slotIndex: 2, width: ENEMY_SIZE, height: ENEMY_SIZE },
        ];

        for (const memberDef of squadCompositionWithSlots) {
            const memberPos = getEnemyFormationPosition(memberDef, squadAnchorPoint, orientationVector, memberDef.slotIndex, formationShape, TILE_SIZE);
            const tempEnemyId = `temp-respawn-squad-${newSquadId}-member-${memberDef.variant}-${memberDef.slotIndex}`;
            const obstaclesForThisMember = [...charactersToAvoidForSpawn, ...tempPlacedMembersForThisSquadAttempt];

            if (isPositionWalkable(memberPos, memberDef.width, memberDef.height, map, tempEnemyId, obstaclesForThisMember).isWalkable) {
                memberPositionsToCreate.push({ x: memberPos.x, y: memberPos.y, variant: memberDef.variant });
                tempPlacedMembersForThisSquadAttempt.push({ x: memberPos.x, y: memberPos.y, width: memberDef.width, height: memberDef.height, id: tempEnemyId });
            } else {
                allMembersPlaceableInFormation = false;
                break;
            }
        }

        if (allMembersPlaceableInFormation) {
            const newSquadMembers = [];
            const newMemberIds = [];
            for (const posToCreate of memberPositionsToCreate) {
                const healthMap = {
                    [EnemyVariant.SOLDIER]: ENEMY_HEALTH_SOLDIER,
                    [EnemyVariant.GRENADIER]: ENEMY_HEALTH_GRENADIER,
                };
                const speedMultiplierMap = {
                    [EnemyVariant.SOLDIER]: ENEMY_SPEED_MULTIPLIER_SOLDIER,
                    [EnemyVariant.GRENADIER]: ENEMY_SPEED_MULTIPLIER_GRENADIER,
                };
                let shootRangeForMember;
                switch(posToCreate.variant) {
                    case EnemyVariant.SOLDIER: shootRangeForMember = ENEMY_SHOOT_RANGE; break;
                    case EnemyVariant.GRENADIER: shootRangeForMember = ENEMY_GRENADIER_SHOOT_RANGE; break;
                    default: shootRangeForMember = ENEMY_SHOOT_RANGE;
                }

                const newMember = {
                    id: generateUniqueId(`enemy-${posToCreate.variant.toLowerCase()}-${newSquadId}`),
                    type: EntityType.ENEMY_SOLDIER,
                    x: posToCreate.x, y: posToCreate.y, width: ENEMY_SIZE, height: ENEMY_SIZE,
                    color: ENEMY_COLORS[posToCreate.variant],
                    health: healthMap[posToCreate.variant], maxHealth: healthMap[posToCreate.variant],
                    speed: ENEMY_SPEED * speedMultiplierMap[posToCreate.variant],
                    variant: posToCreate.variant,
                    targetEntityId: null, lastShotTime: 0,
                    detectionRange: ENEMY_DETECTION_RADIUS * (posToCreate.variant === EnemyVariant.GRENADIER ? 1.1 : 1),
                    shootRange: shootRangeForMember,
                    targetPosition: null, patrolTargetPosition: null, lastPatrolActivityTime: 0,
                    lastMovedTime: 0, stuckCounter: 0, isHVT: false, squadId: newSquadId,
                    currentPath: null, currentPathIndex: 0,
                    lastEvasiveManeuverTime: 0, evasiveManeuverTarget: null, isPerformingEvasiveManeuver: false,
                    preEvasionTarget: null, lastTimeHit: 0,
                    lastMovementVector: { x: 0, y: 0 },
                };
                newSquadMembers.push(newMember);
                newMemberIds.push(newMember.id);
            }
            
            const newSquadObject = {
                id: newSquadId,
                memberIds: newMemberIds,
                patrolTargetPosition: { x: squadAnchorPoint.x, y: squadAnchorPoint.y },
                currentFormationShape: formationShape,
                orientationVector: orientationVector,
                lastPatrolActivityTime: gameTime,
                targetEntityId: null,
                squadAlertTime: 0,
                isRegrouping: false, 
                regroupPoint: null,
                lastRegroupCheckTime: gameTime,
                regroupStartTime: 0,
            };
            console.log(`[enemyAI.js] New squad ${newSquadId} respawned IN FORMATION with ${newMemberIds.length} members.`);
            return { newSquadMembers, newSquadObject };
        }
    }
    console.warn(`[enemyAI.js] FAILED to respawn squad in formation after ${squadSpawnAttempts} attempts.`);
    return { newSquadMembers: [], newSquadObject: null }; 
}


const update = (
    currentEnemies,
    currentEnemySquads,
    player,
    teammates,
    map,
    allCharacters, 
    gameTime,
    TILE_SIZE,
    lastEnemySightedSoundTime, 
    lastRespawnTick,
    sectors
) => {
    let newBullets = [];
    let enemySightedThisTickGlobal = false;
    let updatedLastEnemySightedSoundTime = lastEnemySightedSoundTime;
    let updatedLastRespawnTick = lastRespawnTick;

    let enemiesArrayForThisTick = [...currentEnemies];
    let enemySquadsArrayForThisTick = currentEnemySquads.map(sq => ({
        ...sq,
        memberIds: [...sq.memberIds],
        patrolTargetPosition: sq.patrolTargetPosition ? {...sq.patrolTargetPosition} : null,
        orientationVector: sq.orientationVector ? {...sq.orientationVector} : {x:0, y:1},
        isRegrouping: sq.isRegrouping !== undefined ? sq.isRegrouping : false,
        regroupPoint: sq.regroupPoint ? {...sq.regroupPoint} : null,
        lastRegroupCheckTime: sq.lastRegroupCheckTime !== undefined ? sq.lastRegroupCheckTime : 0,
        regroupStartTime: sq.regroupStartTime !== undefined ? sq.regroupStartTime : 0,
    }));

    // --- Squad Management: Cleanup and Respawn ---
    const activeSquads = [];
    for (let i = 0; i < enemySquadsArrayForThisTick.length; i++) {
        const squad = enemySquadsArrayForThisTick[i];
        squad.memberIds = squad.memberIds.filter(id => enemiesArrayForThisTick.find(e => e.id === id && e.health > 0));
        if (squad.memberIds.length > 0) {
            activeSquads.push(squad);
        } else {
            console.log(`[enemyAI.js] Squad ${squad.id} eliminated.`);
        }
    }
    enemySquadsArrayForThisTick = activeSquads;

    if (enemySquadsArrayForThisTick.length < MAX_ENEMY_SQUADS && gameTime > updatedLastRespawnTick + RESPAWN_DELAY_TICKS) {
        const playerAndTeammatesForRespawn = [player, ...teammates.filter(tm => tm.health > 0)];
        const currentAllCharsForSquadSpawn = [player, ...teammates.filter(tm => tm.health > 0), ...enemiesArrayForThisTick];
        const { newSquadMembers, newSquadObject } = spawnNewEnemySquad(enemiesArrayForThisTick, enemySquadsArrayForThisTick, map, playerAndTeammatesForRespawn, TILE_SIZE, gameTime);
        if (newSquadObject && newSquadMembers.length > 0) { 
            enemiesArrayForThisTick.push(...newSquadMembers);
            enemySquadsArrayForThisTick.push(newSquadObject);
            updatedLastRespawnTick = gameTime;
        }
    }
    
    // --- Generic Boss Respawn ---
    let activeGenericBossCount = 0;
    for (const enemy of enemiesArrayForThisTick) {
        if (enemy.health > 0 && !enemy.squadId && enemy.variant === EnemyVariant.BOSS && !enemy.isHVT) {
            activeGenericBossCount++;
        }
    }

    if (activeGenericBossCount < MAX_GENERIC_BOSSES && gameTime > updatedLastRespawnTick + RESPAWN_DELAY_TICKS) {
        console.log(`[enemyAI.js] Attempting to spawn generic boss. Active: ${activeGenericBossCount}, Max: ${MAX_GENERIC_BOSSES}`);
        const playerAndTeammatesForRespawn = [player, ...teammates.filter(tm => tm.health > 0)];
        const currentAllCharsForBossSpawn = [player, ...teammates.filter(tm => tm.health > 0), ...enemiesArrayForThisTick];

        const newGenericBoss = spawnSingleEnemy(
            EnemyVariant.BOSS, 
            null, 
            map, 
            currentAllCharsForBossSpawn, 
            false 
        );

        if (newGenericBoss) {
            enemiesArrayForThisTick.push(newGenericBoss);
            updatedLastRespawnTick = gameTime;
            activeGenericBossCount++; 
            console.log(`[enemyAI.js] Generic Boss ${newGenericBoss.id} respawned. Total generic bosses: ${activeGenericBossCount}`);
        } else {
            console.warn(`[enemyAI.js] Failed to spawn a generic boss (spawnSingleEnemy returned null).`);
        }
    }

    let currentAllCharacters = [player, ...teammates, ...enemiesArrayForThisTick].filter(c => c && (c.health === undefined || c.health > 0) && (c.type !== EntityType.INTEL_ITEM || !c.isCollected));

    // --- Squad Behavior Loop ---
    for (let i = 0; i < enemySquadsArrayForThisTick.length; i++) {
        const squad = enemySquadsArrayForThisTick[i];
        const livingSquadMembers = enemiesArrayForThisTick.filter(e => squad.memberIds.includes(e.id) && e.health > 0);

        if (livingSquadMembers.length === 0) continue;

        let squadHasAcquiredTargetThisTick = false;
        let closestValidTargetForSquad = null;
        let minDistanceToSquadTarget = Infinity;

        for (const member of livingSquadMembers) {
            const potentialTargets = [player, ...teammates.filter(tm => tm.health > 0)];
            for (const pTarget of potentialTargets) {
                if (!pTarget || pTarget.health <= 0) continue;
                const dist = Math.sqrt(Math.pow(member.x - pTarget.x, 2) + Math.pow(member.y - pTarget.y, 2));
                
                if (dist < member.detectionRange) { 
                    if (hasLineOfSight({ x: member.x + member.width / 2, y: member.y + member.height / 2 }, 
                                        { x: pTarget.x + pTarget.width / 2, y: pTarget.y + pTarget.height / 2 }, map)) {
                        if (dist < minDistanceToSquadTarget) {
                            minDistanceToSquadTarget = dist;
                            closestValidTargetForSquad = pTarget;
                            squadHasAcquiredTargetThisTick = true;
                        }
                    }
                }
            }
        }

        if (squadHasAcquiredTargetThisTick && closestValidTargetForSquad) {
            if (squad.targetEntityId !== closestValidTargetForSquad.id) {
                if (!enemySightedThisTickGlobal && gameTime > updatedLastEnemySightedSoundTime + (ENEMY_SIGHTED_SOUND_COOLDOWN_MS / GAME_LOOP_INTERVAL)) {
                    if (Math.random() < ENEMY_SIGHTED_SOUND_CHANCE) {
                        playEnemySightedAlertSound(BASE_SOUND_NOTE_ENEMY_SIGHTED + Math.random() * 200 - 100, VOICE_SOUND_VOLUME);
                        updatedLastEnemySightedSoundTime = gameTime;
                        enemySightedThisTickGlobal = true;
                    }
                }
            }
            squad.targetEntityId = closestValidTargetForSquad.id;
            squad.squadAlertTime = gameTime; 

            if (squad.isRegrouping) {
                squad.isRegrouping = false;
                squad.regroupPoint = null;
                squad.lastPatrolActivityTime = gameTime; 
            }
        } else {
            squad.targetEntityId = null;
        }

        const squadCompositionWithSlots = [ 
            { variant: EnemyVariant.GRENADIER, slotIndex: 0 },
            { variant: EnemyVariant.SOLDIER, slotIndex: 1 },
            { variant: EnemyVariant.SOLDIER, slotIndex: 2 },
        ];
        
        const memberToSlotMap = new Map();
        let grenadierCount = 0;
        let soldierCount = 0;
        livingSquadMembers.forEach(member => {
            if (member.variant === EnemyVariant.GRENADIER && grenadierCount < 1) {
                const slotDef = squadCompositionWithSlots.find(s => s.variant === EnemyVariant.GRENADIER);
                if (slotDef) memberToSlotMap.set(member.id, slotDef.slotIndex);
                grenadierCount++;
            } else if (member.variant === EnemyVariant.SOLDIER && soldierCount < 2) {
                const assignedSoldierSlots = Array.from(memberToSlotMap.values()).filter(slotIdx => {
                    const compSlot = squadCompositionWithSlots.find(s => s.slotIndex === slotIdx);
                    return compSlot && compSlot.variant === EnemyVariant.SOLDIER;
                });
                const availableSoldierSlot = squadCompositionWithSlots.find(s => s.variant === EnemyVariant.SOLDIER && !assignedSoldierSlots.includes(s.slotIndex));
                if (availableSoldierSlot) {
                    memberToSlotMap.set(member.id, availableSoldierSlot.slotIndex);
                    soldierCount++;
                }
            }
        });

        if (!squad.isRegrouping && gameTime > squad.lastRegroupCheckTime + SQUAD_REGROUP_CHECK_INTERVAL_TICKS) {
            squad.lastRegroupCheckTime = gameTime;
            let avgSquadX = 0, avgSquadY = 0;
            if (livingSquadMembers.length > 0) {
                livingSquadMembers.forEach(m => { avgSquadX += m.x + m.width/2; avgSquadY += m.y + m.height/2; });
                avgSquadX /= livingSquadMembers.length;
                avgSquadY /= livingSquadMembers.length;
            }

            let maxDistanceFromAvg = 0;
             if (livingSquadMembers.length > 0) {
                livingSquadMembers.forEach(m => {
                    const dist = Math.sqrt(Math.pow(m.x + m.width/2 - avgSquadX, 2) + Math.pow(m.y + m.height/2 - avgSquadY, 2));
                    if (dist > maxDistanceFromAvg) maxDistanceFromAvg = dist;
                });
            }

            const isTooSpread = maxDistanceFromAvg > SQUAD_REGROUP_MAX_SPREAD_DISTANCE;
            const needsPostCombatRegroup = !squad.targetEntityId && squad.squadAlertTime > 0 && 
                                           gameTime < squad.squadAlertTime + SQUAD_POST_COMBAT_REGROUP_GRACE_PERIOD_TICKS &&
                                           isTooSpread;

            if (((isTooSpread && !squad.targetEntityId) || needsPostCombatRegroup) && livingSquadMembers.length > 0) {
                squad.isRegrouping = true;
                squad.regroupPoint = { x: avgSquadX, y: avgSquadY };
                squad.regroupStartTime = gameTime;
                squad.currentFormationShape = FormationShape.COLUMN; 
                
                const dxReg = squad.regroupPoint.x - avgSquadX;
                const dyReg = squad.regroupPoint.y - avgSquadY;
                const distReg = Math.sqrt(dxReg * dxReg + dyReg * dyReg);
                squad.orientationVector = distReg > 0.1 ? { x: dxReg / distReg, y: dyReg / distReg } : { x: 0, y: 1 };

                squad.targetEntityId = null; 
                squad.patrolTargetPosition = null; 
            }
        }

        if (squad.isRegrouping) {
             if (squad.targetEntityId) { 
                squad.isRegrouping = false;
                squad.regroupPoint = null;
             } else {
                let membersInPositionCount = 0;
                for (const member of livingSquadMembers) {
                    const memberSlotIndex = memberToSlotMap.get(member.id) ?? (squadCompositionWithSlots.find(s => s.variant === member.variant)?.slotIndex ?? 0); 
                    const formationSpot = getEnemyFormationPosition(member, squad.regroupPoint, squad.orientationVector, memberSlotIndex, squad.currentFormationShape, TILE_SIZE);
                    const distToSpot = Math.sqrt(Math.pow(member.x - formationSpot.x, 2) + Math.pow(member.y - formationSpot.y, 2));
                    if (distToSpot < SQUAD_REGROUP_COHESION_RADIUS) {
                        membersInPositionCount++;
                    }
                }
                if ((membersInPositionCount >= Math.max(1, livingSquadMembers.length - 1) && livingSquadMembers.length > 0) ||
                    gameTime > squad.regroupStartTime + SQUAD_REGROUP_DURATION_MAX_TICKS) {
                    squad.isRegrouping = false;
                    squad.regroupPoint = null;
                    squad.lastPatrolActivityTime = gameTime - (ENEMY_SQUAD_PATROL_IDLE_TIME_MS / GAME_LOOP_INTERVAL) + 100; 
                }
            }
        }
        
        let squadFocalPoint;
        if (squad.isRegrouping && squad.regroupPoint) {
            squadFocalPoint = squad.regroupPoint;
        } else if (squad.targetEntityId) { 
            const actualTargetEntity = [player, ...teammates].find(t => t.id === squad.targetEntityId);
            if (actualTargetEntity && actualTargetEntity.health > 0) {
                squadFocalPoint = { x: actualTargetEntity.x + actualTargetEntity.width / 2, y: actualTargetEntity.y + actualTargetEntity.height / 2 };
                if (livingSquadMembers.length > 0) {
                    const avgSquadXOrientation = livingSquadMembers.reduce((sum, m) => sum + m.x + m.width/2, 0) / livingSquadMembers.length;
                    const avgSquadYOrientation = livingSquadMembers.reduce((sum, m) => sum + m.y + m.height/2, 0) / livingSquadMembers.length;
                    const dx = squadFocalPoint.x - avgSquadXOrientation; 
                    const dy = squadFocalPoint.y - avgSquadYOrientation;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    squad.orientationVector = dist > 0 ? {x: dx/dist, y: dy/dist} : squad.orientationVector;
                }
            } else { 
                squad.targetEntityId = null; 
            }
        } 
        
        const avgSquadX = livingSquadMembers.reduce((sum, m) => sum + m.x, 0) / livingSquadMembers.length;
        const avgSquadY = livingSquadMembers.reduce((sum, m) => sum + m.y, 0) / livingSquadMembers.length;

        let needsNewPatrolTarget = false;
        if (!squad.patrolTargetPosition) {
            needsNewPatrolTarget = true;
        } else {
            const leader = livingSquadMembers.find(m => m.id.includes(EnemyVariant.GRENADIER) || m.id.includes(EnemyVariant.BOSS)) || livingSquadMembers[0];
            if (leader) {
                const distToPatrolTarget = Math.sqrt(Math.pow(leader.x - squad.patrolTargetPosition.x, 2) + Math.pow(leader.y - squad.patrolTargetPosition.y, 2));
                if (distToPatrolTarget < AI_TARGET_ARRIVAL_THRESHOLD * 5) {
                    needsNewPatrolTarget = true;
                    squad.lastPatrolActivityTime = gameTime; 
                }
            }
        }
        
        if (gameTime - squad.lastPatrolActivityTime > (ENEMY_SQUAD_PATROL_IDLE_TIME_MS / GAME_LOOP_INTERVAL)) {
            needsNewPatrolTarget = true;
        }

        if (needsNewPatrolTarget) {
            const squadSector = sectors.find(s => s.id === squad.sectorId);
            if (squadSector) {
                const maxAttempts = 20;
                for (let i = 0; i < maxAttempts; i++) {
                    const patrolX = (squadSector.x + Math.floor(Math.random() * squadSector.width)) * TILE_SIZE;
                    const patrolY = (squadSector.y + Math.floor(Math.random() * squadSector.height)) * TILE_SIZE;
                    
                    if (isPositionWalkable({x: patrolX, y: patrolY}, ENEMY_SIZE, ENEMY_SIZE, map, `squad-patrol-${squad.id}`, allCharacters).isWalkable) {
                         squad.patrolTargetPosition = { x: patrolX, y: patrolY };
                         squad.lastPatrolActivityTime = gameTime;
                         break;
                    }
                }
            } else { // Fallback if sector not found
                const patrolX = avgSquadX + (Math.random() - 0.5) * 2 * ENEMY_SQUAD_PATROL_MAX_DISTANCE;
                const patrolY = avgSquadY + (Math.random() - 0.5) * 2 * ENEMY_SQUAD_PATROL_MAX_DISTANCE;
                squad.patrolTargetPosition = { x: patrolX, y: patrolY };
                squad.lastPatrolActivityTime = gameTime;
            }
        }

        if (!squadFocalPoint) {
            squadFocalPoint = squad.patrolTargetPosition || { x: avgSquadX, y: avgSquadY };
        }

        for (let j = 0; j < livingSquadMembers.length; j++) {
            let enemy = livingSquadMembers[j]; 
            const assignedSlotIndex = memberToSlotMap.get(enemy.id);

            if (enemy.isPerformingEvasiveManeuver && enemy.evasiveManeuverTarget) {
                const { newX, newY, moved } = processAIMovement(enemy, enemy.evasiveManeuverTarget, map, currentAllCharacters, gameTime, TILE_SIZE);
                enemy.x = newX; enemy.y = newY;
                if (moved) enemy.lastMovedTime = gameTime;
                const distToEvasionTarget = Math.sqrt(Math.pow(enemy.x - enemy.evasiveManeuverTarget.x, 2) + Math.pow(enemy.y - enemy.evasiveManeuverTarget.y, 2));
                if (distToEvasionTarget < AI_TARGET_ARRIVAL_THRESHOLD * 2 || gameTime > enemy.lastEvasiveManeuverTime + AI_UNDER_FIRE_DURATION_TICKS * 1.5) {
                    enemy.isPerformingEvasiveManeuver = false; enemy.evasiveManeuverTarget = null; enemy.preEvasionTarget = null; enemy.currentPath = null;
                }
                const mainIndexEvasive = enemiesArrayForThisTick.findIndex(e => e.id === enemy.id);
                if(mainIndexEvasive !== -1) enemiesArrayForThisTick[mainIndexEvasive] = enemy;
                continue; 
            }

            let individualTargetPosition;
            if (squadFocalPoint && assignedSlotIndex !== undefined) {
                 individualTargetPosition = getEnemyFormationPosition(enemy, squadFocalPoint, squad.orientationVector, assignedSlotIndex, squad.currentFormationShape, TILE_SIZE);
            } else if (squadFocalPoint) { 
                 individualTargetPosition = {x: squadFocalPoint.x - enemy.width/2, y: squadFocalPoint.y - enemy.height/2};
            } else { 
                individualTargetPosition = {x: enemy.x, y: enemy.y}; 
            }
            
            const enemyMovementResult = processAIMovement(enemy, individualTargetPosition, map, currentAllCharacters, gameTime, TILE_SIZE);
            enemy.x = enemyMovementResult.newX;
            enemy.y = enemyMovementResult.newY;

            if (enemyMovementResult.moved) enemy.stuckCounter = 0;
            else if(individualTargetPosition && (Math.abs(enemy.x - individualTargetPosition.x) > TILE_SIZE * 0.5 || Math.abs(enemy.y - individualTargetPosition.y) > TILE_SIZE * 0.5)) { 
                enemy.stuckCounter++;
            }

            if (enemy.stuckCounter >= STUCK_TIMEOUT_TICKS) {
                enemy.stuckCounter = 0; enemy.currentPath = null; 
                if (squad.patrolTargetPosition && !squad.targetEntityId && !squad.isRegrouping) { 
                    squad.patrolTargetPosition.x += (Math.random()-0.5) * TILE_SIZE * 3;
                    squad.patrolTargetPosition.y += (Math.random()-0.5) * TILE_SIZE * 3;
                    squad.lastPatrolActivityTime = gameTime - (ENEMY_SQUAD_PATROL_IDLE_TIME_MS / GAME_LOOP_INTERVAL) + 10; 
                }
            }
            
            const canShoot = !squad.isRegrouping || 
                             (squad.isRegrouping && squad.targetEntityId && 
                              Math.sqrt(Math.pow(enemy.x - (squad.targetEntityId ? [player,...teammates].find(t=>t.id===squad.targetEntityId)?.x : enemy.x), 2) + 
                                        Math.pow(enemy.y - (squad.targetEntityId ? [player,...teammates].find(t=>t.id===squad.targetEntityId)?.y : enemy.y), 2)) < TILE_SIZE * 5);

            if (squad.targetEntityId && canShoot) {
                 const actualTargetEntity = [player, ...teammates].find(t => t.id === squad.targetEntityId);
                if (actualTargetEntity && actualTargetEntity.health > 0) {
                    const distToActualTarget = Math.sqrt(Math.pow(enemy.x - actualTargetEntity.x, 2) + Math.pow(enemy.y - actualTargetEntity.y, 2));
                    if (distToActualTarget <= enemy.shootRange) {
                        if (hasLineOfSight({ x: enemy.x + enemy.width / 2, y: enemy.y + enemy.height / 2 }, { x: actualTargetEntity.x + actualTargetEntity.width / 2, y: actualTargetEntity.y + actualTargetEntity.height / 2 }, map)) {
                            
                            let enemyShootCooldownTicks, currentBulletSpeed, bulletDamageMin, bulletDamageMax, shootSoundFn, bulletMaxTravel;
                            switch(enemy.variant) {
                                case EnemyVariant.SOLDIER:
                                    enemyShootCooldownTicks = ENEMY_SOLDIER_SHOOT_COOLDOWN_MS / GAME_LOOP_INTERVAL;
                                    currentBulletSpeed = ENEMY_BULLET_SPEED;
                                    bulletDamageMin = ENEMY_BULLET_DAMAGE_MIN;
                                    bulletDamageMax = ENEMY_BULLET_DAMAGE_MAX;
                                    shootSoundFn = () => playEnemySoldierShootSound(GUNSHOT_VOLUME * 0.9);
                                    bulletMaxTravel = ENEMY_SOLDIER_BULLET_MAX_TRAVEL_DISTANCE;
                                    break;
                                case EnemyVariant.GRENADIER:
                                    enemyShootCooldownTicks = ENEMY_GRENADIER_SHOOT_COOLDOWN_MS / GAME_LOOP_INTERVAL;
                                    currentBulletSpeed = ENEMY_GRENADIER_BULLET_SPEED;
                                    bulletDamageMin = ENEMY_GRENADIER_BULLET_DAMAGE_MIN;
                                    bulletDamageMax = ENEMY_GRENADIER_BULLET_DAMAGE_MAX;
                                    shootSoundFn = () => playEnemyHeavyShootSound(ENEMY_HEAVY_GUNSHOT_VOLUME * 0.9);
                                    bulletMaxTravel = ENEMY_GRENADIER_BULLET_MAX_TRAVEL_DISTANCE;
                                    break;
                                case EnemyVariant.BOSS:
                                    enemyShootCooldownTicks = ENEMY_BOSS_SHOOT_COOLDOWN_MS / GAME_LOOP_INTERVAL;
                                    currentBulletSpeed = ENEMY_BULLET_SPEED;
                                    bulletDamageMin = ENEMY_BOSS_BULLET_DAMAGE_MIN;
                                    bulletDamageMax = ENEMY_BOSS_BULLET_DAMAGE_MAX;
                                    shootSoundFn = () => playEnemyHeavyShootSound(ENEMY_HEAVY_GUNSHOT_VOLUME);
                                    bulletMaxTravel = ENEMY_BOSS_BULLET_MAX_TRAVEL_DISTANCE;
                                    break;
                                case EnemyVariant.HV_BOSS:
                                    enemyShootCooldownTicks = ENEMY_BOSS_SHOOT_COOLDOWN_MS / GAME_LOOP_INTERVAL;
                                    currentBulletSpeed = ENEMY_BULLET_SPEED;
                                    bulletDamageMin = ENEMY_HV_BOSS_BULLET_DAMAGE_MIN;
                                    bulletDamageMax = ENEMY_HV_BOSS_BULLET_DAMAGE_MAX;
                                    shootSoundFn = () => playEnemyHeavyShootSound(ENEMY_HEAVY_GUNSHOT_VOLUME * 1.1);
                                    bulletMaxTravel = ENEMY_BOSS_BULLET_MAX_TRAVEL_DISTANCE;
                                    break;
                                default:
                                    enemyShootCooldownTicks = ENEMY_SOLDIER_SHOOT_COOLDOWN_MS / GAME_LOOP_INTERVAL;
                                    currentBulletSpeed = ENEMY_BULLET_SPEED;
                                    bulletDamageMin = ENEMY_BULLET_DAMAGE_MIN;
                                    bulletDamageMax = ENEMY_BULLET_DAMAGE_MAX;
                                    shootSoundFn = () => playEnemySoldierShootSound(GUNSHOT_VOLUME * 0.9);
                                    bulletMaxTravel = ENEMY_SOLDIER_BULLET_MAX_TRAVEL_DISTANCE;
                            }

                            if (gameTime - enemy.lastShotTime > enemyShootCooldownTicks) {
                                const shooterCenterPos = { x: enemy.x + enemy.width / 2, y: enemy.y + enemy.height / 2 };
                                const predictedTargetPos = predictTargetPosition(shooterCenterPos, actualTargetEntity, currentBulletSpeed);
                                
                                const dxToPredicted = predictedTargetPos.x - shooterCenterPos.x;
                                const dyToPredicted = predictedTargetPos.y - shooterCenterPos.y;
                                const distToPredicted = Math.sqrt(dxToPredicted * dxToPredicted + dyToPredicted * dyToPredicted);

                                const bulletDx = distToPredicted > 0 ? (dxToPredicted / distToPredicted) * currentBulletSpeed : 0;
                                const bulletDy = distToPredicted > 0 ? (dyToPredicted / distToPredicted) * currentBulletSpeed : 0;
                                
                                // Calculate random damage within the enemy's damage range
                                const damage = Math.floor(Math.random() * (bulletDamageMax - bulletDamageMin + 1)) + bulletDamageMin;

                                newBullets.push({
                                  id: generateUniqueId(`bullet-enemy-${enemy.id}`), type: EntityType.BULLET,
                                  x: shooterCenterPos.x - BULLET_SIZE / 2, y: shooterCenterPos.y - BULLET_SIZE / 2,
                                  width: BULLET_SIZE, height: BULLET_SIZE, color: ENEMY_BULLET_COLOR, 
                                  dx: bulletDx, dy: bulletDy, ownerId: enemy.id, damage: damage,
                                  maxTravelDistance: bulletMaxTravel, traveledDistance: 0,
                                });
                                enemy.lastShotTime = gameTime;
                                shootSoundFn();
                            }
                        }
                    }
                }
            }
            const mainIndex = enemiesArrayForThisTick.findIndex(e => e.id === enemy.id);
            if(mainIndex !== -1) enemiesArrayForThisTick[mainIndex] = enemy;
        }
    }

    const nonSquadEnemies = enemiesArrayForThisTick.filter(e => !e.squadId && e.health > 0);
    for (let k=0; k < nonSquadEnemies.length; k++) {
        let enemy = nonSquadEnemies[k];

        if (enemy.isPerformingEvasiveManeuver && enemy.evasiveManeuverTarget) {
             const { newX, newY, moved } = processAIMovement(enemy, enemy.evasiveManeuverTarget, map, currentAllCharacters, gameTime, TILE_SIZE);
            enemy.x = newX; enemy.y = newY;
            if (moved) enemy.lastMovedTime = gameTime;
            const distToEvasionTarget = Math.sqrt(Math.pow(enemy.x - enemy.evasiveManeuverTarget.x, 2) + Math.pow(enemy.y - enemy.evasiveManeuverTarget.y, 2));
            if (distToEvasionTarget < AI_TARGET_ARRIVAL_THRESHOLD * 2 || gameTime > enemy.lastEvasiveManeuverTime + AI_UNDER_FIRE_DURATION_TICKS * 1.5) {
                enemy.isPerformingEvasiveManeuver = false; enemy.evasiveManeuverTarget = null; enemy.preEvasionTarget = null; enemy.currentPath = null;
            }
             const mainNsIndex = enemiesArrayForThisTick.findIndex(e => e.id === enemy.id);
             if(mainNsIndex !== -1) enemiesArrayForThisTick[mainNsIndex] = enemy;
            continue; 
        }

        let potentialTargets = [player, ...teammates.filter(tm => tm.health > 0)];
        let closestVisibleTarget = null;
        let minDistanceToTarget = enemy.detectionRange;

        for (const target of potentialTargets) {
          if (!target || target.health <= 0) continue;
          const distToTarget = Math.sqrt(Math.pow(enemy.x - target.x, 2) + Math.pow(enemy.y - target.y, 2));
          if (distToTarget < minDistanceToTarget) {
            if (hasLineOfSight({ x: enemy.x + enemy.width / 2, y: enemy.y + enemy.height / 2 }, { x: target.x + target.width / 2, y: target.y + target.height / 2 }, map)) {
              minDistanceToTarget = distToTarget;
              closestVisibleTarget = target;
            }
          }
        }
        
        if (closestVisibleTarget) {
          if (!enemy.targetEntityId && !enemySightedThisTickGlobal && gameTime > updatedLastEnemySightedSoundTime + (ENEMY_SIGHTED_SOUND_COOLDOWN_MS / GAME_LOOP_INTERVAL)) {
             if (Math.random() < ENEMY_SIGHTED_SOUND_CHANCE) {
                playEnemySightedAlertSound(BASE_SOUND_NOTE_ENEMY_SIGHTED + Math.random() * 200 - 100, VOICE_SOUND_VOLUME);
                updatedLastEnemySightedSoundTime = gameTime;
                enemySightedThisTickGlobal = true; 
             }
          }
          enemy.targetEntityId = closestVisibleTarget.id;
          enemy.targetPosition = { x: closestVisibleTarget.x, y: closestVisibleTarget.y };
          enemy.patrolTargetPosition = null; 
          
          let enemyShootCooldownTicks, currentBulletSpeed, bulletDamageMin, bulletDamageMax, shootSoundFn, bulletMaxTravel;
            if (enemy.variant === EnemyVariant.BOSS) {
                enemyShootCooldownTicks = ENEMY_BOSS_SHOOT_COOLDOWN_MS / GAME_LOOP_INTERVAL;
                currentBulletSpeed = ENEMY_BULLET_SPEED;
                bulletDamageMin = ENEMY_BOSS_BULLET_DAMAGE_MIN;
                bulletDamageMax = ENEMY_BOSS_BULLET_DAMAGE_MAX;
                shootSoundFn = () => playEnemyHeavyShootSound(ENEMY_HEAVY_GUNSHOT_VOLUME);
                bulletMaxTravel = ENEMY_BOSS_BULLET_MAX_TRAVEL_DISTANCE;
            } else if (enemy.variant === EnemyVariant.HV_BOSS) {
                enemyShootCooldownTicks = ENEMY_BOSS_SHOOT_COOLDOWN_MS / GAME_LOOP_INTERVAL;
                currentBulletSpeed = ENEMY_BULLET_SPEED;
                bulletDamageMin = ENEMY_HV_BOSS_BULLET_DAMAGE_MIN;
                bulletDamageMax = ENEMY_HV_BOSS_BULLET_DAMAGE_MAX;
                shootSoundFn = () => playEnemyHeavyShootSound(ENEMY_HEAVY_GUNSHOT_VOLUME * 1.1);
                bulletMaxTravel = ENEMY_BOSS_BULLET_MAX_TRAVEL_DISTANCE;
            } else if (enemy.variant === EnemyVariant.GRENADIER) {
                enemyShootCooldownTicks = ENEMY_GRENADIER_SHOOT_COOLDOWN_MS / GAME_LOOP_INTERVAL;
                currentBulletSpeed = ENEMY_GRENADIER_BULLET_SPEED;
                bulletDamageMin = ENEMY_GRENADIER_BULLET_DAMAGE_MIN;
                bulletDamageMax = ENEMY_GRENADIER_BULLET_DAMAGE_MAX;
                shootSoundFn = () => playEnemyHeavyShootSound(ENEMY_HEAVY_GUNSHOT_VOLUME * 0.9);
                bulletMaxTravel = ENEMY_GRENADIER_BULLET_MAX_TRAVEL_DISTANCE;
            } else { 
                enemyShootCooldownTicks = ENEMY_SOLDIER_SHOOT_COOLDOWN_MS / GAME_LOOP_INTERVAL;
                currentBulletSpeed = ENEMY_BULLET_SPEED;
                bulletDamageMin = ENEMY_BULLET_DAMAGE_MIN;
                bulletDamageMax = ENEMY_BULLET_DAMAGE_MAX;
                shootSoundFn = () => playEnemySoldierShootSound(GUNSHOT_VOLUME * 0.9);
                bulletMaxTravel = ENEMY_SOLDIER_BULLET_MAX_TRAVEL_DISTANCE;
            }

          if (minDistanceToTarget <= enemy.shootRange && gameTime - enemy.lastShotTime > enemyShootCooldownTicks) {
            const shooterCenterPos = { x: enemy.x + enemy.width / 2, y: enemy.y + enemy.height / 2 };
            const predictedTargetPos = predictTargetPosition(shooterCenterPos, closestVisibleTarget, currentBulletSpeed);

            const dxToPredicted = predictedTargetPos.x - shooterCenterPos.x;
            const dyToPredicted = predictedTargetPos.y - shooterCenterPos.y;
            const distToPredicted = Math.sqrt(dxToPredicted * dxToPredicted + dyToPredicted * dyToPredicted);

            const bulletDx = distToPredicted > 0 ? (dxToPredicted / distToPredicted) * currentBulletSpeed : 0;
            const bulletDy = distToPredicted > 0 ? (dyToPredicted / distToPredicted) * currentBulletSpeed : 0;
            
            // Calculate random damage within the enemy's damage range
            const damage = Math.floor(Math.random() * (bulletDamageMax - bulletDamageMin + 1)) + bulletDamageMin;

            newBullets.push({
              id: generateUniqueId(`bullet-enemy-${enemy.id}`), type: EntityType.BULLET,
              x: shooterCenterPos.x - BULLET_SIZE / 2, y: shooterCenterPos.y - BULLET_SIZE / 2,
              width: BULLET_SIZE, height: BULLET_SIZE, color: ENEMY_BULLET_COLOR, 
              dx: bulletDx, dy: bulletDy, ownerId: enemy.id, damage: damage,
              maxTravelDistance: bulletMaxTravel, traveledDistance: 0,
            });
            enemy.lastShotTime = gameTime;
            shootSoundFn();
          }
        } else { 
          enemy.targetEntityId = null; enemy.targetPosition = null; 
          if (!enemy.patrolTargetPosition || (enemy.x === enemy.patrolTargetPosition.x && enemy.y === enemy.patrolTargetPosition.y) || gameTime > enemy.lastPatrolActivityTime + (ENEMY_SQUAD_PATROL_IDLE_TIME_MS / GAME_LOOP_INTERVAL / 2 )) { 
            if (Math.random() < 0.3 || !enemy.patrolTargetPosition) { 
                const angle = Math.random() * 2 * Math.PI; const distance = Math.random() * ENEMY_SQUAD_PATROL_MAX_DISTANCE * 0.75;
                const patrolX = enemy.x + Math.cos(angle) * distance; const patrolY = enemy.y + Math.sin(angle) * distance;
                const tempPatrolTarget = {
                    x: Math.max(TILE_SIZE, Math.min(patrolX, map.widthTiles * TILE_SIZE - TILE_SIZE*2)),
                    y: Math.max(TILE_SIZE, Math.min(patrolY, map.heightTiles * TILE_SIZE - TILE_SIZE*2))
                };
                const targetTileX = Math.floor(tempPatrolTarget.x / TILE_SIZE); const targetTileY = Math.floor(tempPatrolTarget.y / TILE_SIZE);
                if (map.tiles[targetTileY]?.[targetTileX] && map.tiles[targetTileY][targetTileX].type !== TileType.WALL && map.tiles[targetTileY][targetTileX].type !== TileType.WATER) {
                     enemy.patrolTargetPosition = tempPatrolTarget; enemy.currentPath = null; 
                }
            }
            enemy.lastPatrolActivityTime = gameTime;
          }
        }
        let finalEnemyTargetPos = enemy.targetPosition || enemy.patrolTargetPosition;
        const enemyMovementResult = processAIMovement(enemy, finalEnemyTargetPos || {x: enemy.x, y: enemy.y}, map, currentAllCharacters, gameTime, TILE_SIZE);
        enemy.x = enemyMovementResult.newX; enemy.y = enemyMovementResult.newY;
        if (enemyMovementResult.moved) enemy.stuckCounter = 0; else if (finalEnemyTargetPos) enemy.stuckCounter++;
        if (enemy.stuckCounter >= STUCK_TIMEOUT_TICKS) {
            enemy.stuckCounter = 0; enemy.currentPath = null; enemy.patrolTargetPosition = null; 
        }
         const mainNsIndex = enemiesArrayForThisTick.findIndex(e => e.id === enemy.id);
        if(mainNsIndex !== -1) enemiesArrayForThisTick[mainNsIndex] = enemy;
    }

    return { 
        updatedEnemies: enemiesArrayForThisTick, 
        updatedEnemySquads: enemySquadsArrayForThisTick,
        newBullets, 
        updatedLastEnemySightedSoundTime, 
        updatedLastRespawnTick 
    };
};

export const updateEnemiesAI = {
    update,
    triggerEvasiveManuever: triggerAIEvasiveManeuver, 
};
