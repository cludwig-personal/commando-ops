
import { ObjectiveType, TileType, EntityType } from '../types.js';
import { checkAABBCollision, isPositionWalkable } from './mapGenerator.js';

export const updateObjectiveLogic = {
    handleIntelCollection: (
        player,
        intelItems,
        objectives
    ) => {
        const playerRect = { x: player.x, y: player.y, width: player.width, height: player.height };
        let intelCollectedThisTick = false;

        const updatedIntelItems = intelItems.map(item => {
            if (!item.isCollected && checkAABBCollision(playerRect, item)) {
                intelCollectedThisTick = true;
                return { ...item, isCollected: true };
            }
            return item;
        });

        let objectivesWithIntelUpdate = [...objectives];
        if (intelCollectedThisTick) {
            objectivesWithIntelUpdate = objectives.map(obj => {
                if (obj.type === ObjectiveType.COLLECT_INTEL && !obj.isCompleted) {
                    const collectedCount = updatedIntelItems.filter(item => item.isCollected).length;
                    return { ...obj, collectedCount };
                }
                return obj;
            });
        }
        return { updatedIntelItems, objectivesWithIntelUpdate };
    },

    updateGameObjectives: (
        objectives,
        player,
        enemies,
        map,
        TILE_SIZE
    ) => {
        let allPrimaryObjectivesCompleted = true;
        let extractionObjectiveExists = false;
        let extractionObjectiveCompleted = false;
        let gameWon = false;

        const updatedObjectives = objectives.map(obj => {
            if (obj.isCompleted) {
                if (obj.type === ObjectiveType.REACH_LOCATION) extractionObjectiveCompleted = true;
                return obj;
            }

            let objectiveNowComplete = false;
            switch (obj.type) {
                case ObjectiveType.ELIMINATE_TARGET:
                case ObjectiveType.ELIMINATE_HV_BOSS:
                    const targetEnemy = enemies.find(e => e.id === obj.targetEntityId);
                    if (!targetEnemy || targetEnemy.health <= 0) {
                        objectiveNowComplete = true;
                    }
                    break;
                case ObjectiveType.COLLECT_INTEL:
                    if (obj.collectedCount && obj.requiredCollectibles && obj.collectedCount >= obj.requiredCollectibles) {
                        objectiveNowComplete = true;
                    }
                    break;
                case ObjectiveType.REACH_LOCATION:
                    extractionObjectiveExists = true;
                    if (obj.targetPosition) {
                        const distToExtraction = Math.sqrt(Math.pow(player.x + player.width/2 - obj.targetPosition.x, 2) + Math.pow(player.y + player.height/2 - obj.targetPosition.y, 2));
                        if (distToExtraction < TILE_SIZE * 1.5) {
                            objectiveNowComplete = true;
                            gameWon = true; 
                        }
                    }
                    break;
            }

            if (objectiveNowComplete) {
                if (obj.type === ObjectiveType.REACH_LOCATION) extractionObjectiveCompleted = true;
                return { ...obj, isCompleted: true };
            }
            
            if (obj.type !== ObjectiveType.REACH_LOCATION && !objectiveNowComplete) {
                allPrimaryObjectivesCompleted = false;
            }
            return obj;
        });

        if (allPrimaryObjectivesCompleted && !extractionObjectiveExists && !extractionObjectiveCompleted) {
            let extractionPoint = { 
                x: Math.floor(map.widthTiles / 2) * TILE_SIZE + TILE_SIZE/2, 
                y: Math.floor(map.heightTiles / 4) * TILE_SIZE + TILE_SIZE/2 
            }; 
            let extractionSpawnFound = false;
            for(let r=-2; r<=2 && !extractionSpawnFound; r++){
                for(let c=-2; c<=2 && !extractionSpawnFound; c++){
                    const potentialX = extractionPoint.x + c * TILE_SIZE;
                    const potentialY = extractionPoint.y + r * TILE_SIZE;
                     if (isPositionWalkable({ x: potentialX - player.width/2, y: potentialY - player.height/2 }, player.width, player.height, map, 'extraction-placement', []).isWalkable) {
                        extractionPoint.x = potentialX;
                        extractionPoint.y = potentialY;
                        extractionSpawnFound = true;
                     }
                }
            }
            if(!extractionSpawnFound) console.warn("Could not find ideal walkable extraction point, using default.");

            updatedObjectives.push({
                id: 'obj-extract', type: ObjectiveType.REACH_LOCATION,
                description: 'Reach Extraction Point', isCompleted: false,
                targetPosition: extractionPoint,
            });
        }
          
        const firstActiveObjective = updatedObjectives.find(obj => !obj.isCompleted);
        const currentObjectiveId = firstActiveObjective ? firstActiveObjective.id : null;
        
        if (!gameWon && allPrimaryObjectivesCompleted && extractionObjectiveCompleted) {
            gameWon = true;
        }

        return {
            updatedObjectives,
            currentObjectiveId,
            gameWon,
        };
    }
};
