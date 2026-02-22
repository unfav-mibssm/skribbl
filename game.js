// ==========================================
// GAME ENGINE - ALL BUGS FIXED
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
let remoteStroke = null;
let timerInterval = null;
let autoRestartTimer = null;
let wordSelectTimer = null;
let canvasInitialized = false;

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
    initColorPicker();
    initSizePicker();
    initToolbar();
    initSounds();
    
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
    }
    
    const popupOverlay = document.getElementById('popupOverlay');
    if (popupOverlay) {
        popupOverlay.addEventListener('click', closePopups);
    }
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
// CANVAS - FIXED: Proper sizing and resize handling
// ==========================================

function initCanvas() {
    canvas = document.getElementById('gameCanvas');
    if (!canvas) {
        console.error('CANVAS NOT FOUND!');
        return;
    }
    
    // Get wrapper size
    const wrapper = document.querySelector('.canvas-wrapper');
    let width = 800;
    let height = 600;
    
    if (wrapper) {
        const rect = wrapper.getBoundingClientRect();
        width = Math.floor(rect.width);
        height = Math.floor(rect.height);
    }
    
    // Only set size if not already set or if different
    if (canvas.width !== width || canvas.height !== height || !canvasInitialized) {
        canvas.width = width;
        canvas.height = height;
        canvasInitialized = true;
    }
    
    // Set display size to match internal resolution exactly
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    canvas.style.backgroundColor = '#ffffff';
    canvas.style.display = 'block';
    canvas.style.cursor = 'crosshair';
    canvas.style.touchAction = 'none';
    
    ctx = canvas.getContext('2d', { alpha: false }); // Optimize for no transparency
    
    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Remove old listeners
    canvas.removeEventListener('mousedown', handleMouseDown);
    canvas.removeEventListener('mousemove', handleMouseMove);
    canvas.removeEventListener('mouseup', handleMouseUp);
    canvas.removeEventListener('mouseleave', handleMouseUp);
    canvas.removeEventListener('touchstart', handleTouchStart);
    canvas.removeEventListener('touchmove', handleTouchMove);
    canvas.removeEventListener('touchend', handleMouseUp);
    
    // Add event listeners
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseUp);
    
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleMouseUp);
    
    console.log('Canvas initialized:', canvas.width, 'x', canvas.height);
}

// FIXED: Better resize handling that preserves content
function handleCanvasResize() {
    if (!canvas || !ctx) return;
    
    const wrapper = document.querySelector('.canvas-wrapper');
    if (!wrapper) return;
    
    const rect = wrapper.getBoundingClientRect();
    const newWidth = Math.floor(rect.width);
    const newHeight = Math.floor(rect.height);
    
    // Only resize if dimensions actually changed significantly
    if (Math.abs(canvas.width - newWidth) > 5 || Math.abs(canvas.height - newHeight) > 5) {
        // Save current content
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(canvas, 0, 0);
        
        // Resize canvas
        canvas.width = newWidth;
        canvas.height = newHeight;
        canvas.style.width = newWidth + 'px';
        canvas.style.height = newHeight + 'px';
        
        // Restore content scaled to new size
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
        
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        console.log('Canvas resized to:', canvas.width, 'x', canvas.height);
    }
}

// Use ResizeObserver for better resize detection
let resizeObserver;
function setupResizeObserver() {
    const wrapper = document.querySelector('.canvas-wrapper');
    if (wrapper && !resizeObserver) {
        resizeObserver = new ResizeObserver((entries) => {
            // Debounce resize
            clearTimeout(window.resizeTimeout);
            window.resizeTimeout = setTimeout(handleCanvasResize, 100);
        });
        resizeObserver.observe(wrapper);
    }
}

// ==========================================
// DRAWING - FIXED: Accurate coordinates and flood fill
// ==========================================

function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    
    let clientX, clientY;
    
    if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }
    
    // Calculate scale factors
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = Math.round((clientX - rect.left) * scaleX);
    const y = Math.round((clientY - rect.top) * scaleY);
    
    return {
        x: Math.max(0, Math.min(canvas.width - 1, x)),
        y: Math.max(0, Math.min(canvas.height - 1, y))
    };
}

let lastX = 0;
let lastY = 0;
let currentStroke = null;

function canDraw() {
    return gameState.isDrawer && gameState.currentState === 'drawing';
}

function handleMouseDown(e) {
    if (!canDraw()) {
        console.log('Cannot draw - isDrawer:', gameState.isDrawer, 'state:', gameState.currentState);
        return;
    }
    
    e.preventDefault();
    e.stopPropagation();
    
    const pos = getPos(e);
    lastX = pos.x;
    lastY = pos.y;
    isDrawing = true;
    
    // FIXED: Real flood fill bucket tool
    if (currentTool === 'bucket') {
        floodFill(lastX, lastY, currentColor);
        
        // Save to history
        drawingHistory.push({
            type: 'fill',
            x: lastX,
            y: lastY,
            color: currentColor
        });
        
        sendDrawData('fill', { x: lastX, y: lastY, color: currentColor });
        isDrawing = false;
        return;
    }
    
    // Set drawing properties
    ctx.lineWidth = currentSize;
    ctx.strokeStyle = (currentTool === 'eraser') ? '#ffffff' : currentColor;
    
    // Draw single dot
    ctx.beginPath();
    ctx.arc(lastX, lastY, currentSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
    
    // Start recording stroke
    currentStroke = {
        type: 'stroke',
        color: ctx.strokeStyle,
        size: currentSize,
        points: [{x: lastX, y: lastY}]
    };
    
    sendDrawData('start', { 
        x: lastX, 
        y: lastY, 
        color: ctx.strokeStyle, 
        size: currentSize
    });
}

function handleMouseMove(e) {
    if (!isDrawing || !canDraw()) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const pos = getPos(e);
    const x = pos.x;
    const y = pos.y;
    
    // Skip if too close to last point
    const dist = Math.hypot(x - lastX, y - lastY);
    if (dist < 2) return;
    
    // Draw line
    ctx.lineWidth = currentSize;
    ctx.strokeStyle = (currentTool === 'eraser') ? '#ffffff' : currentColor;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
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
    
    if (currentStroke && currentStroke.points.length > 0) {
        drawingHistory.push(currentStroke);
        if (drawingHistory.length > 50) {
            drawingHistory.shift();
        }
    }
    currentStroke = null;
    
    sendDrawData('end');
}

function handleTouchStart(e) {
    e.preventDefault();
    if (e.touches.length > 0) {
        handleMouseDown(e);
    }
}

function handleTouchMove(e) {
    e.preventDefault();
    if (e.touches.length > 0) {
        handleMouseMove(e);
    }
}

// ==========================================
// FLOOD FILL ALGORITHM - FIXED: Real bucket fill
// ==========================================

function floodFill(startX, startY, fillColor) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const width = canvas.width;
    const height = canvas.height;
    
    // Get target color at click position
    const targetColor = getPixelColor(data, startX, startY, width);
    const fillRgb = hexToRgb(fillColor);
    
    // Don't fill if same color
    if (colorsMatch(targetColor, fillRgb)) return;
    
    // Stack-based flood fill (non-recursive)
    const stack = [[startX, startY]];
    const visited = new Set();
    const key = (x, y) => `${x},${y}`;
    
    while (stack.length > 0) {
        const [x, y] = stack.pop();
        const k = key(x, y);
        
        if (visited.has(k)) continue;
        visited.add(k);
        
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        
        const currentColor = getPixelColor(data, x, y, width);
        if (!colorsMatch(currentColor, targetColor)) continue;
        
        // Set pixel color
        setPixelColor(data, x, y, width, fillRgb);
        
        // Add neighbors
        stack.push([x + 1, y]);
        stack.push([x - 1, y]);
        stack.push([x, y + 1]);
        stack.push([x, y - 1]);
    }
    
    ctx.putImageData(imageData, 0, 0);
}

function getPixelColor(data, x, y, width) {
    const index = (y * width + x) * 4;
    return {
        r: data[index],
        g: data[index + 1],
        b: data[index + 2],
        a: data[index + 3]
    };
}

function setPixelColor(data, x, y, width, color) {
    const index = (y * width + x) * 4;
    data[index] = color.r;
    data[index + 1] = color.g;
    data[index + 2] = color.b;
    data[index + 3] = 255;
}

function colorsMatch(c1, c2, tolerance = 32) {
    return Math.abs(c1.r - c2.r) <= tolerance &&
           Math.abs(c1.g - c2.g) <= tolerance &&
           Math.abs(c1.b - c2.b) <= tolerance;
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
}

// ==========================================
// UNDO & REDRAW
// ==========================================

function undo() {
    if (!canDraw() || drawingHistory.length === 0) return;
    
    drawingHistory.pop();
    redraw();
    sendDrawData('undo');
}

function redraw() {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    drawingHistory.forEach(stroke => {
        if (stroke.type === 'stroke') {
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = stroke.size;
            ctx.strokeStyle = stroke.color;
            ctx.beginPath();
            
            if (stroke.points.length > 0) {
                ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
                for (let i = 1; i < stroke.points.length; i++) {
                    ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
                }
            }
            ctx.stroke();
        } else if (stroke.type === 'fill') {
            floodFill(stroke.x, stroke.y, stroke.color);
        }
    });
}

// FIXED: Clear canvas and history
function clearCanvas() {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawingHistory = [];
}

// FIXED: Clear everything including Firebase
function clearCanvasAndNotify() {
    clearCanvas();
    if (roomRef) {
        drawingRef.push({
            type: 'clear',
            player: gameState.playerId,
            time: firebase.database.ServerValue.TIMESTAMP
        });
    }
}

// ==========================================
// TOOLBAR
// ==========================================

function initColorPicker() {
    const grid = document.getElementById('colorGrid');
    const preview = document.getElementById('colorPreview');
    if (!grid) return;
    
    grid.innerHTML = '';
    
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
    
    container.innerHTML = '';
    
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
    
    if (bucketBtn) bucketBtn.onclick = () => { 
        currentTool = 'bucket'; 
        updateTools(); 
    };
    
    if (undoBtn) undoBtn.onclick = undo;
    
    if (clearBtn) clearBtn.onclick = clearCanvasAndNotify;
    
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
// FIREBASE SYNC
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
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = data.size || 4;
            ctx.strokeStyle = data.color || '#000';
            ctx.beginPath();
            ctx.moveTo(data.x, data.y);
        } else if (data.type === 'draw') {
            ctx.lineTo(data.x, data.y);
            ctx.stroke();
        } else if (data.type === 'fill') {
            floodFill(data.x, data.y, data.color);
        } else if (data.type === 'clear') {
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
    
    const name = (nameInput && nameInput.value.trim()) || 'Player' + Math.floor(Math.random() * 1000);
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
    const prevRound = gameState.round;
    
    gameState.currentState = game.state;
    gameState.lastState = game.state;
    gameState.game = game;
    gameState.round = game.round || 1;
    gameState.isDrawer = (game.drawer === gameState.playerId);
    gameState.currentWord = game.word;
    gameState.isGameActive = (game.state === 'drawing');
    
    // FIXED: Clear canvas when round changes or new drawer starts
    if (game.state === 'drawing' && prevState === 'choosing') {
        clearCanvas();
        // Clear drawing history for new round
        drawingHistory = [];
        // Reset guessed state
        gameState.hasGuessedWord = false;
    }
    
    // Update UI
    const roundInfo = document.getElementById('roundInfo');
    const timerDisplay = document.getElementById('timerDisplay');
    const wordDisplay = document.getElementById('wordDisplay');
    
    if (roundInfo) roundInfo.textContent = `Round ${gameState.round} of ${game.maxRounds || 10}`;
    if (timerDisplay) timerDisplay.textContent = game.timer || 80;
    
    if (wordDisplay) {
        if (!game.word) {
            wordDisplay.textContent = 'Waiting...';
            wordDisplay.classList.remove('revealed');
        } else if (gameState.isDrawer || gameState.hasGuessedWord) {
            wordDisplay.textContent = game.word.toUpperCase().split('').join(' ');
            wordDisplay.classList.add('revealed');
        } else {
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
    
    // Clear canvas when selecting word
    clearCanvas();
    drawingHistory = [];
    
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
            
            // FIXED: Better end round check
            const allPlayers = Object.keys(gameState.players);
            const guessers = allPlayers.filter(id => id !== game.drawer);
            const allCorrect = guessers.length > 0 && guessers.every(id => {
                const player = gameState.players[id];
                return player && player.hasGuessed;
            });
            
            if (remaining <= 0 || (game.allGuessed && allCorrect)) {
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
        
        // Reset hasGuessed for all players
        const updates = {};
        playerList.forEach(pid => {
            if (gameState.players[pid]) {
                updates['players/' + pid + '/hasGuessed'] = false;
            }
        });
        updates['state'] = 'round_end';
        
        gameRef.update(updates);
        
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
    
    const wordDisplay = document.getElementById('wordDisplay');
    if (wordDisplay && gameState.currentWord) {
        wordDisplay.textContent = gameState.currentWord.toUpperCase().split('').join(' ');
        wordDisplay.classList.add('revealed');
    }
    
    // FIXED: Check all guessed immediately
    checkAllGuessed();
}

function checkAllGuessed() {
    const allPlayers = Object.keys(gameState.players);
    if (allPlayers.length < 2) return;
    
    const guessers = allPlayers.filter(id => id !== gameState.game.drawer);
    if (guessers.length === 0) return;
    
    const allCorrect = guessers.every(id => {
        const player = gameState.players[id];
        return player && player.hasGuessed;
    });
    
    if (allCorrect && !gameState.allGuessed) {
        // Award drawer bonus
        const drawer = gameState.players[gameState.game.drawer];
        if (drawer) {
            playersRef.child(gameState.game.drawer).update({
                score: (drawer.score || 0) + 25
            });
        }
        
        gameRef.update({ allGuessed: true });
        
        // End round sooner if everyone guessed
        clearInterval(timerInterval);
        timerInterval = null;
        setTimeout(endRound, 1500);
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
    
    // FIXED: Initialize canvas and setup resize observer
    setTimeout(() => {
        initCanvas();
        setupResizeObserver();
    }, 100);
    
    playSound('enter');
    sendChat('system', `${gameState.playerName} joined!`);
}

function playAgain() {
    if (autoRestartTimer) clearInterval(autoRestartTimer);
    
    gameState.gameStarted = false;
    gameState.hasGuessedWord = false;
    
    const playerIds = Object.keys(gameState.players);
    
    // Reset all players
    const updates = {};
    playerIds.forEach(pid => {
        updates['players/' + pid + '/score'] = 0;
        updates['players/' + pid + '/hasGuessed'] = false;
    });
    updates['state'] = 'choosing';
    updates['round'] = 1;
    updates['playerList'] = playerIds;
    updates['currentDrawerIndex'] = 0;
    updates['drawer'] = playerIds[0] || gameState.playerId;
    updates['word'] = null;
    updates['allGuessed'] = false;
    
    gameRef.update(updates);
    
    const modal = document.getElementById('gameOverModal');
    if (modal) modal.classList.remove('show');
}

function exitGame() {
    if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
    }
    
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

console.log('🎮 Game engine v20.0 - ALL BUGS FIXED!');
