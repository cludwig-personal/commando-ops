import { EntityType } from '../types.js';
import { isPositionWalkable, findPath, smoothPath } from './mapGenerator.js';
import { 
    AI_TARGET_ARRIVAL_THRESHOLD, 
    TEAMMATE_SIZE, 
    STUCK_TIMEOUT_TICKS,
    AI_EVASIVE_MANEUVER_COOLDOWN_MS,
    GAME_LOOP_INTERVAL,
    AI_EVASIVE_DODGE_CHANCE,
    AI_EVASIVE_STRAFE_DISTANCE
} from '../constants.js';

export const processAIMovement = (
  char,
  intendedTargetPos,
  map,
  allCharacters,
  newGameTime,
  TILE_SIZE
) => {
  const originalX = char.x; 
  const originalY = char.y;
  let newX = char.x;
  let newY = char.y;
  let moved = false;
  let finalBlockedByCharacterId = null;

  // --- Failsafe: Only trigger if inside a non-walkable tile (not just blocked by another character) ---
  let stuckThreshold = Math.floor(STUCK_TIMEOUT_TICKS / 2);
  const isCurrentlyWalkable = isPositionWalkable(
    { x: char.x, y: char.y },
    char.width,
    char.height,
    map,
    char.id,
    allCharacters.filter(c => c.id !== char.id && (c.health === undefined || c.health > 0) && (c.type !== EntityType.INTEL_ITEM || !c.isCollected))
  );
  // Determine if the block is due to a tile (not just another character)
  const tileX = Math.floor(char.x / TILE_SIZE);
  const tileY = Math.floor(char.y / TILE_SIZE);
  let isBlockedByTile = false;
  if (map && map.tiles && map.tiles[tileY] && map.tiles[tileY][tileX]) {
    const tile = map.tiles[tileY][tileX];
    // Consider non-walkable if it's a wall, water, or any tile type you want to treat as impassable
    if (tile.type === 1 /* WALL */ || tile.type === 3 /* WATER */ || tile.type === 7 /* FENCE */) {
      isBlockedByTile = true;
    }
  }
  if (!isCurrentlyWalkable.isWalkable && isBlockedByTile) {
    char.stuckCounter = (char.stuckCounter || 0) + 1;
    if (char.stuckCounter > stuckThreshold) {
      // Try to find a nearby walkable tile (simple spiral search)
      let found = false;
      let searchRadius = 1;
      let maxRadius = 10; // up to 10 tiles away
      let safeX = char.x, safeY = char.y;
      while (!found && searchRadius <= maxRadius) {
        for (let dx = -searchRadius; dx <= searchRadius; dx++) {
          for (let dy = -searchRadius; dy <= searchRadius; dy++) {
            if (Math.abs(dx) !== searchRadius && Math.abs(dy) !== searchRadius) continue; // only edge of square
            const testX = char.x + dx * TILE_SIZE;
            const testY = char.y + dy * TILE_SIZE;
            // Check if the candidate tile is walkable and not blocked by a tile
            const walkCheck = isPositionWalkable({ x: testX, y: testY }, char.width, char.height, map, char.id, allCharacters.filter(c => c.id !== char.id && (c.health === undefined || c.health > 0) && (c.type !== EntityType.INTEL_ITEM || !c.isCollected)));
            const testTileX = Math.floor(testX / TILE_SIZE);
            const testTileY = Math.floor(testY / TILE_SIZE);
            let testBlockedByTile = false;
            if (map && map.tiles && map.tiles[testTileY] && map.tiles[testTileY][testTileX]) {
              const testTile = map.tiles[testTileY][testTileX];
              if (testTile.type === 1 || testTile.type === 3 || testTile.type === 7) {
                testBlockedByTile = true;
              }
            }
            if (walkCheck.isWalkable && !testBlockedByTile) {
              safeX = testX;
              safeY = testY;
              found = true;
              break;
            }
          }
          if (found) break;
        }
        searchRadius++;
      }
      char.x = safeX;
      char.y = safeY;
      newX = safeX;
      newY = safeY;
      char.currentPath = null;
      char.currentPathIndex = 0;
      char.stuckCounter = 0;
      return { newX, newY, moved: false, blockedByCharacterId: null };
    }
  } else if (!isCurrentlyWalkable.isWalkable) {
    // Blocked, but not by a tile (likely another character): do not increment stuckCounter for failsafe
    // Optionally, you could increment a separate counter for crowding, but do not teleport
  } else {
    char.stuckCounter = 0;
  }

  let currentActualTarget = intendedTargetPos;

  if (!currentActualTarget) { 
      char.currentPath = null;
      char.currentPathIndex = 0;
      return { newX: char.x, newY: char.y, moved: false, blockedByCharacterId: null };
  }


  if (!char.currentPath || char.currentPath.length === 0 || char.currentPathIndex >= char.currentPath.length) {
    const distToIntended = Math.sqrt(Math.pow(intendedTargetPos.x - char.x, 2) + Math.pow(intendedTargetPos.y - char.y, 2));
    if (distToIntended > AI_TARGET_ARRIVAL_THRESHOLD) {
        const rawPath = findPath({ x: char.x + char.width / 2, y: char.y + char.height / 2 }, intendedTargetPos, map, TILE_SIZE, allCharacters);
        if (rawPath && rawPath.length > 0) {
          char.currentPath = smoothPath(rawPath, map);
          char.currentPathIndex = 0;
        } else {
          char.currentPath = null;
          char.currentPathIndex = 0;
        }
    } else {
        char.currentPath = null;
        char.currentPathIndex = 0;
    }
  }
  
  if (char.currentPath && char.currentPathIndex < char.currentPath.length) {
    const pathNodeIsCenter = char.currentPath[char.currentPathIndex];
    const pathNodeTopLeft = { x: pathNodeIsCenter.x - char.width / 2, y: pathNodeIsCenter.y - char.height / 2 };
    
    currentActualTarget = pathNodeTopLeft;

    const distToPathNodeTopLeft = Math.sqrt(Math.pow(pathNodeTopLeft.x - char.x, 2) + Math.pow(pathNodeTopLeft.y - char.y, 2));

    if (distToPathNodeTopLeft < AI_TARGET_ARRIVAL_THRESHOLD * 1.2) {
      char.currentPathIndex++;
      if (char.currentPathIndex >= char.currentPath.length) {
        char.currentPath = null;
        char.currentPathIndex = 0;
        currentActualTarget = intendedTargetPos;
      } else {
        const nextNodeCenter = char.currentPath[char.currentPathIndex];
        currentActualTarget = { x: nextNodeCenter.x - char.width / 2, y: nextNodeCenter.y - char.height / 2 };
      }
    }
  }

  const dxToCurrentActual = currentActualTarget.x - char.x;
  const dyToCurrentActual = currentActualTarget.y - char.y;
  const distToCurrentActual = Math.sqrt(dxToCurrentActual * dxToCurrentActual + dyToCurrentActual * dyToCurrentActual);

  if (distToCurrentActual <= AI_TARGET_ARRIVAL_THRESHOLD) {
    // Complete the move naturally by moving the remaining distance
    if (distToCurrentActual > 0.001) {
      const moveRatio = Math.min(1, char.speed / distToCurrentActual);
      newX = char.x + dxToCurrentActual * moveRatio;
      newY = char.y + dyToCurrentActual * moveRatio;
      moved = true;
    }
  } else {
    let moveXAmount;
    let moveYAmount;

    if (distToCurrentActual < char.speed) {
      moveXAmount = dxToCurrentActual;
      moveYAmount = dyToCurrentActual;
    } else {
      moveXAmount = (dxToCurrentActual / distToCurrentActual) * char.speed;
      moveYAmount = (dyToCurrentActual / distToCurrentActual) * char.speed;
    }

    const potentialNewX = char.x + moveXAmount;
    const potentialNewY = char.y + moveYAmount;
    
    let currentProvisionalX = originalX;
    let currentProvisionalY = originalY;
    const otherEntities = allCharacters.filter(c => c.id !== char.id && (c.health === undefined || c.health > 0) && (c.type !== EntityType.INTEL_ITEM || !c.isCollected));

    const xCheckResult = isPositionWalkable({ x: potentialNewX, y: originalY }, char.width, char.height, map, char.id, otherEntities);
    if (xCheckResult.isWalkable) {
      currentProvisionalX = potentialNewX;
    } else {
        if (xCheckResult.blockedByCharacterId) finalBlockedByCharacterId = xCheckResult.blockedByCharacterId;
    }

    const yCheckResult = isPositionWalkable({ x: currentProvisionalX, y: potentialNewY }, char.width, char.height, map, char.id, otherEntities);
    if (yCheckResult.isWalkable) {
      currentProvisionalY = potentialNewY;
    } else {
      if (yCheckResult.blockedByCharacterId) finalBlockedByCharacterId = yCheckResult.blockedByCharacterId;
      if (xCheckResult.isWalkable && currentProvisionalX === potentialNewX) {
        currentProvisionalY = originalY; 
      } else if (!xCheckResult.isWalkable) { 
        currentProvisionalX = originalX;
      }
    }
    
    if (currentProvisionalX === originalX && currentProvisionalY === originalY && (xCheckResult.blockedByCharacterId || yCheckResult.blockedByCharacterId)) {
        const yFirstCheck = isPositionWalkable({ x: originalX, y: potentialNewY }, char.width, char.height, map, char.id, otherEntities);
        if (yFirstCheck.isWalkable) {
            const xAfterYCheck = isPositionWalkable({ x: potentialNewX, y: potentialNewY }, char.width, char.height, map, char.id, otherEntities);
            if(xAfterYCheck.isWalkable) {
                currentProvisionalX = potentialNewX;
                currentProvisionalY = potentialNewY;
            } else { 
                currentProvisionalX = originalX;
                currentProvisionalY = potentialNewY;
                if(xAfterYCheck.blockedByCharacterId) finalBlockedByCharacterId = xAfterYCheck.blockedByCharacterId;
            }
        } else {
             if(yFirstCheck.blockedByCharacterId) finalBlockedByCharacterId = yFirstCheck.blockedByCharacterId;
        }
    }

    newX = currentProvisionalX;
    newY = currentProvisionalY;
    moved = (Math.abs(originalX - newX) > 0.001 || Math.abs(originalY - newY) > 0.001);

    if (moved) {
      const distToCurrentActualAfterMove = Math.sqrt(Math.pow(currentActualTarget.x - newX, 2) + Math.pow(currentActualTarget.y - newY, 2));
      if (distToCurrentActualAfterMove <= AI_TARGET_ARRIVAL_THRESHOLD) {
        // Complete the move naturally by moving the remaining distance
        if (distToCurrentActualAfterMove > 0.001) {
          const moveRatio = Math.min(1, char.speed / distToCurrentActualAfterMove);
          newX = char.x + (currentActualTarget.x - char.x) * moveRatio;
          newY = char.y + (currentActualTarget.y - char.y) * moveRatio;
        }
      }
    } else if (distToCurrentActual > AI_TARGET_ARRIVAL_THRESHOLD && !finalBlockedByCharacterId) {
        const combinedCheck = isPositionWalkable({ x: potentialNewX, y: potentialNewY }, char.width, char.height, map, char.id, otherEntities);
        if (!combinedCheck.isWalkable && combinedCheck.blockedByCharacterId) {
            finalBlockedByCharacterId = combinedCheck.blockedByCharacterId;
        }
    }
  }
  
  if (moved) {
    const actualMoveDx = newX - originalX;
    const actualMoveDy = newY - originalY;
    const actualMoveMagnitude = Math.sqrt(actualMoveDx * actualMoveDx + actualMoveDy * actualMoveDy);
    if (actualMoveMagnitude > 0.01) { 
        char.lastMovementVector = { 
            x: actualMoveDx / actualMoveMagnitude,
            y: actualMoveDy / actualMoveMagnitude,
        };
    } else {
        char.lastMovementVector = { x: 0, y: 0 };
    }
    char.lastMovedTime = newGameTime;
  } else {
      char.lastMovementVector = { x: 0, y: 0 };
  }
  
  if (!moved && finalBlockedByCharacterId && char.squadId) {
    const blocker = allCharacters.find(c => c.id === finalBlockedByCharacterId);
    if (blocker && blocker.squadId && blocker.squadId === char.squadId) {
        // If blocked by a squad member, try to find a new path after a short wait
        char.stuckCounter = Math.min(char.stuckCounter + 1, STUCK_TIMEOUT_TICKS);
        if (char.stuckCounter > STUCK_TIMEOUT_TICKS / 4) { // More aggressive about finding new paths
            char.currentPath = null;
            char.currentPathIndex = 0;
        }
    }
  } else if (!moved && !finalBlockedByCharacterId && char.stuckCounter > STUCK_TIMEOUT_TICKS / 4 && char.type !== EntityType.PLAYER) {
    // If stuck and not blocked by a character, try to find a new path
    char.currentPath = null;
    char.currentPathIndex = 0;
    char.stuckCounter = 0;
  }

  const mapPixelWidth = map.widthTiles * TILE_SIZE;
  const mapPixelHeight = map.heightTiles * TILE_SIZE;

  newX = Math.max(0, Math.min(newX, mapPixelWidth - char.width));
  newY = Math.max(0, Math.min(newY, mapPixelHeight - char.height));

  // After all movement logic, before returning, enforce walkability at newX/newY
  const walkableCheck = isPositionWalkable(
    { x: newX, y: newY },
    char.width,
    char.height,
    map,
    char.id,
    allCharacters.filter(c => c.id !== char.id && (c.health === undefined || c.health > 0) && (c.type !== EntityType.INTEL_ITEM || !c.isCollected))
  );
  if (!walkableCheck.isWalkable) {
    // Revert to previous position, trigger stuck logic
    newX = originalX;
    newY = originalY;
    moved = false;
    char.stuckCounter = Math.min((char.stuckCounter || 0) + 1, STUCK_TIMEOUT_TICKS);
    char.currentPath = null;
    char.currentPathIndex = 0;
    finalBlockedByCharacterId = walkableCheck.blockedByCharacterId || finalBlockedByCharacterId;
  }

  // --- Path Node Validation: Ensure next path node is fully walkable for AI's bounding box ---
  if (char.currentPath && char.currentPathIndex < char.currentPath.length) {
    // Validate the next node before moving towards it
    let nextNodeValid = false;
    let validationIndex = char.currentPathIndex;
    while (validationIndex < char.currentPath.length) {
      const nodeCenter = char.currentPath[validationIndex];
      const nodeTopLeft = { x: nodeCenter.x - char.width / 2, y: nodeCenter.y - char.height / 2 };
      const nodeWalkable = isPositionWalkable(nodeTopLeft, char.width, char.height, map, char.id, allCharacters.filter(c => c.id !== char.id && (c.health === undefined || c.health > 0) && (c.type !== EntityType.INTEL_ITEM || !c.isCollected)));
      if (nodeWalkable.isWalkable) {
        nextNodeValid = true;
        if (validationIndex !== char.currentPathIndex) {
          // Skip to the next valid node
          char.currentPathIndex = validationIndex;
        }
        break;
      }
      validationIndex++;
    }
    if (!nextNodeValid) {
      // No valid node found, replan path
      char.currentPath = null;
      char.currentPathIndex = 0;
    }
  }

  // --- Corner Escape Logic: Detect if stuck in a corner and try to escape ---
  if (!moved && isCurrentlyWalkable.isWalkable && !finalBlockedByCharacterId && char.type !== EntityType.PLAYER) {
    // Check for corner: walls on two of four sides (N/S/E/W)
    const directions = [
      { dx: 0, dy: -1 }, // up
      { dx: 0, dy: 1 },  // down
      { dx: -1, dy: 0 }, // left
      { dx: 1, dy: 0 },  // right
    ];
    let wallCount = 0;
    let openDirs = [];
    for (const dir of directions) {
      const checkX = char.x + dir.dx * TILE_SIZE;
      const checkY = char.y + dir.dy * TILE_SIZE;
      const tileX = Math.floor(checkX / TILE_SIZE);
      const tileY = Math.floor(checkY / TILE_SIZE);
      let isWall = false;
      if (map && map.tiles && map.tiles[tileY] && map.tiles[tileY][tileX]) {
        const tile = map.tiles[tileY][tileX];
        if (tile.type === 1 || tile.type === 3 || tile.type === 7) {
          isWall = true;
        }
      }
      if (isWall) wallCount++;
      else openDirs.push(dir);
    }
    if (wallCount >= 2) {
      // Stuck in a corner: try to move in a random open direction or replan
      char.stuckCounter = (char.stuckCounter || 0) + 1;
      if (char.stuckCounter > stuckThreshold) {
        if (openDirs.length > 0) {
          // Try to nudge out of the corner
          const escapeDir = openDirs[Math.floor(Math.random() * openDirs.length)];
          newX = char.x + escapeDir.dx * Math.max(8, Math.floor(char.width / 2));
          newY = char.y + escapeDir.dy * Math.max(8, Math.floor(char.height / 2));
        }
        // Also clear path to force a replan
        char.currentPath = null;
        char.currentPathIndex = 0;
        char.stuckCounter = 0;
        return { newX, newY, moved: true, blockedByCharacterId: null };
      }
    }
  }

  return { newX, newY, moved, blockedByCharacterId: moved ? null : finalBlockedByCharacterId };
};

export const triggerAIEvasiveManeuver = (
    aiChar,
    bullet,
    newGameTime
) => {
    if (newGameTime > aiChar.lastEvasiveManeuverTime + (AI_EVASIVE_MANEUVER_COOLDOWN_MS / GAME_LOOP_INTERVAL)) {
        if (Math.random() < AI_EVASIVE_DODGE_CHANCE) {
            aiChar.isPerformingEvasiveManeuver = true;
            aiChar.lastEvasiveManeuverTime = newGameTime;
            
            if (aiChar.type === EntityType.TEAMMATE) {
                const tm = aiChar;
                tm.effectiveFormationTarget = null; 
                if (!tm.isHoldingPosition) { 
                    tm.preEvasionTarget = tm.targetPosition;
                    tm.preEvasionWaypointQueue = [...tm.waypointQueue];
                    tm.preEvasionCommandedMoveTime = tm.commandedMoveTime;
                } else { 
                    tm.preEvasionTarget = tm.holdPositionTarget; 
                    tm.preEvasionWaypointQueue = null; 
                    tm.preEvasionCommandedMoveTime = null; 
                }
            } else { 
                 aiChar.preEvasionTarget = aiChar.targetPosition;
            }

            const bulletSpeed = Math.sqrt(bullet.dx*bullet.dx + bullet.dy*bullet.dy);
            const normDx = bulletSpeed > 0 ? bullet.dx / bulletSpeed : 0;
            const normDy = bulletSpeed > 0 ? bullet.dy / bulletSpeed : 0;
            
            const evadeDirX = Math.random() < 0.5 ? -normDy : normDy; 
            const evadeDirY = Math.random() < 0.5 ? normDx : -normDx; 

            aiChar.evasiveManeuverTarget = {
                x: aiChar.x + evadeDirX * AI_EVASIVE_STRAFE_DISTANCE,
                y: aiChar.y + evadeDirY * AI_EVASIVE_STRAFE_DISTANCE
            };
            aiChar.currentPath = null; 
            if(aiChar.type === EntityType.TEAMMATE) {
                aiChar.waypointQueue = []; 
            }
        }
    }
    return aiChar;
};

export function predictTargetPosition(shooterCenter, target, bulletSpeed, iterations = 2) {
    const targetCenter = { x: target.x + target.width / 2, y: target.y + target.height / 2 };

    if (!target.lastMovementVector || (target.lastMovementVector.x === 0 && target.lastMovementVector.y === 0) || !target.speed) {
        return targetCenter; // Target is stationary or has no movement data, aim at current center
    }

    let predictedPos = { ...targetCenter };
    let timeToIntercept = 0;

    for (let i = 0; i < iterations; i++) {
        const distToPredicted = Math.sqrt(Math.pow(predictedPos.x - shooterCenter.x, 2) + Math.pow(predictedPos.y - shooterCenter.y, 2));
        
        if (bulletSpeed <= 0) { // Avoid division by zero or nonsensical speeds
             return targetCenter;
        }
        timeToIntercept = distToPredicted / bulletSpeed;

        const targetVelX = target.lastMovementVector.x * target.speed;
        const targetVelY = target.lastMovementVector.y * target.speed;
        
        predictedPos = {
            x: targetCenter.x + targetVelX * timeToIntercept,
            y: targetCenter.y + targetVelY * timeToIntercept,
        };
    }

    return predictedPos;
}
