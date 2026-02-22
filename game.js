// ==========================================
// GAME ENGINE - ALL 5 ISSUES FIXED
// ==========================================

let gameState = {
    roomCode: null,
    playerName: null,
    playerId: null,
    isDrawer: false,
    currentWord: null,
    round: 1,
    maxRounds: 10,
    timer: 80,
    players: {},
    playerList: [],
    currentDrawerIndex: 0,
    isGameActive: false,
    allGuessed: false,
    lastPlayerCount: 0,
    leftPlayerName: null,
    gameStarted: false,
    joinTime: null,
    hasShownGame: false,
    lastState: null,
    lastDrawer: null,
    lastRound: null,
    hasGuessedWord: false,
    currentState: 'waiting'
};

let canvas, ctx;
let isDrawing = false;
let currentTool = 'brush';
let currentColor = '#000000';
let currentSize = 4;
let drawingHistory = [];
let undoHistory = []; // NEW: For undo functionality
let remoteStroke = null;
let timerInterval = null;
let autoRestartTimer = null;
let wordSelectTimer = null;

let roomRef, playersRef, chatRef, drawingRef, gameRef;
let sounds = {};

const colors = [
    '#000000', '#2c3e50', '#8e44ad', '#c0392b', '#d35400',
    '#f39c12', '#f1c40f', '#2ecc71', '#1abc9c', '#3498db',
    '#2980b9', '#9b59b6', '#e74c3c', '#e67e22', '#795548',
    '#ffffff', '#95a5a6', '#34495e', '#16a085', '#27ae60'
];

const brushSizes = [
    { size: 2, label: 'Small' },
    { size: 5, label: 'Medium' },
    { size: 10, label: 'Large' },
    { size: 20, label: 'Huge' }
];

// ==========================================
// INITIALIZATION
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    initCanvas();
    initColorPicker();
    initSizePicker();
    initToolbar();
    initSounds();
    
    document.getElementById('chatInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    
    document.getElementById('popupOverlay').addEventListener('click', closePopups);
});

function initSounds() {
    sounds.join = document.getElementById('soundJoin');
    sounds.correct = document.getElementById('soundCorrect');
    sounds.roundEnd = document.getElementById('soundRoundEnd');
    sounds.leave = document.getElementById('soundLeave');
    sounds.enter = document.getElementById('soundEnter');
}

function playSound(soundName) {
    const sound = sounds[soundName];
    if (sound) {
        sound.currentTime = 0;
        sound.play().catch(e => {});
    }
}

// ==========================================
// CANVAS - FIX 1 & 2: High quality, full size
// ==========================================

function initCanvas() {
    canvas = document.getElementById('gameCanvas');
    if (!canvas) return;
    
    // FIX 2: Make canvas fill the wrapper completely
    const wrapper = document.querySelector('.canvas-wrapper');
    if (wrapper) {
        const rect = wrapper.getBoundingClientRect();
        // FIX 1: Higher resolution for crisp drawing (multiply by device pixel ratio)
        const dpr = window.devicePixelRatio || 1;
        
        // Set display size (css pixels)
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        
        // Set actual size in memory (scaled to account for extra pixel density)
        canvas.width = Math.floor(rect.width * dpr);
        canvas.height = Math.floor(rect.height * dpr);
        
        // Normalize coordinate system to use css pixels
        ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.scale(dpr, dpr);
    } else {
        canvas.width = 800;
        canvas.height = 600;
        ctx = canvas.getContext('2d', { willReadFrequently: true });
    }
    
    // FIX 1: High quality settings
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.imageSmoothingEnabled = false; // Crisp lines
    
    // Clear to white
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));
    
    // Events
    canvas.addEventListener('mousedown', handleMouseDown, true);
    canvas.addEventListener('mousemove', handleMouseMove, true);
    canvas.addEventListener('mouseup', handleMouseUp, true);
    canvas.addEventListener('mouseleave', handleMouseUp, true);
    
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false, capture: true });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
    canvas.addEventListener('touchend', handleMouseUp, { passive: false, capture: true });
}

// ==========================================
// DRAWING - FIX 1: Crisp lines, FIX 2: Full canvas
// ==========================================

function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    const clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
    
    // FIX 2: Return CSS pixels (not scaled)
    return {
        x: clientX - rect.left,
        y: clientY - rect.top
    };
}

let lastX = 0, lastY = 0;

function canDraw() {
    return gameState.isDrawer && gameState.currentState === 'drawing';
}

function handleMouseDown(e) {
    if (!canDraw()) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const pos = getPos(e);
    lastX = pos.x;
    lastY = pos.y;
    isDrawing = true;
    
    // FIX 3: Handle bucket tool
    if (currentTool === 'bucket') {
        floodFill(Math.floor(lastX), Math.floor(lastY), currentColor);
        sendDrawData('fill', { x: Math.floor(lastX), y: Math.floor(lastY), color: currentColor });
        isDrawing = false;
        return;
    }
    
    // Set properties
    ctx.lineWidth = currentSize;
    ctx.strokeStyle = (currentTool === 'eraser') ? '#ffffff' : currentColor;
    
    // Draw dot
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(lastX, lastY);
    ctx.stroke();
    
    // Save to history for undo (FIX 3)
    currentStroke = {
        type: 'stroke',
        color: ctx.strokeStyle,
        size: currentSize,
        points: [{x: lastX, y: lastY}],
        tool: currentTool
    };
    
    sendDrawData('start', { 
        x: lastX, 
        y: lastY, 
        color: ctx.strokeStyle, 
        size: currentSize,
        tool: currentTool
    });
}

let currentStroke = null;

function handleMouseMove(e) {
    if (!isDrawing || !canDraw()) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const pos = getPos(e);
    const x = pos.x;
    const y = pos.y;
    
    // FIX 1: Crisp line drawing
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.stroke();
    
    if (currentStroke) {
        currentStroke.points.push({x, y});
    }
    
    sendDrawData('draw', { x, y, lx: lastX, ly: lastY });
    
    lastX = x;
    lastY = y;
}

function handleMouseUp(e) {
    if (!isDrawing) return;
    isDrawing = false;
    
    if (currentStroke && currentStroke.points.length > 1) {
        drawingHistory.push(currentStroke);
        // Limit history
        if (drawingHistory.length > 50) {
            drawingHistory.shift();
        }
    }
    currentStroke = null;
    
    sendDrawData('end');
}

function handleTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = {
        clientX: touch.clientX,
        clientY: touch.clientY,
        preventDefault: () => {},
        stopPropagation: () => {}
    };
    handleMouseDown(mouseEvent);
}

function handleTouchMove(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = {
        clientX: touch.clientX,
        clientY: touch.clientY,
        preventDefault: () => {},
        stopPropagation: () => {}
    };
    handleMouseMove(mouseEvent);
}

// FIX 3: Working bucket fill
function floodFill(startX, startY, fillColor) {
    const width = canvas.width / (window.devicePixelRatio || 1);
    const height = canvas.height / (window.devicePixelRatio || 1);
    
    // Get image data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const dpr = window.devicePixelRatio || 1;
    
    // Scale coordinates for actual pixel data
    const pixelX = Math.floor(startX * dpr);
    const pixelY = Math.floor(startY * dpr);
    
    const startPos = (pixelY * canvas.width + pixelX) * 4;
    const targetR = data[startPos];
    const targetG = data[startPos + 1];
    const targetB = data[startPos + 2];
    const targetA = data[startPos + 3];
    
    const fill = hexToRgb(fillColor);
    if (!fill) return;
    
    // Don't fill if same color
    if (targetR === fill.r && targetG === fill.g && targetB === fill.b) return;
    
    const stack = [[pixelX, pixelY]];
    const visited = new Set();
    const key = (x, y) => `${x},${y}`;
    
    while (stack.length > 0) {
        const [x, y] = stack.pop();
        const k = key(x, y);
        
        if (visited.has(k)) continue;
        if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) continue;
        
        const pos = (y * canvas.width + x) * 4;
        const r = data[pos], g = data[pos + 1], b = data[pos + 2], a = data[pos + 3];
        
        // Check if pixel matches target color (with tolerance)
        const tolerance = 32;
        if (Math.abs(r - targetR) > tolerance || 
            Math.abs(g - targetG) > tolerance || 
            Math.abs(b - targetB) > tolerance) continue;
        
        visited.add(k);
        
        // Fill pixel
        data[pos] = fill.r;
        data[pos + 1] = fill.g;
        data[pos + 2] = fill.b;
        data[pos + 3] = 255;
        
        // Add neighbors
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    
    ctx.putImageData(imageData, 0, 0);
    
    // Save to history
    drawingHistory.push({
        type: 'fill',
        x: startX,
        y: startY,
        color: fillColor
    });
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

// FIX 3: Working undo
function undo() {
    if (!canDraw() || drawingHistory.length === 0) return;
    
    // Remove last action
    drawingHistory.pop();
    
    // Redraw everything
    redraw();
    
    sendDrawData('undo');
}

function redraw() {
    // Clear canvas
    const dpr = window.devicePixelRatio || 1;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    
    // Redraw all history
    drawingHistory.forEach(action => {
        if (action.type === 'stroke') {
            ctx.lineWidth = action.size;
            ctx.strokeStyle = action.color;
            ctx.beginPath();
            
            if (action.points.length > 0) {
                ctx.moveTo(action.points[0].x, action.points[0].y);
                for (let i = 1; i < action.points.length; i++) {
                    ctx.lineTo(action.points[i].x, action.points[i].y);
                }
            }
            ctx.stroke();
        } else if (action.type === 'fill') {
            floodFill(action.x, action.y, action.color);
        }
    });
}

function clearCanvas() {
    const dpr = window.devicePixelRatio || 1;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    drawingHistory = [];
}

// ==========================================
// TOOLBAR
// ==========================================

function initColorPicker() {
    const grid = document.getElementById('colorGrid');
    const preview = document.getElementById('colorPreview');
    if (!grid) return;
    
    colors.forEach((color, i) => {
        const div = document.createElement('div');
        div.className = 'color-option' + (i === 0 ? ' selected' : '');
        div.style.background = color;
        div.onclick = () => {
            document.querySelectorAll('.color-option').forEach(c => c.classList.remove('selected'));
            div.classList.add('selected');
            currentColor = color;
            currentTool = 'brush';
            if (preview) preview.style.background = color;
            updateTools();
            closePopups();
        };
        grid.appendChild(div);
    });
    
    if (preview) preview.style.background = currentColor;
}

function initSizePicker() {
    const container = document.getElementById('sizeOptions');
    if (!container) return;
    
    brushSizes.forEach((brush, i) => {
        const div = document.createElement('div');
        div.className = 'size-option' + (i === 1 ? ' selected' : '');
        div.innerHTML = `<div style="width:40px;height:${brush.size}px;background:#333;border-radius:2px"></div><span style="font-size:11px">${brush.label}</span>`;
        div.onclick = () => {
            document.querySelectorAll('.size-option').forEach(s => s.classList.remove('selected'));
            div.classList.add('selected');
            currentSize = brush.size;
            closePopups();
        };
        container.appendChild(div);
    });
}

function initToolbar() {
    const colorBtn = document.getElementById('colorBtn');
    const sizeBtn = document.getElementById('sizeBtn');
    const brushBtn = document.getElementById('brushBtn');
    const eraserBtn = document.getElementById('eraserBtn');
    const bucketBtn = document.getElementById('bucketBtn');
    const undoBtn = document.getElementById('undoBtn');
    const clearBtn = document.getElementById('clearBtn');
    
    if (colorBtn) colorBtn.onclick = () => togglePopup('colorPopup');
    if (sizeBtn) sizeBtn.onclick = () => togglePopup('sizePopup');
    if (brushBtn) brushBtn.onclick = () => { currentTool = 'brush'; updateTools(); };
    if (eraserBtn) eraserBtn.onclick = () => { currentTool = 'eraser'; updateTools(); };
    
    // FIX 3: Bucket tool
    if (bucketBtn) bucketBtn.onclick = () => { 
        currentTool = 'bucket'; 
        updateTools(); 
        showToast('Tap canvas to fill area', 'info');
    };
    
    // FIX 3: Undo button
    if (undoBtn) undoBtn.onclick = undo;
    
    if (clearBtn) clearBtn.onclick = () => {
        clearCanvas();
        if (roomRef) {
            drawingRef.push({
                type: 'clear',
                player: gameState.playerId,
                time: firebase.database.ServerValue.TIMESTAMP
            });
        }
    };
    
    updateTools();
}

function updateTools() {
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    
    if (currentTool === 'brush') {
        const btn = document.getElementById('brushBtn');
        if (btn) btn.classList.add('active');
    } else if (currentTool === 'eraser') {
        const btn = document.getElementById('eraserBtn');
        if (btn) btn.classList.add('active');
    } else if (currentTool === 'bucket') {
        const btn = document.getElementById('bucketBtn');
        if (btn) btn.classList.add('active');
    }
}

function togglePopup(id) {
    const popup = document.getElementById(id);
    const overlay = document.getElementById('popupOverlay');
    if (!popup || !overlay) return;
    
    const isOpen = popup.classList.contains('show');
    
    document.querySelectorAll('.popup').forEach(p => p.classList.remove('show'));
    overlay.classList.remove('show');
    
    if (!isOpen) {
        popup.classList.add('show');
        overlay.classList.add('show');
    }
}

function closePopups() {
    document.querySelectorAll('.popup').forEach(p => p.classList.remove('show'));
    const overlay = document.getElementById('popupOverlay');
    if (overlay) overlay.classList.remove('show');
}

// ==========================================
// REMOTE DRAWING
// ==========================================

function sendDrawData(type, data) {
    if (!roomRef || !gameState.isDrawer) return;
    
    const payload = {
        type: type,
        player: gameState.playerId,
        time: firebase.database.ServerValue.TIMESTAMP
    };
    
    if (data) Object.assign(payload, data);
    
    drawingRef.push(payload);
}

function listenDrawing() {
    if (!drawingRef) return;
    
    drawingRef.on('child_added', (snap) => {
        const data = snap.val();
        if (!data || data.player === gameState.playerId) return;
        
        if (data.type === 'start') {
            ctx.lineWidth = data.size || 4;
            ctx.strokeStyle = data.color || '#000';
            ctx.beginPath();
            ctx.moveTo(data.x, data.y);
        } else if (data.type === 'draw') {
            ctx.beginPath();
            ctx.moveTo(data.lx, data.ly);
            ctx.lineTo(data.x, data.y);
            ctx.stroke();
        } else if (data.type === 'fill') {
            floodFill(data.x, data.y, data.color);
        } else if (data.type === 'clear') {
            clearCanvas();
        } else if (data.type === 'undo') {
            // Remote undo - just clear and wait for redraw
            clearCanvas();
        }
    });
}

// ==========================================
// GAME LOGIC
// ==========================================

function joinGame() {
    const nameInput = document.getElementById('playerName');
    const codeInput = document.getElementById('roomCode');
    
    const name = (nameInput ? nameInput.value.trim() : '') || 'Player' + Math.floor(Math.random() * 1000);
    const code = codeInput ? codeInput.value.trim().toUpperCase() : '';
    
    gameState.playerName = name;
    gameState.joinTime = Date.now();
    
    const loading = document.getElementById('loadingOverlay');
    if (loading) loading.classList.add('show');
    
    if (!code) {
        createRoom(generateCode());
    } else {
        joinRoom(code);
    }
}

function generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

function createRoom(code) {
    gameState.roomCode = code;
    gameState.playerId = 'p_' + Date.now();
    
    roomRef = database.ref('rooms/' + code);
    playersRef = roomRef.child('players');
    chatRef = roomRef.child('chat');
    drawingRef = roomRef.child('drawing');
    gameRef = roomRef.child('game');
    
    roomRef.set({
        created: Date.now(),
        state: 'waiting',
        round: 1,
        maxRounds: 10,
        currentDrawerIndex: 0,
        drawer: null,
        word: null,
        allGuessed: false,
        playerList: []
    }).then(() => {
        addPlayer();
    }).catch(err => {
        showToast('Error: ' + err.message, 'error');
        const loading = document.getElementById('loadingOverlay');
        if (loading) loading.classList.remove('show');
    });
}

function joinRoom(code) {
    gameState.roomCode = code;
    gameState.playerId = 'p_' + Date.now();
    
    roomRef = database.ref('rooms/' + code);
    
    roomRef.once('value', (snap) => {
        if (!snap.exists()) {
            showToast('Room not found!', 'error');
            const loading = document.getElementById('loadingOverlay');
            if (loading) loading.classList.remove('show');
            return;
        }
        
        const roomData = snap.val();
        
        playersRef = roomRef.child('players');
        chatRef = roomRef.child('chat');
        drawingRef = roomRef.child('drawing');
        gameRef = roomRef.child('game');
        
        if (roomData.game) {
            gameState.currentState = roomData.game.state || 'waiting';
        }
        
        addPlayer(roomData);
    }, (err) => {
        showToast('Error: ' + err.message, 'error');
        const loading = document.getElementById('loadingOverlay');
        if (loading) loading.classList.remove('show');
    });
}

function addPlayer(existingRoomData) {
    playersRef.child(gameState.playerId).set({
        name: gameState.playerName,
        score: 0,
        joined: Date.now(),
        hasGuessed: false
    }).then(() => {
        playersRef.child(gameState.playerId).onDisconnect().remove();
        
        if (existingRoomData && existingRoomData.game) {
            const currentList = existingRoomData.game.playerList || [];
            if (!currentList.includes(gameState.playerId)) {
                gameRef.update({
                    playerList: [...currentList, gameState.playerId]
                });
            }
        }
        
        setupListeners();
        showGame(gameState.roomCode);
    }).catch(err => {
        showToast('Error: ' + err.message, 'error');
        const loading = document.getElementById('loadingOverlay');
        if (loading) loading.classList.remove('show');
    });
}

function setupListeners() {
    playersRef.on('value', (snap) => {
        gameState.players = snap.val() || {};
        updatePlayerList();
        
        const playerIds = Object.keys(gameState.players);
        const isFirstPlayer = playerIds.length > 0 && playerIds[0] === gameState.playerId;
        
        if (isFirstPlayer && playerIds.length >= 2 && !gameState.gameStarted) {
            checkStartGame();
        }
    });
    
    chatRef.limitToLast(100).on('child_added', (snap) => {
        const msg = snap.val();
        if (msg && msg.time >= gameState.joinTime) {
            displayMessage(msg);
        }
    });
    
    gameRef.on('value', (snap) => {
        const game = snap.val();
        if (game) {
            handleGameChange(game);
            if (game.state !== 'waiting') {
                gameState.gameStarted = true;
            }
        }
    });
    
    listenDrawing();
}

function checkStartGame() {
    if (gameState.gameStarted) return;
    
    const playerIds = Object.keys(gameState.players);
    if (playerIds.length < 2) return;
    
    const firstPlayer = playerIds[0];
    
    gameRef.update({
        state: 'choosing',
        playerList: playerIds,
        currentDrawerIndex: 0,
        drawer: firstPlayer,
        round: 1,
        timer: 80,
        word: null,
        allGuessed: false
    }).then(() => {
        gameState.gameStarted = true;
    });
}

function handleGameChange(game) {
    const prevState = gameState.currentState;
    const wasDrawer = gameState.isDrawer;
    
    gameState.currentState = game.state;
    gameState.lastState = game.state;
    gameState.game = game;
    gameState.round = game.round || 1;
    gameState.isDrawer = (game.drawer === gameState.playerId);
    gameState.currentWord = game.word;
    gameState.isGameActive = (game.state === 'drawing');
    
    // Update UI
    const roundInfo = document.getElementById('roundInfo');
    const timerDisplay = document.getElementById('timerDisplay');
    const wordDisplay = document.getElementById('wordDisplay');
    
    if (roundInfo) roundInfo.textContent = `Round ${gameState.round} of ${game.maxRounds || 10}`;
    if (timerDisplay) timerDisplay.textContent = game.timer || 80;
    
    // FIX 4: Show revealed word properly
    if (wordDisplay) {
        if (!game.word) {
            wordDisplay.textContent = 'Waiting...';
            wordDisplay.classList.remove('revealed');
        } else if (gameState.isDrawer || gameState.hasGuessedWord) {
            // Show actual letters, not underscores
            wordDisplay.textContent = game.word.toUpperCase().split('').join(' ');
            wordDisplay.classList.add('revealed');
        } else {
            // Show underscores with spaces
            wordDisplay.textContent = game.word.split('').map(c => c === ' ' ? '   ' : '_').join(' ');
            wordDisplay.classList.remove('revealed');
        }
    }
    
    // Handle states
    const waitingOverlay = document.getElementById('waitingOverlay');
    const roundOverlay = document.getElementById('roundOverlay');
    const wordModal = document.getElementById('wordModal');
    
    switch(game.state) {
        case 'waiting':
            if (waitingOverlay) waitingOverlay.classList.remove('show');
            if (roundOverlay) roundOverlay.classList.remove('show');
            break;
            
        case 'choosing':
            if (gameState.isDrawer) {
                if (waitingOverlay) waitingOverlay.classList.remove('show');
                if (!wordModal || !wordModal.classList.contains('show')) {
                    setTimeout(showWordSelect, 100);
                }
            } else {
                if (waitingOverlay) waitingOverlay.classList.add('show');
                if (wordModal) wordModal.classList.remove('show');
            }
            if (roundOverlay) roundOverlay.classList.remove('show');
            break;
            
        case 'drawing':
            if (waitingOverlay) waitingOverlay.classList.remove('show');
            if (roundOverlay) roundOverlay.classList.remove('show');
            if (wordModal) wordModal.classList.remove('show');
            
            if (prevState === 'choosing' && gameState.isDrawer) {
                clearCanvas();
            }
            
            if (gameState.isDrawer && !timerInterval) {
                startTimer();
            }
            break;
            
        case 'round_end':
            if (waitingOverlay) waitingOverlay.classList.remove('show');
            showRoundEnd(game.word);
            break;
            
        case 'game_over':
            if (waitingOverlay) waitingOverlay.classList.remove('show');
            if (roundOverlay) roundOverlay.classList.remove('show');
            showGameOver();
            break;
    }
    
    // Handle drawer change
    if (gameState.isDrawer !== wasDrawer) {
        const badge = document.getElementById('drawerBadge');
        const toolbar = document.getElementById('toolbarContainer');
        
        if (gameState.isDrawer) {
            if (badge) badge.classList.add('show');
            if (toolbar) toolbar.classList.add('show');
        } else {
            if (badge) badge.classList.remove('show');
            if (toolbar) toolbar.classList.remove('show');
            if (wordModal) wordModal.classList.remove('show');
        }
    }
}

function showWordSelect() {
    const modal = document.getElementById('wordModal');
    if (!modal || modal.classList.contains('show')) return;
    
    const options = WordBank.getWordOptions();
    const container = document.getElementById('wordOptions');
    if (!container) return;
    
    container.innerHTML = '';
    
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'word-btn';
        btn.innerHTML = `${opt.word}<div style="font-size:12px;margin-top:4px">${opt.difficulty} • ${opt.points} pts</div>`;
        btn.onclick = () => selectWord(opt.word);
        container.appendChild(btn);
    });
    
    modal.classList.add('show');
    
    let time = 15;
    const timerEl = document.getElementById('wordTimer');
    if (timerEl) timerEl.textContent = time;
    
    wordSelectTimer = setInterval(() => {
        time--;
        if (timerEl) timerEl.textContent = time;
        if (time <= 0) {
            clearInterval(wordSelectTimer);
            if (modal.classList.contains('show')) {
                selectWord(options[0].word);
            }
        }
    }, 1000);
}

function selectWord(word) {
    if (wordSelectTimer) clearInterval(wordSelectTimer);
    
    const modal = document.getElementById('wordModal');
    if (modal) modal.classList.remove('show');
    
    clearCanvas();
    
    gameRef.update({
        state: 'drawing',
        word: word,
        timer: 80,
        startTime: Date.now(),
        allGuessed: false
    });
}

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    
    timerInterval = setInterval(() => {
        gameRef.once('value', (snap) => {
            const game = snap.val();
            if (!game || game.state !== 'drawing') {
                clearInterval(timerInterval);
                timerInterval = null;
                return;
            }
            
            if (game.drawer !== gameState.playerId) return;
            
            const elapsed = Math.floor((Date.now() - game.startTime) / 1000);
            const remaining = Math.max(0, 80 - elapsed);
            
            gameRef.update({ timer: remaining });
            
            if (remaining <= 0 || game.allGuessed) {
                clearInterval(timerInterval);
                timerInterval = null;
                endRound();
            }
        });
    }, 1000);
}

function endRound() {
    gameRef.once('value', (snap) => {
        const game = snap.val();
        if (!game) return;
        
        const playerList = game.playerList || Object.keys(gameState.players);
        let nextIndex = (game.currentDrawerIndex + 1) % playerList.length;
        let nextRound = game.round;
        
        if (nextIndex === 0) nextRound++;
        
        if (nextRound > (game.maxRounds || 10)) {
            gameRef.update({ state: 'game_over' });
            return;
        }
        
        let attempts = 0;
        while (attempts < playerList.length && !gameState.players[playerList[nextIndex]]) {
            nextIndex = (nextIndex + 1) % playerList.length;
            if (nextIndex === 0) nextRound++;
            attempts++;
        }
        
        if (nextRound > (game.maxRounds || 10)) {
            gameRef.update({ state: 'game_over' });
            return;
        }
        
        const nextDrawer = playerList[nextIndex];
        
        gameRef.update({ state: 'round_end' });
        
        setTimeout(() => {
            gameRef.update({
                state: 'choosing',
                round: nextRound,
                drawer: nextDrawer,
                currentDrawerIndex: nextIndex,
                word: null,
                timer: 80,
                allGuessed: false
            });
        }, 3000);
    });
}

// ==========================================
// CHAT
// ==========================================

function sendMessage() {
    const input = document.getElementById('chatInput');
    if (!input) return;
    
    const text = input.value.trim();
    if (!text) return;
    
    if (gameState.isDrawer) {
        sendChat('drawer_chat', text);
        input.value = '';
        return;
    }
    
    const me = gameState.players[gameState.playerId];
    if (me && me.hasGuessed) {
        sendChat('guesser_chat', text);
        input.value = '';
        return;
    }
    
    if (gameState.isGameActive && text.toLowerCase() === (gameState.currentWord || '').toLowerCase()) {
        handleCorrectGuess();
        input.value = '';
        return;
    }
    
    sendChat('guess', text);
    input.value = '';
}

function handleCorrectGuess() {
    const me = gameState.players[gameState.playerId];
    if (me && me.hasGuessed) return;
    
    const points = Math.max(10, Math.floor(gameState.timer / 8) * 10);
    
    gameState.hasGuessedWord = true;
    
    playersRef.child(gameState.playerId).update({
        score: (me ? me.score : 0) + points,
        hasGuessed: true
    });
    
    sendChat('correct', `guessed correctly! (+${points})`);
    playSound('correct');
    
    // FIX 4: Update word display immediately to show letters
    const wordDisplay = document.getElementById('wordDisplay');
    if (wordDisplay && gameState.currentWord) {
        wordDisplay.textContent = gameState.currentWord.toUpperCase().split('').join(' ');
        wordDisplay.classList.add('revealed');
    }
    
    checkAllGuessed();
}

function checkAllGuessed() {
    const allPlayers = Object.keys(gameState.players);
    if (allPlayers.length < 2) return;
    
    const guessers = allPlayers.filter(id => id !== gameState.game.drawer);
    if (guessers.length === 0) return;
    
    const allCorrect = guessers.every(id => gameState.players[id] && gameState.players[id].hasGuessed);
    
    if (allCorrect && !gameState.allGuessed) {
        const drawer = gameState.players[gameState.game.drawer];
        if (drawer) {
            playersRef.child(gameState.game.drawer).update({
                score: (drawer.score || 0) + 25
            });
        }
        
        gameRef.update({ allGuessed: true });
        setTimeout(endRound, 2000);
    }
}

function sendChat(type, text, isClose) {
    chatRef.push({
        type: type,
        text: text,
        player: gameState.playerId,
        name: gameState.playerName,
        time: firebase.database.ServerValue.TIMESTAMP,
        isClose: isClose || false
    });
}

function displayMessage(msg) {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    
    const div = document.createElement('div');
    div.className = 'chat-message';
    
    if (msg.type === 'system') {
        div.classList.add('system');
        div.textContent = msg.text;
    } else if (msg.type === 'correct') {
        div.classList.add('correct');
        div.innerHTML = `<span class="username">${msg.name}</span> ${msg.text}`;
    } else {
        div.classList.add('guess');
        div.innerHTML = `<span class="username">${msg.name}</span> ${msg.text}`;
    }
    
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// ==========================================
// UI
// ==========================================

function updatePlayerList() {
    const container = document.getElementById('playersList');
    const count = document.getElementById('playerCount');
    if (!container || !count) return;
    
    container.innerHTML = '';
    const players = Object.entries(gameState.players);
    count.textContent = `${players.length}/8`;
    
    players.sort((a, b) => ((b[1] ? b[1].score : 0) - (a[1] ? a[1].score : 0)));
    
    players.forEach(([id, p]) => {
        if (!p) return;
        
        const div = document.createElement('div');
        div.className = 'player-item';
        
        if (id === (gameState.game ? gameState.game.drawer : null)) div.classList.add('current-drawer');
        if (p.hasGuessed) div.classList.add('guessed');
        
        div.innerHTML = `
            <div class="player-avatar">${(p.name || '?')[0].toUpperCase()}</div>
            <div class="player-info">
                <div class="player-name">${p.name || 'Unknown'} ${id === gameState.playerId ? '(You)' : ''}</div>
            </div>
            <div class="player-score">${p.score || 0}</div>
        `;
        
        container.appendChild(div);
    });
}

function showRoundEnd(word) {
    const overlay = document.getElementById('roundOverlay');
    const revealedWord = document.getElementById('revealedWord');
    
    if (revealedWord) revealedWord.textContent = word || '---';
    if (overlay) overlay.classList.add('show');
    
    playSound('roundEnd');
}

function showGameOver() {
    if (autoRestartTimer) clearInterval(autoRestartTimer);
    
    const modal = document.getElementById('gameOverModal');
    const winnerDisplay = document.getElementById('winnerDisplay');
    const finalScores = document.getElementById('finalScores');
    const autoRestartText = document.getElementById('autoRestartText');
    
    const sorted = Object.entries(gameState.players)
        .sort((a, b) => ((b[1] ? b[1].score : 0) - (a[1] ? a[1].score : 0)));
    
    const winner = sorted[0];
    
    if (winnerDisplay && winner) {
        winnerDisplay.innerHTML = `
            <div class="winner-crown">👑</div>
            <div class="winner-name">${winner[1].name}</div>
            <div class="winner-score">${winner[1].score || 0} points</div>
        `;
    }
    
    if (finalScores) {
        finalScores.innerHTML = '';
        sorted.forEach(([id, p], i) => {
            if (!p) return;
            const div = document.createElement('div');
            div.className = 'final-score-item' + (i === 0 ? ' winner' : '');
            div.innerHTML = `
                <span class="final-rank">#${i + 1}</span>
                <span class="final-name">${p.name}</span>
                <span class="final-points">${p.score || 0}</span>
            `;
            finalScores.appendChild(div);
        });
    }
    
    if (modal) modal.classList.add('show');
    
    let secondsLeft = 10;
    if (autoRestartText) autoRestartText.textContent = `New game starts in ${secondsLeft}...`;
    
    autoRestartTimer = setInterval(() => {
        secondsLeft--;
        if (autoRestartText) autoRestartText.textContent = `New game starts in ${secondsLeft}...`;
        
        if (secondsLeft <= 0) {
            clearInterval(autoRestartTimer);
            playAgain();
        }
    }, 1000);
}

function showGame(code) {
    const loading = document.getElementById('loadingOverlay');
    const loginScreen = document.getElementById('loginScreen');
    const gameScreen = document.getElementById('gameScreen');
    const roomCodeDisplay = document.getElementById('roomCodeDisplay');
    
    if (loading) loading.classList.remove('show');
    if (loginScreen) loginScreen.style.display = 'none';
    if (gameScreen) gameScreen.style.display = 'flex';
    if (roomCodeDisplay) roomCodeDisplay.textContent = code;
    
    playSound('enter');
    sendChat('system', `${gameState.playerName} joined!`);
}

function playAgain() {
    if (autoRestartTimer) clearInterval(autoRestartTimer);
    
    gameState.gameStarted = false;
    gameState.hasGuessedWord = false;
    
    const playerIds = Object.keys(gameState.players);
    
    gameRef.update({
        state: 'choosing',
        round: 1,
        playerList: playerIds,
        currentDrawerIndex: 0,
        drawer: playerIds[0] || gameState.playerId,
        word: null,
        allGuessed: false
    });
    
    Object.keys(gameState.players).forEach(pid => {
        playersRef.child(pid).update({ score: 0, hasGuessed: false });
    });
    
    const modal = document.getElementById('gameOverModal');
    if (modal) modal.classList.remove('show');
}

function exitGame() {
    if (playersRef) playersRef.off();
    if (chatRef) chatRef.off();
    if (gameRef) gameRef.off();
    if (drawingRef) drawingRef.off();
    if (roomRef) roomRef.off();
    
    if (roomRef && gameState.playerId) {
        playersRef.child(gameState.playerId).remove();
        sendChat('system', `${gameState.playerName} left.`);
    }
    
    location.reload();
}

function showToast(msg, type) {
    const container = document.getElementById('toastContainer');
    if (!container) {
        alert(msg);
        return;
    }
    
    const toast = document.createElement('div');
    toast.className = 'toast ' + (type || '');
    toast.textContent = msg;
    container.appendChild(toast);
    
    setTimeout(() => toast.remove(), 3000);
}

window.onbeforeunload = () => {
    if (gameState.isGameActive) return 'Leave game?';
};

console.log('🎮 Game engine v16.0 - ALL 5 ISSUES FIXED!');
