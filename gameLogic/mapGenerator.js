import { TileType, EntityType, EnvironmentType } from '../types.js'; 
import { WALL_HEALTH, FENCE_HEALTH, PATHFINDING_MAX_NODES_EXPLORED } from '../constants.js';
console.log('[mapGenerator.js] Module loaded successfully.');

// Moved from GameEngine.tsx
export const checkAABBCollision = (rect1, rect2) => {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
};

// Helper to fill a rectangle of tiles. Input x,y,w,h are tile-based coordinates/dimensions, can be float.
const fillRect = (
    tiles, 
    x, y, // Top-left corner of the rectangle (tile coordinates, can be float)
    w, h, // Width and height of the rectangle (tile dimensions, can be float)
    type, 
    mapWidthTiles, mapHeightTiles, 
    health, 
    isExplored = true
) => {
  const startTileX = Math.floor(x);
  const endTileX = Math.floor(x + w - 0.00001); 
  const startTileY = Math.floor(y);
  const endTileY = Math.floor(y + h - 0.00001); 

  for (let iterY = startTileY; iterY <= endTileY; iterY++) {
    for (let iterX = startTileX; iterX <= endTileX; iterX++) {
      if (iterX >= 0 && iterX < mapWidthTiles && iterY >= 0 && iterY < mapHeightTiles) {
        let currentHealth = undefined;
        if (type === TileType.WALL) currentHealth = health || WALL_HEALTH;
        if (type === TileType.FENCE) currentHealth = health || FENCE_HEALTH;
        
        tiles[iterY][iterX] = { 
            x: iterX, 
            y: iterY, 
            type, 
            health: currentHealth, 
            isExplored
        };
      }
    }
  }
};

// Original drawLine - for drawing directly
const drawLine = (
    tiles,
    x1, y1,
    x2, y2,
    type,
    mapWidthTiles, mapHeightTiles,
    thickness = 1
) => {
    let currentX = x1;
    let currentY = y1;

    const dxAbs = Math.abs(x2 - currentX);
    const dyAbs = Math.abs(y2 - currentY);
    const sx = (currentX < x2) ? 1 : -1;
    const sy = (currentY < y2) ? 1 : -1;
    let err = dxAbs - dyAbs;

    const setTileAtFloored = (tileValX, tileValY) => {
        const iX = Math.floor(tileValX); 
        const iY = Math.floor(tileValY); 

        if (thickness === 1) {
            if (iX >= 0 && iX < mapWidthTiles && iY >= 0 && iY < mapHeightTiles) {
                 tiles[iY][iX] = { 
                    x: iX, y: iY, 
                    type, 
                    health: type === TileType.FENCE ? FENCE_HEALTH : undefined, 
                    isExplored: true 
                };
            }
        } else { 
            fillRect(tiles, 
                     tileValX - (thickness - 1) / 2.0, 
                     tileValY - (thickness - 1) / 2.0, 
                     thickness, thickness, type, mapWidthTiles, mapHeightTiles);
        }
    };
    
    const maxIterations = Math.ceil(Math.max(dxAbs, dyAbs) * 2) + 2;
    let iterations = 0;

    while (iterations <= maxIterations) {
        iterations++;
        setTileAtFloored(currentX, currentY);

        if (Math.abs(currentX - x2) < 0.5 && Math.abs(currentY - y2) < 0.5) {
             setTileAtFloored(x2, y2); 
             break;
        }
        
        const e2 = 2 * err;
        let moved = false;
        if (e2 > -dyAbs) {
            err -= dyAbs;
            currentX += sx * 0.5;
            moved = true;
        }
        if (e2 < dxAbs) {
            err += dxAbs;
            currentY += sy * 0.5;
            moved = true;
        }
        if (!moved && iterations > 1) {
            currentX += sx * 0.5;
            currentY += sy * 0.5;
        }
         if (iterations >= maxIterations && !(Math.abs(currentX - x2) < 0.5 && Math.abs(currentY - y2) < 0.5)) {
            setTileAtFloored(x2, y2);
            break;
        }
    }
};

// New helper to generate path coordinates (centerline)
const generatePathCoordinates = (startX, startY, endX, endY) => {
    const pathCoords = [];
    let currentX = startX;
    let currentY = startY;
    const dxAbs = Math.abs(endX - currentX);
    const dyAbs = Math.abs(endY - currentY);
    const sx = (currentX < endX) ? 1 : -1;
    const sy = (currentY < endY) ? 1 : -1;
    let err = dxAbs - dyAbs;
    let iterations = 0;
    const maxIterations = Math.ceil(Math.max(dxAbs, dyAbs) * 2) + 5; // Allow for 0.5 steps + buffer

    while (iterations <= maxIterations) {
        iterations++;
        pathCoords.push({ x: Math.floor(currentX), y: Math.floor(currentY) });

        if (Math.abs(currentX - endX) < 0.5 && Math.abs(currentY - endY) < 0.5) {
            if (pathCoords[pathCoords.length - 1].x !== Math.floor(endX) || pathCoords[pathCoords.length - 1].y !== Math.floor(endY)) {
                pathCoords.push({ x: Math.floor(endX), y: Math.floor(endY) });
            }
            break;
        }
        
        const e2 = 2 * err;
        let movedThisStep = false;
        if (e2 > -dyAbs) {
            err -= dyAbs;
            currentX += sx * 0.5;
            movedThisStep = true;
        }
        if (e2 < dxAbs) {
            err += dxAbs;
            currentY += sy * 0.5;
            movedThisStep = true;
        }
        
        if (!movedThisStep && iterations > 1 && !(Math.abs(currentX - endX) < 0.5 && Math.abs(currentY - endY) < 0.5)) {
            currentX += sx * 0.5; 
            currentY += sy * 0.5;
        }

        if (iterations >= maxIterations && !(Math.abs(currentX - endX) < 0.5 && Math.abs(currentY - endY) < 0.5)) {
            if (pathCoords[pathCoords.length - 1].x !== Math.floor(endX) || pathCoords[pathCoords.length - 1].y !== Math.floor(endY)) {
                pathCoords.push({ x: Math.floor(endX), y: Math.floor(endY) });
            }
            break;
        }
    }
    
    // Deduplicate path coordinates
    const uniqueCoords = [];
    const seen = new Set();
    for (const coord of pathCoords) {
        const key = `${coord.x},${coord.y}`;
        if (!seen.has(key)) {
            uniqueCoords.push(coord);
            seen.add(key);
        }
    }
    return uniqueCoords;
};

// New helper to check if a tile coordinate is on any planned trail path
const isTileOnAnyTrailPath = (coord, allTrailData) => {
    for (const trail of allTrailData) {
        for (const centerPathCoord of trail.path) {
            const halfThicknessFloor = Math.floor((trail.thickness - 1) / 2);
            const halfThicknessCeil = Math.ceil((trail.thickness - 1) / 2);

            const minX = centerPathCoord.x - halfThicknessFloor;
            const maxX = centerPathCoord.x + halfThicknessCeil;
            const minY = centerPathCoord.y - halfThicknessFloor;
            const maxY = centerPathCoord.y + halfThicknessCeil;

            if (coord.x >= minX && coord.x <= maxX && coord.y >= minY && coord.y <= maxY) {
                return true;
            }
        }
    }
    return false;
};

const generateBuilding = (
    tiles, 
    centerX, centerY, 
    mapWidthTiles, mapHeightTiles,
    minW = 3, maxW = 7,
    minH = 3, maxH = 7
) => {
    const width = Math.floor(Math.random() * (maxW - minW + 1)) + minW;
    const height = Math.floor(Math.random() * (maxH - minH + 1)) + minH;
    const startX = Math.floor(Math.max(1, Math.min(mapWidthTiles - width - 1, centerX - width / 2)));
    const startY = Math.floor(Math.max(1, Math.min(mapHeightTiles - height - 1, centerY - height / 2)));

    // Check if building would overlap with roads
    for (let y = startY; y < startY + height; y++) {
        for (let x = startX; x < startX + width; x++) {
            if (tiles[y]?.[x]?.type === TileType.ROAD || tiles[y]?.[x]?.isPark) {
                return; // Don't place building if it would overlap with roads or parks
            }
        }
    }

    // Ensure building is not against map boundary
    if (startX <= 1 || startY <= 1 || startX + width >= mapWidthTiles - 1 || startY + height >= mapHeightTiles - 1) {
        return;
    }

    fillRect(tiles, startX, startY, width, height, TileType.BUILDING_FLOOR, mapWidthTiles, mapHeightTiles);
    fillRect(tiles, startX, startY, width, 1, TileType.WALL, mapWidthTiles, mapHeightTiles, WALL_HEALTH); 
    fillRect(tiles, startX, startY + height - 1, width, 1, TileType.WALL, mapWidthTiles, mapHeightTiles, WALL_HEALTH); 
    fillRect(tiles, startX, startY + 1, 1, height - 2, TileType.WALL, mapWidthTiles, mapHeightTiles, WALL_HEALTH); 
    fillRect(tiles, startX + width - 1, startY + 1, 1, height - 2, TileType.WALL, mapWidthTiles, mapHeightTiles, WALL_HEALTH); 

    // Place door in a valid location (not against map boundary)
    const doorSide = Math.floor(Math.random() * 4);
    let doorX = 0, doorY = 0;
    
    switch(doorSide) {
        case 0: // Top
            doorX = startX + 1 + Math.floor(Math.random() * (width - 2));
            doorY = startY;
            break;
        case 1: // Bottom
            doorX = startX + 1 + Math.floor(Math.random() * (width - 2));
            doorY = startY + height - 1;
            break;
        case 2: // Left
            doorX = startX;
            doorY = startY + 1 + Math.floor(Math.random() * (height - 2));
            break;
        case 3: // Right
            doorX = startX + width - 1;
            doorY = startY + 1 + Math.floor(Math.random() * (height - 2));
            break;
    }

    // Ensure door placement is valid
    if (doorX > 0 && doorX < mapWidthTiles - 1 && doorY > 0 && doorY < mapHeightTiles - 1) {
        tiles[doorY][doorX] = { x: doorX, y: doorY, type: TileType.BUILDING_FLOOR, isExplored: true };
    }
};

const generateLargeUrbanBuilding = (
    tiles,
    buildingStartX,
    buildingStartY,
    buildingWidth,
    buildingHeight,
    mapWidthTiles,
    mapHeightTiles
) => {
    // Ensure minimum size for accessibility
    if (buildingWidth < 5 || buildingHeight < 5) return;

    // Create outer walls
    fillRect(tiles, buildingStartX, buildingStartY, buildingWidth, buildingHeight, TileType.BUILDING_FLOOR, mapWidthTiles, mapHeightTiles);
    fillRect(tiles, buildingStartX, buildingStartY, buildingWidth, 1, TileType.WALL, mapWidthTiles, mapHeightTiles, WALL_HEALTH);
    fillRect(tiles, buildingStartX, buildingStartY + buildingHeight - 1, buildingWidth, 1, TileType.WALL, mapWidthTiles, mapHeightTiles, WALL_HEALTH);
    fillRect(tiles, buildingStartX, buildingStartY + 1, 1, buildingHeight - 2, TileType.WALL, mapWidthTiles, mapHeightTiles, WALL_HEALTH);
    fillRect(tiles, buildingStartX + buildingWidth - 1, buildingStartY + 1, 1, buildingHeight - 2, TileType.WALL, mapWidthTiles, mapHeightTiles, WALL_HEALTH);

    // Place door first to ensure we have a valid entrance
    const doorSide = Math.floor(Math.random() * 4);
    let doorX = 0, doorY = 0;
    
    switch(doorSide) {
        case 0: // Top
            doorX = buildingStartX + 1 + Math.floor(Math.random() * (buildingWidth - 2));
            doorY = buildingStartY;
            break;
        case 1: // Bottom
            doorX = buildingStartX + 1 + Math.floor(Math.random() * (buildingWidth - 2));
            doorY = buildingStartY + buildingHeight - 1;
            break;
        case 2: // Left
            doorX = buildingStartX;
            doorY = buildingStartY + 1 + Math.floor(Math.random() * (buildingHeight - 2));
            break;
        case 3: // Right
            doorX = buildingStartX + buildingWidth - 1;
            doorY = buildingStartY + 1 + Math.floor(Math.random() * (buildingHeight - 2));
            break;
    }

    // Ensure door placement is valid
    if (doorX > 0 && doorX < mapWidthTiles - 1 && doorY > 0 && doorY < mapHeightTiles - 1) {
        tiles[doorY][doorX] = { x: doorX, y: doorY, type: TileType.BUILDING_FLOOR, isExplored: true };
    }

    // Helper function to check if a position is within building bounds
    const isInBounds = (x, y) => {
        return x >= buildingStartX && x < buildingStartX + buildingWidth &&
               y >= buildingStartY && y < buildingStartY + buildingHeight;
    };

    // Helper function to check if a position is accessible (floor tile)
    const isAccessible = (x, y) => {
        return isInBounds(x, y) && tiles[y][x].type === TileType.BUILDING_FLOOR;
    };

    // Helper function to count accessible neighbors
    const countAccessibleNeighbors = (x, y) => {
        let count = 0;
        const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        for (const [dx, dy] of directions) {
            if (isAccessible(x + dx, y + dy)) count++;
        }
        return count;
    };

    // Add internal walls with guaranteed paths
    const internalWallAttempts = Math.floor((buildingWidth + buildingHeight) / 4);
    for (let i = 0; i < internalWallAttempts; i++) {
        if (buildingWidth <= 4 || buildingHeight <= 4) continue;

        const wallLength = Math.floor(Math.random() * Math.min(buildingWidth, buildingHeight) * 0.5) + 2;
        const isHorizontal = Math.random() < 0.5;

        if (isHorizontal) {
            const wallY = buildingStartY + 2 + Math.floor(Math.random() * (buildingHeight - 4));
            const wallX = buildingStartX + 1 + Math.floor(Math.random() * (buildingWidth - wallLength - 2));
            
            if (wallX + wallLength < buildingStartX + buildingWidth - 1) {
                // Find a good position for the gap that maintains accessibility
                let bestGapPos = wallX;
                let maxNeighbors = 0;
                
                // Try each possible gap position
                for (let x = wallX; x < wallX + wallLength; x++) {
                    const neighbors = countAccessibleNeighbors(x, wallY);
                    if (neighbors > maxNeighbors) {
                        maxNeighbors = neighbors;
                        bestGapPos = x;
                    }
                }

                // Place the wall with the gap
                for (let x = wallX; x < wallX + wallLength; x++) {
                    if (x !== bestGapPos) {
                        tiles[wallY][x] = { x, y: wallY, type: TileType.WALL, health: WALL_HEALTH * 0.75, isExplored: true };
                    }
                }
            }
        } else {
            const wallX = buildingStartX + 2 + Math.floor(Math.random() * (buildingWidth - 4));
            const wallY = buildingStartY + 1 + Math.floor(Math.random() * (buildingHeight - wallLength - 2));
            
            if (wallY + wallLength < buildingStartY + buildingHeight - 1) {
                // Find a good position for the gap that maintains accessibility
                let bestGapPos = wallY;
                let maxNeighbors = 0;
                
                // Try each possible gap position
                for (let y = wallY; y < wallY + wallLength; y++) {
                    const neighbors = countAccessibleNeighbors(wallX, y);
                    if (neighbors > maxNeighbors) {
                        maxNeighbors = neighbors;
                        bestGapPos = y;
                    }
                }

                // Place the wall with the gap
                for (let y = wallY; y < wallY + wallLength; y++) {
                    if (y !== bestGapPos) {
                        tiles[y][wallX] = { x: wallX, y, type: TileType.WALL, health: WALL_HEALTH * 0.75, isExplored: true };
                    }
                }
            }
        }
    }

    // Verify accessibility using flood fill
    const visited = new Set();
    const queue = [{x: doorX, y: doorY}];
    visited.add(`${doorX},${doorY}`);

    while (queue.length > 0) {
        const {x, y} = queue.shift();
        const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        
        for (const [dx, dy] of directions) {
            const newX = x + dx;
            const newY = y + dy;
            const key = `${newX},${newY}`;
            
            if (isAccessible(newX, newY) && !visited.has(key)) {
                visited.add(key);
                queue.push({x: newX, y: newY});
            }
        }
    }

    // If not all floor tiles are accessible, remove some walls to ensure connectivity
    const totalFloorTiles = (buildingWidth - 2) * (buildingHeight - 2);
    if (visited.size < totalFloorTiles) {
        // Find and remove walls that are blocking access
        for (let y = buildingStartY + 1; y < buildingStartY + buildingHeight - 1; y++) {
            for (let x = buildingStartX + 1; x < buildingStartX + buildingWidth - 1; x++) {
                if (tiles[y][x].type === TileType.WALL && tiles[y][x].health !== Infinity) {
                    const key = `${x},${y}`;
                    if (!visited.has(key)) {
                        tiles[y][x] = { x, y, type: TileType.BUILDING_FLOOR, isExplored: true };
                    }
                }
            }
        }
    }
};

const generateWarehouse = (
    tiles,
    centerX, centerY, 
    mapWidthTiles, mapHeightTiles
) => {
    const minDim = 8; const maxDim = 16;
    const width = Math.floor(Math.random() * (maxDim - minDim + 1)) + minDim;
    const height = Math.floor(Math.random() * (maxDim - minDim + 1)) + minDim;
    const startX = Math.floor(Math.max(1, Math.min(mapWidthTiles - width - 1, centerX - width / 2)));
    const startY = Math.floor(Math.max(1, Math.min(mapHeightTiles - height - 1, centerY - height / 2)));

    fillRect(tiles, startX, startY, width, height, TileType.BUILDING_FLOOR, mapWidthTiles, mapHeightTiles);
    fillRect(tiles, startX, startY, width, 1, TileType.WALL, mapWidthTiles, mapHeightTiles, WALL_HEALTH * 1.5); 
    fillRect(tiles, startX, startY + height - 1, width, 1, TileType.WALL, mapWidthTiles, mapHeightTiles, WALL_HEALTH * 1.5); 
    fillRect(tiles, startX, startY + 1, 1, height - 2, TileType.WALL, mapWidthTiles, mapHeightTiles, WALL_HEALTH * 1.5); 
    fillRect(tiles, startX + width - 1, startY + 1, 1, height - 2, TileType.WALL, mapWidthTiles, mapHeightTiles, WALL_HEALTH * 1.5); 

    const numDoors = Math.random() < 0.6 ? 1 : 2;
    for (let d = 0; d < numDoors; d++) {
        const doorSide = Math.floor(Math.random() * 4);
        const doorWidth = Math.floor(Math.random() * 2) + 2; 
        let doorX = 0, doorY = 0; 

        if (doorSide === 0 && width > doorWidth + 1) { 
            doorX = startX + Math.floor(Math.random() * (width - doorWidth - 1)) + 1; doorY = startY;
            fillRect(tiles, doorX, doorY, doorWidth, 1, TileType.BUILDING_FLOOR, mapWidthTiles, mapHeightTiles);
        } else if (doorSide === 1 && width > doorWidth + 1) { 
            doorX = startX + Math.floor(Math.random() * (width - doorWidth - 1)) + 1; doorY = startY + height - 1;
            fillRect(tiles, doorX, doorY, doorWidth, 1, TileType.BUILDING_FLOOR, mapWidthTiles, mapHeightTiles);
        } else if (doorSide === 2 && height > doorWidth + 1) { 
            doorX = startX; doorY = startY + Math.floor(Math.random() * (height - doorWidth - 1)) + 1;
            fillRect(tiles, doorX, doorY, 1, doorWidth, TileType.BUILDING_FLOOR, mapWidthTiles, mapHeightTiles);
        } else if (height > doorWidth + 1) { 
            doorX = startX + width - 1; doorY = startY + Math.floor(Math.random() * (height - doorWidth - 1)) + 1;
            fillRect(tiles, doorX, doorY, 1, doorWidth, TileType.BUILDING_FLOOR, mapWidthTiles, mapHeightTiles);
        }
    }

    const numInternalObstacles = Math.floor(Math.random() * 4) + 2; 
    for (let i = 0; i < numInternalObstacles; i++) {
        if (width <= 4 || height <= 4) continue; 

        const obsW = Math.random() < 0.7 ? 1 : 2;
        const obsH = (obsW === 2 && Math.random() < 0.3) ? 2 : 1; 
        
        const obsX = startX + 2 + Math.floor(Math.random() * (width - obsW - 4)); 
        const obsY = startY + 2 + Math.floor(Math.random() * (height - obsH - 4)); 

        if (obsX + obsW < startX + width -1 && obsY + obsH < startY + height -1) { 
            fillRect(tiles, obsX, obsY, obsW, obsH, TileType.WALL, mapWidthTiles, mapHeightTiles, WALL_HEALTH * 0.5);
        }
    }
};

const generateParkingLot = (
    tiles,
    centerX, centerY,
    mapWidthTiles, mapHeightTiles
) => {
    const lotWidth = Math.floor(Math.random() * 10) + 15;
    const lotHeight = Math.floor(Math.random() * 10) + 15;
    const startX = Math.max(1, Math.min(mapWidthTiles - lotWidth - 1, centerX - Math.floor(lotWidth / 2)));
    const startY = Math.max(1, Math.min(mapHeightTiles - lotHeight - 1, centerY - Math.floor(lotHeight / 2)));

    // Base of the parking lot
    fillRect(tiles, startX, startY, lotWidth, lotHeight, TileType.ROAD, mapWidthTiles, mapHeightTiles);

    // Add some cars (as obstacles)
    const numCars = Math.floor(Math.random() * (lotWidth * lotHeight / 20));
    for (let i = 0; i < numCars; i++) {
        const carW = 2;
        const carH = 1;
        if (lotWidth <= carW + 2 || lotHeight <= carH + 2) continue;
        const carX = startX + 1 + Math.floor(Math.random() * (lotWidth - carW - 1));
        const carY = startY + 1 + Math.floor(Math.random() * (lotHeight - carH - 1));
        
        let canPlace = true;
        for (let y = carY -1; y <= carY + carH; y++) {
            for (let x = carX -1; x <= carX + carW; x++) {
                if(tiles[y]?.[x]?.type !== TileType.ROAD){
                    canPlace = false;
                    break;
                }
            }
            if (!canPlace) break;
        }

        if(canPlace){
            fillRect(tiles, carX, carY, carW, carH, TileType.WALL, mapWidthTiles, mapHeightTiles, WALL_HEALTH * 0.8);
        }
    }
};

const placeBlob = (
    tiles, 
    centerX, centerY, 
    maxRadius, 
    type, 
    mapWidthTiles, mapHeightTiles, 
    density = 0.6,
    canOverwriteNonGrassOrEmpty = false, 
    isExplored = true,
    trailData = [],
    markAsPark = false,
    solidFill = false
) => {
    const radiusSq = maxRadius * maxRadius;
    for (let y = Math.floor(centerY - maxRadius); y <= Math.ceil(centerY + maxRadius); y++) {
        for (let x = Math.floor(centerX - maxRadius); x <= Math.ceil(centerX + maxRadius); x++) {
            if (x < 0 || x >= mapWidthTiles || y < 0 || y >= mapHeightTiles) continue;
            
            const distSq = (x - centerX) * (x - centerX) + (y - centerY) * (y - centerY);
            if (distSq <= radiusSq && (solidFill || Math.random() < density)) {
                // Don't place grass on roads or buildings
                if (type === TileType.GRASS && (tiles[y]?.[x]?.type === TileType.ROAD || tiles[y]?.[x]?.type === TileType.BUILDING_FLOOR || tiles[y]?.[x]?.type === TileType.WALL)) {
                    continue;
                }
                
                if (!canOverwriteNonGrassOrEmpty) {
                    const currentTile = tiles[y]?.[x];
                    if (currentTile && currentTile.type !== TileType.GRASS && currentTile.type !== TileType.EMPTY) {
                        continue;
                    }
                }
                if (isTileOnAnyTrailPath({ x, y }, trailData)) continue;

                tiles[y][x] = { x: x, y: y, type, isExplored, health: undefined, isPark: markAsPark };
            }
        }
    }
};

const generateUrbanBlock = (
    tiles,
    blockX, blockY,
    blockWidth, blockHeight,
    mapWidthTiles, mapHeightTiles
) => {
    const buildingPadding = 1; 
    const alleyWidth = 1;
    const minBuildingDim = 5;

    let currentX = blockX;
    while (currentX < blockX + blockWidth) {
        let currentY = blockY;
        const remainingWidth = blockX + blockWidth - currentX;
        const buildingWidth = Math.floor(Math.random() * (remainingWidth - minBuildingDim)) + minBuildingDim;

        while (currentY < blockY + blockHeight) {
            const remainingHeight = blockY + blockHeight - currentY;
            if (remainingHeight < minBuildingDim) break;

            const buildingHeight = Math.floor(Math.random() * (remainingHeight - minBuildingDim + 1)) + minBuildingDim;
            
            if (buildingWidth >= minBuildingDim && buildingHeight >= minBuildingDim) {
                generateBuilding(
                    tiles,
                    currentX + buildingWidth / 2,
                    currentY + buildingHeight / 2,
                    mapWidthTiles, mapHeightTiles,
                    Math.max(minBuildingDim, buildingWidth), Math.max(minBuildingDim, buildingWidth),
                    Math.max(minBuildingDim, buildingHeight), Math.max(minBuildingDim, buildingHeight)
                );
            }
            currentY += buildingHeight + alleyWidth + buildingPadding;
        }
        currentX += buildingWidth + alleyWidth + buildingPadding;
    }
};

const generateIndustrialCompound = (
    tiles,
    centerX, centerY, 
    mapWidthTiles, mapHeightTiles
) => {
    const compoundWidth = Math.floor(Math.random() * 15) + 25;
    const compoundHeight = Math.floor(Math.random() * 15) + 25;
    const startX = Math.max(1, Math.min(mapWidthTiles - compoundWidth - 1, centerX - Math.floor(compoundWidth / 2)));
    const startY = Math.max(1, Math.min(mapHeightTiles - compoundHeight - 1, centerY - Math.floor(compoundHeight / 2)));

    // Fill the entire compound with concrete (ROAD type)
    fillRect(tiles, startX, startY, compoundWidth, compoundHeight, TileType.ROAD, mapWidthTiles, mapHeightTiles);

    // Outer fence
    // Top and Bottom Fence
    drawLine(tiles, startX, startY, startX + compoundWidth - 1, startY, TileType.FENCE, mapWidthTiles, mapHeightTiles);
    drawLine(tiles, startX, startY + compoundHeight - 1, startX + compoundWidth - 1, startY + compoundHeight - 1, TileType.FENCE, mapWidthTiles, mapHeightTiles);
    // Left and Right Fence
    drawLine(tiles, startX, startY + 1, startX, startY + compoundHeight - 2, TileType.FENCE, mapWidthTiles, mapHeightTiles);
    drawLine(tiles, startX + compoundWidth - 1, startY + 1, startX + compoundWidth - 1, startY + compoundHeight - 2, TileType.FENCE, mapWidthTiles, mapHeightTiles);

    // Entrance
    const entranceSide = Math.floor(Math.random() * 4);
    const entranceSize = 3;
    if (entranceSide === 0) { // Top
        const ex = startX + Math.floor(Math.random() * (compoundWidth - entranceSize));
        fillRect(tiles, ex, startY, entranceSize, 1, TileType.ROAD, mapWidthTiles, mapHeightTiles);
    } else if (entranceSide === 1) { // Bottom
        const ex = startX + Math.floor(Math.random() * (compoundWidth - entranceSize));
        fillRect(tiles, ex, startY + compoundHeight -1, entranceSize, 1, TileType.ROAD, mapWidthTiles, mapHeightTiles);
    } else if (entranceSide === 2) { // Left
        const ey = startY + Math.floor(Math.random() * (compoundHeight - entranceSize));
        fillRect(tiles, startX, ey, 1, entranceSize, TileType.ROAD, mapWidthTiles, mapHeightTiles);
    } else { // Right
        const ey = startY + Math.floor(Math.random() * (compoundHeight - entranceSize));
        fillRect(tiles, startX + compoundWidth - 1, ey, 1, entranceSize, TileType.ROAD, mapWidthTiles, mapHeightTiles);
    }

    // Internal roads - create a grid pattern
    const numHorizontalRoads = Math.floor(Math.random() * 2) + 2;
    const numVerticalRoads = Math.floor(Math.random() * 2) + 2;
    
    // Horizontal roads
    for (let i = 1; i < numHorizontalRoads; i++) {
        const roadY = startY + Math.floor((compoundHeight * i) / numHorizontalRoads);
        fillRect(tiles, startX, roadY, compoundWidth, 2, TileType.ROAD, mapWidthTiles, mapHeightTiles);
    }
    
    // Vertical roads
    for (let i = 1; i < numVerticalRoads; i++) {
        const roadX = startX + Math.floor((compoundWidth * i) / numVerticalRoads);
        fillRect(tiles, roadX, startY, 2, compoundHeight, TileType.ROAD, mapWidthTiles, mapHeightTiles);
    }

    // Place warehouses with concrete pads around them
    const numWarehouses = Math.floor(Math.random() * 3) + 2;
    for (let i = 0; i < numWarehouses; i++) {
        const whX = startX + 5 + Math.floor(Math.random() * (compoundWidth - 10));
        const whY = startY + 5 + Math.floor(Math.random() * (compoundHeight - 10));
        
        // Add concrete pad around warehouse
        const padSize = 2;
        generateWarehouse(tiles, whX, whY, mapWidthTiles, mapHeightTiles);
        
        // Add concrete pad around the warehouse
        const warehouse = tiles[whY][whX];
        if (warehouse) {
            const padX = whX - padSize;
            const padY = whY - padSize;
            const padWidth = 8 + padSize * 2; // Assuming warehouse is roughly 8x8
            const padHeight = 8 + padSize * 2;
            fillRect(tiles, padX, padY, padWidth, padHeight, TileType.ROAD, mapWidthTiles, mapHeightTiles);
        }
    }

    // Add some storage tanks with concrete pads
    const numTanks = Math.floor(Math.random() * 4) + 2;
    for (let i = 0; i < numTanks; i++) {
        const tankX = startX + 3 + Math.floor(Math.random() * (compoundWidth - 6));
        const tankY = startY + 3 + Math.floor(Math.random() * (compoundHeight - 6));
        generateStorageTank(tiles, tankX, tankY, mapWidthTiles, mapHeightTiles);
        
        // Add concrete pad around tank
        const padSize = 3;
        fillRect(tiles, tankX - padSize, tankY - padSize, padSize * 2 + 1, padSize * 2 + 1, TileType.ROAD, mapWidthTiles, mapHeightTiles);
    }

    // Add some industrial debris
    const numDebris = Math.floor(Math.random() * 5) + 3;
    for (let i = 0; i < numDebris; i++) {
        const debrisX = startX + 2 + Math.floor(Math.random() * (compoundWidth - 4));
        const debrisY = startY + 2 + Math.floor(Math.random() * (compoundHeight - 4));
        generateIndustrialDebris(tiles, debrisX, debrisY, mapWidthTiles, mapHeightTiles);
    }
};

const generateStorageTank = (tiles, centerX, centerY, mapWidthTiles, mapHeightTiles) => {
    const radius = Math.floor(Math.random() * 2) + 2;
    placeBlob(tiles, centerX, centerY, radius, TileType.WALL, mapWidthTiles, mapHeightTiles, 1.0, true, false, [], false, true);
};

const generateIndustrialDebris = (tiles, centerX, centerY, mapWidthTiles, mapHeightTiles) => {
    const debrisCount = Math.floor(Math.random() * 4) + 2;
    for (let i = 0; i < debrisCount; i++) {
        const offsetX = Math.floor(Math.random() * 5) - 2;
        const offsetY = Math.floor(Math.random() * 5) - 2;
        const tileX = centerX + offsetX;
        const tileY = centerY + offsetY;
        if (tileX >= 0 && tileX < mapWidthTiles && tileY >= 0 && tileY < mapHeightTiles) {
            if (tiles[tileY][tileX].type === TileType.BUILDING_FLOOR || tiles[tileY][tileX].type === TileType.ROAD) {
                 tiles[tileY][tileX] = { x: tileX, y: tileY, type: TileType.WALL, health: WALL_HEALTH, isExplored: true };
            }
        }
    }
};

const generateFarmstead = (tiles, centerX, centerY, mapWidthTiles, mapHeightTiles) => {
    const fieldWidth = Math.floor(Math.random() * 10) + 15;
    const fieldHeight = Math.floor(Math.random() * 10) + 15;
    const startX = Math.max(1, Math.min(mapWidthTiles - fieldWidth - 1, centerX - Math.floor(fieldWidth / 2)));
    const startY = Math.max(1, Math.min(mapHeightTiles - fieldHeight - 1, centerY - Math.floor(fieldHeight / 2)));

    fillRect(tiles, startX, startY, fieldWidth, fieldHeight, TileType.FARM_FIELD, mapWidthTiles, mapHeightTiles);
    drawLine(tiles, startX, startY, startX + fieldWidth - 1, startY, TileType.FENCE, mapWidthTiles, mapHeightTiles);
    drawLine(tiles, startX, startY + fieldHeight - 1, startX + fieldWidth - 1, startY + fieldHeight - 1, TileType.FENCE, mapWidthTiles, mapHeightTiles);
    drawLine(tiles, startX, startY + 1, startX, startY + fieldHeight - 2, TileType.FENCE, mapWidthTiles, mapHeightTiles);
    drawLine(tiles, startX + fieldWidth - 1, startY + 1, startX + fieldWidth - 1, startY + fieldHeight - 2, TileType.FENCE, mapWidthTiles, mapHeightTiles);

    const houseX = startX + 2 + Math.floor(Math.random() * (fieldWidth - 8));
    const houseY = startY + 2 + Math.floor(Math.random() * (fieldHeight - 8));
    generateBuilding(tiles, houseX, houseY, mapWidthTiles, mapHeightTiles, 4, 6, 4, 6);

    const barnX = startX + 2 + Math.floor(Math.random() * (fieldWidth - 12));
    const barnY = startY + 2 + Math.floor(Math.random() * (fieldHeight - 12));
    if (Math.abs(houseX - barnX) > 8 || Math.abs(houseY - barnY) > 8) {
        generateWarehouse(tiles, barnX, barnY, mapWidthTiles, mapHeightTiles);
    }
};

export const generateMap = (widthTiles, heightTiles, tileSize, chosenEnvironment) => {
  console.log(`[mapGenerator.js] generateMap: START for ${chosenEnvironment}`);
  console.time('generateMapInternal');
  const tiles = Array.from({ length: heightTiles }, (_, y) =>
    Array.from({ length: widthTiles }, (_, x) => ({ x, y, type: TileType.GRASS, isExplored: true }))
  );

  if (chosenEnvironment === EnvironmentType.URBAN) {
    console.log('[mapGenerator.js] generateMap: Urban environment generation.');
    fillRect(tiles, 0, 0, widthTiles, heightTiles, TileType.EMPTY, widthTiles, heightTiles);

    const roadThickness = Math.floor(Math.random() * 2) + 2; 
    const numHorizRoads = Math.floor(Math.random() * 2) + 2; 
    const numVertRoads = Math.floor(Math.random() * 2) + 2; 

    const horizRoadPositions = [];
    for (let i = 0; i < numHorizRoads; i++) {
        const roadY = Math.floor((i + 1) * heightTiles / (numHorizRoads + 1));
        drawLine(tiles, 0, roadY, widthTiles - 1, roadY, TileType.ROAD, widthTiles, heightTiles, roadThickness);
        horizRoadPositions.push(roadY);
    }
    const vertRoadPositions = [];
    for (let i = 0; i < numVertRoads; i++) {
        const roadX = Math.floor((i + 1) * widthTiles / (numVertRoads + 1));
        drawLine(tiles, roadX, 0, roadX, heightTiles - 1, TileType.ROAD, widthTiles, heightTiles, roadThickness);
        vertRoadPositions.push(roadX);
    }
    
    const blockBoundariesX = [0, ...vertRoadPositions.sort((a,b)=>a-b), widthTiles -1];
    const blockBoundariesY = [0, ...horizRoadPositions.sort((a,b)=>a-b), heightTiles -1];

    for (let i = 0; i < blockBoundariesX.length - 1; i++) {
        for (let j = 0; j < blockBoundariesY.length - 1; j++) {
            const blockStartX = blockBoundariesX[i] + (blockBoundariesX[i] === 0 ? 0 : Math.ceil(roadThickness/2));
            const blockEndX = blockBoundariesX[i+1] - (blockBoundariesX[i+1] === widthTiles -1 ? 0 : Math.ceil(roadThickness/2));
            const blockStartY = blockBoundariesY[j] + (blockBoundariesY[j] === 0 ? 0 : Math.ceil(roadThickness/2));
            const blockEndY = blockBoundariesY[j+1] - (blockBoundariesY[j+1] === heightTiles -1 ? 0 : Math.ceil(roadThickness/2));

            const blockWidth = blockEndX - blockStartX;
            const blockHeight = blockEndY - blockStartY;
            const blockCenterX = blockStartX + blockWidth / 2;
            const blockCenterY = blockStartY + blockHeight / 2;

            if (blockWidth < 8 || blockHeight < 8) continue; 

            const isParkBlock = Math.random() < 0.20; 

            if (isParkBlock) {
                fillRect(tiles, blockStartX, blockStartY, blockWidth, blockHeight, TileType.GRASS, widthTiles, heightTiles);
                placeBlob(tiles, Math.floor(blockCenterX), Math.floor(blockCenterY), Math.floor(Math.min(blockWidth, blockHeight) / 3), TileType.WATER, widthTiles, heightTiles, 0.6, true, true, [], true, true);
                if (Math.random() < 0.5 && blockWidth > 5) drawLine(tiles, blockStartX + 1, blockCenterY, blockEndX -1, blockCenterY, TileType.ROAD, widthTiles, heightTiles, 1);
                if (Math.random() < 0.5 && blockHeight > 5) drawLine(tiles, blockCenterX, blockStartY + 1, blockCenterX, blockEndY -1, TileType.ROAD, widthTiles, heightTiles, 1);
                if (Math.random() < 0.7) {
                    if(Math.random() < 0.5) drawLine(tiles, blockStartX, blockStartY, blockEndX, blockStartY, TileType.FENCE, widthTiles, heightTiles,1); 
                    if(Math.random() < 0.5) drawLine(tiles, blockStartX, blockEndY, blockEndX, blockEndY, TileType.FENCE, widthTiles, heightTiles,1); 
                    if(Math.random() < 0.5) drawLine(tiles, blockStartX, blockStartY, blockStartX, blockEndY, TileType.FENCE, widthTiles, heightTiles,1); 
                    if(Math.random() < 0.5) drawLine(tiles, blockEndX, blockStartY, blockEndX, blockEndY, TileType.FENCE, widthTiles, heightTiles,1); 
                }

            } else { // Building Block
                const numLargeBuildings = Math.floor(Math.random() * 2) + 1;
                for (let k = 0; k < numLargeBuildings; k++) {
                    const largeBuildingWidth = Math.max(8, Math.floor(Math.random() * (blockWidth * 0.6)) + Math.min(8, blockWidth * 0.4));
                    const largeBuildingHeight = Math.max(8, Math.floor(Math.random() * (blockHeight * 0.6)) + Math.min(8, blockHeight * 0.4));
                    
                    if (blockWidth - largeBuildingWidth <=1 || blockHeight - largeBuildingHeight <=1) continue;

                    const bStartX = blockStartX + 1 + Math.floor(Math.random() * (blockWidth - largeBuildingWidth -1));
                    const bStartY = blockStartY + 1 + Math.floor(Math.random() * (blockHeight - largeBuildingHeight -1));
                    if (bStartX + largeBuildingWidth < blockEndX -1 && bStartY + largeBuildingHeight < blockEndY -1) {
                         generateLargeUrbanBuilding(tiles, bStartX, bStartY, largeBuildingWidth, largeBuildingHeight, widthTiles, heightTiles);
                    }
                }
                const numSmallBuildings = Math.floor(Math.random() * 4) + 2;
                for (let k = 0; k < numSmallBuildings; k++) {
                     const smallW = Math.floor(Math.random()*4)+3; 
                     const smallH = Math.floor(Math.random()*4)+3; 
                     if (blockWidth - smallW <= 1 || blockHeight - smallH <=1) continue;
                     
                     const bX = blockStartX + 1 + Math.floor(Math.random() * (blockWidth - smallW - 1));
                     const bY = blockStartY + 1 + Math.floor(Math.random() * (blockHeight - smallH -1));

                    let canPlaceSmall = true;
                    for(let checkX = bX; checkX < bX + smallW; checkX++){
                        for(let checkY = bY; checkY < bY + smallH; checkY++){
                            if(tiles[Math.floor(checkY)]?.[Math.floor(checkX)]?.type !== TileType.EMPTY){
                                canPlaceSmall = false; break;
                            }
                        }
                        if(!canPlaceSmall) break;
                    }
                    if(canPlaceSmall){
                         generateBuilding(tiles, Math.floor(bX + smallW/2), Math.floor(bY + smallH/2), widthTiles, heightTiles, smallW, smallH);
                    }
                }
                const numAlleys = Math.floor(Math.random()*2);
                for(let k=0; k<numAlleys; k++){
                    if(Math.random() < 0.5 && blockWidth > 5){ 
                        const alleyY = blockStartY + 1 + Math.floor(Math.random()*(blockHeight-2));
                        drawLine(tiles, blockStartX, alleyY, blockEndX, alleyY, Math.random() < 0.7 ? TileType.EMPTY : TileType.ROAD, widthTiles, heightTiles, 1);
                    } else if (blockHeight > 5) { 
                        const alleyX = blockStartX + 1 + Math.floor(Math.random()*(blockWidth-2));
                        drawLine(tiles, alleyX, blockStartY, alleyX, blockEndY, Math.random() < 0.7 ? TileType.EMPTY : TileType.ROAD, widthTiles, heightTiles, 1);
                    }
                }
            }
        }
    }

    const blockWidth = 30;
    const blockHeight = 25;
    const roadWidth = 4;
    const parkChance = 0.15;

    for (let y = 0; y < heightTiles; y += blockHeight + roadWidth) {
        for (let x = 0; x < widthTiles; x += blockWidth + roadWidth) {
            if (Math.random() < parkChance) {
                placeBlob(tiles, x + blockWidth / 2, y + blockHeight / 2, Math.min(blockWidth, blockHeight) / 2, TileType.GRASS, widthTiles, heightTiles, 1.0, true, true, [], true, true);
            } else {
                generateUrbanBlock(tiles, x, y, blockWidth, blockHeight, widthTiles, heightTiles);
            }
        }
    }

  } else if (chosenEnvironment === EnvironmentType.INDUSTRIAL) {
    console.log('[mapGenerator.js] generateMap: Industrial environment generation.');
    const numCompounds = Math.floor((widthTiles * heightTiles) / (40 * 40)); 
    for (let i = 0; i < numCompounds; i++) {
        const cx = Math.floor(Math.random() * (widthTiles - 40)) + 20;
        const cy = Math.floor(Math.random() * (heightTiles - 40)) + 20;
        generateIndustrialCompound(tiles, cx, cy, widthTiles, heightTiles);
    }

    const numTanks = Math.floor((widthTiles * heightTiles) / (150*150));
    for (let i = 0; i < numTanks; i++) {
        const cx = Math.floor(Math.random() * widthTiles);
        const cy = Math.floor(Math.random() * heightTiles);
        generateStorageTank(tiles, cx, cy, widthTiles, heightTiles);
    }

    const numDebris = Math.floor((widthTiles * heightTiles) / (100*100));
    for (let i = 0; i < numDebris; i++) {
        const cx = Math.floor(Math.random() * widthTiles);
        const cy = Math.floor(Math.random() * heightTiles);
        generateIndustrialDebris(tiles, cx, cy, widthTiles, heightTiles);
    }

    const numParks = Math.floor((widthTiles * heightTiles) / (100*100));
    for (let i = 0; i < numParks; i++) {
        const cx = Math.floor(Math.random() * widthTiles);
        const cy = Math.floor(Math.random() * heightTiles);
        const radius = Math.floor(Math.random() * 10) + 15;
        placeBlob(tiles, cx, cy, radius, TileType.GRASS, widthTiles, heightTiles, 0.9, true, true, [], true, true);
    }

    const numWarehouses = Math.floor(Math.random() * 3) + 2; 
    for (let i = 0; i < numWarehouses; i++) {
      const whX = Math.floor(Math.random() * (widthTiles - 20)) + 10; 
      const whY = Math.floor(Math.random() * (heightTiles - 20)) + 10; 
      generateWarehouse(tiles, whX, whY, widthTiles, heightTiles);
    }

    const numIndustrialFences = Math.floor(Math.random() * 5) + 6; 
    for (let i = 0; i < numIndustrialFences; i++) {
        const startX = Math.floor(Math.random() * widthTiles);
        const startY = Math.floor(Math.random() * heightTiles);
        const length = Math.floor(Math.random() * (widthTiles/4)) + 5; 
        if (Math.random() < 0.5) { 
            const endX = Math.min(widthTiles - 1, startX + length);
            drawLine(tiles, startX, startY, endX, startY, TileType.FENCE, widthTiles, heightTiles, 1);
        } else { 
            const endY = Math.min(heightTiles - 1, startY + length);
            drawLine(tiles, startX, startY, startX, endY, TileType.FENCE, widthTiles, heightTiles, 1);
        }
    }
    const numWaterIndustrial = Math.floor(Math.random() * 2) + 1; 
    for(let i=0; i<numWaterIndustrial; i++) {
        placeBlob(tiles, Math.floor(Math.random() * widthTiles), Math.floor(Math.random() * heightTiles), Math.floor(Math.random() * 2 + 2), TileType.WATER, widthTiles, heightTiles, 1.0, true, true, [], false, true); 
    }
    const numGrassIndustrial = Math.floor(Math.random() * 1) + 1; 
    for(let i=0; i<numGrassIndustrial; i++) {
        placeBlob(tiles, Math.floor(Math.random() * widthTiles), Math.floor(Math.random() * heightTiles), Math.floor(Math.random() * 2 + 1), TileType.GRASS, widthTiles, heightTiles, 0.6, true); 
    }

    const numProcessingPlants = Math.floor(Math.random() * 2) + 1;
    for (let i = 0; i < numProcessingPlants; i++) {
        const cx = Math.floor(Math.random() * (widthTiles - 40)) + 20;
        const cy = Math.floor(Math.random() * (heightTiles - 40)) + 20;
        generateIndustrialCompound(tiles, cx, cy, widthTiles, heightTiles); // Re-using compound as a base
    }

    const numParkingLots = Math.floor(Math.random() * 2) + 1;
    for (let i = 0; i < numParkingLots; i++) {
        const cx = Math.floor(Math.random() * widthTiles);
        const cy = Math.floor(Math.random() * heightTiles);
        generateParkingLot(tiles, cx, cy, widthTiles, heightTiles);
    }

    // Add surrounding natural features
    // 1. Add trails
    const trailData = [];
    const numTrails = Math.floor(Math.random() * 3) + 2;
    for (let i = 0; i < numTrails; i++) {
        let trailStartX, trailStartY, trailEndX, trailEndY;
        const edge = Math.floor(Math.random() * 4);
        const trailThickness = Math.random() < 0.7 ? 2 : 3;
        if (edge === 0) { 
            trailStartX = Math.floor(Math.random() * widthTiles); trailStartY = 0;
            trailEndX = Math.floor(Math.random() * widthTiles); trailEndY = heightTiles -1;
        } else if (edge === 1) { 
            trailStartX = Math.floor(Math.random() * widthTiles); trailStartY = heightTiles - 1;
            trailEndX = Math.floor(Math.random() * widthTiles); trailEndY = 0;
        } else if (edge === 2) { 
            trailStartX = 0; trailStartY = Math.floor(Math.random() * heightTiles);
            trailEndX = widthTiles -1; trailEndY = Math.floor(Math.random() * heightTiles);
        } else { 
            trailStartX = widthTiles -1; trailStartY = Math.floor(Math.random() * heightTiles);
            trailEndX = 0; trailEndY = Math.floor(Math.random() * heightTiles);
        }
        
        const midX1 = Math.max(0, Math.min(widthTiles -1, trailStartX + (trailEndX - trailStartX) * 0.33 + (Math.random() - 0.5) * widthTiles * 0.2));
        const midY1 = Math.max(0, Math.min(heightTiles -1, trailStartY + (trailEndY - trailStartY) * 0.33 + (Math.random() - 0.5) * heightTiles * 0.2));
        const midX2 = Math.max(0, Math.min(widthTiles-1, trailStartX + (trailEndX - trailStartX) * 0.66 + (Math.random() - 0.5) * widthTiles * 0.2));
        const midY2 = Math.max(0, Math.min(heightTiles-1, trailStartY + (trailEndY - trailStartY) * 0.66 + (Math.random() - 0.5) * heightTiles * 0.2));

        trailData.push({ path: generatePathCoordinates(trailStartX, trailStartY, midX1, midY1), thickness: trailThickness });
        trailData.push({ path: generatePathCoordinates(midX1, midY1, midX2, midY2), thickness: trailThickness });
        trailData.push({ path: generatePathCoordinates(midX2, midY2, trailEndX, trailEndY), thickness: trailThickness });
    }

    // Draw trails
    trailData.forEach(trail => {
        trail.path.forEach(centerCoord => {
            const halfThicknessFloor = Math.floor((trail.thickness - 1) / 2);
            const halfThicknessCeil = Math.ceil((trail.thickness - 1) / 2);
            for (let dyOffset = -halfThicknessFloor; dyOffset <= halfThicknessCeil; dyOffset++) {
                for (let dxOffset = -halfThicknessFloor; dxOffset <= halfThicknessCeil; dxOffset++) {
                    const tileX = centerCoord.x + dxOffset;
                    const tileY = centerCoord.y + dyOffset;
                    if (tileX >= 0 && tileX < widthTiles && tileY >= 0 && tileY < heightTiles) {
                        if (tiles[tileY][tileX].type === TileType.EMPTY || tiles[tileY][tileX].type === TileType.GRASS) {
                            tiles[tileY][tileX] = { ...tiles[tileY][tileX], type: TileType.ROAD };
                        }
                    }
                }
            }
        });
    });

    // 2. Add water features
    const numWaterFeatures = Math.floor((widthTiles * heightTiles) / 2500);
    for(let i=0; i < numWaterFeatures; i++) {
        const cx = Math.floor(Math.random() * widthTiles);
        const cy = Math.floor(Math.random() * heightTiles);
        const radius = Math.floor(Math.random() * 8) + 8;
        placeBlob(tiles, cx, cy, radius, TileType.WATER, widthTiles, heightTiles, 1.0, true, true, trailData, false, true);
    }

    // 3. Add tree patches
    const numTreePatches = Math.floor(Math.random() * 15) + 20;
    for (let i = 0; i < numTreePatches; i++) {
        const patchCenterX = Math.floor(Math.random() * widthTiles);
        const patchCenterY = Math.floor(Math.random() * heightTiles);
        const patchRadius = Math.floor(Math.random() * 3) + 2;
        const treeHealth = Math.random() < 0.3 ? Infinity : WALL_HEALTH;
        placeBlob(tiles, patchCenterX, patchCenterY, patchRadius, TileType.WALL, widthTiles, heightTiles, 0.85, false, true, trailData);
        
        // Ensure health is set for trees
        for (let y = Math.max(0, patchCenterY - patchRadius); y <= Math.min(heightTiles - 1, patchCenterY + patchRadius); y++) {
            for (let x = Math.max(0, patchCenterX - patchRadius); x <= Math.min(widthTiles - 1, patchCenterX + patchRadius); x++) {
                if(tiles[y]?.[x]?.type === TileType.WALL && tiles[y][x].health === undefined) {
                    tiles[y][x].health = treeHealth;
                }
            }
        }
    }

    // 4. Add scattered trees
    const numScatteredTrees = Math.floor(Math.random() * 300) + 400;
    for (let i = 0; i < numScatteredTrees; i++) {
        const treeX = Math.floor(Math.random() * (widthTiles - 2)) + 1;
        const treeY = Math.floor(Math.random() * (heightTiles - 2)) + 1;
        if (tiles[treeY]?.[treeX]?.type === TileType.GRASS && !isTileOnAnyTrailPath({x: treeX, y: treeY}, trailData)) {
            tiles[treeY][treeX] = { x: treeX, y: treeY, type: TileType.WALL, health: WALL_HEALTH, isExplored: true };
        }
    }
  } else if (chosenEnvironment === EnvironmentType.FOREST) {
    console.log('[mapGenerator.js] generateMap: Forest environment generation.');
    // 1. Base Grass
    fillRect(tiles, 0, 0, widthTiles, heightTiles, TileType.GRASS, widthTiles, heightTiles);

    // 2. Plan Streams
    const streamData = [];
    const numStreams = Math.floor(Math.random() * 2) + 1;
    for (let i = 0; i < numStreams; i++) {
        let streamStartX, streamStartY, streamEndX, streamEndY;
        const edge = Math.floor(Math.random() * 4);
        const streamWidth = Math.random() < 0.6 ? 1 : 2;
        if (edge === 0) { 
            streamStartX = Math.floor(Math.random() * widthTiles); streamStartY = 0;
            streamEndX = Math.floor(Math.random() * widthTiles); streamEndY = heightTiles -1;
        } else { 
            streamStartX = Math.floor(Math.random() * widthTiles); streamStartY = heightTiles - 1;
            streamEndX = Math.floor(Math.random() * widthTiles); streamEndY = 0;
        }
        streamData.push({ path: generatePathCoordinates(streamStartX, streamStartY, streamEndX, streamEndY), width: streamWidth });
    }

    // 3. Plan Trails
    const trailData = [];
    const numTrails = Math.floor(Math.random() * 3) + 2;
    for (let i = 0; i < numTrails; i++) {
        let trailStartX, trailStartY, trailEndX, trailEndY;
        const edge = Math.floor(Math.random() * 4);
        const trailThickness = Math.random() < 0.7 ? 2 : 3;
        if (edge === 0) { 
            trailStartX = Math.floor(Math.random() * widthTiles); trailStartY = 0;
            trailEndX = Math.floor(Math.random() * widthTiles); trailEndY = heightTiles -1;
        } else if (edge === 1) { 
            trailStartX = Math.floor(Math.random() * widthTiles); trailStartY = heightTiles - 1;
            trailEndX = Math.floor(Math.random() * widthTiles); trailEndY = 0;
        } else if (edge === 2) { 
            trailStartX = 0; trailStartY = Math.floor(Math.random() * heightTiles);
            trailEndX = widthTiles -1; trailEndY = Math.floor(Math.random() * heightTiles);
        } else { 
            trailStartX = widthTiles -1; trailStartY = Math.floor(Math.random() * heightTiles);
            trailEndX = 0; trailEndY = Math.floor(Math.random() * heightTiles);
        }
        
        const midX1 = Math.max(0, Math.min(widthTiles -1, trailStartX + (trailEndX - trailStartX) * 0.33 + (Math.random() - 0.5) * widthTiles * 0.2));
        const midY1 = Math.max(0, Math.min(heightTiles -1, trailStartY + (trailEndY - trailStartY) * 0.33 + (Math.random() - 0.5) * heightTiles * 0.2));
        const midX2 = Math.max(0, Math.min(widthTiles-1, trailStartX + (trailEndX - trailStartX) * 0.66 + (Math.random() - 0.5) * widthTiles * 0.2));
        const midY2 = Math.max(0, Math.min(heightTiles-1, trailStartY + (trailEndY - trailStartY) * 0.66 + (Math.random() - 0.5) * heightTiles * 0.2));

        trailData.push({ path: generatePathCoordinates(trailStartX, trailStartY, midX1, midY1), thickness: trailThickness });
        trailData.push({ path: generatePathCoordinates(midX1, midY1, midX2, midY2), thickness: trailThickness });
        trailData.push({ path: generatePathCoordinates(midX2, midY2, trailEndX, trailEndY), thickness: trailThickness });
    }

    // 4. Draw Streams
    streamData.forEach(stream => {
        stream.path.forEach(coord => {
            fillRect(tiles, coord.x - Math.floor((stream.width - 1) / 2), coord.y - Math.floor((stream.width - 1) / 2), stream.width, stream.width, TileType.WATER, widthTiles, heightTiles);
        });
    });

    // 5. Draw Trails and Bridges
    trailData.forEach(trail => {
        trail.path.forEach(centerCoord => {
            if (tiles[centerCoord.y]?.[centerCoord.x]?.type === TileType.WATER) {
                tiles[centerCoord.y][centerCoord.x] = { ...tiles[centerCoord.y][centerCoord.x], type: TileType.BUILDING_FLOOR, health: Infinity };
                const orthogonalNeighbors = [
                    { x: centerCoord.x + 1, y: centerCoord.y }, { x: centerCoord.x - 1, y: centerCoord.y },
                    { x: centerCoord.x, y: centerCoord.y + 1 }, { x: centerCoord.x, y: centerCoord.y - 1 }
                ];
                for (const neighbor of orthogonalNeighbors) {
                    if (neighbor.x >= 0 && neighbor.x < widthTiles && neighbor.y >= 0 && neighbor.y < heightTiles) {
                        if (tiles[neighbor.y][neighbor.x].type === TileType.WATER && isTileOnAnyTrailPath(neighbor, trailData)) {
                            tiles[neighbor.y][neighbor.x] = { ...tiles[neighbor.y][neighbor.x], type: TileType.BUILDING_FLOOR, health: Infinity };
                        }
                    }
                }
            }
            const halfThicknessFloor = Math.floor((trail.thickness - 1) / 2);
            const halfThicknessCeil = Math.ceil((trail.thickness - 1) / 2);
            for (let dyOffset = -halfThicknessFloor; dyOffset <= halfThicknessCeil; dyOffset++) {
                for (let dxOffset = -halfThicknessFloor; dxOffset <= halfThicknessCeil; dxOffset++) {
                    const tileX = centerCoord.x + dxOffset;
                    const tileY = centerCoord.y + dyOffset;
                    if (tileX >= 0 && tileX < widthTiles && tileY >= 0 && tileY < heightTiles) {
                        if (tiles[tileY][tileX].type === TileType.WATER) {
                            tiles[tileY][tileX] = { ...tiles[tileY][tileX], type: TileType.BUILDING_FLOOR, health: Infinity };
                        } else if (tiles[tileY][tileX].type !== TileType.BUILDING_FLOOR) { 
                            tiles[tileY][tileX] = { ...tiles[tileY][tileX], type: TileType.ROAD };
                        }
                    }
                }
            }
        });
    });
    
    for (let y = 0; y < heightTiles; y++) {
        for (let x = 0; x < widthTiles; x++) {
            if (tiles[y][x].type === TileType.BUILDING_FLOOR) { 
                const neighbors = [
                    { dx: 0, dy: 1 }, { dx: 0, dy: -1 }, 
                    { dx: 1, dy: 0 }, { dx: -1, dy: 0 }
                ];
                for (const nDelta of neighbors) {
                    const nx = x + nDelta.dx;
                    const ny = y + nDelta.dy;
                    if (nx >= 0 && nx < widthTiles && ny >= 0 && ny < heightTiles) {
                        if (tiles[ny][nx].type === TileType.WATER && !isTileOnAnyTrailPath({x: nx, y: ny}, trailData)) {
                             tiles[ny][nx] = { x: nx, y: ny, type: TileType.FENCE, health: FENCE_HEALTH, isExplored: true };
                        }
                    }
                }
            }
        }
    }

    // 6. Place Tree Patches, respecting trails
    const numTreePatches = Math.floor(Math.random() * 40) + 60;
    for (let i = 0; i < numTreePatches; i++) {
        const patchCenterX = Math.floor(Math.random() * widthTiles);
        const patchCenterY = Math.floor(Math.random() * heightTiles);
        const patchRadius = Math.floor(Math.random() * 6) + 4;
        const treeHealth = Math.random() < 0.3 ? Infinity : WALL_HEALTH;
        // Pass trailData to placeBlob so it can avoid placing trees on trails
        placeBlob(tiles, patchCenterX, patchCenterY, patchRadius, TileType.WALL, widthTiles, heightTiles, 0.85, false, true, trailData); // Increased density
        // Ensure health is set for placed trees (placeBlob already handles health, but this is a safeguard)
        for (let y = Math.max(0, patchCenterY - patchRadius); y <= Math.min(heightTiles - 1, patchCenterY + patchRadius); y++) {
            for (let x = Math.max(0, patchCenterX - patchRadius); x <= Math.min(widthTiles - 1, patchCenterX + patchRadius); x++) {
                 if(tiles[y]?.[x]?.type === TileType.WALL && tiles[y][x].health === undefined) {
                    tiles[y][x].health = treeHealth;
                 }
            }
        }
    }
    
    // 7. Place Scattered Trees, respecting trails
    const numScatteredTrees = Math.floor(Math.random() * 300) + 400;
    for (let i = 0; i < numScatteredTrees; i++) {
        const treeX = Math.floor(Math.random() * (widthTiles - 2)) + 1;
        const treeY = Math.floor(Math.random() * (heightTiles - 2)) + 1;
        // Check if the tile is grass AND not on a trail
        if (tiles[treeY]?.[treeX]?.type === TileType.GRASS && !isTileOnAnyTrailPath({x: treeX, y: treeY}, trailData)) {
            tiles[treeY][treeX] = { x: treeX, y: treeY, type: TileType.WALL, health: WALL_HEALTH, isExplored: true };
        }
    }

    // 8. Place Structures
    const numStructures = Math.floor(Math.random() * 3) + 2;
    for (let i = 0; i < numStructures; i++) {
        const structX = Math.floor(Math.random() * (widthTiles - 15)) + 7;
        const structY = Math.floor(Math.random() * (heightTiles - 15)) + 7;
        const isBarn = Math.random() < 0.4;
        if (isBarn) {
            generateBuilding(tiles, structX, structY, widthTiles, heightTiles, 6, 8);
        } else {
            generateBuilding(tiles, structX, structY, widthTiles, heightTiles, 3, 5);
        }
    }

  } else if (chosenEnvironment === EnvironmentType.RURAL) {
    console.log('[mapGenerator.js] generateMap: Rural environment generation.');
    const numFarms = Math.floor((widthTiles * heightTiles) / (50*50));
    for (let i = 0; i < numFarms; i++) {
        const cx = Math.floor(Math.random() * widthTiles);
        const cy = Math.floor(Math.random() * heightTiles);
        generateFarmstead(tiles, cx, cy, widthTiles, heightTiles);
    }

    const mainRoads = [];
    const numMainRoads = Math.floor(Math.random() * 2) + 1; 
    const roadThickness = Math.random() < 0.6 ? 1 : 2; 
    for (let i = 0; i < numMainRoads; i++) {
        if (Math.random() < 0.5) { 
            const roadY = Math.floor(Math.random() * (heightTiles - roadThickness * 2)) + roadThickness;
            const roadPath = generatePathCoordinates(0, roadY, widthTiles - 1, roadY);
            mainRoads.push({ path: roadPath, thickness: roadThickness });
            drawLine(tiles, 0, roadY, widthTiles - 1, roadY, TileType.ROAD, widthTiles, heightTiles, roadThickness);
        } else { 
            const roadX = Math.floor(Math.random() * (widthTiles - roadThickness * 2)) + roadThickness;
            const roadPath = generatePathCoordinates(roadX, 0, roadX, heightTiles - 1);
            mainRoads.push({ path: roadPath, thickness: roadThickness });
            drawLine(tiles, roadX, 0, roadX, heightTiles - 1, TileType.ROAD, widthTiles, heightTiles, roadThickness);
        }
    }

    const numSettlements = Math.floor(Math.random() * 3) + 2; 
    for (let i = 0; i < numSettlements; i++) {
        const settlementX = Math.floor(Math.random() * (widthTiles - 20)) + 10; 
        const settlementY = Math.floor(Math.random() * (heightTiles - 20)) + 10; 
        const buildingsInSettlement = Math.floor(Math.random() * 2) + 1; 
        for (let j = 0; j < buildingsInSettlement; j++) {
            const buildingOffsetX = Math.floor(Math.random() * 10) - 5; 
            const buildingOffsetY = Math.floor(Math.random() * 10) - 5;
            generateBuilding(tiles, settlementX + buildingOffsetX, settlementY + buildingOffsetY, widthTiles, heightTiles, 3, 6); 
        }
    }
  
    const numFenceLines = Math.floor(Math.random() * 10) + 15; 
    for (let i = 0; i < numFenceLines; i++) {
        const startX = Math.floor(Math.random() * widthTiles);
        const startY = Math.floor(Math.random() * heightTiles);
        const length = Math.floor(Math.random() * (widthTiles/5)) + 8; 
        if (Math.random() < 0.5) { 
            const endX = Math.min(widthTiles - 1, startX + length);
            drawLine(tiles, startX, startY, endX, startY, TileType.FENCE, widthTiles, heightTiles, 1);
        } else { 
            const endY = Math.min(heightTiles - 1, startY + length);
            drawLine(tiles, startX, startY, startX, endY, TileType.FENCE, widthTiles, heightTiles, 1);
        }
    }

    const numWaterBlobs = Math.floor((widthTiles*heightTiles) / 2500);
    for(let i=0; i < numWaterBlobs; i++){
        const cx = Math.floor(Math.random()*widthTiles);
        const cy = Math.floor(Math.random()*heightTiles);
        const radius = Math.floor(Math.random()*8) + 8;
        placeBlob(tiles, cx, cy, radius, TileType.WATER, widthTiles, heightTiles, 1.0, true, true, [], false, true);
    }

    const numGrassBlobs = Math.floor(Math.random() * 4) + 5;
    for(let i=0; i < numGrassBlobs; i++){
        const cx = Math.floor(Math.random()*widthTiles);
        const cy = Math.floor(Math.random()*heightTiles);
        const radius = Math.floor(Math.random() * 12) + 10;
        placeBlob(tiles, cx, cy, radius, TileType.GRASS, widthTiles, heightTiles, 0.9, true, true, [], true);
    }

    // Place Tree Patches for wooded areas
    const numTreePatchesRural = Math.floor(Math.random() * 15) + 20;
    for (let i = 0; i < numTreePatchesRural; i++) {
        const patchCenterX = Math.floor(Math.random() * widthTiles);
        const patchCenterY = Math.floor(Math.random() * heightTiles);
        const patchRadius = Math.floor(Math.random() * 3) + 2;
        // Avoid placing on main roads by passing `mainRoads` as trailData
        placeBlob(tiles, patchCenterX, patchCenterY, patchRadius, TileType.WALL, widthTiles, heightTiles, 0.7, false, true, mainRoads);
    }

    // Place Scattered Trees
    const numScatteredTreesRural = Math.floor(Math.random() * 50) + 50;
    for (let i = 0; i < numScatteredTreesRural; i++) {
        const treeX = Math.floor(Math.random() * (widthTiles - 2)) + 1;
        const treeY = Math.floor(Math.random() * (heightTiles - 2)) + 1;
        if (tiles[treeY]?.[treeX]?.type === TileType.GRASS && !tiles[treeY][treeX].isPark) {
            if (!isTileOnAnyTrailPath({ x: treeX, y: treeY }, mainRoads)) {
                tiles[treeY][treeX] = { x: treeX, y: treeY, type: TileType.WALL, health: WALL_HEALTH, isExplored: true };
            }
        }
    }
  } else {
      console.log(`[mapGenerator.js] generateMap: Unknown environment '${chosenEnvironment}', defaulting to RURAL.`);
      // Fallback to rural generation
      const numFarms = Math.floor((widthTiles * heightTiles) / (50*50));
        for (let i = 0; i < numFarms; i++) {
            const cx = Math.floor(Math.random() * widthTiles);
            const cy = Math.floor(Math.random() * heightTiles);
            generateFarmstead(tiles, cx, cy, widthTiles, heightTiles);
        }

        const mainRoads = [];
        const numMainRoads = Math.floor(Math.random() * 2) + 1; 
        const roadThickness = Math.random() < 0.6 ? 1 : 2; 
        for (let i = 0; i < numMainRoads; i++) {
            if (Math.random() < 0.5) { 
                const roadY = Math.floor(Math.random() * (heightTiles - roadThickness * 2)) + roadThickness;
                const roadPath = generatePathCoordinates(0, roadY, widthTiles - 1, roadY);
                mainRoads.push({ path: roadPath, thickness: roadThickness });
                drawLine(tiles, 0, roadY, widthTiles - 1, roadY, TileType.ROAD, widthTiles, heightTiles, roadThickness);
            } else { 
                const roadX = Math.floor(Math.random() * (widthTiles - roadThickness * 2)) + roadThickness;
                const roadPath = generatePathCoordinates(roadX, 0, roadX, heightTiles - 1);
                mainRoads.push({ path: roadPath, thickness: roadThickness });
                drawLine(tiles, roadX, 0, roadX, heightTiles - 1, TileType.ROAD, widthTiles, heightTiles, roadThickness);
            }
        }
        const treeDensity = 0.3; // Fallback tree density
        for (let y = 0; y < heightTiles; y++) {
            for (let x = 0; x < widthTiles; x++) {
                if (tiles[y][x].type === TileType.GRASS && !tiles[y][x].isPark && Math.random() < treeDensity) {
                     if (!isTileOnAnyTrailPath({x,y}, mainRoads)) {
                        tiles[y][x].type = TileType.WALL;
                        tiles[y][x].health = WALL_HEALTH;
                     }
                }
            }
        }
  }
  console.log('[mapGenerator.js] generateMap: Base environment generated, adding borders.');
  fillRect(tiles, 0, 0, widthTiles, 1, TileType.WALL, widthTiles, heightTiles, Infinity); 
  fillRect(tiles, 0, heightTiles - 1, widthTiles, 1, TileType.WALL, widthTiles, heightTiles, Infinity); 
  fillRect(tiles, 0, 1, 1, heightTiles - 2, TileType.WALL, widthTiles, heightTiles, Infinity); 
  fillRect(tiles, widthTiles - 1, 1, 1, heightTiles - 2, TileType.WALL, widthTiles, heightTiles, Infinity); 

  for (let y = 0; y < heightTiles; y++) {
    for (let x = 0; x < widthTiles; x++) {
      const tile = tiles[y][x];
      tile.x = Math.floor(tile.x);
      tile.y = Math.floor(tile.y);
      if (tile.type === TileType.WALL && tile.health === undefined) tile.health = WALL_HEALTH;
      if (tile.type === TileType.FENCE && tile.health === undefined) tile.health = FENCE_HEALTH;
    }
  }
  console.timeEnd('generateMapInternal');
  console.log('[mapGenerator.js] generateMap: END successfully.');
  return { tiles, widthTiles, heightTiles, tileSize };
};


export const isPositionWalkable = (
    position, 
    entityWidth, 
    entityHeight, 
    map,
    characterIdToIgnore,
    allCharacters 
  ) => {
  const { tileSize, widthTiles, heightTiles } = map;
  
  const result = {
    isWalkable: true,
    blockedByCharacterId: null,
    blockedByMapTile: false,
  };

  // First check if the entity would be outside the map boundaries
  if (
    position.x < 0 || 
    position.x + entityWidth > widthTiles * tileSize ||
    position.y < 0 ||
    position.y + entityHeight > heightTiles * tileSize
  ) {
    result.isWalkable = false;
    result.blockedByMapTile = true; 
    return result;
  }

  // Create a more comprehensive set of points to check for collision
  // This includes corners, edges, and center points to ensure no overlap
  const pointsToCheck = [
    // Corners
    { x: position.x, y: position.y }, 
    { x: position.x + entityWidth - 1, y: position.y }, 
    { x: position.x, y: position.y + entityHeight - 1 }, 
    { x: position.x + entityWidth - 1, y: position.y + entityHeight - 1 },
    // Center points
    { x: position.x + entityWidth / 2, y: position.y + entityHeight / 2 },
    // Edge midpoints
    { x: position.x + entityWidth / 2, y: position.y },
    { x: position.x + entityWidth / 2, y: position.y + entityHeight - 1 },
    { x: position.x, y: position.y + entityHeight / 2 },
    { x: position.x + entityWidth - 1, y: position.y + entityHeight / 2 },
    // Additional points for better coverage
    { x: position.x + entityWidth * 0.25, y: position.y + entityHeight * 0.25 },
    { x: position.x + entityWidth * 0.75, y: position.y + entityHeight * 0.25 },
    { x: position.x + entityWidth * 0.25, y: position.y + entityHeight * 0.75 },
    { x: position.x + entityWidth * 0.75, y: position.y + entityHeight * 0.75 }
  ];

  // Check each point against the map tiles
  for (const point of pointsToCheck) {
    const tileX = Math.floor(point.x / tileSize);
    const tileY = Math.floor(point.y / tileSize);

    // Check if the point is within map boundaries
    if (
      tileX < 0 || tileX >= widthTiles ||
      tileY < 0 || tileY >= heightTiles
    ) {
      result.isWalkable = false;
      result.blockedByMapTile = true;
      return result; 
    }

    // Check if the tile at this point is non-traversable
    const tile = map.tiles[tileY]?.[tileX];
    if (!tile || tile.type === TileType.WALL || tile.type === TileType.WATER || tile.type === TileType.FENCE) {
      result.isWalkable = false;
      result.blockedByMapTile = true;
      return result; 
    }
  }

  // Check for collisions with other characters
  const movingEntityRect = { x: position.x, y: position.y, width: entityWidth, height: entityHeight };
  for (const char of allCharacters) {
    if (!char) continue; 
    if (char.id === characterIdToIgnore) continue; 
    if (char.health !== undefined && char.health <= 0) continue; 
    if (char.type === EntityType.INTEL_ITEM && char.isCollected) continue; 

    // Add a small buffer zone around characters to prevent tight overlaps
    const bufferSize = 2; // 2 pixel buffer
    const otherCharRect = { 
      x: char.x - bufferSize, 
      y: char.y - bufferSize, 
      width: char.width + bufferSize * 2, 
      height: char.height + bufferSize * 2 
    };
    
    if (checkAABBCollision(movingEntityRect, otherCharRect)) {
        // Special case for intel items - only block enemies
        if (char.type === EntityType.INTEL_ITEM) {
            if (characterIdToIgnore === 'player' || characterIdToIgnore.startsWith('teammate-')) {
                continue; 
            } else { 
                result.isWalkable = false;
                result.blockedByCharacterId = char.id; 
                return result;
            }
        } else { 
            // For all other characters (including player), block movement
            result.isWalkable = false;
            result.blockedByCharacterId = char.id;
            return result; 
        }
    }
  }
  return result; 
};

const isTileTraversableForPathfinding = (tileX, tileY, map) => {
    if (tileX < 0 || tileX >= map.widthTiles || tileY < 0 || tileY >= map.heightTiles) {
        return false;
    }
    const tile = map.tiles[tileY][tileX];
    return tile && tile.type !== TileType.WALL && tile.type !== TileType.WATER && tile.type !== TileType.FENCE;
};

export const findPath = (startPos, endPos, map, TILE_SIZE, allCharacters = []) => {
    const startTileX = Math.floor(startPos.x / TILE_SIZE);
    const startTileY = Math.floor(startPos.y / TILE_SIZE);
    const endTileX = Math.floor(endPos.x / TILE_SIZE);
    const endTileY = Math.floor(endPos.y / TILE_SIZE);

    if (startTileX === endTileX && startTileY === endTileY) return []; 

    const openSet = [];
    const closedSet = new Set(); 

    const startNode = {
        x: startTileX,
        y: startTileY,
        gCost: 0,
        hCost: Math.abs(startTileX - endTileX) + Math.abs(startTileY - endTileY), 
        fCost: 0, 
        parent: null,
    };
    startNode.fCost = startNode.gCost + startNode.hCost;
    openSet.push(startNode);

    let nodesExplored = 0;
    const SQRT_2 = Math.sqrt(2);

    // Create a set of tiles occupied by characters
    const characterOccupiedTiles = new Set();
    for (const char of allCharacters) {
        if (!char || char.health <= 0) continue;
        const charTileX = Math.floor(char.x / TILE_SIZE);
        const charTileY = Math.floor(char.y / TILE_SIZE);
        characterOccupiedTiles.add(`${charTileX},${charTileY}`);
    }

    while (openSet.length > 0) {
        nodesExplored++;
        if (nodesExplored > PATHFINDING_MAX_NODES_EXPLORED) {
            return null; 
        }

        openSet.sort((a, b) => a.fCost - b.fCost || a.hCost - b.hCost);
        const currentNode = openSet.shift();

        if (currentNode.x === endTileX && currentNode.y === endTileY) {
            const path = [];
            let temp = currentNode;
            while (temp !== null) {
                path.push({ x: temp.x * TILE_SIZE + TILE_SIZE / 2, y: temp.y * TILE_SIZE + TILE_SIZE / 2 });
                temp = temp.parent;
            }
            return path.reverse();
        }

        closedSet.add(`${currentNode.x},${currentNode.y}`);

        const neighborDeltas = [
            { dx: 0, dy: -1, cost: 1 }, { dx: 0, dy: 1, cost: 1 }, 
            { dx: -1, dy: 0, cost: 1 }, { dx: 1, dy: 0, cost: 1 }, 
            { dx: -1, dy: -1, cost: SQRT_2 }, { dx: 1, dy: -1, cost: SQRT_2 }, 
            { dx: -1, dy: 1, cost: SQRT_2 }, { dx: 1, dy: 1, cost: SQRT_2 }  
        ];

        for (const delta of neighborDeltas) {
            const neighborX = currentNode.x + delta.dx;
            const neighborY = currentNode.y + delta.dy;
            const neighborKey = `${neighborX},${neighborY}`;

            if (closedSet.has(neighborKey)) {
                continue;
            }

            // Check if the tile is occupied by a character
            if (characterOccupiedTiles.has(neighborKey)) {
                closedSet.add(neighborKey);
                continue;
            }

            if (!isTileTraversableForPathfinding(neighborX, neighborY, map)) {
                closedSet.add(neighborKey); 
                continue;
            }
            
            if (delta.dx !== 0 && delta.dy !== 0) { 
                const axialCheck1 = isTileTraversableForPathfinding(currentNode.x + delta.dx, currentNode.y, map);
                const axialCheck2 = isTileTraversableForPathfinding(currentNode.x, currentNode.y + delta.dy, map);
                if (!axialCheck1 && !axialCheck2) { 
                    continue; 
                }
            }

            const gCostToNeighbor = currentNode.gCost + delta.cost;
            let neighborNode = openSet.find(node => node.x === neighborX && node.y === neighborY);

            if (!neighborNode || gCostToNeighbor < neighborNode.gCost) {
                const hCost = Math.abs(neighborX - endTileX) + Math.abs(neighborY - endTileY); 
                if (!neighborNode) {
                    neighborNode = {
                        x: neighborX,
                        y: neighborY,
                        gCost: gCostToNeighbor,
                        hCost: hCost,
                        fCost: gCostToNeighbor + hCost,
                        parent: currentNode,
                    };
                    openSet.push(neighborNode);
                } else {
                    neighborNode.parent = currentNode;
                    neighborNode.gCost = gCostToNeighbor;
                    neighborNode.fCost = neighborNode.gCost + neighborNode.hCost;
                }
            }
        }
    }
    return null; 
};


export const hasLineOfSight = (start, end, map) => {
  const { tileSize, widthTiles, heightTiles } = map;
  let x1 = start.x;
  let y1 = start.y;
  const x2 = end.x;
  const y2 = end.y;

  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  
  const startTileX = Math.floor(x1 / tileSize);
  const startTileY = Math.floor(y1 / tileSize);
  
  const stepSize = tileSize / 3; 
  let currentPixelX = x1;
  let currentPixelY = y1;
  
  const totalDistance = Math.sqrt(dx * dx + dy * dy);
  if (totalDistance === 0) return true;

  const numSteps = Math.ceil(totalDistance / stepSize);

  for (let i = 0; i <= numSteps; i++) {
    const t = i / numSteps;
    currentPixelX = x1 + t * (x2 - x1);
    currentPixelY = y1 + t * (y2 - y1);

    const currentTileX = Math.floor(currentPixelX / tileSize);
    const currentTileY = Math.floor(currentPixelY / tileSize);

    if (currentTileX < 0 || currentTileX >= widthTiles || currentTileY < 0 || currentTileY >= heightTiles) {
        return false; 
    }
    
    const isStartTile = (currentTileX === startTileX && currentTileY === startTileY);

    if (!isStartTile) {
        const tile = map.tiles[currentTileY]?.[currentTileX];
        if (tile && (tile.type === TileType.WALL || tile.type === TileType.FENCE || tile.type === TileType.WATER)) {
            return false;
        }
    }
    
    if (i === numSteps) {
        return true;
    }
  }
  return true; 
};

export const smoothPath = (path, map) => {
  if (!path || path.length < 3) {
    return path; 
  }

  const smoothedPath = [path[0]];
  let currentAnchorIndexInOriginalPath = 0; 

  for (let i = 2; i < path.length; i++) {
    if (!hasLineOfSight(path[currentAnchorIndexInOriginalPath], path[i], map)) {
      if (path[i-1].x !== smoothedPath[smoothedPath.length - 1].x || path[i-1].y !== smoothedPath[smoothedPath.length - 1].y) {
         smoothedPath.push(path[i-1]);
      }
      currentAnchorIndexInOriginalPath = i - 1;
    }
  }

  const lastOriginalPoint = path[path.length - 1];
  const lastSmoothedPoint = smoothedPath[smoothedPath.length - 1];
  if (lastOriginalPoint.x !== lastSmoothedPoint.x || lastOriginalPoint.y !== lastSmoothedPoint.y) {
    smoothedPath.push(lastOriginalPoint);
  }

  return smoothedPath;
};
