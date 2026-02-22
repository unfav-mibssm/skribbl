// ==========================================
// GAME ENGINE - DRAWER CAN DRAW FIX
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
    hasGuessedWord: false
};

let canvas, ctx;
let isDrawing = false;
let currentTool = 'brush';
let currentColor = '#000000';
let currentSize = 4;
let drawingHistory = [];
let lastDrawTime = 0;
let remoteStroke = null;
let timerInterval = null;
let autoRestartTimer = null;
let wordSelectTimer = null;

let pendingDrawBuffer = [];

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
    initPullToRefresh();
    
    document.getElementById('chatInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    
    document.getElementById('popupOverlay').addEventListener('click', closePopups);
    
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', () => {
            document.body.style.height = '100dvh';
        });
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
        sound.play().catch(e => console.log('Sound play failed:', e));
    }
}

function initPullToRefresh() {
    let startY = 0;
    let isPulling = false;
    
    document.addEventListener('touchstart', (e) => {
        if (window.scrollY === 0) {
            startY = e.touches[0].clientY;
            isPulling = true;
        }
    }, { passive: true });
    
    document.addEventListener('touchmove', (e) => {
        if (!isPulling) return;
        
        const currentY = e.touches[0].clientY;
        const diff = currentY - startY;
        
        if (diff > 80 && window.scrollY === 0) {
            document.getElementById('pullToRefresh').classList.add('show');
        }
    }, { passive: true });
    
    document.addEventListener('touchend', (e) => {
        if (!isPulling) return;
        
        const currentY = e.changedTouches[0].clientY;
        const diff = currentY - startY;
        
        if (diff > 150 && window.scrollY === 0) {
            location.reload();
        }
        
        document.getElementById('pullToRefresh').classList.remove('show');
        isPulling = false;
    });
}

// ==========================================
// CANVAS
// ==========================================

function initCanvas() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    const wrapper = document.querySelector('.canvas-wrapper');
    if (wrapper) {
        const rect = wrapper.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
    }
    
    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', endDraw);
    canvas.addEventListener('mouseleave', endDraw);
    
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', endDraw, { passive: false });
    
    clearCanvas();
}

function clearCanvas() {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawingHistory = [];
    pendingDrawBuffer = [];
}

// ==========================================
// TOOLBAR & COLOR PICKER
// ==========================================

function initColorPicker() {
    const grid = document.getElementById('colorGrid');
    const preview = document.getElementById('colorPreview');
    
    colors.forEach((color, i) => {
        const div = document.createElement('div');
        div.className = 'color-option' + (i === 0 ? ' selected' : '');
        div.style.background = color;
        div.onclick = () => {
            document.querySelectorAll('.color-option').forEach(c => c.classList.remove('selected'));
            div.classList.add('selected');
            currentColor = color;
            currentTool = 'brush';
            preview.style.background = color;
            updateTools();
            closePopups();
        };
        grid.appendChild(div);
    });
    
    preview.style.background = currentColor;
}

function initSizePicker() {
    const container = document.getElementById('sizeOptions');
    
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
    document.getElementById('colorBtn').onclick = () => togglePopup('colorPopup');
    document.getElementById('sizeBtn').onclick = () => togglePopup('sizePopup');
    document.getElementById('brushBtn').onclick = () => { currentTool = 'brush'; updateTools(); };
    document.getElementById('eraserBtn').onclick = () => { currentTool = 'eraser'; updateTools(); };
    document.getElementById('bucketBtn').onclick = () => { currentTool = 'bucket'; updateTools(); };
    document.getElementById('undoBtn').onclick = undo;
    document.getElementById('clearBtn').onclick = () => {
        clearCanvas();
        sendDrawData('clear');
    };
}

function updateTools() {
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    if (currentTool === 'brush') document.getElementById('brushBtn').classList.add('active');
    else if (currentTool === 'eraser') document.getElementById('eraserBtn').classList.add('active');
    else if (currentTool === 'bucket') document.getElementById('bucketBtn').classList.add('active');
}

function togglePopup(id) {
    const popup = document.getElementById(id);
    const overlay = document.getElementById('popupOverlay');
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
    document.getElementById('popupOverlay').classList.remove('show');
}

// ==========================================
// DRAWING FUNCTIONS - FIXED: Check game.state directly
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
    
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
    };
}

let lastPoint = null;
let currentStroke = null;

// CRITICAL FIX: Check game.state directly instead of isGameActive flag
function canDraw() {
    return gameState.isDrawer && gameState.game && gameState.game.state === 'drawing';
}

function startDraw(e) {
    // CRITICAL FIX: Use canDraw() instead of isGameActive
    if (!canDraw()) {
        console.log('Cannot draw:', { isDrawer: gameState.isDrawer, state: gameState.game?.state });
        return;
    }
    e.preventDefault();
    
    const pos = getPos(e);
    
    if (pos.x < 0 || pos.x > canvas.width || pos.y < 0 || pos.y > canvas.height) return;
    
    if (currentTool === 'bucket') {
        floodFill(Math.floor(pos.x), Math.floor(pos.y), currentColor);
        sendDrawData('fill', { x: Math.floor(pos.x), y: Math.floor(pos.y), color: currentColor });
        return;
    }
    
    isDrawing = true;
    lastPoint = pos;
    
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = currentSize;
    ctx.strokeStyle = currentTool === 'eraser' ? '#ffffff' : currentColor;
    
    currentStroke = {
        id: Date.now() + Math.random(),
        color: ctx.strokeStyle,
        size: currentSize,
        points: [{ x: pos.x, y: pos.y, t: Date.now() }],
        startTime: Date.now()
    };
    
    // Draw the first point immediately
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    
    sendDrawData('start', { 
        x: pos.x, 
        y: pos.y, 
        color: currentStroke.color, 
        size: currentStroke.size,
        strokeId: currentStroke.id,
        timestamp: Date.now()
    });
    
    console.log('✏️ Started drawing at:', pos.x, pos.y);
}

function draw(e) {
    if (!isDrawing || !canDraw()) return;
    e.preventDefault();
    
    const pos = getPos(e);
    
    if (pos.x < 0 || pos.x > canvas.width || pos.y < 0 || pos.y > canvas.height) {
        lastPoint = pos;
        return;
    }
    
    if (lastPoint) {
        ctx.beginPath();
        ctx.moveTo(lastPoint.x, lastPoint.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        
        if (currentStroke) {
            currentStroke.points.push({ x: pos.x, y: pos.y, t: Date.now() });
        }
        
        sendDrawData('draw', { 
            x: pos.x, 
            y: pos.y, 
            lx: lastPoint.x, 
            ly: lastPoint.y,
            strokeId: currentStroke?.id,
            timestamp: Date.now()
        });
    }
    
    lastPoint = pos;
}

function endDraw(e) {
    if (!isDrawing) return;
    isDrawing = false;
    
    if (currentStroke) {
        drawingHistory.push(currentStroke);
        sendDrawData('end', { strokeId: currentStroke.id });
        console.log('✏️ Ended drawing, points:', currentStroke.points.length);
        currentStroke = null;
    }
    
    lastPoint = null;
    ctx.beginPath();
}

function handleTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousedown', {
        clientX: touch.clientX,
        clientY: touch.clientY,
        bubbles: true
    });
    canvas.dispatchEvent(mouseEvent);
}

function handleTouchMove(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousemove', {
        clientX: touch.clientX,
        clientY: touch.clientY,
        bubbles: true
    });
    canvas.dispatchEvent(mouseEvent);
}

function floodFill(startX, startY, fillColor) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const width = canvas.width;
    const height = canvas.height;
    
    const startPos = (startY * width + startX) * 4;
    const targetR = data[startPos];
    const targetG = data[startPos + 1];
    const targetB = data[startPos + 2];
    const targetA = data[startPos + 3];
    
    const fill = hexToRgb(fillColor);
    if (!fill) return;
    if (targetR === fill.r && targetG === fill.g && targetB === fill.b) return;
    
    const stack = [[startX, startY]];
    const visited = new Set();
    const key = (x, y) => `${x},${y}`;
    const tolerance = 32;
    
    while (stack.length > 0) {
        const [x, y] = stack.pop();
        const k = key(x, y);
        
        if (visited.has(k)) continue;
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        
        const pos = (y * width + x) * 4;
        const r = data[pos], g = data[pos + 1], b = data[pos + 2], a = data[pos + 3];
        
        if (Math.abs(r - targetR) > tolerance || 
            Math.abs(g - targetG) > tolerance || 
            Math.abs(b - targetB) > tolerance) continue;
        
        visited.add(k);
        
        data[pos] = fill.r;
        data[pos + 1] = fill.g;
        data[pos + 2] = fill.b;
        data[pos + 3] = 255;
        
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    
    ctx.putImageData(imageData, 0, 0);
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

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
        if (!stroke.points || stroke.points.length < 2) return;
        
        ctx.beginPath();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = stroke.size;
        ctx.strokeStyle = stroke.color;
        
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        
        for (let i = 1; i < stroke.points.length; i++) {
            ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        
        ctx.stroke();
    });
}

// ==========================================
// FIREBASE SYNC
// ==========================================

function sendDrawData(type, data) {
    if (!roomRef || !gameState.isDrawer) return;
    
    const payload = {
        type: type,
        player: gameState.playerId,
        time: firebase.database.ServerValue.TIMESTAMP,
        localTime: Date.now()
    };
    
    if (data) Object.assign(payload, data);
    
    drawingRef.push(payload);
}

function listenDrawing() {
    drawingRef.on('child_added', (snap) => {
        const data = snap.val();
        if (!data || data.player === gameState.playerId) return;
        handleRemoteDraw(data);
    });
}

let processedStrokes = new Set();

function handleRemoteDraw(data) {
    const strokeKey = `${data.strokeId || ''}_${data.type}_${data.localTime || data.time}`;
    if (processedStrokes.has(strokeKey)) return;
    processedStrokes.add(strokeKey);
    
    if (processedStrokes.size > 1000) {
        processedStrokes = new Set(Array.from(processedStrokes).slice(-500));
    }
    
    switch(data.type) {
        case 'start':
            remoteStroke = {
                color: data.color,
                size: data.size,
                lastX: data.x,
                lastY: data.y,
                strokeId: data.strokeId
            };
            ctx.beginPath();
            ctx.moveTo(data.x, data.y);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = data.size;
            ctx.strokeStyle = data.color;
            ctx.lineTo(data.x, data.y);
            ctx.stroke();
            break;
            
        case 'draw':
            if (!remoteStroke) {
                remoteStroke = {
                    lastX: data.lx,
                    lastY: data.ly,
                    color: '#000000',
                    size: 4
                };
                ctx.beginPath();
                ctx.moveTo(data.lx, data.ly);
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.lineWidth = 4;
                ctx.strokeStyle = '#000000';
            }
            
            ctx.beginPath();
            ctx.moveTo(remoteStroke.lastX, remoteStroke.lastY);
            ctx.lineTo(data.x, data.y);
            ctx.stroke();
            
            remoteStroke.lastX = data.x;
            remoteStroke.lastY = data.y;
            break;
            
        case 'end':
            remoteStroke = null;
            ctx.beginPath();
            break;
            
        case 'fill':
            floodFill(data.x, data.y, data.color);
            break;
            
        case 'clear':
            clearCanvas();
            break;
    }
}

// ==========================================
// GAME LOGIC
// ==========================================

function joinGame() {
    const name = document.getElementById('playerName').value.trim() || 'Player' + Math.floor(Math.random() * 1000);
    const code = document.getElementById('roomCode').value.trim().toUpperCase();
    
    gameState.playerName = name;
    gameState.joinTime = Date.now();
    document.getElementById('loadingOverlay').classList.add('show');
    
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
        showToast('Error creating room: ' + err.message, 'error');
        document.getElementById('loadingOverlay').classList.remove('show');
    });
}

function joinRoom(code) {
    gameState.roomCode = code;
    gameState.playerId = 'p_' + Date.now();
    
    roomRef = database.ref('rooms/' + code);
    
    roomRef.once('value', (snap) => {
        if (!snap.exists()) {
            showToast('Room not found!', 'error');
            document.getElementById('loadingOverlay').classList.remove('show');
            return;
        }
        
        const roomData = snap.val();
        
        playersRef = roomRef.child('players');
        chatRef = roomRef.child('chat');
        drawingRef = roomRef.child('drawing');
        gameRef = roomRef.child('game');
        
        addPlayer(roomData);
    }, (err) => {
        showToast('Connection error: ' + err.message, 'error');
        document.getElementById('loadingOverlay').classList.remove('show');
    });
}

function addPlayer(existingRoomData = null) {
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
        showToast('Error joining: ' + err.message, 'error');
        document.getElementById('loadingOverlay').classList.remove('show');
    });
}

function setupListeners() {
    playersRef.on('value', (snap) => {
        const previousPlayers = { ...gameState.players };
        gameState.players = snap.val() || {};
        
        updatePlayerList();
        
        const prevIds = Object.keys(previousPlayers);
        const currentIds = Object.keys(gameState.players);
        
        if (prevIds.length > 0 && currentIds.length > prevIds.length) {
            const joinedId = currentIds.find(id => !prevIds.includes(id));
            if (joinedId && joinedId !== gameState.playerId) {
                playSound('join');
            }
        }
        
        if (prevIds.length > 0 && currentIds.length < prevIds.length) {
            const leftId = prevIds.find(id => !currentIds.includes(id));
            if (leftId && previousPlayers[leftId]) {
                const leftName = previousPlayers[leftId].name;
                gameState.leftPlayerName = leftName;
                
                sendChat('system', `${leftName} left the game`);
                playSound('leave');
                
                gameRef.once('value', (gameSnap) => {
                    const game = gameSnap.val();
                    if (game && game.playerList) {
                        const newList = game.playerList.filter(id => id !== leftId);
                        gameRef.update({ playerList: newList });
                    }
                    
                    if (game && game.drawer === leftId) {
                        handleDrawerLeft();
                    }
                });
            }
        }
        
        gameState.lastPlayerCount = currentIds.length;
        
        const playerIds = Object.keys(gameState.players);
        const isFirstPlayer = playerIds.length > 0 && playerIds[0] === gameState.playerId;
        
        if (isFirstPlayer && playerIds.length >= 2 && !gameState.gameStarted) {
            checkStartGame();
        }
    });
    
    chatRef.limitToLast(100).on('child_added', (snap) => {
        const msg = snap.val();
        if (msg.time >= gameState.joinTime && shouldShowMessage(msg)) {
            displayMessage(msg);
            
            if (msg.type === 'correct' && msg.player !== gameState.playerId) {
                playSound('correct');
            }
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

function handleDrawerLeft() {
    gameRef.once('value', (snap) => {
        const game = snap.val();
        if (!game) return;
        
        const playerList = game.playerList || Object.keys(gameState.players);
        let nextIndex = (game.currentDrawerIndex + 1) % playerList.length;
        
        while (nextIndex < playerList.length && !gameState.players[playerList[nextIndex]]) {
            nextIndex = (nextIndex + 1) % playerList.length;
        }
        
        const nextDrawer = playerList[nextIndex];
        
        gameRef.update({
            state: 'choosing',
            drawer: nextDrawer,
            currentDrawerIndex: nextIndex,
            word: null,
            allGuessed: false
        });
    });
}

function checkStartGame() {
    if (gameState.gameStarted) return;
    
    const playerIds = Object.keys(gameState.players);
    
    if (playerIds.length >= 2) {
        gameState.playerList = playerIds;
        
        const firstPlayer = playerIds[0];
        
        console.log('🎮 Starting game! First drawer:', firstPlayer);
        
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
            console.log('✅ Game started successfully');
        }).catch(err => {
            console.error('❌ Failed to start game:', err);
        });
    }
}

function shouldShowMessage(msg) {
    if (msg.player === gameState.playerId) return true;
    if (msg.type === 'system') return true;
    if (msg.type === 'correct') return true;
    
    const me = gameState.players[gameState.playerId];
    const sender = gameState.players[msg.player];
    
    if (me && me.hasGuessed) {
        if (msg.type === 'correct') return true;
        if (sender && (sender.hasGuessed || gameState.game?.drawer === msg.player)) return true;
        return false;
    }
    
    if (!me || !me.hasGuessed) {
        if (msg.type === 'guess') return true;
        if (msg.isClose) return true;
    }
    
    return true;
}

// ==========================================
// CRITICAL FIX: handleGameChange - Fixed isGameActive logic
// ==========================================
function handleGameChange(game) {
    if (game.round < gameState.round && gameState.round > 1) {
        console.warn('Invalid round transition prevented:', gameState.round, '->', game.round);
        return;
    }
    
    const previousState = gameState.lastState;
    const previousDrawer = gameState.lastDrawer;
    const previousRound = gameState.lastRound;
    
    gameState.game = game;
    gameState.round = game.round || 1;
    gameState.maxRounds = game.maxRounds || 10;
    gameState.allGuessed = game.allGuessed || false;
    gameState.playerList = game.playerList || Object.keys(gameState.players);
    gameState.currentDrawerIndex = game.currentDrawerIndex || 0;
    
    gameState.lastState = game.state;
    gameState.lastDrawer = game.drawer;
    gameState.lastRound = game.round;
    
    document.getElementById('roundInfo').textContent = `Round ${gameState.round} of ${gameState.maxRounds}`;
    document.getElementById('timerDisplay').textContent = game.timer || 80;
    
    const wasDrawer = gameState.isDrawer;
    gameState.isDrawer = game.drawer === gameState.playerId;
    gameState.currentWord = game.word;
    
    // CRITICAL FIX: Set isGameActive based on state
    gameState.isGameActive = (game.state === 'drawing');
    
    updateWordDisplay(game.word, gameState.hasGuessedWord);
    
    const waitingOverlay = document.getElementById('waitingOverlay');
    const roundOverlay = document.getElementById('roundOverlay');
    const wordModal = document.getElementById('wordModal');
    
    const stateChanged = game.state !== previousState;
    const drawerChanged = game.drawer !== previousDrawer;
    const roundChanged = game.round !== previousRound;
    
    if (!stateChanged && !drawerChanged && !roundChanged && wasDrawer === gameState.isDrawer) {
        return;
    }
    
    if (roundChanged) {
        gameState.hasGuessedWord = false;
    }
    
    console.log('🔄 Game state:', game.state, '| Drawer:', game.drawer, '| Me:', gameState.playerId, '| isDrawer:', gameState.isDrawer, '| isGameActive:', gameState.isGameActive);
    
    switch(game.state) {
        case 'waiting':
            waitingOverlay.classList.remove('show');
            roundOverlay.classList.remove('show');
            break;
            
        case 'choosing':
            if (gameState.isDrawer) {
                waitingOverlay.classList.remove('show');
                if (!wordModal.classList.contains('show')) {
                    if (wordSelectTimer) clearInterval(wordSelectTimer);
                    setTimeout(() => showWordSelect(), 100);
                }
            } else {
                waitingOverlay.classList.add('show');
                wordModal.classList.remove('show');
            }
            roundOverlay.classList.remove('show');
            break;
            
        case 'drawing':
            waitingOverlay.classList.remove('show');
            roundOverlay.classList.remove('show');
            wordModal.classList.remove('show');
            
            if (previousState === 'choosing' || previousState === 'round_end' || game.timer === 80) {
                if (!gameState.isDrawer) {
                    playersRef.child(gameState.playerId).update({ hasGuessed: false });
                    gameState.hasGuessedWord = false;
                }
                if (gameState.isDrawer) {
                    clearCanvas();
                }
            }
            
            if (gameState.isDrawer && !timerInterval) {
                startTimer();
            }
            break;
            
        case 'round_end':
            waitingOverlay.classList.remove('show');
            showRoundEnd(game.word);
            break;
            
        case 'game_over':
            waitingOverlay.classList.remove('show');
            roundOverlay.classList.remove('show');
            showGameOver();
            break;
    }
    
    if (gameState.isDrawer !== wasDrawer) {
        if (gameState.isDrawer) {
            becomeDrawer();
        } else {
            stopDrawer();
        }
    }
}

function updateWordDisplay(word, hasGuessed) {
    const wordDisplay = document.getElementById('wordDisplay');
    
    if (!word) {
        wordDisplay.textContent = 'Waiting...';
        return;
    }
    
    if (gameState.isDrawer || hasGuessed) {
        wordDisplay.textContent = word.toUpperCase();
        wordDisplay.style.color = 'var(--success)';
    } else {
        const display = word.split('').map(c => c === ' ' ? ' ' : '_').join(' ');
        wordDisplay.textContent = display;
        wordDisplay.style.color = 'var(--accent)';
    }
}

function becomeDrawer() {
    gameState.isDrawer = true;
    document.getElementById('drawerBadge').classList.add('show');
    document.getElementById('toolbarContainer').classList.add('show');
    
    if (gameState.game?.state === 'choosing') {
        setTimeout(() => showWordSelect(), 200);
    }
}

function stopDrawer() {
    gameState.isDrawer = false;
    document.getElementById('drawerBadge').classList.remove('show');
    document.getElementById('toolbarContainer').classList.remove('show');
    document.getElementById('wordModal').classList.remove('show');
}

function showWordSelect() {
    const modal = document.getElementById('wordModal');
    if (modal.classList.contains('show')) return;
    
    const options = WordBank.getWordOptions();
    const container = document.getElementById('wordOptions');
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
    timerEl.textContent = time;
    
    wordSelectTimer = setInterval(() => {
        time--;
        timerEl.textContent = time;
        if (time <= 0) {
            clearInterval(wordSelectTimer);
            wordSelectTimer = null;
            if (modal.classList.contains('show')) {
                selectWord(options[0].word);
            }
        }
    }, 1000);
}

function selectWord(word) {
    if (wordSelectTimer) {
        clearInterval(wordSelectTimer);
        wordSelectTimer = null;
    }
    
    document.getElementById('wordModal').classList.remove('show');
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
            
            if (game.drawer !== gameState.playerId) {
                return;
            }
            
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
        
        if (nextIndex === 0) {
            nextRound = game.round + 1;
        }
        
        if (nextRound > game.maxRounds) {
            gameRef.update({ state: 'game_over' });
            return;
        }
        
        let attempts = 0;
        while (attempts < playerList.length && !gameState.players[playerList[nextIndex]]) {
            nextIndex = (nextIndex + 1) % playerList.length;
            if (nextIndex === 0) nextRound++;
            attempts++;
        }
        
        if (nextRound > game.maxRounds) {
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
    
    if (gameState.isGameActive && text.toLowerCase() === gameState.currentWord?.toLowerCase()) {
        handleCorrectGuess();
        input.value = '';
        return;
    }
    
    const similarity = calcSimilarity(text.toLowerCase(), gameState.currentWord?.toLowerCase() || '');
    const isClose = similarity > 0.6 && similarity < 1;
    
    sendChat('guess', text, isClose);
    input.value = '';
}

function calcSimilarity(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    let matches = 0;
    const min = Math.min(a.length, b.length);
    for (let i = 0; i < min; i++) if (a[i] === b[i]) matches++;
    return matches / Math.max(a.length, b.length);
}

function handleCorrectGuess() {
    const me = gameState.players[gameState.playerId];
    if (me && me.hasGuessed) return;
    
    const points = Math.max(10, Math.floor(gameState.timer / 8) * 10);
    
    gameState.hasGuessedWord = true;
    
    playersRef.child(gameState.playerId).update({
        score: (me?.score || 0) + points,
        hasGuessed: true
    });
    
    updateWordDisplay(gameState.currentWord, true);
    
    sendChat('correct', `guessed correctly! (+${points})`);
    playSound('correct');
    checkAllGuessed();
}

function checkAllGuessed() {
    const allPlayers = Object.keys(gameState.players);
    if (allPlayers.length < 2) return;
    
    const guessers = allPlayers.filter(id => id !== gameState.game?.drawer);
    if (guessers.length === 0) return;
    
    const allCorrect = guessers.every(id => gameState.players[id]?.hasGuessed);
    
    if (allCorrect && !gameState.allGuessed) {
        const drawer = gameState.players[gameState.game?.drawer];
        if (drawer) {
            playersRef.child(gameState.game.drawer).update({
                score: (drawer.score || 0) + 25
            });
        }
        
        gameRef.update({ allGuessed: true });
        setTimeout(() => endRound(), 2000);
    }
}

function sendChat(type, text, isClose = false) {
    chatRef.push({
        type: type,
        text: text,
        player: gameState.playerId,
        name: gameState.playerName,
        time: firebase.database.ServerValue.TIMESTAMP,
        isClose: isClose
    });
}

function displayMessage(msg) {
    const container = document.getElementById('chatMessages');
    const div = document.createElement('div');
    div.className = 'chat-message';
    
    if (msg.type === 'system') {
        div.classList.add('system');
        div.textContent = msg.text;
    } else if (msg.type === 'correct') {
        div.classList.add('correct');
        div.innerHTML = `<span class="username">${msg.name}</span> ${msg.text}`;
    } else if (msg.isClose) {
        div.classList.add('close');
        div.innerHTML = `<span class="username">${msg.name}</span> ${msg.text} (close!)`;
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
    
    container.innerHTML = '';
    const players = Object.entries(gameState.players);
    count.textContent = `${players.length}/8`;
    
    players.sort((a, b) => (b[1].score || 0) - (a[1].score || 0));
    
    players.forEach(([id, p]) => {
        const div = document.createElement('div');
        div.className = 'player-item';
        
        if (id === gameState.game?.drawer) div.classList.add('current-drawer');
        if (p.hasGuessed) div.classList.add('guessed');
        
        div.innerHTML = `
            <div class="player-avatar">${p.name[0].toUpperCase()}</div>
            <div class="player-info">
                <div class="player-name">${p.name} ${id === gameState.playerId ? '(You)' : ''}</div>
            </div>
            <div class="player-score">${p.score || 0}</div>
        `;
        
        container.appendChild(div);
    });
}

function showRoundEnd(word) {
    document.getElementById('revealedWord').textContent = word || '---';
    document.getElementById('roundOverlay').classList.add('show');
    playSound('roundEnd');
    
    const scoresDiv = document.getElementById('roundScores');
    scoresDiv.innerHTML = '';
    
    const sorted = Object.entries(gameState.players)
        .sort((a, b) => (b[1].score || 0) - (a[1].score || 0))
        .slice(0, 3);
    
    sorted.forEach(([id, p], i) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee;';
        row.innerHTML = `<span>#${i + 1} ${p.name}</span><span>${p.score || 0} pts</span>`;
        scoresDiv.appendChild(row);
    });
}

function showGameOver() {
    if (autoRestartTimer) clearInterval(autoRestartTimer);
    
    const modal = document.getElementById('gameOverModal');
    const winnerDisplay = document.getElementById('winnerDisplay');
    const trophy = document.getElementById('winnerTrophy');
    const autoRestartText = document.getElementById('autoRestartText');
    
    const sorted = Object.entries(gameState.players)
        .sort((a, b) => (b[1].score || 0) - (a[1].score || 0));
    
    const winner = sorted[0];
    
    if (winner) {
        winnerDisplay.innerHTML = `
            <div class="winner-crown">👑</div>
            <div class="winner-name">${winner[1].name}</div>
            <div class="winner-score">${winner[1].score || 0} points</div>
        `;
        trophy.textContent = '🏆';
    }
    
    const container = document.getElementById('finalScores');
    container.innerHTML = '';
    
    sorted.forEach(([id, p], i) => {
        const div = document.createElement('div');
        div.className = 'final-score-item' + (i === 0 ? ' winner' : '');
        div.innerHTML = `
            <span class="final-rank">#${i + 1}</span>
            <span class="final-name">${p.name}</span>
            <span class="final-points">${p.score || 0}</span>
        `;
        container.appendChild(div);
    });
    
    modal.classList.add('show');
    
    let secondsLeft = 10;
    autoRestartText.textContent = `New game starts in ${secondsLeft}...`;
    
    autoRestartTimer = setInterval(() => {
        secondsLeft--;
        autoRestartText.textContent = `New game starts in ${secondsLeft}...`;
        
        if (secondsLeft <= 0) {
            clearInterval(autoRestartTimer);
            autoRestartTimer = null;
            playAgain();
        }
    }, 1000);
}

function showGame(code) {
    document.getElementById('loadingOverlay').classList.remove('show');
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('gameScreen').style.display = 'flex';
    document.getElementById('roomCodeDisplay').textContent = code;
    
    playSound('enter');
    
    sendChat('system', `${gameState.playerName} joined!`);
}

function playAgain() {
    if (autoRestartTimer) {
        clearInterval(autoRestartTimer);
        autoRestartTimer = null;
    }
    
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
    
    document.getElementById('gameOverModal').classList.remove('show');
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
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = msg;
    container.appendChild(toast);
    
    setTimeout(() => toast.remove(), 3000);
}

window.onbeforeunload = () => {
    if (gameState.isGameActive) return 'Leave game?';
};

console.log('🎮 Game engine v13.0 - DRAWER CAN DRAW!');
