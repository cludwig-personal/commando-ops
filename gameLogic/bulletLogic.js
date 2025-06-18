import { EntityType, TileType } from '../types.js';
import { PLAYER_BULLET_WALL_DAMAGE } from '../constants.js';
import { checkAABBCollision } from './mapGenerator.js';
import { triggerAIEvasiveManeuver } from './aiUtils.js';

export const updateBulletsLogic = {
    update: (
        bullets,
        player,
        teammates,
        enemies,
        map,
        newGameTime,
        TILE_SIZE
    ) => {
        let newPlayer = { ...player };
        let newTeammates = teammates.map(tm => ({ ...tm }));
        let newEnemies = enemies.map(e => ({ ...e }));
        const newMapTiles = map.tiles.map(row => row.map(tile => ({ ...tile })));
        const newMap = { ...map, tiles: newMapTiles };

        const remainingBullets = bullets.filter(bullet => {
            // Validate bullet damage to prevent NaN
            if (typeof bullet.damage !== 'number' || isNaN(bullet.damage)) {
                console.warn('Invalid bullet damage detected:', bullet);
                return false;
            }

            bullet.x += bullet.dx;
            bullet.y += bullet.dy;
            bullet.traveledDistance += Math.sqrt(bullet.dx * bullet.dx + bullet.dy * bullet.dy);

            if (bullet.traveledDistance > bullet.maxTravelDistance) return false;

            // Check wall collisions
            const bulletTileX = Math.floor((bullet.x + bullet.width / 2) / TILE_SIZE);
            const bulletTileY = Math.floor((bullet.y + bullet.height / 2) / TILE_SIZE);

            if (bulletTileX >= 0 && bulletTileX < newMap.widthTiles && bulletTileY >= 0 && bulletTileY < newMap.heightTiles) {
                const tile = newMap.tiles[bulletTileY][bulletTileX];
                if (tile.type === TileType.WALL || tile.type === TileType.FENCE) {
                    tile.health = (tile.health || 0) - (bullet.ownerId === 'player' ? PLAYER_BULLET_WALL_DAMAGE : bullet.damage);
                    if (tile.health <= 0) {
                        newMap.tiles[bulletTileY][bulletTileX] = { ...tile, type: TileType.EMPTY, health: 0 };
                    }
                    return false;
                }
            }
            
            const charactersToCheck = [];
            if (bullet.ownerId === 'player' || bullet.ownerId.startsWith('teammate-')) {
                charactersToCheck.push(...newEnemies.filter(e => e.health > 0));
            } else { 
                if (newPlayer.health > 0) charactersToCheck.push(newPlayer);
                charactersToCheck.push(...newTeammates.filter(tm => tm.health > 0));
            }

            for (let i = 0; i < charactersToCheck.length; i++) {
                let char = charactersToCheck[i];
                
                if (checkAABBCollision(bullet, char)) {
                    // Ensure health and damage are valid numbers
                    const currentHealth = typeof char.health === 'number' ? char.health : char.maxHealth;
                    const damage = Math.max(0, bullet.damage); // Ensure non-negative damage
                    
                    // Apply damage and ensure health doesn't go below 0
                    char.health = Math.max(0, currentHealth - damage);
                    char.lastTimeHit = newGameTime;

                    if (char.id !== 'player') {
                        char = triggerAIEvasiveManeuver(char, bullet, newGameTime);
                    }

                    // Reset state for dead characters
                    if (char.health <= 0) {
                        char.health = 0;
                        if (char.type === EntityType.TEAMMATE || char.type === EntityType.ENEMY) {
                            char.targetPosition = null;
                            char.targetEntityId = null;
                            char.commandedMoveTime = null;
                            char.currentPath = null;
                            char.waypointQueue = [];
                            char.isPerformingEvasiveManeuver = false;
                            char.evasiveManeuverTarget = null;
                        }
                    }
                    
                    // Update the appropriate character collection
                    if (char.id === 'player') {
                        newPlayer = { ...char };
                    } else if (char.type === EntityType.TEAMMATE) {
                        const tmIndex = newTeammates.findIndex(t => t.id === char.id);
                        if (tmIndex !== -1) newTeammates[tmIndex] = { ...char };
                    } else { 
                        const enIndex = newEnemies.findIndex(e => e.id === char.id);
                        if (enIndex !== -1) newEnemies[enIndex] = { ...char };
                    }
                    return false;
                }
            }
            return true;
        });

        return {
            remainingBullets,
            updatedPlayer: newPlayer,
            updatedTeammates: newTeammates,
            updatedEnemies: newEnemies,
            updatedMap: newMap,
        };
    }
};
