console.log('[types.js] Module loaded successfully.');
// types.js - Converted from types.ts

export const EntityType = {
  PLAYER: 'PLAYER',
  TEAMMATE: 'TEAMMATE',
  ENEMY_SOLDIER: 'ENEMY_SOLDIER',
  ENEMY_BOSS: 'ENEMY_BOSS',
  ENEMY_GRENADIER: 'ENEMY_GRENADIER',
  BULLET: 'BULLET',
  OBJECTIVE_MARKER: 'OBJECTIVE_MARKER',
  INTEL_ITEM: 'INTEL_ITEM',
};

export const TileType = {
  EMPTY: 0,
  WALL: 1,
  GRASS: 2,
  WATER: 3,
  ROAD: 5,
  BUILDING_FLOOR: 6,
  FENCE: 7,
  FARM_FIELD: 8,
  DIRT_PATH: 9,
};

export const EnvironmentType = {
  URBAN: 'URBAN',
  RURAL: 'RURAL',
  INDUSTRIAL: 'INDUSTRIAL',
  FOREST: 'FOREST',
};

export const FormationShape = {
  DIAMOND: 'DIAMOND',
  LINE: 'LINE',
  COLUMN: 'COLUMN',
};

// Interfaces like Position, Entity, Character, Player, etc. are now implicitly defined 
// by the structure of the objects used in the game.
// JSDoc could be used for more formal definitions if desired.
/*
For example:
/**
 * @typedef {Object} Position
 * @property {number} x
 * @property {number} y
 */
 
// For brevity, explicit JSDoc for all types is omitted here.
// The structure remains the same as in the original types.ts.

export const EnemyVariant = {
  SOLDIER: 'SOLDIER',
  BOSS: 'BOSS',
  GRENADIER: 'GRENADIER',
  HV_BOSS: 'HV_BOSS', 
};

export const ObjectiveType = {
  REACH_LOCATION: 'REACH_LOCATION',
  ELIMINATE_TARGET: 'ELIMINATE_TARGET', 
  DEFUSE_BOMB: 'DEFUSE_BOMB', // Not currently implemented but kept for structure
  DESTROY_CACHE: 'DESTROY_CACHE', // Not currently implemented
  ELIMINATE_HV_BOSS: 'ELIMINATE_HV_BOSS', 
  COLLECT_INTEL: 'COLLECT_INTEL', 
};

// GameAction types are also implicit now, actions will be direct function calls
// or state changes rather than dispatched objects with a 'type' property.