import { MAP_WIDTH_TILES, MAP_HEIGHT_TILES, TILE_SIZE } from '../constants.js';

export const SECTOR_GRID_SIZE = 3; 

export const getSectors = () => {
    const sectors = [];
    const sectorWidth = Math.floor(MAP_WIDTH_TILES / SECTOR_GRID_SIZE);
    const sectorHeight = Math.floor(MAP_HEIGHT_TILES / SECTOR_GRID_SIZE);

    for (let i = 0; i < SECTOR_GRID_SIZE; i++) {
        for (let j = 0; j < SECTOR_GRID_SIZE; j++) {
            sectors.push({
                id: i * SECTOR_GRID_SIZE + j,
                x: j * sectorWidth,
                y: i * sectorHeight,
                width: sectorWidth,
                height: sectorHeight,
            });
        }
    }
    return sectors;
};

export const getSectorForPosition = (position, sectors) => {
    const tileX = Math.floor(position.x / TILE_SIZE);
    const tileY = Math.floor(position.y / TILE_SIZE);
    
    for (const sector of sectors) {
        if (
            tileX >= sector.x &&
            tileX < sector.x + sector.width &&
            tileY >= sector.y &&
            tileY < sector.y + sector.height
        ) {
            return sector;
        }
    }
    return null; 
}; 