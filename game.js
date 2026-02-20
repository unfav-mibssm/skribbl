// ==========================================
// GAME ENGINE - 10 ROUNDS FIXED
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
    joinTime: null // NEW: Track when player joined
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

let roomRef, playersRef, chatRef, drawingRef, gameRef;

// NEW: Audio elements
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
    initSounds(); // NEW: Initialize sounds
    
    document.getElementById('chatInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    
    document.getElementById('popupOverlay').addEventListener('click', closePopups);
});

// NEW: Initialize audio elements
function initSounds() {
    sounds.join = document.getElementById('soundJoin');
    sounds.correct = document.getElementById('soundCorrect');
    sounds.roundEnd = document.getElementById('soundRoundEnd');
    sounds.leave = document.getElementById('soundLeave');
    sounds.enter = document.getElementById('soundEnter');
}

// NEW: Play sound helper
function playSound(soundName) {
    const sound = sounds[soundName];
    if (sound) {
        sound.currentTime = 0;
        sound.play().catch(e => console.log('Sound play failed:', e));
    }
}

function initCanvas() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    resizeCanvas();
    window.addEventListener('resize', () => {
        resizeCanvas();
    });
    
    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', endDraw);
    canvas.addEventListener('mouseleave', endDraw);
    
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', endDraw, { passive: false });
    
    clearCanvas();
}

function resizeCanvas() {
    const section = document.querySelector('.canvas-section');
    const sectionHeight = section.clientHeight;
    const sectionWidth = section.clientWidth;
    
    // FULL WIDTH - NO PADDING CALCULATION
    let width = sectionWidth;
    let height = width * 0.75;
    
    if (height > sectionHeight) {
        height = sectionHeight;
        width = height / 0.75;
    }
    
    canvas.width = width;
    canvas.height = height;
    
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    
    canvas.style.position = 'absolute';
    canvas.style.left = '50%';
    canvas.style.top = '50%';
    canvas.style.transform = 'translate(-50%, -50%)';
}

function clearCanvas() {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawingHistory = [];
}

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
// DRAWING - SMOOTH CURVES
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

function startDraw(e) {
    if (!gameState.isDrawer || !gameState.isGameActive) return;
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
    
    const stroke = {
        color: ctx.strokeStyle,
        size: currentSize,
        points: [{ x: pos.x, y: pos.y }]
    };
    drawingHistory.push(stroke);
    
    sendDrawData('start', { x: pos.x, y: pos.y, color: stroke.color, size: stroke.size });
}

function draw(e) {
    if (!isDrawing || !gameState.isDrawer) return;
    e.preventDefault();
    
    const pos = getPos(e);
    
    if (pos.x < 0 || pos.x > canvas.width || pos.y < 0 || pos.y > canvas.height) {
        lastPoint = pos;
        return;
    }
    
    if (lastPoint) {
        const midX = (lastPoint.x + pos.x) / 2;
        const midY = (lastPoint.y + pos.y) / 2;
        
        ctx.quadraticCurveTo(lastPoint.x, lastPoint.y, midX, midY);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(midX, midY);
        
        if (drawingHistory.length > 0) {
            drawingHistory[drawingHistory.length - 1].points.push({ x: pos.x, y: pos.y });
        }
        
        sendDrawData('draw', { x: pos.x, y: pos.y, lx: lastPoint.x, ly: lastPoint.y });
    }
    
    lastPoint = pos;
}

function endDraw(e) {
    if (!isDrawing) return;
    isDrawing = false;
    lastPoint = null;
    ctx.beginPath();
    sendDrawData('end');
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
    if (!gameState.isDrawer || drawingHistory.length === 0) return;
    drawingHistory.pop();
    redraw();
    sendDrawData('undo');
}

function redraw() {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    drawingHistory.forEach(stroke => {
        if (stroke.points.length < 2) return;
        
        ctx.beginPath();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = stroke.size;
        ctx.strokeStyle = stroke.color;
        
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        
        for (let i = 1; i < stroke.points.length - 1; i++) {
            const midX = (stroke.points[i].x + stroke.points[i + 1].x) / 2;
            const midY = (stroke.points[i].y + stroke.points[i + 1].y) / 2;
            ctx.quadraticCurveTo(stroke.points[i].x, stroke.points[i].y, midX, midY);
        }
        
        ctx.stroke();
    });
}

// ==========================================
// FIREBASE SYNC
// ==========================================

function sendDrawData(type, data) {
    if (!roomRef) return;
    
    const payload = {
        type: type,
        player: gameState.playerId,
        time: firebase.database.ServerValue.TIMESTAMP
    };
    
    if (data) Object.assign(payload, data);
    
    drawingRef.push(payload);
}

function listenDrawing() {
    gameRef.child('state').on('value', (snap) => {
        const state = snap.val();
        if (state === 'drawing' && !gameState.isDrawer) {
            setTimeout(() => {
                clearCanvas();
                remoteStroke = null;
            }, 100);
        }
    });
    
    drawingRef.on('child_added', (snap) => {
        const data = snap.val();
        if (!data || data.player === gameState.playerId) return;
        handleRemoteDraw(data);
    });
}

function handleRemoteDraw(data) {
    switch(data.type) {
        case 'start':
            remoteStroke = {
                color: data.color,
                size: data.size,
                lastX: data.x,
                lastY: data.y
            };
            ctx.beginPath();
            ctx.moveTo(data.x, data.y);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = data.size;
            ctx.strokeStyle = data.color;
            break;
            
        case 'draw':
            if (!remoteStroke) return;
            
            const midX = (remoteStroke.lastX + data.x) / 2;
            const midY = (remoteStroke.lastY + data.y) / 2;
            
            ctx.quadraticCurveTo(remoteStroke.lastX, remoteStroke.lastY, midX, midY);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(midX, midY);
            
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
// GAME LOGIC - 10 ROUNDS
// ==========================================

function joinGame() {
    const name = document.getElementById('playerName').value.trim() || 'Player' + Math.floor(Math.random() * 1000);
    const code = document.getElementById('roomCode').value.trim().toUpperCase();
    
    gameState.playerName = name;
    gameState.joinTime = Date.now(); // NEW: Record join time
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
        
        playersRef = roomRef.child('players');
        chatRef = roomRef.child('chat');
        drawingRef = roomRef.child('drawing');
        gameRef = roomRef.child('game');
        
        addPlayer();
    });
}

function addPlayer() {
    playersRef.child(gameState.playerId).set({
        name: gameState.playerName,
        score: 0,
        joined: Date.now(),
        hasGuessed: false
    }).then(() => {
        playersRef.child(gameState.playerId).onDisconnect().remove();
        setupListeners();
        showGame(gameState.roomCode);
    });
}

function setupListeners() {
    playersRef.on('value', (snap) => {
        const previousPlayers = { ...gameState.players };
        gameState.players = snap.val() || {};
        
        updatePlayerList();
        
        const prevIds = Object.keys(previousPlayers);
        const currentIds = Object.keys(gameState.players);
        
        // NEW: Check for new players joining (not us)
        if (prevIds.length > 0 && currentIds.length > prevIds.length) {
            const joinedId = currentIds.find(id => !prevIds.includes(id));
            if (joinedId && joinedId !== gameState.playerId) {
                playSound('join'); // NEW: Play join sound
            }
        }
        
        // NEW: Check for players leaving
        if (prevIds.length > 0 && currentIds.length < prevIds.length) {
            const leftId = prevIds.find(id => !currentIds.includes(id));
            if (leftId && previousPlayers[leftId]) {
                gameState.leftPlayerName = previousPlayers[leftId].name;
                showToast(`${gameState.leftPlayerName} left the game`, 'info');
                playSound('leave'); // NEW: Play leave sound
                
                gameRef.once('value', (gameSnap) => {
                    const game = gameSnap.val();
                    if (game && game.playerList) {
                        const newList = game.playerList.filter(id => id !== leftId);
                        gameRef.update({ playerList: newList });
                    }
                    
                    if (game && game.drawer === leftId) {
                        showDrawerLeftModal(game.word);
                    }
                });
            }
        }
        
        gameState.lastPlayerCount = currentIds.length;
        
        if (!gameState.gameStarted) {
            checkStartGame();
        }
    });
    
    // MODIFIED: Only show messages sent after join time
    chatRef.limitToLast(100).on('child_added', (snap) => {
        const msg = snap.val();
        // Only show messages sent after this player joined
        if (msg.time >= gameState.joinTime && shouldShowMessage(msg)) {
            displayMessage(msg);
            
            // NEW: Play sound for correct guesses by others
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

function checkStartGame() {
    const playerIds = Object.keys(gameState.players);
    
    if (playerIds.length >= 2 && !gameState.gameStarted) {
        gameState.playerList = playerIds;
        
        const firstPlayer = playerIds[0];
        
        gameRef.update({
            state: 'choosing',
            playerList: playerIds,
            currentDrawerIndex: 0,
            drawer: firstPlayer,
            round: 1
        }).then(() => {
            gameState.gameStarted = true;
        });
    }
}

function shouldShowMessage(msg) {
    if (msg.player === gameState.playerId) return true;
    if (msg.type === 'system') return true;
    
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
        return false;
    }
    
    return true;
}

function showDrawerLeftModal(word) {
    document.getElementById('leftPlayerTitle').textContent = 'The drawer left!';
    document.getElementById('leftPlayerMessage').textContent = `${gameState.leftPlayerName || 'Someone'} left the game`;
    document.getElementById('leftWordReveal').textContent = word || '---';
    document.getElementById('playerLeftModal').classList.add('show');
}

function continueGame() {
    document.getElementById('playerLeftModal').classList.remove('show');
    
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

function handleGameChange(game) {
    gameState.game = game;
    gameState.round = game.round || 1;
    gameState.maxRounds = game.maxRounds || 10;
    gameState.allGuessed = game.allGuessed || false;
    gameState.playerList = game.playerList || Object.keys(gameState.players);
    gameState.currentDrawerIndex = game.currentDrawerIndex || 0;
    
    document.getElementById('roundInfo').textContent = `Round ${gameState.round} of ${gameState.maxRounds}`;
    document.getElementById('timerDisplay').textContent = game.timer || 80;
    
    const wasDrawer = gameState.isDrawer;
    gameState.isDrawer = game.drawer === gameState.playerId;
    gameState.currentWord = game.word;
    
    if (gameState.isDrawer && !wasDrawer) {
        becomeDrawer();
    } else if (!gameState.isDrawer && wasDrawer) {
        stopDrawer();
    }
    
    if (gameState.isDrawer && game.word) {
        document.getElementById('wordDisplay').textContent = game.word;
    } else if (game.word) {
        const display = game.word.split('').map(c => c === ' ' ? ' ' : '_').join(' ');
        document.getElementById('wordDisplay').textContent = display;
    }
    
    if (game.state === 'choosing') {
        document.getElementById('waitingOverlay').classList.add('show');
        gameState.isGameActive = false;
    } else if (game.state === 'drawing') {
        document.getElementById('waitingOverlay').classList.remove('show');
        document.getElementById('roundOverlay').classList.remove('show');
        gameState.isGameActive = true;
        
        if (game.timer === 80) {
            Object.keys(gameState.players).forEach(pid => {
                if (pid !== game.drawer) {
                    playersRef.child(pid).update({ hasGuessed: false });
                }
            });
        }
        
        if (!timerInterval) {
            startTimer();
        }
    } else if (game.state === 'round_end') {
        showRoundEnd(game.word);
    } else if (game.state === 'game_over') {
        showGameOver();
    }
}

function becomeDrawer() {
    gameState.isDrawer = true;
    document.getElementById('drawerBadge').classList.add('show');
    document.getElementById('toolbar').classList.add('show');
    clearCanvas();
    showWordSelect();
}

function stopDrawer() {
    gameState.isDrawer = false;
    document.getElementById('drawerBadge').classList.remove('show');
    document.getElementById('toolbar').classList.remove('show');
    document.getElementById('wordModal').classList.remove('show');
}

function showWordSelect() {
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
    
    document.getElementById('wordModal').classList.add('show');
    
    let time = 15;
    const timerEl = document.getElementById('wordTimer');
    timerEl.textContent = time;
    
    const interval = setInterval(() => {
        time--;
        timerEl.textContent = time;
        if (time <= 0) {
            clearInterval(interval);
            if (document.getElementById('wordModal').classList.contains('show')) {
                selectWord(options[0].word);
            }
        }
    }, 1000);
}

function selectWord(word) {
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
        
        if (nextRound > 10) {
            gameRef.update({ state: 'game_over' });
            return;
        }
        
        while (nextIndex < playerList.length && !gameState.players[playerList[nextIndex]]) {
            nextIndex = (nextIndex + 1) % playerList.length;
            if (nextIndex === 0) {
                nextRound++;
                if (nextRound > 10) {
                    gameRef.update({ state: 'game_over' });
                    return;
                }
            }
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
    
    playersRef.child(gameState.playerId).update({
        score: (me?.score || 0) + points,
        hasGuessed: true
    });
    
    sendChat('correct', `guessed correctly! (+${points})`);
    playSound('correct'); // NEW: Play sound for own correct guess
    checkAllGuessed();
}

function checkAllGuessed() {
    const guessers = Object.entries(gameState.players).filter(([id, p]) => id !== gameState.game?.drawer);
    const allCorrect = guessers.every(([id, p]) => p.hasGuessed);
    
    if (guessers.length >= 1 && allCorrect && !gameState.allGuessed) {
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

// REMOVED: clearChat function completely

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
    playSound('roundEnd'); // NEW: Play round end sound
    
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
    document.getElementById('gameOverModal').classList.add('show');
    
    const container = document.getElementById('finalScores');
    container.innerHTML = '';
    
    const sorted = Object.entries(gameState.players)
        .sort((a, b) => (b[1].score || 0) - (a[1].score || 0));
    
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
}

function showGame(code) {
    document.getElementById('loadingOverlay').classList.remove('show');
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('gameScreen').style.display = 'flex';
    document.getElementById('roomCodeDisplay').textContent = code;
    
    playSound('enter'); // NEW: Play enter game sound
    
    setTimeout(() => {
        resizeCanvas();
    }, 100);
    
    sendChat('system', `${gameState.playerName} joined!`);
}

function playAgain() {
    gameState.gameStarted = false;
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
    if (roomRef) {
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

console.log('🎮 Game engine v8.0 - 10 ROUNDS with SOUNDS loaded!');
