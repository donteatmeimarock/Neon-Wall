// Game Constants
const BOARD_SIZE = 9; // 9x9 walkable cells
const GRID_SIZE = 17; // 17x17 logical grid (cells + walls)
const WALLS_PER_PLAYER = Infinity;

// Game State
let gameState = {
    playMode: 'pvp', // 'pvp' or 'pve'
    currentPlayer: 1, // 1 or 2
    gameOver: false,
    mode: 'move', // 'move' or 'wall'
    players: {
        1: { pos: { x: 4, y: 8 }, walls: WALLS_PER_PLAYER, targetY: 0 }, // Bottom player going up
        2: { pos: { x: 4, y: 0 }, walls: WALLS_PER_PLAYER, targetY: 8 }  // Top player going down
    },
    // Board representation: 
    // Even indices are cells. Odd indices are wall gaps/intersections.
    // 0 = empty, 1 = wall placed
    grid: Array(GRID_SIZE).fill(0).map(() => Array(GRID_SIZE).fill(0)),
    
    // UI state
    wallHoverState: { ix: -1, iy: -1, orientation: 'h', valid: false }
};

// DOM Elements
const boardEl = document.getElementById('game-board');
const p1WallsEl = document.getElementById('p1-walls');
const p2WallsEl = document.getElementById('p2-walls');
const p1Panel = document.getElementById('player1-panel');
const p2Panel = document.getElementById('player2-panel');
const overlay = document.getElementById('win-overlay');
const winMsg = document.getElementById('win-message');
const modeMoveBtn = document.getElementById('mode-move');
const modeWallBtn = document.getElementById('mode-wall');
const restartBtn = document.getElementById('restart-btn');
const mainGameEl = document.getElementById('main-game');
const startOverlay = document.getElementById('start-overlay');
const btnPvp = document.getElementById('btn-pvp');
const btnPve = document.getElementById('btn-pve');

// Initialize Game
function init() {
    setupEventListeners();
    renderInventories();
    renderBoard();
    updateUI();
}

// Start Game from Menu
function startGame(mode) {
    gameState.playMode = mode;
    startOverlay.classList.add('hidden');
    resetGame();
}

// Reset Game
function resetGame() {
    gameState = {
        playMode: gameState.playMode,
        currentPlayer: 1,
        gameOver: false,
        mode: 'move',
        players: {
            1: { pos: { x: 4, y: 8 }, walls: WALLS_PER_PLAYER, targetY: 0 },
            2: { pos: { x: 4, y: 0 }, walls: WALLS_PER_PLAYER, targetY: 8 }
        },
        grid: Array(GRID_SIZE).fill(0).map(() => Array(GRID_SIZE).fill(0)),
        wallHoverState: { ix: -1, iy: -1, orientation: 'h', valid: false }
    };
    overlay.classList.add('hidden');
    switchMode('move');
    renderInventories();
    updateUI();
    renderBoard();
}

// Setup Listeners
function setupEventListeners() {
    btnPvp.addEventListener('click', () => startGame('pvp'));
    btnPve.addEventListener('click', () => startGame('pve'));
    
    modeMoveBtn.addEventListener('click', () => switchMode('move'));
    modeWallBtn.addEventListener('click', () => switchMode('wall'));
    restartBtn.addEventListener('click', resetGame);
    
    boardEl.addEventListener('mousemove', handleBoardHover);
    boardEl.addEventListener('mouseleave', () => {
        gameState.wallHoverState.ix = -1;
        renderBoard();
    });
    
    // Toggle orientation with right click
    boardEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (gameState.mode === 'wall' && !gameState.gameOver) {
            gameState.wallHoverState.orientation = gameState.wallHoverState.orientation === 'h' ? 'v' : 'h';
            // Re-validate wall at current hover position
            if (gameState.wallHoverState.ix !== -1) {
                gameState.wallHoverState.valid = canPlaceWall(gameState.wallHoverState.ix, gameState.wallHoverState.iy, gameState.wallHoverState.orientation);
            }
            renderBoard();
        }
    });

    // Handle clicks delegated from board
    boardEl.addEventListener('click', (e) => {
        if (gameState.gameOver) return;
        if (gameState.playMode === 'pve' && gameState.currentPlayer === 2) return; // Prevent interaction during bot turn

        // If clicking on a movable cell
        if (gameState.mode === 'move' && e.target.closest('.grid-cell.movable')) {
            const cell = e.target.closest('.grid-cell.movable');
            const nx = parseInt(cell.dataset.cx);
            const ny = parseInt(cell.dataset.cy);
            movePawn(nx, ny);
        }
        
        // If placing a wall and valid
        if (gameState.mode === 'wall' && gameState.wallHoverState.ix !== -1 && gameState.wallHoverState.valid) {
            placeWall(gameState.wallHoverState.ix, gameState.wallHoverState.iy, gameState.wallHoverState.orientation);
        }
    });

    // Add keyboard toggle
    document.addEventListener('keydown', (e) => {
        if ((e.key === ' ' || e.key === 'r' || e.key === 'R') && gameState.mode === 'wall' && !gameState.gameOver) {
            e.preventDefault();
            gameState.wallHoverState.orientation = gameState.wallHoverState.orientation === 'h' ? 'v' : 'h';
            if (gameState.wallHoverState.ix !== -1) {
                gameState.wallHoverState.valid = canPlaceWall(gameState.wallHoverState.ix, gameState.wallHoverState.iy, gameState.wallHoverState.orientation);
            }
            renderBoard();
        }
    });
}

function switchMode(newMode) {
    if (gameState.gameOver) return;
    gameState.mode = newMode;
    gameState.wallHoverState.ix = -1; // reset hover
    modeMoveBtn.classList.toggle('active', newMode === 'move');
    modeWallBtn.classList.toggle('active', newMode === 'wall');
    
    // Automatically switch to move if out of walls
    if (newMode === 'wall' && gameState.players[gameState.currentPlayer].walls <= 0) {
        // Can't switch to wall mode if 0 walls left
        switchMode('move');
        return;
    }
    
    renderBoard();
}

function handleBoardHover(e) {
    if (gameState.mode !== 'wall' || gameState.gameOver) return;
    
    // Find closest cell/wall element
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || !boardEl.contains(el)) return;
    
    // Nearest element might not have data-x, search up a little
    const gridEl = el.closest('[data-x]');
    if (!gridEl) return;
    
    const gx = parseInt(gridEl.dataset.x);
    const gy = parseInt(gridEl.dataset.y);
    
    let ix = gx;
    let iy = gy;
    let newOrientation = gameState.wallHoverState.orientation;
    
    // Auto-detect orientation based on the hovered gap
    if (gx % 2 === 0 && gy % 2 === 1) {
        newOrientation = 'h'; // Hovering on h-wall
        ix = gx < 16 ? gx + 1 : gx - 1;
        iy = gy;
    } else if (gx % 2 === 1 && gy % 2 === 0) {
        newOrientation = 'v'; // Hovering on v-wall
        ix = gx;
        iy = gy < 16 ? gy + 1 : gy - 1;
    } else if (gx % 2 === 0 && gy % 2 === 0) {
        // Hovering a cell, pick nearest intersection
        ix = gx < 16 ? gx + 1 : gx - 1;
        iy = gy < 16 ? gy + 1 : gy - 1;
    } else {
        // Hovering exactly on intersection
        ix = gx;
        iy = gy;
    }
    
    // If we changed intersections or orientation, re-evaluate
    if (ix !== gameState.wallHoverState.ix || iy !== gameState.wallHoverState.iy || newOrientation !== gameState.wallHoverState.orientation) {
        gameState.wallHoverState.ix = ix;
        gameState.wallHoverState.iy = iy;
        gameState.wallHoverState.orientation = newOrientation;
        gameState.wallHoverState.valid = canPlaceWall(ix, iy, gameState.wallHoverState.orientation);
        renderBoard();
    }
}

// Logic: Check if moving pawn is valid
function getValidMoves(playerNum) {
    const pos = gameState.players[playerNum].pos;
    const opponentPos = gameState.players[playerNum === 1 ? 2 : 1].pos;
    const moves = [];
    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]]; // UP, DOWN, LEFT, RIGHT
    
    for (let [dx, dy] of dirs) {
        const nx = pos.x + dx;
        const ny = pos.y + dy;
        
        // Bounds
        if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
            // No wall blocks?
            const wallX = pos.x * 2 + dx;
            const wallY = pos.y * 2 + dy;
            
            if (gameState.grid[wallY][wallX] === 0) {
                // Opponent blocking?
                if (nx === opponentPos.x && ny === opponentPos.y) {
                    // Try to jump straight over the opponent
                    const jumpX = nx + dx;
                    const jumpY = ny + dy;
                    
                    let canJumpStraight = false;
                    
                    if (jumpX >= 0 && jumpX < BOARD_SIZE && jumpY >= 0 && jumpY < BOARD_SIZE) {
                        const jumpWallX = nx * 2 + dx;
                        const jumpWallY = ny * 2 + dy;
                        if (gameState.grid[jumpWallY][jumpWallX] === 0) {
                            moves.push({x: jumpX, y: jumpY});
                            canJumpStraight = true;
                        }
                    }
                    
                    // If straight jump is blocked by edge or wall, allow diagonal jumps next to opponent
                    if (!canJumpStraight) {
                        // If moving vertically (dy !== 0), look horizontally (dx = -1, 1). If moving horizontally, look vertically
                        const diagDirs = dx === 0 ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]];
                         for (let [ddx, ddy] of diagDirs) {
                            const diagX = nx + ddx;
                            const diagY = ny + ddy;
                            
                            if (diagX >= 0 && diagX < BOARD_SIZE && diagY >= 0 && diagY < BOARD_SIZE) {
                                const diagWallX = nx * 2 + ddx;
                                const diagWallY = ny * 2 + ddy;
                                if (gameState.grid[diagWallY][diagWallX] === 0) {
                                    moves.push({x: diagX, y: diagY});
                                }
                            }
                         }
                    }
                    
                } else {
                    moves.push({x: nx, y: ny});
                }
            }
        }
    }
    return moves;
}

// Logic: BFS to verify path exists
function canReachGoal(playerNum) {
    const startPos = gameState.players[playerNum].pos;
    const targetY = gameState.players[playerNum].targetY;
    
    let queue = [{x: startPos.x, y: startPos.y}];
    let visited = Array(BOARD_SIZE).fill(0).map(() => Array(BOARD_SIZE).fill(false));
    visited[startPos.y][startPos.x] = true;
    
    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    
    let head = 0;
    while(head < queue.length) {
        const curr = queue[head++];
        if (curr.y === targetY) return true;
        
        for (let [dx, dy] of dirs) {
            const nx = curr.x + dx;
            const ny = curr.y + dy;
            if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && !visited[ny][nx]) {
                const wallX = curr.x * 2 + dx;
                const wallY = curr.y * 2 + dy;
                // If no wall blocking
                if (gameState.grid[wallY][wallX] === 0) {
                    visited[ny][nx] = true;
                    queue.push({x: nx, y: ny});
                }
            }
        }
    }
    return false;
}

// Logic: Verify wall placement
function canPlaceWall(ix, iy, orientation) {
    if (gameState.players[gameState.currentPlayer].walls <= 0) return false;
    
    // Ensure bounds (ix and iy must be odd and within 1-15)
    if (ix < 1 || ix > 15 || iy < 1 || iy > 15) return false;
    // Ensure they are actually intersections
    if (ix % 2 === 0 || iy % 2 === 0) return false;

    // Check overlaps
    if (orientation === 'h') {
        if (gameState.grid[iy][ix-1] !== 0 || gameState.grid[iy][ix] !== 0 || gameState.grid[iy][ix+1] !== 0) return false;
    } else {
        if (gameState.grid[iy-1][ix] !== 0 || gameState.grid[iy][ix] !== 0 || gameState.grid[iy+1][ix] !== 0) return false;
    }
    
    // Pathfinding verification
    // Place temp
    if (orientation === 'h') {
        gameState.grid[iy][ix-1] = 1; gameState.grid[iy][ix] = 1; gameState.grid[iy][ix+1] = 1;
    } else {
        gameState.grid[iy-1][ix] = 1; gameState.grid[iy][ix] = 1; gameState.grid[iy+1][ix] = 1;
    }
    
    const p1CanReach = canReachGoal(1);
    const p2CanReach = canReachGoal(2);
    
    // Remove temp
    if (orientation === 'h') {
        gameState.grid[iy][ix-1] = 0; gameState.grid[iy][ix] = 0; gameState.grid[iy][ix+1] = 0;
    } else {
        gameState.grid[iy-1][ix] = 0; gameState.grid[iy][ix] = 0; gameState.grid[iy+1][ix] = 0;
    }
    
    return p1CanReach && p2CanReach;
}

// Action: Move Pawn
function movePawn(x, y) {
    gameState.players[gameState.currentPlayer].pos = {x, y};
    checkWinOrEndTurn();
}

// Action: Place Wall
function placeWall(ix, iy, orientation) {
    gameState.players[gameState.currentPlayer].walls--;
    
    if (orientation === 'h') {
        gameState.grid[iy][ix-1] = 1; gameState.grid[iy][ix] = 1; gameState.grid[iy][ix+1] = 1;
    } else {
        gameState.grid[iy-1][ix] = 1; gameState.grid[iy][ix] = 1; gameState.grid[iy+1][ix] = 1;
    }
    
    // Once placed, reset hover state and end turn
    gameState.wallHoverState.ix = -1;
    checkWinOrEndTurn();
}

// End Turn
function checkWinOrEndTurn() {
    const p1 = gameState.players[1];
    const p2 = gameState.players[2];
    
    if (p1.pos.y === p1.targetY) {
        endGame(1);
        return;
    } else if (p2.pos.y === p2.targetY) {
        endGame(2);
        return;
    }
    
    // Switch turns
    gameState.currentPlayer = gameState.currentPlayer === 1 ? 2 : 1;
    
    // Reset mode back to move automatically to save clicks, or keep it depending on walls.
    if (gameState.players[gameState.currentPlayer].walls <= 0) {
        switchMode('move');
    } else {
        switchMode('move'); // Resetting to move feels most intuitive for a new turn
    }
    
    renderInventories();
    updateUI();
    renderBoard();

    if (gameState.playMode === 'pve' && gameState.currentPlayer === 2 && !gameState.gameOver) {
        setTimeout(playBotTurn, 500); // 500ms delay for realism
    }
}

function endGame(winnerNum) {
    gameState.gameOver = true;
    winMsg.textContent = `Player ${winnerNum} Wins!`;
    winMsg.style.color = winnerNum === 1 ? 'var(--p1-color)' : 'var(--p2-color)';
    overlay.classList.remove('hidden');
    renderBoard();
}

// Generate the 17x17 grid DOM
function renderBoard() {
    boardEl.innerHTML = '';
    
    const validMoves = (gameState.mode === 'move' && !gameState.gameOver) ? getValidMoves(gameState.currentPlayer) : [];
    
    const ixHover = gameState.wallHoverState.ix;
    const iyHover = gameState.wallHoverState.iy;
    const isHoverValid = gameState.wallHoverState.valid;
    const hoverOrient = gameState.wallHoverState.orientation;
    
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            const el = document.createElement('div');
            el.dataset.x = x;
            el.dataset.y = y;
            
            // Build hover preview logic
            let isHoverTarget = false;
            if (gameState.mode === 'wall' && ixHover !== -1) {
                if (hoverOrient === 'h') {
                    if (y === iyHover && x >= ixHover - 1 && x <= ixHover + 1) isHoverTarget = true;
                } else {
                    if (x === ixHover && y >= iyHover - 1 && y <= iyHover + 1) isHoverTarget = true;
                }
            }

            if (x % 2 === 0 && y % 2 === 0) {
                // Cell
                el.className = 'grid-cell';
                let cx = x / 2;
                let cy = y / 2;
                el.dataset.cx = cx;
                el.dataset.cy = cy;
                
                // Add pawns
                if (gameState.players[1].pos.x === cx && gameState.players[1].pos.y === cy) {
                    const pawn = document.createElement('div');
                    pawn.className = 'pawn p1-pawn';
                    el.appendChild(pawn);
                } else if (gameState.players[2].pos.x === cx && gameState.players[2].pos.y === cy) {
                    const pawn = document.createElement('div');
                    pawn.className = 'pawn p2-pawn';
                    el.appendChild(pawn);
                }
                
                // Movable state
                if (gameState.mode === 'move' && !gameState.gameOver) {
                    if (validMoves.some(m => m.x === cx && m.y === cy)) {
                        el.classList.add('movable');
                    }
                }
                
            } else if (x % 2 === 1 && y % 2 === 0) {
                el.className = 'v-wall';
            } else if (x % 2 === 0 && y % 2 === 1) {
                el.className = 'h-wall';
            } else {
                el.className = 'intersection';
            }
            
            // Placed walls
            if (gameState.grid[y][x] === 1) {
                el.classList.add('wall-placed');
                if (y % 2 !== 0 && x % 2 !== 0) { el.classList.add('wall-placed-int'); }
            }
            
            // Hover preview
            if (isHoverTarget) {
                el.style.backgroundColor = isHoverValid ? 'var(--wall-hover-valid)' : 'var(--wall-hover-invalid)';
                if (!isHoverValid) el.style.cursor = 'not-allowed';
                else el.style.cursor = 'pointer';
            }
            
            boardEl.appendChild(el);
        }
    }
}

// Render wall icons in player panels
function renderInventories() {
    const renderPlayerWalls = (el) => {
        el.innerHTML = '<div style="display: flex; align-items: center; gap: 8px; font-size: 1.5rem; color: var(--text-muted); font-weight: 800;"><div class="wall-icon"></div> ∞</div>';
    };
    
    renderPlayerWalls(p1WallsEl);
    renderPlayerWalls(p2WallsEl);
}

// Update UI active states
function updateUI() {
    p1Panel.classList.toggle('active', gameState.currentPlayer === 1);
    p2Panel.classList.toggle('active', gameState.currentPlayer === 2);
    p1Panel.querySelector('.status-indicator').textContent = gameState.currentPlayer === 1 ? 'Your Turn' : 'Waiting...';
    p2Panel.querySelector('.status-indicator').textContent = gameState.currentPlayer === 2 ? 'Your Turn' : 'Waiting...';
    
    // Disable Wall Button if out of walls
    modeWallBtn.disabled = gameState.players[gameState.currentPlayer].walls <= 0;
    if (modeWallBtn.disabled) {
        modeWallBtn.title = "No walls remaining";
        modeWallBtn.style.opacity = "0.5";
        modeWallBtn.style.cursor = "not-allowed";
    } else {
        modeWallBtn.title = `Right-click board or press Space to rotate`;
        modeWallBtn.style.opacity = "1";
        modeWallBtn.style.cursor = "pointer";
    }
}

// AI Logic
function getDistanceToTarget(startX, startY, targetY) {
    let queue = [{x: startX, y: startY, dist: 0}];
    let visited = Array(BOARD_SIZE).fill(0).map(() => Array(BOARD_SIZE).fill(false));
    visited[startY][startX] = true;
    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    
    // We need to know where the opponent is to simulate a jump
    // If we're evaluating P2's moves, P1 is the obstacle, and vice versa.
    // However, getDistanceToTarget is used universally including hypothetical boards.
    // For simplicity, we'll just pull the main game state opponents.
    const p1Pos = gameState.players[1].pos;
    const p2Pos = gameState.players[2].pos;

    let head = 0;
    while(head < queue.length) {
        const curr = queue[head++];
        if (curr.y === targetY) return curr.dist;
        
        for (let [dx, dy] of dirs) {
            const nx = curr.x + dx;
            const ny = curr.y + dy;
            if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
                const wallX = curr.x * 2 + dx;
                const wallY = curr.y * 2 + dy;
                // If no wall blocking
                if (gameState.grid[wallY][wallX] === 0) {
                    // Check if there's someone in the way of the BFS (opponent)
                    // (Assuming we are looking at real opponent positions, this makes it a rough estimate for hypothetical moves, but it's good enough for AI)
                    let isOpponentHere = (nx === p1Pos.x && ny === p1Pos.y) || (nx === p2Pos.x && ny === p2Pos.y);
                    
                    if (isOpponentHere) {
                        // Simulate straight jump
                        const jumpX = nx + dx;
                        const jumpY = ny + dy;
                        let canJumpStraight = false;

                        if (jumpX >= 0 && jumpX < BOARD_SIZE && jumpY >= 0 && jumpY < BOARD_SIZE) {
                            const jumpWallX = nx * 2 + dx;
                            const jumpWallY = ny * 2 + dy;
                            if (gameState.grid[jumpWallY][jumpWallX] === 0) {
                                if (!visited[jumpY][jumpX]) {
                                    visited[jumpY][jumpX] = true;
                                    queue.push({x: jumpX, y: jumpY, dist: curr.dist + 1});
                                }
                                canJumpStraight = true;
                            }
                        }

                        if (!canJumpStraight) {
                            // Simulate diagonal jumps
                            const diagDirs = dx === 0 ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]];
                            for (let [ddx, ddy] of diagDirs) {
                                const diagX = nx + ddx;
                                const diagY = ny + ddy;
                                if (diagX >= 0 && diagX < BOARD_SIZE && diagY >= 0 && diagY < BOARD_SIZE) {
                                    const diagWallX = nx * 2 + ddx;
                                    const diagWallY = ny * 2 + ddy;
                                    if (gameState.grid[diagWallY][diagWallX] === 0) {
                                        if (!visited[diagY][diagX]) {
                                            visited[diagY][diagX] = true;
                                            queue.push({x: diagX, y: diagY, dist: curr.dist + 1});
                                        }
                                    }
                                }
                            }
                        }
                    } else {
                        // Normal move
                        if (!visited[ny][nx]) {
                            visited[ny][nx] = true;
                            queue.push({x: nx, y: ny, dist: curr.dist + 1});
                        }
                    }
                }
            }
        }
    }
    return Infinity;
}

function playBotTurn() {
    if (gameState.gameOver) return;
    
    const bot = gameState.players[2];
    const player = gameState.players[1];
    
    const currentBotDist = getDistanceToTarget(bot.pos.x, bot.pos.y, bot.targetY);
    const currentPlayerDist = getDistanceToTarget(player.pos.x, player.pos.y, player.targetY);
    
    // 1. Evaluate Wall placements
    let bestWall = null;
    let bestWallScore = currentPlayerDist - currentBotDist; 
    
    if (bot.walls > 0) {
        let candidateWalls = [];
        for (let iy = 1; iy <= 15; iy += 2) {
            for (let ix = 1; ix <= 15; ix += 2) {
                for (let orient of ['h', 'v']) {
                    if (canPlaceWall(ix, iy, orient)) {
                        candidateWalls.push({ix, iy, orient});
                    }
                }
            }
        }
        
        // Shuffle to get varied wall placements
        candidateWalls.sort(() => Math.random() - 0.5);
        
        for (let wall of candidateWalls) {
            // Place temp wall
            if (wall.orient === 'h') {
                gameState.grid[wall.iy][wall.ix-1] = 1; gameState.grid[wall.iy][wall.ix] = 1; gameState.grid[wall.iy][wall.ix+1] = 1;
            } else {
                gameState.grid[wall.iy-1][wall.ix] = 1; gameState.grid[wall.iy][wall.ix] = 1; gameState.grid[wall.iy+1][wall.ix] = 1;
            }
            
            let newBotDist = getDistanceToTarget(bot.pos.x, bot.pos.y, bot.targetY);
            let newPlayerDist = getDistanceToTarget(player.pos.x, player.pos.y, player.targetY);
            let score = newPlayerDist - newBotDist;
            
            // Only consider wall if it harms the player more than it harms the bot
            if (score > bestWallScore && (newPlayerDist - currentPlayerDist) > (newBotDist - currentBotDist)) {
                bestWallScore = score;
                bestWall = wall;
            }
            
            // Remove temp wall
            if (wall.orient === 'h') {
                gameState.grid[wall.iy][wall.ix-1] = 0; gameState.grid[wall.iy][wall.ix] = 0; gameState.grid[wall.iy][wall.ix+1] = 0;
            } else {
                gameState.grid[wall.iy-1][wall.ix] = 0; gameState.grid[wall.iy][wall.ix] = 0; gameState.grid[wall.iy+1][wall.ix] = 0;
            }
        }
    }
    
    let shouldPlaceWall = false;
    if (bestWall && bestWallScore > (currentPlayerDist - currentBotDist)) {
        if (currentPlayerDist <= currentBotDist + 1) shouldPlaceWall = true;
        else if (bestWallScore >= (currentPlayerDist - currentBotDist) + 2) shouldPlaceWall = true;
        else if (Math.random() < 0.3) shouldPlaceWall = true;
    }
    
    if (shouldPlaceWall) {
        placeWall(bestWall.ix, bestWall.iy, bestWall.orient);
        return;
    }

    // 2. Move Pawn
    const validMoves = getValidMoves(2);
    let bestMoves = [];
    let minDistance = Infinity;
    
    for (let move of validMoves) {
        let dist = getDistanceToTarget(move.x, move.y, bot.targetY);
        if (dist < minDistance) {
            minDistance = dist;
            bestMoves = [move];
        } else if (dist === minDistance) {
            bestMoves.push(move);
        }
    }
    
    let bestMove = null;
    if (bestMoves.length > 0) {
        // Pick random optimal move
        bestMove = bestMoves[Math.floor(Math.random() * bestMoves.length)];
    } else if (validMoves.length > 0) {
        bestMove = validMoves[0];
    }

    if (bestMove) {
        movePawn(bestMove.x, bestMove.y);
    }
}

init();
