console.log('[game.js] Module loaded successfully.');
import * as GameConstants from './constants.js';
import * as GameTypes from './types.js';
import { initializeGameWorld, spawnSquadInSector } from './gameLogic/initialization.js';
import { updatePlayerLogic } from './gameLogic/playerLogic.js';
import { updateTeammatesAI, handleMoveOrder, handleDefendOrder } from './gameLogic/teammateAI.js';
import { updateEnemiesAI } from './gameLogic/enemyAI.js';
import { updateBulletsLogic } from './gameLogic/bulletLogic.js';
import { updateObjectiveLogic } from './gameLogic/objectiveLogic.js';
import { getAudioContext, playObjectiveCompleteSound, playIntelCollectedSound } from './utils/audioUtils.js';
import { getSectors } from './gameLogic/sectorUtils.js';
import { getCurrentViewport } from './utils/vectorUtils.js';

const canvas = document.getElementById('gameCanvas');
if (!canvas) {
    console.error("[game.js] CRITICAL: canvas element with ID 'gameCanvas' not found.");
    throw new Error("Canvas not found");
}
const ctx = canvas.getContext('2d');
if (!ctx) {
    console.error("[game.js] CRITICAL: Failed to get 2D context from canvas.");
    throw new Error("Canvas context failed");
}

// Disable image smoothing for crisp pixel art
ctx.imageSmoothingEnabled = false;
ctx.mozImageSmoothingEnabled = false; // Firefox
ctx.webkitImageSmoothingEnabled = false; // Chrome, Safari, Edge
ctx.msImageSmoothingEnabled = false; // IE

const controlsDisplay = document.getElementById('controls-display');

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas(); // Initial resize

// --- Game State ---
let gameState = createInitialGameState();
let currentScreen = 'environmentSelection';
let camera = { x: 0, y: 0 };
// Add defend order state
let defendOrder = null;
// --- Helper Functions ---
function createInitialGameState() {
    return {
        player: null,
        teammates: [],
        enemies: [],
        enemySquads: [], // New: To manage enemy squads
        bullets: [],
        map: null,
        objectives: [],
        intelItems: [],
        sectors: [],
        gameTime: 0,
        lastRespawnTick: 0, // Used for squad respawning too
        currentObjectiveId: null,
        selectedTeammateIds: [],
        gameOver: false,
        gameWon: false,
        keysPressed: {},
        chosenEnvironment: null,
        currentFormationShape: GameTypes.FormationShape.DIAMOND, // Player's squad formation
        lastEnemySightedSoundTime: 0,
        isPaused: false,
        lastSpawnCheckTick: 0,
        isHudVisible: true,
        lastHKeyPress: false,
        // Add defend order state to gameState for persistence
        defendOrder: null,
    };
}

async function resetAndStartGame(environmentType) {
    console.log(`[game.js] resetAndStartGame: ENTERED with environment: ${environmentType}`);
    currentScreen = 'loading';
    console.log(`[game.js] resetAndStartGame: currentScreen set to '${currentScreen}'. Calling renderLoadingScreen.`);
    renderLoadingScreen(); 
    console.log('[game.js] resetAndStartGame: renderLoadingScreen finished.');

    try {
        console.log('[game.js] resetAndStartGame: Checking typeof initializeGameWorld:', typeof initializeGameWorld);
        if (typeof initializeGameWorld !== 'function') {
            console.error('[game.js] resetAndStartGame: initializeGameWorld is NOT a function! Import failed or error in initialization.js.');
            currentScreen = 'environmentSelection'; 
            console.log(`[game.js] resetAndStartGame: Exiting due to initializeGameWorld not being a function. currentScreen is now: ${currentScreen}`);
            return; 
        }
        
        console.log('[game.js] resetAndStartGame: Attempting to call initializeGameWorld...');
        console.time('initializeGameWorldTotal');
        gameState = initializeGameWorld(environmentType); // THE CALL
        console.timeEnd('initializeGameWorldTotal');
        console.log('[game.js] resetAndStartGame: initializeGameWorld has returned.');

        if (!gameState || !gameState.player) { 
            console.error('[game.js] resetAndStartGame: initializeGameWorld did not return a valid game state or player is null. gameState:', gameState);
            currentScreen = 'environmentSelection';
            console.log(`[game.js] resetAndStartGame: Exiting due to invalid gameState. currentScreen is now: ${currentScreen}`);
            return;
        }

        gameState.sectors = getSectors();        console.log('[game.js] resetAndStartGame: initializeGameWorld COMPLETED SUCCESSFULLY.');
        currentScreen = 'game';
        if (controlsDisplay) {
            controlsDisplay.textContent = ""; // Clear controls display in main game view
        }
    } catch (error) {
        console.error("[game.js] resetAndStartGame: Error during initializeGameWorld call or subsequent setup:", error, error.stack);
        currentScreen = 'environmentSelection';
    }
    console.log(`[game.js] resetAndStartGame: Exiting function. currentScreen is now: ${currentScreen}`);
}

// --- Input Handling ---
const mousePosition = { x: 0, y: 0 };

function handleKeyDown(e) {
    const key = e.key; 
    if (['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'r', 'f', '1', '2', '3', 'Escape'].includes(key)) {
        e.preventDefault();
    }

    if (key === ' ') {
        if (currentScreen === 'game' || currentScreen === 'pause') {
            togglePause();
        }
        return;
    }
    
    if (currentScreen === 'game' && !gameState.isPaused) {
        gameState.keysPressed[key.toLowerCase()] = true; 
        if (key === 'r' && gameState.player && gameState.map) {
            const TILE_SIZE = gameState.map.tileSize;
            gameState.teammates = updateTeammatesAI.handleRecall(
                gameState.teammates, gameState.player, gameState.currentFormationShape, gameState.gameTime, TILE_SIZE
            );
        }
        if (key === 'f') {
            cycleFormation();
        }
        if (key === 'Escape') {
            gameState.selectedTeammateIds = [];
        }
        if (["1", "2", "3"].includes(key)) {
            const tmIndex = parseInt(key) - 1;
            if (
                gameState.teammates &&
                gameState.teammates[tmIndex] &&
                gameState.teammates[tmIndex].health > 0
            ) {
                const teammateId = gameState.teammates[tmIndex].id;
                const selectedIndex = gameState.selectedTeammateIds.indexOf(teammateId);
                if (selectedIndex > -1) {
                    gameState.selectedTeammateIds.splice(selectedIndex, 1);
                } else {
                    gameState.selectedTeammateIds.push(teammateId);
                }
            }
        }
    }
}

function handleKeyUp(e) {
    if (currentScreen === 'game' && !gameState.isPaused) {
        gameState.keysPressed[e.key.toLowerCase()] = false;
    }
}

function isPointInRect(point, rectX, rectY, rectWidth, rectHeight) {
    return point.x >= rectX && point.x <= rectX + rectWidth &&
           point.y >= rectY && point.y <= rectY + rectHeight;
};


async function handleMouseDown(e) { 
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    if (currentScreen === 'environmentSelection') {
        const buttonWidth = 200;
        const buttonHeight = 70;
        const spacing = 20;
        
        // 2x2 grid layout
        const buttonsPerRow = 2;
        const rowWidth = buttonsPerRow * buttonWidth + (buttonsPerRow - 1) * spacing;
        const startX_row = (canvas.width - rowWidth) / 2;
        
        const groupOffsetY = 50; // Original Y offset for the button group center
        const row1Y = (canvas.height / 2 + groupOffsetY) - buttonHeight - spacing / 2;
        const row2Y = (canvas.height / 2 + groupOffsetY) + spacing / 2;

        const urbanButton = { x: startX_row, y: row1Y, width: buttonWidth, height: buttonHeight, env: GameTypes.EnvironmentType.URBAN };
        const ruralButton = { x: startX_row + buttonWidth + spacing, y: row1Y, width: buttonWidth, height: buttonHeight, env: GameTypes.EnvironmentType.RURAL };
        const industrialButton = { x: startX_row, y: row2Y, width: buttonWidth, height: buttonHeight, env: GameTypes.EnvironmentType.INDUSTRIAL };
        const forestButton = { x: startX_row + buttonWidth + spacing, y: row2Y, width: buttonWidth, height: buttonHeight, env: GameTypes.EnvironmentType.FOREST };
        
        console.log(`[game.js] handleMouseDown: Environment selection screen clicked at (${clickX}, ${clickY}).`);
        if (isPointInRect({x: clickX, y: clickY}, urbanButton.x, urbanButton.y, urbanButton.width, urbanButton.height)) {
            console.log('[game.js] handleMouseDown: Urban environment selected.');
            await resetAndStartGame(urbanButton.env);
        } else if (isPointInRect({x: clickX, y: clickY}, ruralButton.x, ruralButton.y, ruralButton.width, ruralButton.height)) {
            console.log('[game.js] handleMouseDown: Rural environment selected.');
            await resetAndStartGame(ruralButton.env);
        } else if (isPointInRect({x: clickX, y: clickY}, industrialButton.x, industrialButton.y, industrialButton.width, industrialButton.height)) {
            console.log('[game.js] handleMouseDown: Industrial environment selected.');
            await resetAndStartGame(industrialButton.env);
        } else if (isPointInRect({x: clickX, y: clickY}, forestButton.x, forestButton.y, forestButton.width, forestButton.height)) {
            console.log('[game.js] handleMouseDown: Forest environment selected.');
            await resetAndStartGame(forestButton.env);
        }
        return;
    }
    
    if (currentScreen === 'pause') {
        const resumeButton = { x: canvas.width/2 - 100, y: canvas.height/2 + 20, width: 200, height: 50 };
        const restartButton = { x: canvas.width/2 - 100, y: canvas.height/2 + 90, width: 200, height: 50 };
        if (isPointInRect({x: clickX, y: clickY}, resumeButton.x, resumeButton.y, resumeButton.width, resumeButton.height)) togglePause();
        else if (isPointInRect({x: clickX, y: clickY}, restartButton.x, restartButton.y, restartButton.width, restartButton.height)) {
            currentScreen = 'environmentSelection'; 
            gameState = createInitialGameState(); 
        }
        return;
    }
    
    if (currentScreen === 'gameOver' || currentScreen === 'gameWon') {
        const restartButton = { x: canvas.width/2 - 100, y: canvas.height/2 + 60, width: 200, height: 50 };
        if (isPointInRect({x: clickX, y: clickY}, restartButton.x, restartButton.y, restartButton.width, restartButton.height)) {
            currentScreen = 'environmentSelection';
            gameState = createInitialGameState();
        }
        return;
    }

    if (currentScreen !== 'game' || gameState.isPaused || !gameState.player || gameState.gameOver || gameState.gameWon) return;    // Calculate world position accounting for camera and HUD offset
    const worldX = clickX + camera.x;
    // For defend orders and other world-space interactions, we need to account for the HUD offset in the click position
    const adjustedClickY = gameState.isHudVisible ? clickY - GameConstants.HUD_PANEL_HEIGHT : clickY;
    const worldY = adjustedClickY + camera.y;

    // DEFEND ORDER: Ctrl+LMB
    if (e.button === 0 && e.ctrlKey) {
        const TILE_SIZE = gameState.map ? gameState.map.tileSize : GameConstants.DEFAULT_TILE_SIZE;
        const defendPos = { x: worldX, y: worldY };
        const radiusTiles = GameConstants.DEFEND_RADIUS_TILES || 10;
        // Issue defend order to all alive teammates
        gameState.teammates = handleDefendOrder(
            gameState.teammates,
            defendPos,
            radiusTiles,
            gameState.map,
            gameState.gameTime,
            TILE_SIZE
        );
        // Set defend order state
        gameState.defendOrder = {
            position: defendPos,
            radius: radiusTiles * TILE_SIZE,
            active: true,
            issuedAt: gameState.gameTime,
            teammateIds: gameState.teammates.filter(tm => tm.health > 0).map(tm => tm.id)
        };
        return;
    }

    if (e.button === 0) { 
        let clickedOnFriendly = false;
        
        if (isPointInRect({x: worldX, y: worldY}, gameState.player.x, gameState.player.y, gameState.player.width, gameState.player.height)) {
             const TILE_SIZE = gameState.map ? gameState.map.tileSize : GameConstants.DEFAULT_TILE_SIZE;
            gameState.teammates = updateTeammatesAI.handleRecall(gameState.teammates, gameState.player, gameState.currentFormationShape, gameState.gameTime, TILE_SIZE);
            clickedOnFriendly = true;
        } else {
            for (const tm of gameState.teammates) {
                if (tm.health > 0 && isPointInRect({x: worldX, y: worldY}, tm.x, tm.y, tm.width, tm.height)) {
                    if (!e.shiftKey) {
                        gameState.selectedTeammateIds = [tm.id];
                    } else {
                        const selectedIndex = gameState.selectedTeammateIds.indexOf(tm.id);
                        if (selectedIndex > -1) {
                            gameState.selectedTeammateIds.splice(selectedIndex, 1);
                        } else {
                            gameState.selectedTeammateIds.push(tm.id);
                        }
                    }
                    clickedOnFriendly = true;
                    break;
                }
            }
        }
        if (!clickedOnFriendly) {
             const { updatedPlayer, newBullet } = updatePlayerLogic.handlePlayerShoot(gameState.player, { x: worldX, y: worldY }, gameState.gameTime);
            gameState.player = updatedPlayer;
            if (newBullet) {
                gameState.bullets.push(newBullet);
            }
        }
    } else if (e.button === 2) { 
        e.preventDefault();
        if (gameState.selectedTeammateIds.length > 0) {
            const targetPos = { x: worldX, y: worldY };
            const TILE_SIZE = gameState.map ? gameState.map.tileSize : GameConstants.DEFAULT_TILE_SIZE;
            
            gameState.teammates = handleMoveOrder(
                gameState.teammates,
                gameState.selectedTeammateIds,
                targetPos,
                gameState.keysPressed['shift'],
                gameState.currentFormationShape,
                gameState.player,
                gameState.gameTime,
                TILE_SIZE
            );
        }
    }
}

function handleContextMenu(e) {
    e.preventDefault();
}

window.addEventListener('keydown', handleKeyDown);
window.addEventListener('keyup', handleKeyUp);
canvas.addEventListener('mousedown', handleMouseDown);
canvas.addEventListener('contextmenu', handleContextMenu);


// --- Game Logic Updates ---
function togglePause() {
    if (currentScreen === 'game' || currentScreen === 'pause') {
        gameState.isPaused = !gameState.isPaused;
        currentScreen = gameState.isPaused ? 'pause' : 'game';
        const audioCtx = getAudioContext();
        if (audioCtx) {
            if (gameState.isPaused && audioCtx.state === 'running') {
                audioCtx.suspend().catch(err => console.error("Error suspending audio context:", err));
            } else if (!gameState.isPaused && audioCtx.state === 'suspended') {
                audioCtx.resume().catch(err => console.error("Error resuming audio context:", err));
            }
        }
    }
}

function cycleFormation() {
    if (!gameState || !gameState.teammates) return;
    const formationShapes = Object.values(GameTypes.FormationShape);
    const currentIndex = formationShapes.indexOf(gameState.currentFormationShape);
    const nextIndex = (currentIndex + 1) % formationShapes.length;
    gameState.currentFormationShape = formationShapes[nextIndex];
    gameState.teammates = gameState.teammates.map(tm => ({
        ...tm,
        isHoldingPosition: false,
        holdPositionTarget: null,
        commandedMoveTime: null, 
        targetPosition: null, 
        currentPath: null, 
        waypointQueue: [], 
        effectiveFormationTarget: null,
    }));
}


function updateGame() {
    if (!gameState.player || !gameState.map || gameState.isPaused || gameState.gameOver || gameState.gameWon) {
        return;
    }

    // Toggle HUD visibility with 'h' key
    if (gameState.keysPressed['h'] && !gameState.lastHKeyPress) {
        gameState.isHudVisible = !gameState.isHudVisible;
    }
    gameState.lastHKeyPress = gameState.keysPressed['h'];

    gameState.gameTime++;
    const TILE_SIZE = gameState.map.tileSize;

    let mutablePlayer = { ...gameState.player };
    let mutableTeammates = gameState.teammates.map(tm => ({ ...tm }));
    let mutableEnemies = gameState.enemies.map(e => ({ ...e }));
    let mutableEnemySquads = gameState.enemySquads.map(sq => ({ 
        ...sq, 
        memberIds: [...sq.memberIds],
        patrolTargetPosition: sq.patrolTargetPosition ? {...sq.patrolTargetPosition} : null,
        orientationVector: sq.orientationVector ? {...sq.orientationVector} : {x:0, y:1},
        // Copy new regrouping properties
        isRegrouping: sq.isRegrouping,
        regroupPoint: sq.regroupPoint ? {...sq.regroupPoint} : null,
        lastRegroupCheckTime: sq.lastRegroupCheckTime,
        regroupStartTime: sq.regroupStartTime,
    }));
    let mutableBullets = gameState.bullets.map(b => ({ ...b }));
    let mutableMap = gameState.map; 
    let mutableObjectives = gameState.objectives.map(obj => ({ ...obj }));
    let mutableIntelItems = gameState.intelItems.map(item => ({...item}));

    const allCharsForCollision = [
        mutablePlayer, 
        ...mutableTeammates, 
        ...mutableEnemies, 
        ...mutableIntelItems.filter(i => !i.isCollected)
      ].filter(c => c !== null && (c.health === undefined || c.health > 0)); 

    const playerMovementUpdate = updatePlayerLogic.handlePlayerMovement(mutablePlayer, gameState.keysPressed, mutableMap, allCharsForCollision);
    mutablePlayer = playerMovementUpdate.updatedPlayer;
    
    const playerOriginalPositionForTick = { x: gameState.player.x, y: gameState.player.y };

    const teammatesUpdate = updateTeammatesAI(
        mutableTeammates, mutablePlayer, playerOriginalPositionForTick, mutableEnemies, mutableMap, allCharsForCollision, 
        gameState.gameTime, TILE_SIZE, gameState.currentFormationShape, gameState.gameTime 
    );
    mutableTeammates = teammatesUpdate.updatedTeammates;
    mutableBullets.push(...teammatesUpdate.newBullets);

    const enemiesAIUpdateResult = updateEnemiesAI.update(
        mutableEnemies, 
        mutableEnemySquads, 
        mutablePlayer,
        mutableTeammates,
        mutableMap,
        allCharsForCollision,
        gameState.gameTime,
        TILE_SIZE,
        gameState.lastEnemySightedSoundTime,
        gameState.lastRespawnTick,
        gameState.sectors
    );
    mutableEnemies = enemiesAIUpdateResult.updatedEnemies;
    mutableEnemySquads = enemiesAIUpdateResult.updatedEnemySquads;
    mutableBullets.push(...enemiesAIUpdateResult.newBullets);
    gameState.lastEnemySightedSoundTime = enemiesAIUpdateResult.updatedLastEnemySightedSoundTime;
    gameState.lastRespawnTick = enemiesAIUpdateResult.updatedLastRespawnTick;
    
    const bulletsUpdate = updateBulletsLogic.update(
        mutableBullets, mutablePlayer, mutableTeammates, mutableEnemies, mutableMap, gameState.gameTime, TILE_SIZE
    );
    mutableBullets = bulletsUpdate.remainingBullets;
    mutablePlayer = bulletsUpdate.updatedPlayer;
    mutableTeammates = bulletsUpdate.updatedTeammates;
    mutableEnemies = bulletsUpdate.updatedEnemies;
    mutableMap = bulletsUpdate.updatedMap;

    if (mutablePlayer.health <= 0 && !gameState.gameOver) {
        gameState.gameOver = true;
        currentScreen = 'gameOver';
    }

    const { updatedIntelItems: intelAfterCollection, objectivesWithIntelUpdate } = updateObjectiveLogic.handleIntelCollection(
        mutablePlayer, mutableIntelItems, mutableObjectives
    );
    if (intelAfterCollection.some((item, idx) => item.isCollected !== mutableIntelItems[idx].isCollected)) {
        playIntelCollectedSound(GameConstants.VOICE_SOUND_VOLUME);
    }
    mutableIntelItems = intelAfterCollection;
    mutableObjectives = objectivesWithIntelUpdate;

    const objectiveStatusUpdate = updateObjectiveLogic.updateGameObjectives(
        mutableObjectives, mutablePlayer, mutableEnemies, mutableMap, TILE_SIZE
    );
    
    objectiveStatusUpdate.updatedObjectives.forEach((newObj, index) => {
        const oldObj = mutableObjectives[index];
        if (newObj && newObj.isCompleted && oldObj && !oldObj.isCompleted) { 
            playObjectiveCompleteSound(GameConstants.UI_SOUND_VOLUME);
        }
    });

    mutableObjectives = objectiveStatusUpdate.updatedObjectives;
    gameState.currentObjectiveId = objectiveStatusUpdate.currentObjectiveId;

    if (objectiveStatusUpdate.gameWon && !gameState.gameWon) {
        gameState.gameWon = true;
        currentScreen = 'gameWon';
    }
     if (mutablePlayer.health <= 0 && !gameState.gameOver) { 
        gameState.gameOver = true;
        currentScreen = 'gameOver';
    }

    gameState.player = mutablePlayer;
    gameState.teammates = mutableTeammates;
    gameState.enemies = mutableEnemies;
    gameState.enemySquads = mutableEnemySquads; 
    gameState.bullets = mutableBullets;
    gameState.map = mutableMap;
    gameState.objectives = mutableObjectives;
    gameState.intelItems = mutableIntelItems;

    if (gameState.player && gameState.map) {
        const playerCenterX = gameState.player.x + gameState.player.width / 2;
        const playerCenterY = gameState.player.y + gameState.player.height / 2;
        
        const gameAreaHeight = canvas.height - GameConstants.HUD_PANEL_HEIGHT;
        const targetScrollTop = playerCenterY - gameAreaHeight / 2;
        const targetScrollLeft = playerCenterX - canvas.width / 2; 
        
        const mapPixelWidth = gameState.map.widthTiles * TILE_SIZE;
        const mapPixelHeight = gameState.map.heightTiles * TILE_SIZE;

        camera.x = Math.max(0, Math.min(targetScrollLeft, mapPixelWidth - canvas.width));
        camera.y = Math.max(0, Math.min(targetScrollTop, mapPixelHeight - gameAreaHeight));
    }

    if (gameState.gameTime - gameState.lastSpawnCheckTick > GameConstants.SPAWN_CHECK_INTERVAL_TICKS) {
        updateEnemyPopulation();
        gameState.lastSpawnCheckTick = gameState.gameTime;
    }

    // Clear defend order if all teammates have been given a new move order or are dead
    if (gameState.defendOrder) {
        const defenders = gameState.teammates.filter(tm => gameState.defendOrder.teammateIds.includes(tm.id));
        // A teammate is considered to have received a new move order if their targetPosition is set (and not the defend point),
        // or if they are no longer holding position, or if they are dead
        const allGivenMoveOrderOrDead = defenders.every(tm => {
            if (tm.health <= 0) return true;
            // If teammate is not holding position or has a targetPosition set (move order), consider them reassigned
            if (!tm.isHoldingPosition || (tm.targetPosition && (!tm.holdPositionTarget || (tm.targetPosition.x !== tm.holdPositionTarget.x || tm.targetPosition.y !== tm.holdPositionTarget.y)))) {
                return true;
            }
            return false;
        });
        if (allGivenMoveOrderOrDead) {
            gameState.defendOrder = null;
        }
    }

    // Make viewport available for all logic this tick
    const viewport = getCurrentViewport(camera, canvas);
    gameState.viewport = viewport;
}

function updateEnemyPopulation() {
    if (!gameState.player || !gameState.map) return;

    const TILE_SIZE = gameState.map.tileSize;
    const playerPos = { x: gameState.player.x, y: gameState.player.y };
    const despawnRadius = GameConstants.SQUAD_DESPAWN_RADIUS_TILES * TILE_SIZE;
    const spawnRadius = GameConstants.SQUAD_SPAWN_RADIUS_TILES * TILE_SIZE;

    // --- Despawning ---
    const squadsToKeep = [];
    const despawnedMemberIds = new Set();

    for (const squad of gameState.enemySquads) {
        if (squad.isObjectiveGuardian) {
            squadsToKeep.push(squad);
            continue;
        }
        const distanceToPlayer = Math.sqrt(Math.pow(squad.focalPoint.x - playerPos.x, 2) + Math.pow(squad.focalPoint.y - playerPos.y, 2));
        if (distanceToPlayer > despawnRadius) {
            squad.memberIds.forEach(id => despawnedMemberIds.add(id));
            console.log(`[game.js] Despawning squad ${squad.id} due to distance.`);
        } else {
            squadsToKeep.push(squad);
        }
    }

    if (despawnedMemberIds.size > 0) {
        gameState.enemySquads = squadsToKeep;
        gameState.enemies = gameState.enemies.filter(e => !despawnedMemberIds.has(e.id));
    }

    // --- Spawning ---
    const activeDynamicSquads = gameState.enemySquads.filter(s => !s.isObjectiveGuardian).length;
    const squadsToSpawn = GameConstants.ACTIVE_SQUAD_LIMIT - activeDynamicSquads;

    if (squadsToSpawn <= 0) return;

    const potentialSpawnSectors = gameState.sectors.filter(sector => {
        const sectorCenterX = (sector.x + sector.width / 2) * TILE_SIZE;
        const sectorCenterY = (sector.y + sector.height / 2) * TILE_SIZE;
        const distanceToPlayer = Math.sqrt(Math.pow(sectorCenterX - playerPos.x, 2) + Math.pow(sectorCenterY - playerPos.y, 2));
        return distanceToPlayer > spawnRadius && distanceToPlayer < despawnRadius;
    });

    if (potentialSpawnSectors.length === 0) return;

    for (let i = 0; i < squadsToSpawn; i++) {
        const randomSector = potentialSpawnSectors[Math.floor(Math.random() * potentialSpawnSectors.length)];
        const allCharacters = [gameState.player, ...gameState.teammates, ...gameState.enemies];
        const result = spawnSquadInSector(randomSector, gameState.map, allCharacters, false);

        if (result) {
            const { newSquad, squadMembers } = result;
            gameState.enemySquads.push(newSquad);
            gameState.enemies.push(...squadMembers);
            console.log(`[game.js] Dynamically spawned squad ${newSquad.id} in sector ${randomSector.id}.`);
        }
    }
}

// --- Rendering ---
function clearCanvas() {
    if (!ctx) {
        console.error('[game.js] clearCanvas: ctx is null or undefined!');
        return;
    }
    if (!GameConstants || GameConstants.GAME_BACKGROUND_COLOR === undefined) {
        console.error('[game.js] clearCanvas: GameConstants or GAME_BACKGROUND_COLOR is undefined. Defaulting color.');
        ctx.fillStyle = '#1F2937'; // Default fallback
    } else {
        ctx.fillStyle = GameConstants.GAME_BACKGROUND_COLOR;
    }
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function lerpColor(color1, color2, factor) {
    const r1 = parseInt(color1.substring(1, 3), 16);
    const g1 = parseInt(color1.substring(3, 5), 16);
    const b1 = parseInt(color1.substring(5, 7), 16);

    const r2 = parseInt(color2.substring(1, 3), 16);
    const g2 = parseInt(color2.substring(3, 5), 16);
    const b2 = parseInt(color2.substring(5, 7), 16);

    const r = Math.round(r1 + factor * (r2 - r1));
    const g = Math.round(g1 + factor * (g2 - g1));
    const b = Math.round(b1 + factor * (b2 - b1));

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function drawMap(mapToDraw, TILE_SIZE) {
    if (!mapToDraw) return;
    const startTileX = Math.floor(camera.x / TILE_SIZE);
    const endTileX = Math.min(mapToDraw.widthTiles - 1, Math.ceil((camera.x + canvas.width) / TILE_SIZE));
    const startTileY = Math.floor(camera.y / TILE_SIZE);
    const endTileY = Math.min(mapToDraw.heightTiles - 1, Math.ceil((camera.y + canvas.height) / TILE_SIZE));

    for (let y = startTileY; y <= endTileY; y++) {
        for (let x = startTileX; x <= endTileX; x++) {
            const tile = mapToDraw.tiles[y][x];
            if (!tile) continue;

            const tileScreenX = x * TILE_SIZE;
            const tileScreenY = y * TILE_SIZE;

            if (tileScreenX + TILE_SIZE > camera.x && tileScreenX < camera.x + canvas.width &&
                tileScreenY + TILE_SIZE > camera.y && tileScreenY < camera.y + canvas.height) {

                const finalDrawX = Math.floor(tileScreenX - camera.x);
                const finalDrawY = Math.floor(tileScreenY - camera.y);
                
                let tileColor = GameConstants.TILE_COLORS[tile.type] || GameConstants.TILE_COLORS[GameTypes.TileType.EMPTY];

                if (tile.type === GameTypes.TileType.WALL && tile.health < GameConstants.WALL_HEALTH) {
                    const healthPercent = Math.max(0, tile.health / GameConstants.WALL_HEALTH);
                    tileColor = lerpColor(GameConstants.WALL_DAMAGED_COLOR, GameConstants.WALL_COLOR, healthPercent);
                } else if (tile.type === GameTypes.TileType.FENCE && tile.health < GameConstants.FENCE_HEALTH) {
                    const healthPercent = Math.max(0, tile.health / GameConstants.FENCE_HEALTH);
                    tileColor = lerpColor(GameConstants.FENCE_DAMAGED_COLOR, GameConstants.FENCE_COLOR, healthPercent);
                }
                
                ctx.fillStyle = tileColor;
                ctx.fillRect(finalDrawX, finalDrawY, TILE_SIZE, TILE_SIZE);
            }
        }
    }
}


function drawCharacter(character, TILE_SIZE, isSelected = false, targetPosition = null, waypointQueue = []) {
    if (!character || (character.health !== undefined && character.health <= 0 && character.type !== GameTypes.EntityType.INTEL_ITEM)) return;
    if (character.type === GameTypes.EntityType.INTEL_ITEM && character.isCollected) return;

    const drawX = character.x - camera.x;
    const drawY = character.y - camera.y;

    if (character.type === GameTypes.EntityType.INTEL_ITEM) {
        ctx.fillStyle = GameConstants.INTEL_ITEM_FILL_COLOR;
        ctx.fillRect(Math.floor(drawX), Math.floor(drawY), character.width, character.height);
        
        ctx.fillStyle = GameConstants.INTEL_ITEM_STROKE_COLOR;
        ctx.font = `${TILE_SIZE * 0.7}px 'Press Start 2P'`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', Math.floor(drawX + character.width / 2), Math.floor(drawY + character.height / 2 + 1));
        
        ctx.strokeStyle = GameConstants.INTEL_ITEM_STROKE_COLOR;
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.floor(drawX), Math.floor(drawY), character.width, character.height);
    } else {
        const centerX = drawX + character.width / 2;
        const centerY = drawY + character.height / 2;
        const radius = character.width / 2;

        let fillColor = character.color;
        if (character.type === GameTypes.EntityType.ENEMY_SOLDIER && GameConstants.ENEMY_COLORS) { 
            if (character.isHVT) fillColor = GameConstants.HVT_COLOR;
            else fillColor = GameConstants.ENEMY_COLORS[character.variant] || character.color;
        }
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fillStyle = fillColor;
        ctx.fill();

        ctx.strokeStyle = '#000000'; 
        ctx.lineWidth = 1;
        ctx.stroke();

        if (isSelected) {
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius + 2, 0, Math.PI * 2);
            ctx.strokeStyle = '#FACC15'; 
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        
        if (isSelected && character.type === GameTypes.EntityType.TEAMMATE) {
            if (waypointQueue && waypointQueue.length > 0) {
                ctx.strokeStyle = 'rgba(250, 204, 21, 0.6)'; 
                ctx.lineWidth = 2;
                ctx.setLineDash([4, 2]);
                ctx.beginPath();
                ctx.moveTo(centerX, centerY); 
                waypointQueue.forEach(wp => ctx.lineTo(wp.x - camera.x, wp.y - camera.y));
                ctx.stroke();
                ctx.setLineDash([]);
                waypointQueue.forEach(wp => {
                    ctx.fillStyle = 'rgba(250, 204, 21, 0.8)';
                    ctx.beginPath();
                    ctx.arc(wp.x - camera.x, wp.y - camera.y, TILE_SIZE * 0.15, 0, Math.PI * 2);
                    ctx.fill();
                });
            }
            if (targetPosition && character.health > 0) {
                const targetDrawX = targetPosition.x - camera.x;
                const targetDrawY = targetPosition.y - camera.y;
                const teammateColor = character.color || GameConstants.TEAMMATE_COLORS[0];

                ctx.fillStyle = teammateColor; 
                ctx.beginPath();
                ctx.arc(targetDrawX, targetDrawY, TILE_SIZE * 0.2, 0, Math.PI * 2);
                ctx.fill();
                const pulseFactor = Math.abs(Math.sin(gameState.gameTime * 0.1));
                ctx.strokeStyle = `rgba(253, 224, 71, ${0.5 + pulseFactor * 0.5})`; 
                ctx.lineWidth = 1 + pulseFactor * 2;
                ctx.beginPath();
                ctx.arc(targetDrawX, targetDrawY, TILE_SIZE * (0.2 + pulseFactor * 0.15) , 0, Math.PI * 2);
                ctx.stroke();
            }
        }
    }
}

function drawBullet(bullet) {
    if (!bullet) return;
    const drawX = bullet.x - camera.x;
    const drawY = bullet.y - camera.y;
    ctx.fillStyle = bullet.color;
    ctx.fillRect(Math.floor(drawX), Math.floor(drawY), bullet.width, bullet.height);
}

function drawObjectiveMarkers(objectives, TILE_SIZE) {
    if (!objectives) return;
    objectives.filter(obj => !obj.isCompleted && obj.targetPosition).forEach(obj => {
        const drawX = obj.targetPosition.x - camera.x;
        const drawY = obj.targetPosition.y - camera.y;

        ctx.font = `${TILE_SIZE}px 'Press Start 2P'`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const marker = obj.type === GameTypes.ObjectiveType.REACH_LOCATION ? '🏁' : (obj.type === GameTypes.ObjectiveType.COLLECT_INTEL ? '❔' : '🎯');
        ctx.fillStyle = '#FFFFFF'; 
        if (obj.id === gameState.currentObjectiveId && (gameState.gameTime % 20 < 10)) {
             ctx.fillStyle = GameConstants.PLAYER_BULLET_COLOR; 
        }
        ctx.fillText(marker, drawX, drawY);
    });
}


function drawHud() {
    if (!gameState.player) return;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'; 
    ctx.fillRect(0, 0, canvas.width, GameConstants.HUD_PANEL_HEIGHT);

    const padding = 5;
    const barHeight = 6;
    const hudWidth = canvas.width / 3 - padding * 1.5;

    // Player health
    ctx.fillStyle = '#FDE047'; 
    ctx.font = "8px 'Press Start 2P'";
    ctx.textAlign = 'left';
    ctx.fillText(`HP: ${gameState.player.health}/${gameState.player.maxHealth}`, padding, padding + 8);
    const playerHealthPercent = gameState.player.health / gameState.player.maxHealth;
    ctx.fillStyle = '#7F1D1D'; 
    ctx.fillRect(padding, padding + 10, hudWidth, barHeight);
    ctx.fillStyle = '#DC2626'; 
    ctx.fillRect(padding, padding + 10, hudWidth * playerHealthPercent, barHeight);

    // Teammate health
    if (gameState.teammates) {
        gameState.teammates.forEach((tm, index) => {
            const yOffset = padding + 20 + index * 15;
            if (yOffset + barHeight + 5 > GameConstants.HUD_PANEL_HEIGHT) return; 

            const tmHealthPercent = tm.health / tm.maxHealth;
            const tmStatus = tm.health <= 0 ? '(DOWN)' : '';
            ctx.fillStyle = tm.health <= 0 ? '#F87171' : '#D1D5DB'; 
            ctx.fillText(`TM${index + 1}: ${tm.health}/${tm.maxHealth} ${tmStatus}`, padding, yOffset);
            
            ctx.fillStyle = tm.health <= 0 ? '#7F1D1D' : '#4B5563'; 
            ctx.fillRect(padding, yOffset + 2, hudWidth, barHeight);
            ctx.fillStyle = tm.health <= 0 ? '#B91C1C' : tm.color; 
            ctx.fillRect(padding, yOffset + 2, hudWidth * (tm.health <= 0 ? 1 : tmHealthPercent), barHeight);
        });
    }

    // Objectives
    const objectivesX = canvas.width * 2/3;
    ctx.fillStyle = '#A78BFA'; 
    ctx.fillText('Objectives:', objectivesX, padding + 8);
    let objYOffset = padding + 15;
    
    if (gameState.objectives) {
        const activeObjectives = gameState.objectives.filter(obj => !obj.isCompleted);
        const completedMainObjectives = gameState.objectives.filter(obj => obj.isCompleted && obj.type !== GameTypes.ObjectiveType.REACH_LOCATION);
        const extractionObjectiveDetails = gameState.objectives.find(obj => obj.type === GameTypes.ObjectiveType.REACH_LOCATION);

        const objectivesToDisplay = activeObjectives.length > 0 ? activeObjectives :
                                (extractionObjectiveDetails && !extractionObjectiveDetails.isCompleted ? [extractionObjectiveDetails] : []);

        objectivesToDisplay.forEach(obj => {
            if (objYOffset + 12 > GameConstants.HUD_PANEL_HEIGHT && objectivesToDisplay.length > 3) return; 
            let text = obj.description;
            if (obj.type === GameTypes.ObjectiveType.COLLECT_INTEL) {
                text = `${obj.description} (${obj.collectedCount || 0}/${obj.requiredCollectibles || '?'})`;
            }
            const marker = obj.type === GameTypes.ObjectiveType.REACH_LOCATION ? '🏁' : (obj.type === GameTypes.ObjectiveType.COLLECT_INTEL ? '❔' : '🎯');
            ctx.fillStyle = obj.id === gameState.currentObjectiveId ? '#FDE047' : '#E5E7EB'; 
            ctx.fillText(`${marker} ${text}`, objectivesX, objYOffset);
            objYOffset += 12;
        });

        if (objectivesToDisplay.length === 0 && extractionObjectiveDetails && !extractionObjectiveDetails.isCompleted) { 
            if (objYOffset + 12 <= GameConstants.HUD_PANEL_HEIGHT) {
                ctx.fillStyle = '#34D399'; 
                ctx.fillText("All primary complete! Reach Extraction.", objectivesX, objYOffset);
                objYOffset += 12;
            }
        } else if (objectivesToDisplay.length === 0 && !extractionObjectiveDetails && gameState.objectives.every(o => o.isCompleted)) { 
            if (objYOffset + 12 <= GameConstants.HUD_PANEL_HEIGHT) {
                ctx.fillStyle = '#6EE7B7';
                ctx.fillText("All objectives complete!", objectivesX, objYOffset);
                objYOffset += 12;
            }
        }

        completedMainObjectives.forEach(obj => {
            if (objYOffset + 12 > GameConstants.HUD_PANEL_HEIGHT) return; 
            ctx.fillStyle = '#6B7280'; 
            const textToMeasure = `✅ ${obj.description}`;
            const textWidth = ctx.measureText(textToMeasure).width;
            ctx.fillText(textToMeasure, objectivesX, objYOffset);
            ctx.beginPath();
            ctx.moveTo(objectivesX, objYOffset - 2);
            ctx.lineTo(objectivesX + textWidth, objYOffset - 2);
            ctx.strokeStyle = '#6B7280';
            ctx.lineWidth = 1;
            ctx.stroke();
            objYOffset += 12;
        });
    }

    // Formation
    ctx.fillStyle = '#CBD5E1'; 
    ctx.textAlign = 'center';
    ctx.fillText(`Formation: ${gameState.currentFormationShape}`, canvas.width / 2, padding + 8);
}

function renderEnvironmentSelectionScreen() {
    //console.log('[game.js] renderEnvironmentSelectionScreen: ENTRY');
    clearCanvas();
    ctx.fillStyle = '#34D399'; 
    ctx.font = "24px 'Press Start 2P'";
    ctx.textAlign = 'center';
    ctx.fillText('Choose Your Mission Zone', canvas.width / 2, canvas.height / 2 - 100);

    const buttonWidth = 200;
    const buttonHeight = 70;
    const spacing = 20;

    // 2x2 grid layout
    const buttonsPerRow = 2;
    const rowWidth = buttonsPerRow * buttonWidth + (buttonsPerRow - 1) * spacing;
    const startX_row = (canvas.width - rowWidth) / 2;
    
    const groupOffsetY = 50; // Original Y offset for the button group center
    const row1Y = (canvas.height / 2 + groupOffsetY) - buttonHeight - spacing / 2;
    const row2Y = (canvas.height / 2 + groupOffsetY) + spacing / 2;

    // Urban Button (Top-Left)
    ctx.fillStyle = '#374151'; 
    ctx.fillRect(startX_row, row1Y, buttonWidth, buttonHeight);
    ctx.strokeStyle = '#6B7280'; ctx.strokeRect(startX_row, row1Y, buttonWidth, buttonHeight);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = "16px 'Press Start 2P'";
    ctx.fillText('Urban', startX_row + buttonWidth / 2, row1Y + buttonHeight / 2 - 5);
    ctx.font = "8px 'Press Start 2P'";
    ctx.fillText('Dense buildings', startX_row + buttonWidth / 2, row1Y + buttonHeight / 2 + 15);

    // Rural Button (Top-Right)
    ctx.fillStyle = '#4D7C0F'; 
    ctx.fillRect(startX_row + buttonWidth + spacing, row1Y, buttonWidth, buttonHeight);
    ctx.strokeStyle = '#84CC16'; ctx.strokeRect(startX_row + buttonWidth + spacing, row1Y, buttonWidth, buttonHeight);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = "16px 'Press Start 2P'";
    ctx.fillText('Rural', startX_row + buttonWidth + spacing + buttonWidth / 2, row1Y + buttonHeight / 2 - 5);
    ctx.font = "8px 'Press Start 2P'";
    ctx.fillText('Open fields', startX_row + buttonWidth + spacing + buttonWidth / 2, row1Y + buttonHeight / 2 + 15);

    // Industrial Button (Bottom-Left)
    ctx.fillStyle = '#334155'; 
    ctx.fillRect(startX_row, row2Y, buttonWidth, buttonHeight);
    ctx.strokeStyle = '#64748B'; ctx.strokeRect(startX_row, row2Y, buttonWidth, buttonHeight);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = "16px 'Press Start 2P'";
    ctx.fillText('Industrial', startX_row + buttonWidth / 2, row2Y + buttonHeight / 2 - 5);
    ctx.font = "8px 'Press Start 2P'";
    ctx.fillText('Factories', startX_row + buttonWidth / 2, row2Y + buttonHeight / 2 + 15);    // Forest Button (Bottom-Right)
    ctx.fillStyle = '#047857'; // Forest green
    ctx.fillRect(startX_row + buttonWidth + spacing, row2Y, buttonWidth, buttonHeight);
    ctx.strokeStyle = '#065F46'; ctx.strokeRect(startX_row + buttonWidth + spacing, row2Y, buttonWidth, buttonHeight);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = "16px 'Press Start 2P'";
    ctx.fillText('Forest', startX_row + buttonWidth + spacing + buttonWidth / 2, row2Y + buttonHeight / 2 - 5);    
    ctx.font = "8px 'Press Start 2P'";
    ctx.fillText('Trees & Trails', startX_row + buttonWidth + spacing + buttonWidth / 2, row2Y + buttonHeight / 2 + 15);
    
    // Draw instructions at the bottom with proper line spacing
    ctx.fillStyle = '#FFFFFF';
    ctx.font = "12px 'Press Start 2P'";
    const lineHeight = 20; // Increased line spacing
    let startY = canvas.height - 150; // Start higher up from the bottom
    
    ctx.fillText("Controls:", canvas.width / 2, startY);
    startY += lineHeight;
    ctx.fillText("WASD/Arrows to Move. Left-Click to Shoot.", canvas.width / 2, startY);
    startY += lineHeight;
    ctx.fillText("Right-Click (Selected Teammate) to Move/Waypoint (Shift+RMB).", canvas.width / 2, startY);
    startY += lineHeight;
    ctx.fillText("Ctrl+Left-Click to Make Teammates Defend Position.", canvas.width / 2, startY);
    startY += lineHeight;
    ctx.fillText("R to Recall. F to Cycle Formation.", canvas.width / 2, startY);
    startY += lineHeight;
    ctx.fillText("1/2/3 to Select/Deselect Teammate. ESC to Deselect.", canvas.width / 2, startY);
    startY += lineHeight;
    ctx.fillText("Space to Pause.", canvas.width / 2, startY);

    // Draw version at the very bottom
    ctx.fillStyle = '#A3A3A3';
    ctx.font = "10px 'Press Start 2P'";
    ctx.fillText(`Version ${GameConstants.GAME_VERSION}`, canvas.width - 90, canvas.height - 10);

    if(controlsDisplay) {
        controlsDisplay.textContent = "Choose Your Mission Zone";
    }
    //console.log('[game.js] renderEnvironmentSelectionScreen: EXIT');
}

function renderGame() {
    clearCanvas(); 

    if (!gameState.map || !gameState.player) {
        console.warn("[game.js] renderGame: gameState.map or gameState.player is null. Skipping render.");
        return;
    }

    const TILE_SIZE = gameState.map.tileSize;

    ctx.save();
    // Only translate if HUD is visible
    if (gameState.isHudVisible) {
        ctx.translate(0, GameConstants.HUD_PANEL_HEIGHT);
    }

    drawMap(gameState.map, TILE_SIZE); 
      if (gameState.intelItems) gameState.intelItems.forEach(item => drawCharacter(item, TILE_SIZE));
    if (gameState.bullets) gameState.bullets.forEach(bullet => drawBullet(bullet));
    
    if (gameState.player) drawCharacter(gameState.player, TILE_SIZE, false);
    if (gameState.teammates) gameState.teammates.forEach(tm => drawCharacter(tm, TILE_SIZE, gameState.selectedTeammateIds.includes(tm.id), tm.targetPosition, tm.waypointQueue));    if (gameState.enemies) gameState.enemies.filter(e => e.health > 0).forEach(enemy => drawCharacter(enemy, TILE_SIZE));
    if (gameState.objectives) drawObjectiveMarkers(gameState.objectives, TILE_SIZE);

    ctx.restore(); // Restore context before drawing HUD    // Only draw HUD if it's visible
    if (gameState.isHudVisible) {
        drawHud();
    }
    
    // Make sure controls display is empty during gameplay
    if (controlsDisplay) {
        controlsDisplay.textContent = "";
    }
}

function renderPauseScreen() {
    console.log('[game.js] renderPauseScreen: ENTRY');
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#FACC15'; 
    ctx.font = "36px 'Press Start 2P'";
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2 - 50);

    ctx.fillStyle = '#10B981'; 
    ctx.fillRect(canvas.width/2 - 100, canvas.height/2 + 20, 200, 50);
    ctx.fillStyle = '#000000';
    ctx.font = "18px 'Press Start 2P'";
    ctx.fillText('Resume', canvas.width / 2, canvas.height/2 + 50);
    
    ctx.fillStyle = '#EF4444'; 
    ctx.fillRect(canvas.width/2 - 100, canvas.height/2 + 90, 200, 50);    ctx.fillStyle = '#000000';
    ctx.fillText('Restart', canvas.width / 2, canvas.height/2 + 120);
      // Draw instructions at the bottom with proper line spacing
    ctx.fillStyle = '#FFFFFF';
    ctx.font = "12px 'Press Start 2P'";
    const lineHeight = 20; // Increased line spacing
    let startY = canvas.height - 150; // Start higher up from the bottom
    
    ctx.fillText("Controls:", canvas.width / 2, startY);
    startY += lineHeight;
    ctx.fillText("WASD/Arrows to Move. Left-Click to Shoot.", canvas.width / 2, startY);
    startY += lineHeight;
    ctx.fillText("Right-Click (Selected Teammate) to Move/Waypoint (Shift+RMB).", canvas.width / 2, startY);
    startY += lineHeight;
    ctx.fillText("Ctrl+Left-Click to Make Teammates Defend Position.", canvas.width / 2, startY);
    startY += lineHeight;
    ctx.fillText("R to Recall. F to Cycle Formation.", canvas.width / 2, startY);
    startY += lineHeight;
    ctx.fillText("1/2/3 to Select/Deselect Teammate. ESC to Deselect.", canvas.width / 2, startY);    startY += lineHeight;
    ctx.fillText("Space to Resume.", canvas.width / 2, startY);

    // Draw version at the very bottom
    ctx.fillStyle = '#A3A3A3';
    ctx.font = "10px 'Press Start 2P'";
    ctx.fillText(`Version ${GameConstants.GAME_VERSION}`, canvas.width - 90, canvas.height - 10);

    if(controlsDisplay) {
        controlsDisplay.textContent = "Game Paused. Space to Resume.";
    }
    console.log('[game.js] renderPauseScreen: EXIT');
}

function renderGameOverScreen() {
    console.log('[game.js] renderGameOverScreen: ENTRY');
    ctx.fillStyle = 'rgba(127, 29, 29, 0.85)'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#F87171'; 
    ctx.font = "48px 'Press Start 2P'";
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 30);
    
    ctx.fillStyle = '#F59E0B'; 
    ctx.fillRect(canvas.width/2 - 100, canvas.height/2 + 60, 200, 50);
    ctx.fillStyle = '#000000';
    ctx.font = "18px 'Press Start 2P'";
    ctx.fillText('Restart', canvas.width / 2, canvas.height/2 + 90);
    if(controlsDisplay) controlsDisplay.textContent = "Game Over. Click Restart.";
    console.log('[game.js] renderGameOverScreen: EXIT');
}

function renderGameWonScreen() {
    console.log('[game.js] renderGameWonScreen: ENTRY');
    ctx.fillStyle = 'rgba(6, 78, 59, 0.85)'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#6EE7B7'; 
    ctx.font = "36px 'Press Start 2P'";
    ctx.textAlign = 'center';
    ctx.fillText('MISSION ACCOMPLISHED!', canvas.width / 2, canvas.height / 2 - 50);
    ctx.fillStyle = '#FACC15'; 
    ctx.font = "24px 'Press Start 2P'";
    ctx.fillText('You Win!', canvas.width / 2, canvas.height / 2);

    ctx.fillStyle = '#F59E0B'; 
    ctx.fillRect(canvas.width/2 - 100, canvas.height/2 + 60, 200, 50);
    ctx.fillStyle = '#000000';
    ctx.font = "18px 'Press Start 2P'";
    ctx.fillText('Play Again', canvas.width / 2, canvas.height/2 + 90);
    if(controlsDisplay) controlsDisplay.textContent = "Mission Accomplished! Click Play Again.";
    console.log('[game.js] renderGameWonScreen: EXIT');
}

function renderLoadingScreen() {
    console.log('[game.js] renderLoadingScreen: ENTRY');
    clearCanvas();
    ctx.fillStyle = '#FACC15'; 
    ctx.font = "20px 'Press Start 2P'";
    ctx.textAlign = 'center';
    ctx.fillText('Loading Mission...', canvas.width / 2, canvas.height / 2);
    if(controlsDisplay) controlsDisplay.textContent = "Loading controls...";
    console.log('[game.js] renderLoadingScreen: EXIT');
}


// --- Game Loop ---
let lastTime = 0;
function gameLoop(timestamp) {
    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;

    try {
        switch (currentScreen) {
            case 'environmentSelection':
                renderEnvironmentSelectionScreen();
                break;
            case 'loading': 
                renderLoadingScreen(); 
                break;
            case 'game':
                if (gameState && gameState.player && gameState.map) { 
                    updateGame();
                    renderGame();
                } else if (!gameState.player && currentScreen === 'game') { 
                    console.warn("[game.js] gameLoop: Game state not ready for 'game' screen. Reverting to environment selection.");
                    currentScreen = 'environmentSelection';
                    renderEnvironmentSelectionScreen(); 
                }
                break;
            case 'pause':
                renderPauseScreen(); 
                break;
            case 'gameOver':
                renderGameOverScreen();
                break;
            case 'gameWon':
                renderGameWonScreen();
                break;
            default:
                console.warn("[game.js] gameLoop: Unknown currentScreen state:", currentScreen, "Switching to environmentSelection.");
                currentScreen = 'environmentSelection'; 
                renderEnvironmentSelectionScreen();
        }
    } catch (error) {
        console.error(`[game.js] gameLoop: Error during screen '${currentScreen}' processing:`, error, error.stack);
        try {
            ctx.fillStyle = 'red';
            ctx.fillRect(0,0, canvas.width, canvas.height);
            ctx.fillStyle = 'white';
            ctx.font = "12px 'Press Start 2P'";
            ctx.textAlign = 'center';
            ctx.fillText("CRITICAL ERROR IN GAME LOOP. Check console.", canvas.width/2, canvas.height/2);
        } catch (e) {
            // ignore
        }
        console.error("[game.js] gameLoop: Halting due to critical error.");
        return; 
    }
    
    requestAnimationFrame(gameLoop);
}

// Initial setup
console.log("[game.js] Initializing audio context and starting game loop.");
try {
    getAudioContext(); 
} catch (e) {
    console.error("[game.js] Error initializing AudioContext on startup:", e);
}
requestAnimationFrame(gameLoop);
console.log("[game.js] Script execution finished. Game loop requested.");