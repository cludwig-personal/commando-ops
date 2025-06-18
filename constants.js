// Renamed from types.ts TileType and other enums will be in types.js
import { TileType, EnemyVariant, FormationShape } from './types.js';
console.log('[constants.js] Module loaded successfully.');

export const GAME_VERSION = '0.0.29'; // Update this as needed

export const TILE_SIZE = 14;
export const DEFAULT_TILE_SIZE = TILE_SIZE; 
export const MAP_WIDTH_TILES = 150; 
export const MAP_HEIGHT_TILES = 150; 

export const HUD_PANEL_HEIGHT = 70;

export const GAME_BACKGROUND_COLOR = '#1F2937'; // bg-gray-800

export const PLAYER_SIZE = TILE_SIZE * 0.7;
export const PLAYER_SPEED = 0.36; 
export const PLAYER_HEALTH = 100;
export const PLAYER_COLOR = '#2563EB'; 
export const PLAYER_SHOOT_COOLDOWN_MS = 840; 
export const PLAYER_BULLET_SPEED = 3.2; 
export const PLAYER_BULLET_DAMAGE_MIN = 7; 
export const PLAYER_BULLET_DAMAGE_MAX = 19; 
export const PLAYER_BULLET_WALL_DAMAGE = 25;
export const PLAYER_BULLET_MAX_TRAVEL_DISTANCE = TILE_SIZE * 26; // Increased by 20% from 21
export const PLAYER_BULLET_COLOR = '#7DD3FC';
export const PLAYER_STATIONARY_THRESHOLD_TICKS = 50; 
export const PLAYER_MOVEMENT_HISTORY_LENGTH = 20; 
export const PLAYER_MOVEMENT_HISTORY_MIN_FOR_SMOOTHING = 3; 

export const TEAMMATE_SIZE = TILE_SIZE * 0.7;
export const TEAMMATE_SPEED = 0.36; 
export const TEAMMATE_HEALTH = 100;
export const TEAMMATE_COLORS = ['#10B981', '#14B8A6', '#06B6D4']; 
export const TEAMMATE_FORMATION_POSITION_TOLERANCE = TILE_SIZE * 0.5;

export const TEAMMATE_FORMATION_OFFSETS_DIAMOND = [
  { x: -TILE_SIZE * 3.0, y: 0 },                    
  { x: -TILE_SIZE * 1.5, y: -TILE_SIZE * 3 },    
  { x: -TILE_SIZE * 1.5, y:  TILE_SIZE * 3 },    
];

export const TEAMMATE_FORMATION_OFFSETS_LINE = [
  { x: 0, y: -TILE_SIZE * 4.0 },    
  { x: 0, y:  TILE_SIZE * 4.0 },                    
  { x: 0, y:  TILE_SIZE * 6.0 },    
];

export const TEAMMATE_FORMATION_OFFSETS_COLUMN = [
  { x: -TILE_SIZE * 2.5, y: 0 },                    
  { x: -TILE_SIZE * 4.5, y: 0 },                    
  { x: -TILE_SIZE * 6.5, y: 0 },                    
];

export const ALL_TEAMMATE_FORMATION_OFFSETS = {
  [FormationShape.DIAMOND]: TEAMMATE_FORMATION_OFFSETS_DIAMOND,
  [FormationShape.LINE]: TEAMMATE_FORMATION_OFFSETS_LINE,
  [FormationShape.COLUMN]: TEAMMATE_FORMATION_OFFSETS_COLUMN,
};
// Enemy squads can reuse teammate formations or have their own
export const ALL_ENEMY_SQUAD_FORMATION_OFFSETS = ALL_TEAMMATE_FORMATION_OFFSETS; // Reuse for now
export const ENEMY_SQUAD_FORMATION_SHAPES = [FormationShape.DIAMOND, FormationShape.LINE, FormationShape.COLUMN];


export const TEAMMATE_FORMATION_TARGET_LERP_FACTOR = 0.08;

export const TEAMMATE_DETECTION_RADIUS = TILE_SIZE * 24;       // Increased by 20% from 20
export const TEAMMATE_SHOOT_RANGE = TILE_SIZE * 21;           // Increased by 20% from 17
export const TEAMMATE_SHOOT_COOLDOWN_MS = 1260; 
export const TEAMMATE_BULLET_SPEED = 3.2; 
export const TEAMMATE_BULLET_DAMAGE_MIN = 7;
export const TEAMMATE_BULLET_DAMAGE_MAX = 14;
export const TEAMMATE_BULLET_COLOR = '#7DD3FC'; 
export const TEAMMATE_BULLET_MAX_TRAVEL_DISTANCE = TILE_SIZE * 24;    // Increased by 20% from 20
export const TEAMMATE_HOLD_POSITION_DURATION_TICKS = 6000;

export const ENEMY_SIZE = TILE_SIZE * 0.7;
export const ENEMY_SPEED = 0.29; 
export const ENEMY_SPEED_MULTIPLIER_SOLDIER = 1.0;
export const ENEMY_SPEED_MULTIPLIER_GRENADIER = 0.85;
export const ENEMY_SPEED_MULTIPLIER_BOSS = 0.7; // For non-squad bosses
export const ENEMY_SPEED_MULTIPLIER_HV_BOSS = 0.8; // For non-squad HV_Boss


export const ENEMY_HEALTH_SOLDIER = 50;
export const ENEMY_HEALTH_BOSS = 100; // For non-squad Boss (HVT and Generic)
export const ENEMY_HEALTH_GRENADIER = 80;
export const ENEMY_HEALTH_HV_BOSS = 350; // For non-squad Commander

export const HVT_COLOR = '#7C3AED'; // Dark purple for HVT (distinct from commander)

export const ENEMY_COLORS = {
  [EnemyVariant.SOLDIER]: '#991B1B',    // Dark red
  [EnemyVariant.GRENADIER]: '#E53E3E',  // Brighter red for distinction
  [EnemyVariant.BOSS]: '#FACC15',       // Yellow for generic non-HVT Boss (was #DC2626)
  [EnemyVariant.HV_BOSS]: '#C4B5FD',    // Light purple for Commander
};

export const BULLET_SIZE = TILE_SIZE * 0.20;

// Default Enemy Bullet Stats (primarily for Soldier)
export const ENEMY_BULLET_SPEED = 2.2; 
export const ENEMY_BULLET_DAMAGE_MIN = 1;
export const ENEMY_BULLET_DAMAGE_MAX = 5;
export const ENEMY_BULLET_COLOR = '#EF4444'; 
export const ENEMY_DETECTION_RADIUS = TILE_SIZE * 27;        // Increased by 20% from 22
export const ENEMY_SHOOT_RANGE = TILE_SIZE * 18;            // Increased by 20% from 15
export const ENEMY_SOLDIER_SHOOT_COOLDOWN_MS = 1700; 

// Grenadier Specific Stats
export const ENEMY_GRENADIER_SHOOT_RANGE = TILE_SIZE * 12;   // Increased by 20% from 10
export const ENEMY_GRENADIER_SHOOT_COOLDOWN_MS = 2000;
export const ENEMY_GRENADIER_BULLET_SPEED = 1.7;
export const ENEMY_GRENADIER_BULLET_DAMAGE_MIN = 3;
export const ENEMY_GRENADIER_BULLET_DAMAGE_MAX = 10;

// Boss Specific Stats (for HVT Boss and Generic non-squad Bosses)
export const ENEMY_BOSS_SHOOT_RANGE = TILE_SIZE * 24;       // Increased by 20% from 20
export const ENEMY_BOSS_SHOOT_COOLDOWN_MS = 2000; 
export const ENEMY_BOSS_BULLET_DAMAGE_MIN = 3;
export const ENEMY_BOSS_BULLET_DAMAGE_MAX = 6;

// HV_Boss (Commander) Specific Stats (non-squad)
export const ENEMY_HV_BOSS_BULLET_DAMAGE_MIN = 5; // Commander still has slightly higher damage
export const ENEMY_HV_BOSS_BULLET_DAMAGE_MAX = 12;


export const GAME_LOOP_INTERVAL = 50; 

export const WALL_HEALTH = 100;
export const FENCE_HEALTH = 30;

export const ENEMY_SOLDIER_BULLET_MAX_TRAVEL_DISTANCE = TILE_SIZE * 21;    // Increased by 20% from 17
export const ENEMY_GRENADIER_BULLET_MAX_TRAVEL_DISTANCE = TILE_SIZE * 17;    // Increased by 20% from 14
export const ENEMY_BOSS_BULLET_MAX_TRAVEL_DISTANCE = TILE_SIZE * 26;         // Increased by 20% from 21

export const WALL_COLOR = '#44403C';           
export const WALL_DAMAGED_COLOR = '#78716C';   // stone-500
export const GRASS_COLOR = '#65A30D';          
export const WATER_COLOR = '#0284C7';          
export const EMPTY_COLOR = '#334155';          
export const ROAD_COLOR = '#6B7280';           
export const BUILDING_FLOOR_COLOR = '#FEF3C7'; 
export const FENCE_COLOR = '#CA8A04';          
export const FENCE_DAMAGED_COLOR = '#A16207';  // yellow-700
export const FARM_FIELD_COLOR = '#B48A64';
export const DIRT_PATH_COLOR = '#8B5A2B';
export const ASPHALT_COLOR = '#4A4A4A';

export const TILE_COLORS = {
  [TileType.EMPTY]: EMPTY_COLOR,
  [TileType.WALL]: WALL_COLOR,
  [TileType.GRASS]: GRASS_COLOR,
  [TileType.WATER]: WATER_COLOR,
  [TileType.ROAD]: ROAD_COLOR,
  [TileType.BUILDING_FLOOR]: BUILDING_FLOOR_COLOR,
  [TileType.FENCE]: FENCE_COLOR,
  [TileType.FARM_FIELD]: FARM_FIELD_COLOR,
  [TileType.DIRT_PATH]: DIRT_PATH_COLOR,
};

export const INTEL_ITEM_SIZE = TILE_SIZE * 0.8;
export const INTEL_ITEM_FILL_COLOR = '#60A5FA'; 
export const INTEL_ITEM_STROKE_COLOR = '#BFDBFE'; 
export const NUM_INTEL_TO_COLLECT = 3;

// Enemy Squad Constants
export const MAX_ENEMY_SQUADS = 12;
export const ENEMY_SQUAD_COMPOSITION = {
    [EnemyVariant.SOLDIER]: 2,
    [EnemyVariant.GRENADIER]: 1,
};
export const ENEMY_SQUAD_PATROL_IDLE_TIME_MS = 7000;
export const ENEMY_SQUAD_PATROL_MAX_DISTANCE = TILE_SIZE * 50; // Increased patrol distance
export const SQUAD_FORMATION_POSITION_TOLERANCE = TILE_SIZE * 0.75; // How close member needs to be to its formation spot

// Squad Regrouping Constants
export const SQUAD_REGROUP_MAX_SPREAD_DISTANCE = TILE_SIZE * 25;
export const SQUAD_REGROUP_COHESION_RADIUS = TILE_SIZE * 10;
export const SQUAD_REGROUP_CHECK_INTERVAL_TICKS = 150; // Approx 7.5 seconds
export const SQUAD_REGROUP_DURATION_MAX_TICKS = 600; // Approx 30 seconds
export const SQUAD_POST_COMBAT_REGROUP_GRACE_PERIOD_TICKS = 200; // Approx 10 seconds

export const MAX_GENERIC_BOSSES = 2; // New: Max non-HVT yellow bosses

// Dynamic Spawning Constants
export const ACTIVE_SQUAD_LIMIT = 0; // Disable dynamic squad spawning
export const SQUAD_SPAWN_RADIUS_TILES = 70; // Spawn squads just outside this radius
export const SQUAD_DESPAWN_RADIUS_TILES = 90; // Despawn squads beyond this radius
export const SPAWN_CHECK_INTERVAL_TICKS = 200; // Check every 5 seconds (100 * 50ms)

export const RESPAWN_DELAY_TICKS = Infinity; // Prevent respawn of squads and generic bosses

export const STUCK_TIMEOUT_TICKS = 120; 
export const STUCK_RECOVERY_PATROL_RADIUS = TILE_SIZE * 10;

export const AI_TARGET_ARRIVAL_THRESHOLD = TILE_SIZE * 0.5; 
export const AI_PATIENCE_THRESHOLD = 60; 

export const PATHFINDING_MAX_NODES_EXPLORED = 250; 

export const AI_EVASIVE_MANEUVER_COOLDOWN_MS = 1000;
export const AI_EVASIVE_STRAFE_DISTANCE = TILE_SIZE * 5.0; 
export const AI_EVASIVE_DODGE_CHANCE = 0.50;
export const AI_UNDER_FIRE_DURATION_TICKS = 30;
export const ENEMY_COMBAT_STRAFE_DISTANCE = TILE_SIZE * 10.0; // Added this constant

// Sound Configuration
export const GUNSHOT_VOLUME = 0.2; 
export const ENEMY_HEAVY_GUNSHOT_VOLUME = 0.25;
export const UI_SOUND_VOLUME = 0.3;
export const VOICE_SOUND_VOLUME = 0.4; 

export const ENEMY_SIGHTED_SOUND_COOLDOWN_MS = 8000;
export const ENEMY_SIGHTED_SOUND_CHANCE = 0.4;
export const BASE_SOUND_NOTE_ENEMY_SIGHTED = 600;

export const DEFEND_RADIUS_TILES = 5;