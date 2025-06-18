
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
            bullet.x += bullet.dx;
            bullet.y += bullet.dy;
            bullet.traveledDistance += Math.sqrt(bullet.dx * bullet.dx + bullet.dy * bullet.dy);

            if (bullet.traveledDistance > bullet.maxTravelDistance) return false;

            if (bullet.x < 0 || bullet.x > newMap.widthTiles * TILE_SIZE || bullet.y < 0 || bullet.y > newMap.heightTiles * TILE_SIZE) {
                return false;
            }

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
                    char.health -= bullet.damage;
                    char.lastTimeHit = newGameTime;

                    if (char.id !== 'player') {
                        char = triggerAIEvasiveManeuver(char, bullet, newGameTime);
                    }

                    if (char.health <= 0) {
                        char.health = 0;
                        if (char.type === EntityType.TEAMMATE) {
                            char.targetPosition = null;
                            char.targetEntityId = null;
                            char.commandedMoveTime = null;
                            char.currentPath = null;
                            char.waypointQueue = [];
                        }
                    }
                    
                    if (char.id === 'player') {
                        newPlayer = char;
                    } else if (char.type === EntityType.TEAMMATE) {
                        const tmIndex = newTeammates.findIndex(t => t.id === char.id);
                        if (tmIndex !== -1) newTeammates[tmIndex] = char;
                    } else { 
                        const enIndex = newEnemies.findIndex(e => e.id === char.id);
                        if (enIndex !== -1) newEnemies[enIndex] = char;
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
