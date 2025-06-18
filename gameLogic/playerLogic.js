import { generateUniqueId } from '../utils/idGenerator.js';
import { EntityType } from '../types.js';
import { isPositionWalkable } from './mapGenerator.js';
import { PLAYER_SHOOT_COOLDOWN_MS, PLAYER_BULLET_SPEED, PLAYER_BULLET_COLOR, PLAYER_BULLET_MAX_TRAVEL_DISTANCE, PLAYER_BULLET_DAMAGE_MIN, PLAYER_BULLET_DAMAGE_MAX, BULLET_SIZE, GAME_LOOP_INTERVAL, GUNSHOT_VOLUME, PLAYER_MOVEMENT_HISTORY_LENGTH } from '../constants.js';
import { playPlayerShootSound } from '../utils/audioUtils.js';

const handlePlayerMovement = (
    player,
    keysPressed,
    map,
    allCharacters
) => {
    const newPlayer = { ...player };
    let dx = 0;
    let dy = 0;
    const originalX = newPlayer.x;
    const originalY = newPlayer.y;

    if (keysPressed['w'] || keysPressed['ArrowUp']) dy -= 1;
    if (keysPressed['s'] || keysPressed['ArrowDown']) dy += 1;
    if (keysPressed['a'] || keysPressed['ArrowLeft']) dx -= 1;
    if (keysPressed['d'] || keysPressed['ArrowRight']) dx += 1;

    if (dx !== 0 || dy !== 0) {
        const magnitude = Math.sqrt(dx * dx + dy * dy);
        const normalizedDx = dx / magnitude;
        const normalizedDy = dy / magnitude;

        const currentMovementVector = { x: normalizedDx, y: normalizedDy };
        newPlayer.lastMovementVector = currentMovementVector;

        const newHistory = [...newPlayer.movementVectorHistory, currentMovementVector];
        if (newHistory.length > PLAYER_MOVEMENT_HISTORY_LENGTH) {
            newHistory.shift();
        }
        newPlayer.movementVectorHistory = newHistory;


        const potentialNewX = newPlayer.x + normalizedDx * newPlayer.speed;
        const potentialNewY = newPlayer.y + normalizedDy * newPlayer.speed;

        const otherEntitiesForPlayer = allCharacters.filter(c => c.id !== newPlayer.id && (c.type !== EntityType.INTEL_ITEM || !c.isCollected));

        if (isPositionWalkable({ x: potentialNewX, y: newPlayer.y }, newPlayer.width, newPlayer.height, map, newPlayer.id, otherEntitiesForPlayer).isWalkable) {
            newPlayer.x = potentialNewX;
        }
        if (isPositionWalkable({ x: newPlayer.x, y: potentialNewY }, newPlayer.width, newPlayer.height, map, newPlayer.id, otherEntitiesForPlayer).isWalkable) {
            newPlayer.y = potentialNewY;
        }
    } else {
        // Player is not trying to move, so their movement vector should be zero.
        newPlayer.lastMovementVector = { x: 0, y: 0 };
    }

    const mapPixelWidth = map.widthTiles * map.tileSize;
    const mapPixelHeight = map.heightTiles * map.tileSize;

    newPlayer.x = Math.max(0, Math.min(newPlayer.x, mapPixelWidth - newPlayer.width));
    newPlayer.y = Math.max(0, Math.min(newPlayer.y, mapPixelHeight - newPlayer.height));


    if (newPlayer.x === originalX && newPlayer.y === originalY) {
        newPlayer.stationaryTicks += 1;
    } else {
        newPlayer.stationaryTicks = 0;
    }

    return { updatedPlayer: newPlayer };
};

const handlePlayerShoot = (
    player,
    target,
    gameTime
) => {
    const nowInTicks = gameTime;
    const cooldownInTicks = PLAYER_SHOOT_COOLDOWN_MS / GAME_LOOP_INTERVAL;

    if (nowInTicks - player.lastShotTime < cooldownInTicks) {
        return { updatedPlayer: player }; // Cooldown not met
    }

    // Calculate player center position
    const playerCenterX = player.x + player.width / 2;
    const playerCenterY = player.y + player.height / 2;

    // Calculate direction vector from player center to target
    const dxToTarget = target.x - playerCenterX;
    const dyToTarget = target.y - playerCenterY;
    const dist = Math.sqrt(dxToTarget * dxToTarget + dyToTarget * dyToTarget);

    // Normalize direction vector and scale by bullet speed
    const bulletDx = dist > 0 ? (dxToTarget / dist) * PLAYER_BULLET_SPEED : 0;
    const bulletDy = dist > 0 ? (dyToTarget / dist) * PLAYER_BULLET_SPEED : 0;
    
    const damageRange = PLAYER_BULLET_DAMAGE_MAX - PLAYER_BULLET_DAMAGE_MIN;
    const randomDamage = Math.floor(Math.random() * (damageRange + 1)) + PLAYER_BULLET_DAMAGE_MIN;

    const newBullet = {
        id: generateUniqueId('bullet-player'),
        type: EntityType.BULLET,
        x: playerCenterX - BULLET_SIZE / 2,
        y: playerCenterY - BULLET_SIZE / 2,
        width: BULLET_SIZE,
        height: BULLET_SIZE,
        color: PLAYER_BULLET_COLOR,
        dx: bulletDx,
        dy: bulletDy,
        ownerId: player.id,
        damage: randomDamage,
        maxTravelDistance: PLAYER_BULLET_MAX_TRAVEL_DISTANCE,
        traveledDistance: 0,
    };
    playPlayerShootSound(GUNSHOT_VOLUME);
    return { 
        updatedPlayer: { ...player, lastShotTime: nowInTicks }, 
        newBullet 
    };
};

export const updatePlayerLogic = {
    handlePlayerMovement,
    handlePlayerShoot,
};
