import { generateUniqueId } from '../utils/idGenerator.js';
console.log('[initialization.js] Module loaded successfully.');
import { EntityType, TileType, EnemyVariant, FormationShape, ObjectiveType, EnvironmentType } from '../types.js';
import {
  DEFAULT_TILE_SIZE, MAP_WIDTH_TILES, MAP_HEIGHT_TILES, PLAYER_SIZE, PLAYER_SPEED, PLAYER_HEALTH, PLAYER_COLOR,
  TEAMMATE_SIZE, TEAMMATE_SPEED, TEAMMATE_HEALTH, TEAMMATE_COLORS, TEAMMATE_DETECTION_RADIUS, TEAMMATE_SHOOT_RANGE,
  ENEMY_SIZE, ENEMY_COLORS, ENEMY_SPEED, ENEMY_DETECTION_RADIUS, ENEMY_SHOOT_RANGE, ENEMY_HEALTH_HV_BOSS,
  ENEMY_HEALTH_SOLDIER, ENEMY_HEALTH_BOSS, ENEMY_HEALTH_GRENADIER,
  INTEL_ITEM_SIZE, INTEL_ITEM_FILL_COLOR, NUM_INTEL_TO_COLLECT, TEAMMATE_DETECTION_RADIUS as FRIENDLY_DETECTION_RADIUS_CONST,
  ENEMY_GRENADIER_SHOOT_RANGE, ENEMY_BOSS_SHOOT_RANGE,
  ENEMY_SPEED_MULTIPLIER_SOLDIER, ENEMY_SPEED_MULTIPLIER_GRENADIER, ENEMY_SPEED_MULTIPLIER_BOSS, ENEMY_SPEED_MULTIPLIER_HV_BOSS,
  MAX_ENEMY_SQUADS, ENEMY_SQUAD_COMPOSITION, ENEMY_SQUAD_FORMATION_SHAPES, ALL_ENEMY_SQUAD_FORMATION_OFFSETS,
  HVT_COLOR, MAX_GENERIC_BOSSES
} from '../constants.js';
import { generateMap, isPositionWalkable } from './mapGenerator.js';
import { getSectors } from './sectorUtils.js';
import { isPositionInViewport } from '../utils/vectorUtils.js';


export const createInitialPlayer = (map) => {
  console.log('[initialization.js] createInitialPlayer: START');
  let startX = Math.floor(map.widthTiles / 2) * map.tileSize + (map.tileSize - PLAYER_SIZE) / 2;
  let startY = Math.floor(map.heightTiles / 2) * map.tileSize + (map.tileSize - PLAYER_SIZE) / 2;
  const emptyInitialChars = [];

  let initialWalkableResult = isPositionWalkable({ x: startX, y: startY }, PLAYER_SIZE, PLAYER_SIZE, map, 'player-init', emptyInitialChars);
  let spawnPointSuccessfullyFound = initialWalkableResult.isWalkable;

  if (!spawnPointSuccessfullyFound) {
      console.log('[initialization.js] createInitialPlayer: Initial spawn point not walkable, searching...');
      for (let r = 0; r < map.heightTiles; r++) {
          for (let c = 0; c < map.widthTiles; c++) {
              if (map.tiles[r][c].type === TileType.ROAD || map.tiles[r][c].type === TileType.GRASS || map.tiles[r][c].type === TileType.BUILDING_FLOOR || map.tiles[r][c].type === TileType.EMPTY) {
                  const potentialX = c * map.tileSize + (map.tileSize - PLAYER_SIZE) / 2;
                  const potentialY = r * map.tileSize + (map.tileSize - PLAYER_SIZE) / 2;
                  const fallbackWalkableResult = isPositionWalkable({ x: potentialX, y: potentialY }, PLAYER_SIZE, PLAYER_SIZE, map, 'player-init-fallback', emptyInitialChars);
                  if (fallbackWalkableResult.isWalkable) {
                      startX = potentialX;
                      startY = potentialY;
                      spawnPointSuccessfullyFound = true;
                      console.log(`[initialization.js] createInitialPlayer: Found fallback spawn at ${startX}, ${startY}`);
                      break;
                  }
              }
          }
          if (spawnPointSuccessfullyFound) break;
      }
  }
   if (!spawnPointSuccessfullyFound) {
    console.warn("[initialization.js] createInitialPlayer: Player spawn point is not walkable even after search. Defaulting to TILE_SIZE offset, may be inside wall.");
    startX = map.tileSize * 2;
    startY = map.tileSize * 2;
  }
  console.log('[initialization.js] createInitialPlayer: END');
  return {
    id: 'player', type: EntityType.PLAYER, x: startX, y: startY, width: PLAYER_SIZE, height: PLAYER_SIZE,
    color: PLAYER_COLOR, health: PLAYER_HEALTH, maxHealth: PLAYER_HEALTH, speed: PLAYER_SPEED,
    lastShotTime: 0,
    lastMovementVector: { x: 0, y: 1 }, // Player starts with a default orientation
    movementVectorHistory: [],
    lastTimeHit: 0,
    stationaryTicks: 0,
  };
};

export const createInitialTeammates = (player, map) => {
  console.log('[initialization.js] createInitialTeammates: START');
  const teammates = [];
  const entitiesToAvoid = [player];
  const spawnAttemptsPerTeammate = 30;
  const minSpawnDistance = map.tileSize * 2; // Minimum distance from player
  const maxSpawnDistance = map.tileSize * 4; // Maximum distance from player

  for (let i = 0; i < 3; i++) {
    let tx, ty;
    let spotFound = false;

    for (let attempt = 0; attempt < spawnAttemptsPerTeammate; attempt++) {
      const angle = Math.random() * 2 * Math.PI;
      const distance = minSpawnDistance + Math.random() * (maxSpawnDistance - minSpawnDistance);

      const potentialX = player.x + player.width / 2 - TEAMMATE_SIZE / 2 + Math.cos(angle) * distance;
      const potentialY = player.y + player.height / 2 - TEAMMATE_SIZE / 2 + Math.sin(angle) * distance;

      // Check if the position is walkable and not too close to other teammates
      const walkableResult = isPositionWalkable({x: potentialX, y: potentialY}, TEAMMATE_SIZE, TEAMMATE_SIZE, map, `teammate-${i}-init`, entitiesToAvoid);
      if (walkableResult.isWalkable) {
        // Additional check to ensure minimum distance from other teammates
        let tooCloseToOtherTeammate = false;
        for (const teammate of teammates) {
          const distToTeammate = Math.sqrt(Math.pow(potentialX - teammate.x, 2) + Math.pow(potentialY - teammate.y, 2));
          if (distToTeammate < minSpawnDistance) {
            tooCloseToOtherTeammate = true;
            break;
          }
        }
        if (!tooCloseToOtherTeammate) {
          spotFound = true;
          tx = potentialX;
          ty = potentialY;
          break;
        }
      }
    }

    if (!spotFound) {
      console.log(`[initialization.js] createInitialTeammates: Teammate ${i} preferred spawn not found, searching wider...`);
      for (let r = 0; r < map.heightTiles && !spotFound; r++) {
        for (let c = 0; c < map.widthTiles && !spotFound; c++) {
           if (map.tiles[r][c].type === TileType.GRASS || map.tiles[r][c].type === TileType.EMPTY || map.tiles[r][c].type === TileType.ROAD || map.tiles[r][c].type === TileType.BUILDING_FLOOR) {
            const candidateX = c * map.tileSize + (map.tileSize - TEAMMATE_SIZE) / 2;
            const candidateY = r * map.tileSize + (map.tileSize - TEAMMATE_SIZE) / 2;
            
            // Check distance from player
            const distToPlayer = Math.sqrt(Math.pow(candidateX - player.x, 2) + Math.pow(candidateY - player.y, 2));
            if (distToPlayer < minSpawnDistance) continue;

            // Check distance from other teammates
            let tooCloseToOtherTeammate = false;
            for (const teammate of teammates) {
              const distToTeammate = Math.sqrt(Math.pow(candidateX - teammate.x, 2) + Math.pow(candidateY - teammate.y, 2));
              if (distToTeammate < minSpawnDistance) {
                tooCloseToOtherTeammate = true;
                break;
              }
            }
            if (tooCloseToOtherTeammate) continue;

            if (isPositionWalkable({ x: candidateX, y: candidateY }, TEAMMATE_SIZE, TEAMMATE_SIZE, map, `teammate-${i}-init-fallback`, entitiesToAvoid).isWalkable) {
              tx = candidateX;
              ty = candidateY;
              spotFound = true;
              console.log(`[initialization.js] createInitialTeammates: Teammate ${i} found fallback spawn.`);
              break;
            }
          }
        }
         if (spotFound) break;
      }
    }

    if (!spotFound) {
        // Last resort: spawn at a fixed distance from player in a circle
        const angle = (i * 2 * Math.PI) / 3; // Evenly space around the circle
        tx = player.x + Math.cos(angle) * minSpawnDistance;
        ty = player.y + Math.sin(angle) * minSpawnDistance;
        console.warn(`[initialization.js] createInitialTeammates: Teammate ${i} using super fallback spawn position.`);
    }

    const newTeammate = {
      id: generateUniqueId(`teammate-${i}`), type: EntityType.TEAMMATE, x: tx, y: ty, width: TEAMMATE_SIZE, height: TEAMMATE_SIZE,
      color: TEAMMATE_COLORS[i % TEAMMATE_COLORS.length], health: TEAMMATE_HEALTH, maxHealth: TEAMMATE_HEALTH,
      speed: TEAMMATE_SPEED, isSelected: false, targetPosition: null,
      targetEntityId: null, lastShotTime: 0, detectionRange: TEAMMATE_DETECTION_RADIUS, shootRange: TEAMMATE_SHOOT_RANGE,
      commandedMoveTime: null, lastMovedTime: 0, stuckCounter: 0,
      currentPath: null, currentPathIndex: 0,
      lastEvasiveManeuverTime: 0, evasiveManeuverTarget: null, isPerformingEvasiveManeuver: false,
      preEvasionTarget: null,
      preEvasionWaypointQueue: null,
      preEvasionCommandedMoveTime: null,
      lastTimeHit: 0,
      waypointQueue: [],
      isHoldingPosition: false, 
      holdPositionTarget: null, 
      effectiveFormationTarget: null,
      lastMovementVector: { x: 0, y: 0 },
    };
    teammates.push(newTeammate);
    entitiesToAvoid.push(newTeammate);
  }
  console.log('[initialization.js] createInitialTeammates: END');
  return teammates;
};

// Helper to spawn a single NON-SQUAD enemy (HV_BOSS, HVT_BOSS, Generic_BOSS)
export function spawnSingleEnemy(variant, squadId, map, charactersToAvoid, isHVT = false) {
    const healthMap = {
        [EnemyVariant.SOLDIER]: ENEMY_HEALTH_SOLDIER,
        [EnemyVariant.BOSS]: ENEMY_HEALTH_BOSS,
        [EnemyVariant.GRENADIER]: ENEMY_HEALTH_GRENADIER,
        [EnemyVariant.HV_BOSS]: ENEMY_HEALTH_HV_BOSS,
    };
    const speedMultiplierMap = {
        [EnemyVariant.SOLDIER]: ENEMY_SPEED_MULTIPLIER_SOLDIER,
        [EnemyVariant.GRENADIER]: ENEMY_SPEED_MULTIPLIER_GRENADIER,
        [EnemyVariant.BOSS]: ENEMY_SPEED_MULTIPLIER_BOSS,
        [EnemyVariant.HV_BOSS]: ENEMY_SPEED_MULTIPLIER_HV_BOSS,
    };
    let currentShootRange;
    switch(variant) {
        case EnemyVariant.SOLDIER: currentShootRange = ENEMY_SHOOT_RANGE; break;
        case EnemyVariant.GRENADIER: currentShootRange = ENEMY_GRENADIER_SHOOT_RANGE; break;
        case EnemyVariant.BOSS: currentShootRange = ENEMY_BOSS_SHOOT_RANGE; break;
        case EnemyVariant.HV_BOSS: currentShootRange = ENEMY_BOSS_SHOOT_RANGE; break; // HV_BOSS uses BOSS shoot range
        default: currentShootRange = ENEMY_SHOOT_RANGE;
    }

    let ex, ey;
    let spotFound = false;
    const maxSpawnAttempts = 100;
    const enemyId = generateUniqueId(`enemy-${variant.toLowerCase()}-solo`);
    
    const playerSpawnCenterX = Math.floor(map.widthTiles / 2) * map.tileSize;
    const playerSpawnCenterY = Math.floor(map.heightTiles / 2) * map.tileSize;
    const minSpawnDistFromPlayerCenter = map.tileSize * 15;

    // Get viewport info if available (from global or map)
    let viewport = null;
    if (typeof window !== 'undefined' && window.camera && window.canvas) {
        viewport = {
            x: window.camera.x,
            y: window.camera.y,
            width: window.canvas.width,
            height: window.canvas.height
        };
    } else if (map.viewport) {
        viewport = map.viewport;
    }

    for (let attempt = 0; attempt < maxSpawnAttempts; attempt++) {
        let randTileX = Math.floor(Math.random() * (map.widthTiles - 2)) + 1;
        let randTileY = Math.floor(Math.random() * (map.heightTiles - 2)) + 1;

        const targetTileType = map.tiles[randTileY]?.[randTileX]?.type;
        if (targetTileType === TileType.WALL || targetTileType === TileType.WATER || targetTileType === TileType.FENCE) continue;

        const potentialX = randTileX * map.tileSize + (map.tileSize - ENEMY_SIZE) / 2;
        const potentialY = randTileY * map.tileSize + (map.tileSize - ENEMY_SIZE) / 2;
        
        // Prevent spawning inside the viewport
        if (viewport && isPositionInViewport(potentialX, potentialY, viewport)) continue;

        const distToPlayerSpawn = Math.sqrt(Math.pow(potentialX - playerSpawnCenterX, 2) + Math.pow(potentialY - playerSpawnCenterY, 2));
        if (distToPlayerSpawn <= minSpawnDistFromPlayerCenter) continue;


        if (isPositionWalkable({x: potentialX, y: potentialY}, ENEMY_SIZE, ENEMY_SIZE, map, enemyId, charactersToAvoid).isWalkable) {
            let tooCloseToFriendly = false;
            for (const friendly of charactersToAvoid.filter(c => c.type === EntityType.PLAYER || c.type === EntityType.TEAMMATE)) {
                const distToFriendly = Math.sqrt(Math.pow(potentialX - friendly.x, 2) + Math.pow(potentialY - friendly.y, 2));
                if (distToFriendly < FRIENDLY_DETECTION_RADIUS_CONST) { tooCloseToFriendly = true; break; }
            }
            if (tooCloseToFriendly) continue;
            
            spotFound = true; ex = potentialX; ey = potentialY; break;
        }
    }
    if (!spotFound) { 
        ex = (map.tileSize * (Math.random() < 0.5 ? 3 : map.widthTiles - 4));
        ey = (map.tileSize * (Math.random() < 0.5 ? 3 : map.heightTiles - 4));
        console.warn(`[initialization.js] spawnSingleEnemy (SOLO type ${variant}): ${enemyId} using fallback spawn.`);
        return null; // Return null if fallback is used or no spot found, respawn logic will handle retry.
    }
    
    const enemyColor = isHVT ? HVT_COLOR : ENEMY_COLORS[variant];

    return {
        id: enemyId, type: EntityType.ENEMY_SOLDIER, // Generic type, variant distinguishes
        x: ex, y: ey, width: ENEMY_SIZE, height: ENEMY_SIZE,
        color: enemyColor, 
        health: healthMap[variant], maxHealth: healthMap[variant],
        speed: ENEMY_SPEED * speedMultiplierMap[variant],
        variant: variant, targetEntityId: null, lastShotTime: 0,
        detectionRange: ENEMY_DETECTION_RADIUS * (variant === EnemyVariant.BOSS || variant === EnemyVariant.HV_BOSS || variant === EnemyVariant.GRENADIER ? 1.1 : 1),
        shootRange: currentShootRange,
        targetPosition: null, patrolTargetPosition: null, lastPatrolActivityTime: 0,
        lastMovedTime: 0, stuckCounter: 0, isHVT: isHVT, squadId: squadId, // squadId will be null for these
        currentPath: null, currentPathIndex: 0,
        lastEvasiveManeuverTime: 0, evasiveManeuverTarget: null, isPerformingEvasiveManeuver: false,
        preEvasionTarget: null, lastTimeHit: 0,
        lastMovementVector: { x: 0, y: 0 },
    };
}

export const spawnSquadInSector = (sector, map, charactersToAvoid, isObjectiveGuardian = false) => {
  const squadId = generateUniqueId('squad');
  let focalPoint = null;
  let focalPointFound = false;
  const maxFocalPointAttempts = 50;

  for (let attempt = 0; attempt < maxFocalPointAttempts && !focalPointFound; attempt++) {
    const tileX = sector.x + Math.floor(Math.random() * sector.width);
    const tileY = sector.y + Math.floor(Math.random() * sector.height);
    const potentialFocalPoint = {
      x: tileX * map.tileSize + map.tileSize / 2,
      y: tileY * map.tileSize + map.tileSize / 2,
    };
    // Prevent squad focal point from being inside the viewport
    let viewport = null;
    if (typeof window !== 'undefined' && window.camera && window.canvas) {
        viewport = {
            x: window.camera.x,
            y: window.camera.y,
            width: window.canvas.width,
            height: window.canvas.height
        };
    } else if (map.viewport) {
        viewport = map.viewport;
    }
    if (viewport && isPositionInViewport(potentialFocalPoint.x, potentialFocalPoint.y, viewport)) continue;
    if (isPositionWalkable(potentialFocalPoint, ENEMY_SIZE, ENEMY_SIZE, map, `squad-${squadId}-fp`, charactersToAvoid).isWalkable) {
      focalPoint = potentialFocalPoint;
      focalPointFound = true;
    }
  }

  if (!focalPoint) {
    console.warn(`[initialization.js] Could not find a valid focal point for a new squad in sector ${sector.id}.`);
    return null;
  }
  
  const squadMembers = [];
  const squadMemberIds = [];
  
  for (const variantStr in ENEMY_SQUAD_COMPOSITION) {
    const variant = EnemyVariant[variantStr];
    const count = ENEMY_SQUAD_COMPOSITION[variantStr];
    for (let j = 0; j < count; j++) {
      const member = spawnSingleEnemy(variant, squadId, map, [...charactersToAvoid, ...squadMembers], false);
      if (member) {
        member.sectorId = sector.id;
        squadMembers.push(member);
        squadMemberIds.push(member.id);
      }
    }
  }

  if (squadMembers.length === 0) {
    return null;
  }
  
  const squadFormationShape = ENEMY_SQUAD_FORMATION_SHAPES[Math.floor(Math.random() * ENEMY_SQUAD_FORMATION_SHAPES.length)];

  const newSquad = {
    id: squadId,
    memberIds: squadMemberIds,
    members: squadMembers,
    sectorId: sector.id,
    currentFormationShape: squadFormationShape,
    formationOffsets: ALL_ENEMY_SQUAD_FORMATION_OFFSETS[squadFormationShape],
    focalPoint: focalPoint,
    isAlerted: false,
    state: 'patrolling',
    lastStateChangeTime: 0,
    regroupTarget: null,
    lastRegroupCheckTime: 0,
    lastSightingReportTime: 0,
    primaryTargetId: null,
    isObjectiveGuardian, // Tag the squad so it doesn't get despawned
  };

  return { newSquad, squadMembers };
};

export const createInitialEnemies = (map, playerAndTeammates, intelItems) => {
  console.log('[initialization.js] createInitialEnemies: START (Squad Based)');
  const enemies = [];
  const enemySquads = [];
  let currentAllCharactersToAvoid = [...playerAndTeammates, ...intelItems];
  const sectors = getSectors();
  const intelSectors = intelItems.map(item => {
    const tileX = Math.floor(item.x / map.tileSize);
    const tileY = Math.floor(item.y / map.tileSize);
    for (const sector of sectors) {
        if (tileX >= sector.x && tileX < sector.x + sector.width &&
            tileY >= sector.y && tileY < sector.y + sector.height) {
            return sector.id;
        }
    }
    return -1;
  }).filter(id => id !== -1);

  const uniqueIntelSectors = [...new Set(intelSectors)];

  // 1. Spawn HV_BOSS (Commander) - Non-squad
  const hvBoss = spawnSingleEnemy(EnemyVariant.HV_BOSS, null, map, currentAllCharactersToAvoid, false);
  if (hvBoss) {
      enemies.push(hvBoss);
      currentAllCharactersToAvoid.push(hvBoss);
      console.log('[initialization.js] createInitialEnemies: HV_BOSS (Commander) spawned.');
  } else {
      console.error("[initialization.js] FAILED to spawn HV_BOSS (Commander).");
  }


  // 2. Spawn one regular BOSS (to be potentially marked as HVT later) - Non-squad
  const hvtPotentialBoss = spawnSingleEnemy(EnemyVariant.BOSS, null, map, currentAllCharactersToAvoid, false); 
  if (hvtPotentialBoss) {
      enemies.push(hvtPotentialBoss);
      currentAllCharactersToAvoid.push(hvtPotentialBoss);
      console.log('[initialization.js] createInitialEnemies: HVT Potential Boss spawned.');
  } else {
      console.error("[initialization.js] FAILED to spawn HVT Potential Boss.");
  }

  // 3. Spawn Generic (non-HVT) Bosses - Non-squad
  for (let i = 0; i < MAX_GENERIC_BOSSES; i++) {
    const genericBoss = spawnSingleEnemy(EnemyVariant.BOSS, null, map, currentAllCharactersToAvoid, false);
    if (genericBoss) {
        enemies.push(genericBoss);
        currentAllCharactersToAvoid.push(genericBoss);
        console.log(`[initialization.js] createInitialEnemies: Generic Boss ${i+1} spawned.`);
    } else {
        console.warn(`[initialization.js] createInitialEnemies: Failed to spawn Generic Boss ${i+1}. Might reach max attempts if map is crowded.`);
    }
  }

  // 3. Spawn ONE guardian squad for each sector containing an intel item.
  uniqueIntelSectors.forEach(sectorId => {
    const sector = sectors.find(s => s.id === sectorId);
    if (sector) {
      const result = spawnSquadInSector(sector, map, currentAllCharactersToAvoid, true); // Mark as guardian
      if (result) {
        const { newSquad, squadMembers } = result;
        enemySquads.push(newSquad);
        enemies.push(...squadMembers);
        currentAllCharactersToAvoid.push(...squadMembers);
      }
    }
  });
  
  console.log(`[initialization.js] createInitialEnemies: END. Created ${enemies.length} total initial enemies in ${enemySquads.length} guardian squads.`);
  return { enemies, enemySquads };
};


export const createInitialObjectives = (enemies, intelItems) => {
  console.log('[initialization.js] createInitialObjectives: START');
  const objectives = [];

  // Find HV_BOSS (commander) and a BOSS (HVT) that is not the HV_BOSS
  const hvtBoss = enemies.find(e => e.variant === EnemyVariant.HV_BOSS && !e.squadId);
  // Ensure HVT is not the same as HV_BOSS
  const hvtPotential = enemies.find(e => e.variant === EnemyVariant.BOSS && !e.squadId && (!hvtBoss || e.id !== hvtBoss.id));

  if (hvtBoss) {
    hvtBoss.isHVT = true;
    hvtBoss.color = HVT_COLOR;
    objectives.push({
      id: 'obj-eliminate-hv-boss',
      type: ObjectiveType.ELIMINATE_HV_BOSS,
      description: 'Eliminate Enemy Commander',
      isCompleted: false,
      targetEntityId: hvtBoss.id,
    });
  } else {
    console.error("HV_BOSS (Commander) not spawned! Commander objective will not be created.");
  }

  if (hvtPotential) {
    hvtPotential.isHVT = true;
    hvtPotential.color = HVT_COLOR;
    objectives.push({
      id: 'obj-eliminate-hvt-boss',
      type: ObjectiveType.ELIMINATE_TARGET,
      description: 'Eliminate the HVT',
      isCompleted: false,
      targetEntityId: hvtPotential.id,
    });
  } else {
    console.error("HVT (Boss) not spawned! HVT objective will not be created.");
  }

  objectives.push({
    id: 'obj-intel',
    type: ObjectiveType.COLLECT_INTEL,
    description: `Collect ${NUM_INTEL_TO_COLLECT} intel items`,
    isCompleted: false,
    requiredCollectibles: NUM_INTEL_TO_COLLECT,
    collectedCount: 0,
    intelItemIds: intelItems.map(item => item.id),
  });

  console.log('[initialization.js] createInitialObjectives: END');
  return objectives;
};

export const createInitialIntelItems = (map, charactersToAvoid) => {
  console.log('[initialization.js] createInitialIntelItems: START');
  const intelItems = [];
  let currentCharactersToAvoid = [...charactersToAvoid];
  const sectors = getSectors();
  const shuffledSectors = [...sectors].sort(() => 0.5 - Math.random());
  let placedIntelCount = 0;

  for (const sector of shuffledSectors) {
      if (placedIntelCount >= NUM_INTEL_TO_COLLECT) break;

      let itemX, itemY;
      let spotFound = false;
      const maxSpawnAttempts = 100;

      for (let attempt = 0; attempt < maxSpawnAttempts; attempt++) {
          const randTileX = sector.x + Math.floor(Math.random() * sector.width);
          const randTileY = sector.y + Math.floor(Math.random() * sector.height);
          
          const targetTileType = map.tiles[randTileY]?.[randTileX]?.type;
          if (!targetTileType || targetTileType === TileType.WALL || targetTileType === TileType.WATER) continue;

          const potentialX = randTileX * map.tileSize + (map.tileSize - INTEL_ITEM_SIZE) / 2;
          const potentialY = randTileY * map.tileSize + (map.tileSize - INTEL_ITEM_SIZE) / 2;
          
          const walkableCheckId = `intel-item-init-${placedIntelCount}`;
          if (isPositionWalkable({ x: potentialX, y: potentialY }, INTEL_ITEM_SIZE, INTEL_ITEM_SIZE, map, walkableCheckId, currentCharactersToAvoid).isWalkable) {
              itemX = potentialX;
              itemY = potentialY;
              spotFound = true;
              break;
          }
      }

      if (spotFound) {
          const intelId = generateUniqueId(`intel-${placedIntelCount}`);
          const newIntelItem = {
              id: intelId, type: EntityType.INTEL_ITEM,
              x: itemX, y: itemY,
              width: INTEL_ITEM_SIZE, height: INTEL_ITEM_SIZE,
              color: INTEL_ITEM_FILL_COLOR,
              isCollected: false,
          };
          intelItems.push(newIntelItem);
          currentCharactersToAvoid.push(newIntelItem);
          placedIntelCount++;
          console.log(`[initialization.js] createInitialIntelItems: Placed intel ${intelId} in sector ${sector.id}`);
      } else {
          console.warn(`[initialization.js] createInitialIntelItems: Could not find suitable location for intel in sector ${sector.id} after ${maxSpawnAttempts} attempts.`);
      }
  }

  if (intelItems.length < NUM_INTEL_TO_COLLECT) {
      console.error(`[initialization.js] createInitialIntelItems: FAILED to place all required intel items. Placed ${intelItems.length}/${NUM_INTEL_TO_COLLECT}.`);
  }
  
  console.log('[initialization.js] createInitialIntelItems: END');
  return intelItems;
};


export const initializeGameWorld = (environmentType) => {
  console.log('[initialization.js] initializeGameWorld: START with environment:', environmentType);
  const TILE_SIZE = DEFAULT_TILE_SIZE; 

  console.time('generateMap');
  const map = generateMap(MAP_WIDTH_TILES, MAP_HEIGHT_TILES, TILE_SIZE, environmentType);
  console.timeEnd('generateMap');
  console.log('[initialization.js] initializeGameWorld: Map generated.');

  console.time('createInitialPlayer');
  const player = createInitialPlayer(map);
  console.timeEnd('createInitialPlayer');
  console.log('[initialization.js] initializeGameWorld: Player created.');

  console.time('createInitialTeammates');
  const teammates = createInitialTeammates(player, map);
  console.timeEnd('createInitialTeammates');
  console.log('[initialization.js] initializeGameWorld: Teammates created.');

  const initialPlayerAndTeammates = [player, ...teammates];
  console.time('createInitialEnemiesAndSquads');
  const intelItems = createInitialIntelItems(map, initialPlayerAndTeammates);
  const { enemies, enemySquads } = createInitialEnemies(map, initialPlayerAndTeammates, intelItems); 
  console.timeEnd('createInitialEnemiesAndSquads');
  console.log('[initialization.js] initializeGameWorld: Enemies and Squads created.');

  console.time('createInitialObjectives');
  const objectives = createInitialObjectives(enemies, intelItems); 
  console.timeEnd('createInitialObjectives');
  console.log('[initialization.js] initializeGameWorld: Objectives created.');

  const firstObjective = objectives.find(obj => !obj.isCompleted);
  console.log('[initialization.js] initializeGameWorld: END successfully.');

  return {
    player,
    teammates,
    enemies,
    enemySquads, 
    bullets: [],
    map,
    objectives,
    intelItems,
    gameTime: 0,
    lastRespawnTick: 0,
    currentObjectiveId: firstObjective ? firstObjective.id : null,
    selectedTeammateIds: [],
    gameOver: false,
    gameWon: false,
    keysPressed: {},
    chosenEnvironment: environmentType,
    currentFormationShape: FormationShape.DIAMOND,
    lastEnemySightedSoundTime: 0,
    isPaused: false,
    isHudVisible: true,
    lastHKeyPress: false,
  };
};
