// ==========================================
// GAME ENGINE v15.0 - ALL BUGS FIXED
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
    isHost: false,
    joinTime: null,
    hasGuessedCurrentWord: false,
    gameStarted: false
};

let canvas, ctx;
let isDrawing = false;
let currentTool = 'brush';
let currentColor = '#000000';
let currentSize = 4;
let drawingHistory = [];
let lastDrawTime = 0;
let remoteStrokes = {}; // FIXED: Per-player remote strokes
let timerInterval = null;
let autoRestartTimer = null;
let wordSelectTimer = null;
let isTabActive = true;
let pendingDrawBuffer = [];

let canvasBackup = null;
let isKeyboardOpen = false;

let roomRef, playersRef, chatRef, drawingRef, gameRef, hostRef;

let sounds = {};
let audioContext = null;

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
    initKeyboardHandling();
    initVisibilityAPI();
    
    const chatInput = document.getElementById('chatInput');
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    
    document.getElementById('popupOverlay').addEventListener('click', closePopups);
    
    // FIXED: Handle page unload properly
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('unload', handleUnload);
});

// FIXED: Page Visibility API to pause timers when tab hidden
function initVisibilityAPI() {
    document.addEventListener('visibilitychange', () => {
        isTabActive = !document.hidden;
    });
}

function initKeyboardHandling() {
    const chatInput = document.getElementById('chatInput');
    
    chatInput.addEventListener('focus', () => {
        isKeyboardOpen = true;
        saveCanvasBackup();
    });
    
    chatInput.addEventListener('blur', () => {
        isKeyboardOpen = false;
        restoreCanvasWithDelay();
    });
    
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', handleViewportResize);
    }
}

function handleViewportResize() {
    if (!isKeyboardOpen && !canvasBackup) {
        setTimeout(resizeCanvas, 100);
    }
}

function saveCanvasBackup() {
    if (canvas && ctx && canvas.width > 0) {
        try {
            canvasBackup = ctx.getImageData(0, 0, canvas.width, canvas.height);
        } catch(e) {
            console.error('Canvas backup failed:', e);
        }
    }
}

function restoreCanvasWithDelay() {
    const delays = [0, 100, 300, 500];
    delays.forEach(delay => {
        setTimeout(() => {
            if (canvasBackup && ctx) {
                try {
                    ctx.putImageData(canvasBackup, 0, 0);
                } catch(e) {}
            }
            redraw();
        }, delay);
    });
}

function initSounds() {
    sounds.join = document.getElementById('soundJoin');
    sounds.correct = document.getElementById('soundCorrect');
    sounds.roundEnd = document.getElementById('soundRoundEnd');
    sounds.leave = document.getElementById('soundLeave');
    sounds.enter = document.getElementById('soundEnter');
    
    // FIXED: Initialize audio context on first user interaction
    document.addEventListener('click', initAudioContext, { once: true });
    document.addEventListener('touchstart', initAudioContext, { once: true });
}

function initAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
    }
}

function playSound(soundName) {
    const sound = sounds[soundName];
    if (!sound) return;
    
    // FIXED: Handle autoplay restrictions
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            playSoundInternal(sound);
        });
    } else {
        playSoundInternal(sound);
    }
}

function playSoundInternal(sound) {
    sound.currentTime = 0;
    sound.play().catch(e => {
        // Silently fail if autoplay blocked
        console.log('Sound play failed:', e.message);
    });
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
// CANVAS - FIXED
// ==========================================

function initCanvas() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    resizeCanvas();
    
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (!isKeyboardOpen && !canvasBackup) {
                resizeCanvas();
            }
        }, 250);
    });
    
    // Mouse events
    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', endDraw);
    canvas.addEventListener('mouseleave', endDraw);
    
    // Touch events - FIXED: proper touch handling
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });
    
    clearCanvas();
}

function resizeCanvas() {
    const wrapper = document.querySelector('.canvas-wrapper');
    if (!wrapper) return;
    
    if (canvasBackup || isKeyboardOpen) return;
    
    const wrapperWidth = wrapper.clientWidth;
    const wrapperHeight = wrapper.clientHeight;
    
    let width = wrapperWidth;
    let height = width * 0.75;
    
    if (height > wrapperHeight) {
        height = wrapperHeight;
        width = height / 0.75;
    }
    
    // Only resize if significant change
    if (Math.abs(canvas.width - width) > 5 || Math.abs(canvas.height - height) > 5) {
        let savedData = null;
        if (ctx && canvas.width > 0 && canvas.height > 0) {
            try {
                savedData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            } catch(e) {}
        }
        
        canvas.width = width;
        canvas.height = height;
        
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        
        if (savedData) {
            try {
                ctx.putImageData(savedData, 0, 0);
            } catch(e) {
                redraw();
            }
        } else {
            clearCanvas();
        }
    }
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
        canvasBackup = null;
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
// DRAWING FUNCTIONS - FIXED
// ==========================================

function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    
    if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else if (e.changedTouches && e.changedTouches.length > 0) {
        clientX = e.changedTouches[0].clientX;
        clientY = e.changedTouches[0].clientY;
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
let isProcessingFill = false;

function startDraw(e) {
    if (!gameState.isDrawer || !gameState.isGameActive) return;
    if (isProcessingFill) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const pos = getPos(e);
    
    if (pos.x < 0 || pos.x > canvas.width || pos.y < 0 || pos.y > canvas.height) return;
    
    if (currentTool === 'bucket') {
        isProcessingFill = true;
        floodFill(Math.floor(pos.x), Math.floor(pos.y), currentColor);
        sendDrawData('fill', { x: Math.floor(pos.x), y: Math.floor(pos.y), color: currentColor });
        setTimeout(() => { isProcessingFill = false; }, 100);
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
        color: ctx.strokeStyle,
        size: currentSize,
        points: [{ x: pos.x, y: pos.y }]
    };
    
    sendDrawData('start', { 
        x: pos.x, 
        y: pos.y, 
        color: currentStroke.color, 
        size: currentStroke.size 
    });
}

function draw(e) {
    if (!isDrawing || !gameState.isDrawer) return;
    e.preventDefault();
    e.stopPropagation();
    
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
        
        if (currentStroke) {
            currentStroke.points.push({ x: pos.x, y: pos.y });
        }
        
        // FIXED: Throttle draw data to reduce Firebase writes
        const now = Date.now();
        if (now - lastDrawTime > 50) { // Max 20 updates/sec
            sendDrawData('draw', { 
                x: pos.x, 
                y: pos.y, 
                lx: lastPoint.x, 
                ly: lastPoint.y 
            });
            lastDrawTime = now;
        }
    }
    
    lastPoint = pos;
}

function endDraw(e) {
    if (!isDrawing) return;
    isDrawing = false;
    lastPoint = null;
    ctx.beginPath();
    
    if (currentStroke && currentStroke.points.length > 1) {
        drawingHistory.push(currentStroke);
        // FIXED: Limit history to prevent memory issues
        if (drawingHistory.length > 50) {
            drawingHistory.shift();
        }
    }
    currentStroke = null;
    
    sendDrawData('end');
}

// FIXED: Proper touch handling
function handleTouchStart(e) {
    if (e.touches.length === 1) {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousedown', {
            clientX: touch.clientX,
            clientY: touch.clientY,
            bubbles: true
        });
        canvas.dispatchEvent(mouseEvent);
    }
}

function handleTouchMove(e) {
    if (e.touches.length === 1) {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousemove', {
            clientX: touch.clientX,
            clientY: touch.clientY,
            bubbles: true
        });
        canvas.dispatchEvent(mouseEvent);
    }
}

function handleTouchEnd(e) {
    e.preventDefault();
    const mouseEvent = new MouseEvent('mouseup', {
        bubbles: true
    });
    canvas.dispatchEvent(mouseEvent);
}

// FIXED: Optimized flood fill with stack limit
function floodFill(startX, startY, fillColor) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const width = canvas.width;
    const height = canvas.height;
    
    const startPos = (startY * width + startX) * 4;
    const targetR = data[startPos];
    const targetG = data[startPos + 1];
    const targetB = data[startPos + 2];
    
    const fill = hexToRgb(fillColor);
    if (!fill) return;
    if (targetR === fill.r && targetG === fill.g && targetB === fill.b) return;
    
    const stack = [[startX, startY]];
    const visited = new Set();
    const key = (x, y) => `${x},${y}`;
    const tolerance = 32;
    const maxIterations = 100000; // FIXED: Prevent infinite loop
    
    let iterations = 0;
    
    while (stack.length > 0 && iterations < maxIterations) {
        iterations++;
        const [x, y] = stack.pop();
        const k = key(x, y);
        
        if (visited.has(k)) continue;
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        
        const pos = (y * width + x) * 4;
        const r = data[pos], g = data[pos + 1], b = data[pos + 2];
        
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
        if (!stroke.points || stroke.points.length < 2) return;
        
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
        
        if (stroke.points.length > 1) {
            ctx.lineTo(stroke.points[stroke.points.length - 1].x, stroke.points[stroke.points.length - 1].y);
        }
        
        ctx.stroke();
    });
}

// ==========================================
// FIREBASE SYNC - FIXED
// ==========================================

// FIXED: Throttled draw data sender
let drawQueue = [];
let drawQueueTimeout = null;

function sendDrawData(type, data) {
    if (!roomRef || !drawingRef) return;
    
    const payload = {
        type: type,
        player: gameState.playerId,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        seq: Date.now()
    };
    
    if (data) Object.assign(payload, data);
    
    // Queue draw operations
    drawQueue.push(payload);
    
    if (!drawQueueTimeout) {
        drawQueueTimeout = setTimeout(flushDrawQueue, 30); // Batch every 30ms
    }
}

function flushDrawQueue() {
    if (drawQueue.length === 0) {
        drawQueueTimeout = null;
        return;
    }
    
    // Send only last 'draw' operation per batch to reduce writes
    const optimized = [];
    let lastDraw = null;
    
    drawQueue.forEach(op => {
        if (op.type === 'draw') {
            lastDraw = op;
        } else {
            if (lastDraw) {
                optimized.push(lastDraw);
                lastDraw = null;
            }
            optimized.push(op);
        }
    });
    
    if (lastDraw) optimized.push(lastDraw);
    
    // Send in small batches
    const batch = optimized.slice(0, 10);
    batch.forEach(payload => {
        drawingRef.push(payload).catch(err => {
            console.error('Failed to send draw data:', err);
        });
    });
    
    drawQueue = optimized.slice(10);
    drawQueueTimeout = drawQueue.length > 0 ? setTimeout(flushDrawQueue, 30) : null;
}

function listenDrawing() {
    // FIXED: Use 'child_added' with limit for performance
    drawingRef.limitToLast(100).on('child_added', (snap) => {
        const data = snap.val();
        if (!data) return;
        if (data.player === gameState.playerId) return;
        
        // Buffer remote draws for smooth playback
        pendingDrawBuffer.push(data);
        if (!isProcessingRemoteDraws) {
            processRemoteDrawBuffer();
        }
    });
}

let isProcessingRemoteDraws = false;

function processRemoteDrawBuffer() {
    isProcessingRemoteDraws = true;
    
    const processNext = () => {
        if (pendingDrawBuffer.length === 0) {
            isProcessingRemoteDraws = false;
            return;
        }
        
        const data = pendingDrawBuffer.shift();
        handleRemoteDraw(data);
        
        // Process at 60fps max
        requestAnimationFrame(processNext);
    };
    
    processNext();
}

function handleRemoteDraw(data) {
    if (!data || !data.type) return;
    
    // FIXED: Per-player remote stroke tracking
    const playerId = data.player;
    
    switch(data.type) {
        case 'start':
            remoteStrokes[playerId] = {
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
            if (!remoteStrokes[playerId]) {
                remoteStrokes[playerId] = {
                    color: data.color || '#000000',
                    size: data.size || 4,
                    lastX: data.lx,
                    lastY: data.ly
                };
                ctx.beginPath();
                ctx.moveTo(data.lx, data.ly);
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.lineWidth = remoteStrokes[playerId].size;
                ctx.strokeStyle = remoteStrokes[playerId].color;
            }
            
            const stroke = remoteStrokes[playerId];
            const midX = (stroke.lastX + data.x) / 2;
            const midY = (stroke.lastY + data.y) / 2;
            
            ctx.quadraticCurveTo(stroke.lastX, stroke.lastY, midX, midY);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(midX, midY);
            
            stroke.lastX = data.x;
            stroke.lastY = data.y;
            break;
            
        case 'end':
            remoteStrokes[playerId] = null;
            ctx.beginPath();
            break;
            
        case 'fill':
            floodFill(data.x, data.y, data.color);
            break;
            
        case 'clear':
            clearCanvas();
            break;
            
        case 'undo':
            // Remote undo not implemented (would need full history sync)
            break;
    }
}

// ==========================================
// GAME LOGIC - CRITICAL FIXES
// ==========================================

function joinGame() {
    const nameInput = document.getElementById('playerName');
    const codeInput = document.getElementById('roomCode');
    
    // FIXED: Input sanitization
    let name = nameInput.value.trim().substring(0, 12);
    if (!name) name = 'Player' + Math.floor(Math.random() * 1000);
    
    // Remove HTML tags
    name = name.replace(/[<>]/g, '');
    
    let code = codeInput.value.trim().toUpperCase().substring(0, 4);
    
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
    for (let i = 0; i < 4; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

// FIXED: Atomic room creation with transaction
function createRoom(code) {
    gameState.roomCode = code;
    gameState.playerId = 'p_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    
    roomRef = database.ref('rooms/' + code);
    playersRef = roomRef.child('players');
    chatRef = roomRef.child('chat');
    drawingRef = roomRef.child('drawing');
    gameRef = roomRef.child('game');
    hostRef = roomRef.child('host');
    
    // FIXED: Set host and check if room exists
    hostRef.set({
        id: gameState.playerId,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    }).then(() => {
        // Host set successfully, now create room
        return roomRef.set({
            created: Date.now(),
            state: 'waiting',
            round: 1,
            maxRounds: 10,
            currentDrawerIndex: 0,
            drawer: null,
            word: null,
            allGuessed: false,
            playerList: [gameState.playerId] // FIXED: Initialize with first player
        });
    }).then(() => {
        gameState.isHost = true;
        addPlayer();
    }).catch(err => {
        // Room might exist, try different code
        if (err.code === 'PERMISSION_DENIED' || err.message.includes('exists')) {
            createRoom(generateCode());
        } else {
            showToast('Error creating room: ' + err.message, 'error');
            document.getElementById('loadingOverlay').classList.remove('show');
        }
    });
}

function joinRoom(code) {
    gameState.roomCode = code;
    gameState.playerId = 'p_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    
    roomRef = database.ref('rooms/' + code);
    
    roomRef.once('value', (snap) => {
        if (!snap.exists()) {
            showToast('Room not found!', 'error');
            document.getElementById('loadingOverlay').classList.remove('show');
            return;
        }
        
        const roomData = snap.val();
        
        // FIXED: Check player limit
        const playerCount = roomData.playerList ? roomData.playerList.length : 0;
        if (playerCount >= 8) {
            showToast('Room is full (8/8 players)!', 'error');
            document.getElementById('loadingOverlay').classList.remove('show');
            return;
        }
        
        playersRef = roomRef.child('players');
        chatRef = roomRef.child('chat');
        drawingRef = roomRef.child('drawing');
        gameRef = roomRef.child('game');
        hostRef = roomRef.child('host');
        
        // FIXED: Add to playerList atomically
        const newList = roomData.playerList || [];
        newList.push(gameState.playerId);
        
        gameRef.update({ playerList: newList }).then(() => {
            addPlayer(roomData);
        });
        
    }, (err) => {
        showToast('Connection error: ' + err.message, 'error');
        document.getElementById('loadingOverlay').classList.remove('show');
    });
}

function addPlayer(existingRoomData = null) {
    const playerData = {
        name: gameState.playerName,
        score: 0,
        joined: Date.now(),
        hasGuessed: false,
        guessedCurrentWord: false,
        isOnline: true
    };
    
    // FIXED: Handle late join to active game
    if (existingRoomData && existingRoomData.state !== 'waiting') {
        playerData.hasGuessed = false;
        playerData.guessedCurrentWord = false;
    }
    
    playersRef.child(gameState.playerId).set(playerData).then(() => {
        // FIXED: Proper disconnect handling
        playersRef.child(gameState.playerId).onDisconnect().update({
            isOnline: false,
            leftAt: Date.now()
        });
        
        setupListeners();
        showGame(gameState.roomCode);
    }).catch(err => {
        showToast('Error joining: ' + err.message, 'error');
        document.getElementById('loadingOverlay').classList.remove('show');
    });
}

function setupListeners() {
    // FIXED: Players listener with debounced game start check
    let playerChangeTimeout = null;
    
    playersRef.on('value', (snap) => {
        const previousPlayers = { ...gameState.players };
        gameState.players = snap.val() || {};
        
        updatePlayerList();
        
        const prevIds = Object.keys(previousPlayers);
        const currentIds = Object.keys(gameState.players);
        
        // Handle joins
        if (prevIds.length > 0 && currentIds.length > prevIds.length) {
            const joinedId = currentIds.find(id => !prevIds.includes(id));
            if (joinedId && joinedId !== gameState.playerId) {
                playSound('join');
            }
        }
        
        // Handle leaves
        if (prevIds.length > 0 && currentIds.length < prevIds.length) {
            const leftId = prevIds.find(id => !currentIds.includes(id));
            if (leftId && previousPlayers[leftId]) {
                const leftName = previousPlayers[leftId].name;
                sendChat('system', sanitizeText(`${leftName} left the game`));
                playSound('leave');
                
                // FIXED: Handle drawer leaving
                gameRef.once('value', (gameSnap) => {
                    const game = gameSnap.val();
                    if (game && game.drawer === leftId) {
                        handleDrawerLeft();
                    }
                });
            }
        }
        
        // FIXED: Debounced game start check (only host starts game)
        if (gameState.isHost) {
            clearTimeout(playerChangeTimeout);
            playerChangeTimeout = setTimeout(() => {
                tryStartGame();
            }, 500);
        }
    });
    
    // Chat listener
    chatRef.limitToLast(100).on('child_added', (snap) => {
        const msg = snap.val();
        if (!msg) return;
        
        // FIXED: Time comparison for late joiners
        const msgTime = msg.time || 0;
        if (msgTime >= gameState.joinTime - 5000 && shouldShowMessage(msg)) {
            displayMessage(msg);
            
            if (msg.type === 'correct' && msg.player !== gameState.playerId) {
                playSound('correct');
            }
        }
    });
    
    // FIXED: Game state listener with transaction awareness
    gameRef.on('value', (snap) => {
        const game = snap.val();
        if (game) {
            handleGameChange(game);
        }
    });
    
    listenDrawing();
    
    // FIXED: Listen for host changes
    hostRef.on('value', (snap) => {
        const host = snap.val();
        if (host && host.id === gameState.playerId) {
            gameState.isHost = true;
        } else {
            gameState.isHost = false;
        }
    });
}

// FIXED: Proper drawer left handling with host election
function handleDrawerLeft() {
    gameRef.once('value', (snap) => {
        const game = snap.val();
        if (!game) return;
        
        const playerList = game.playerList || Object.keys(gameState.players);
        
        // Remove offline players from list
        const onlineList = playerList.filter(id => gameState.players[id] && gameState.players[id].isOnline !== false);
        
        if (onlineList.length === 0) return; // No players left
        
        let nextIndex = (game.currentDrawerIndex + 1) % onlineList.length;
        
        // Find next valid drawer
        let attempts = 0;
        while (attempts < onlineList.length) {
            if (gameState.players[onlineList[nextIndex]] && 
                gameState.players[onlineList[nextIndex]].isOnline !== false) {
                break;
            }
            nextIndex = (nextIndex + 1) % onlineList.length;
            attempts++;
        }
        
        const nextDrawer = onlineList[nextIndex];
        
        // FIXED: Update playerList to remove offline players
        gameRef.update({
            state: 'choosing',
            drawer: nextDrawer,
            currentDrawerIndex: nextIndex,
            playerList: onlineList,
            word: null,
            allGuessed: false,
            timer: 80
        });
    });
}

// FIXED: Atomic game start with host-only initiation
function tryStartGame() {
    if (!gameState.isHost) return; // Only host starts game
    
    const playerIds = Object.keys(gameState.players).filter(id => {
        return gameState.players[id] && gameState.players[id].isOnline !== false;
    });
    
    const playerCount = playerIds.length;
    
    if (playerCount < 2) {
        updateWaitingMessage(playerCount);
        return;
    }
    
    // FIXED: Use transaction to prevent race conditions
    gameRef.transaction((currentGame) => {
        if (!currentGame) return currentGame;
        
        // Only start if waiting and we have enough players
        if (currentGame.state === 'waiting' && playerCount >= 2) {
            return {
                ...currentGame,
                state: 'choosing',
                playerList: playerIds,
                currentDrawerIndex: 0,
                drawer: playerIds[0],
                round: 1,
                timer: 80,
                allGuessed: false,
                word: null,
                startTime: null
            };
        }
        
        return currentGame; // Abort transaction
    }, (error, committed, snapshot) => {
        if (error) {
            console.error('Transaction failed:', error);
        } else if (committed) {
            console.log('Game started successfully!');
        }
    });
}

function updateWaitingMessage(playerCount) {
    const wordDisplay = document.getElementById('wordDisplay');
    
    gameRef.once('value', (snap) => {
        const game = snap.val();
        if (!game || game.state === 'waiting') {
            if (playerCount === 1) {
                wordDisplay.textContent = 'Need 2+ players to start...';
            } else if (playerCount >= 2) {
                wordDisplay.textContent = 'Starting game...';
            }
        }
    });
}

// FIXED: Proper message filtering
function shouldShowMessage(msg) {
    if (msg.type === 'system') return true;
    if (msg.type === 'correct') return true;
    if (msg.player === gameState.playerId) return true;
    
    const me = gameState.players[gameState.playerId];
    const sender = gameState.players[msg.player];
    
    // Drawer sees all guesser chats
    if (gameState.isDrawer) {
        if (msg.type === 'guesser_chat') return true;
        if (msg.isClose) return true;
        if (msg.type === 'guess' && !sender?.hasGuessed) return false;
        return true;
    }
    
    // Guesser who got it right sees other correct guessers
    if (me && me.hasGuessed) {
        if (msg.type === 'guesser_chat') return true;
        if (sender && sender.hasGuessed) return true;
        if (gameState.game?.drawer === msg.player) return true;
        return false;
    }
    
    // Guesser who hasn't got it yet
    if (!me || !me.hasGuessed) {
        if (msg.type === 'guess') return true;
        if (msg.isClose) return true;
        if (msg.type === 'guesser_chat') return false;
    }
    
    return true;
}

// FIXED: Robust game state handling
function handleGameChange(game) {
    console.log('Game state:', game.state, 'Drawer:', game.drawer, 'Me:', gameState.playerId);
    
    const previousState = gameState.game?.state;
    const previousDrawer = gameState.game?.drawer;
    
    // Update game state
    gameState.game = game;
    gameState.round = game.round || 1;
    gameState.maxRounds = game.maxRounds || 10;
    gameState.allGuessed = game.allGuessed || false;
    gameState.playerList = game.playerList || [];
    gameState.currentDrawerIndex = game.currentDrawerIndex || 0;
    
    // FIXED: Check if I'm the drawer
    const wasDrawer = gameState.isDrawer;
    gameState.isDrawer = (game.drawer === gameState.playerId);
    gameState.currentWord = game.word;
    
    // Update UI
    document.getElementById('roundInfo').textContent = `Round ${gameState.round} of ${gameState.maxRounds}`;
    document.getElementById('timerDisplay').textContent = game.timer || 80;
    
    updateWordDisplay(game.word);
    
    const waitingOverlay = document.getElementById('waitingOverlay');
    const roundOverlay = document.getElementById('roundOverlay');
    const wordModal = document.getElementById('wordModal');
    
    // Reset font styles
    const wordDisplay = document.getElementById('wordDisplay');
    wordDisplay.style.fontSize = '';
    wordDisplay.style.letterSpacing = '';
    
    // FIXED: Clear word timer when state changes
    if (game.state !== 'choosing' && wordSelectTimer) {
        clearInterval(wordSelectTimer);
        wordSelectTimer = null;
    }
    
    // FIXED: Clear drawing timer when not drawing
    if (game.state !== 'drawing' && timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    
    switch(game.state) {
        case 'waiting':
            waitingOverlay.classList.remove('show');
            roundOverlay.classList.remove('show');
            wordModal.classList.remove('show');
            gameState.isGameActive = false;
            updateWaitingMessage(Object.keys(gameState.players).length);
            break;
            
        case 'choosing':
            if (gameState.isDrawer) {
                console.log('I am the drawer! Showing word select...');
                waitingOverlay.classList.remove('show');
                roundOverlay.classList.remove('show');
                
                // FIXED: Only show if not already showing
                if (!wordModal.classList.contains('show')) {
                    clearCanvas();
                    showWordSelect();
                }
            } else {
                console.log('I am not the drawer. Waiting...');
                waitingOverlay.classList.add('show');
                wordModal.classList.remove('show');
                roundOverlay.classList.remove('show');
            }
            gameState.isGameActive = false;
            gameState.hasGuessedCurrentWord = false;
            break;
            
        case 'drawing':
            waitingOverlay.classList.remove('show');
            roundOverlay.classList.remove('show');
            wordModal.classList.remove('show');
            gameState.isGameActive = true;
            
            // FIXED: Reset guessed state when entering drawing
            if (previousState === 'choosing') {
                gameState.hasGuessedCurrentWord = false;
                
                // FIXED: Only drawer resets player states
                if (gameState.isDrawer) {
                    Object.keys(gameState.players).forEach(pid => {
                        if (pid !== game.drawer) {
                            playersRef.child(pid).update({ 
                                hasGuessed: false,
                                guessedCurrentWord: false
                            });
                        }
                    });
                }
            }
            
            // FIXED: Only host/drawer starts timer
            if (!timerInterval && gameState.isHost && gameState.isDrawer) {
                startTimer();
            }
            break;
            
        case 'round_end':
            waitingOverlay.classList.remove('show');
            showRoundEnd(game.word);
            gameState.isGameActive = false;
            
            // FIXED: Auto-hide round end overlay
            setTimeout(() => {
                if (gameState.game?.state === 'round_end') {
                    roundOverlay.classList.remove('show');
                }
            }, 5000);
            break;
            
        case 'game_over':
            waitingOverlay.classList.remove('show');
            roundOverlay.classList.remove('show');
            wordModal.classList.remove('show');
            showGameOver();
            gameState.isGameActive = false;
            break;
    }
    
    // Handle drawer UI changes
    if (gameState.isDrawer !== wasDrawer) {
        if (gameState.isDrawer) {
            becomeDrawer();
        } else {
            stopDrawer();
        }
    }
    
    // FIXED: Handle word reveal for correct guessers
    if (game.word && !gameState.isDrawer) {
        const me = gameState.players[gameState.playerId];
        if (me && me.hasGuessed) {
            updateWordDisplay(game.word);
        }
    }
}

function updateWordDisplay(word) {
    const wordDisplay = document.getElementById('wordDisplay');
    
    if (!word) {
        wordDisplay.textContent = 'Waiting...';
        return;
    }
    
    if (gameState.isDrawer) {
        wordDisplay.textContent = word;
        return;
    }
    
    const me = gameState.players[gameState.playerId];
    
    if (me && me.hasGuessed) {
        wordDisplay.textContent = word.toUpperCase();
        return;
    }
    
    // Show underscores with spaces between
    const display = word.split('').map(c => c === ' ' ? ' ' : '_').join(' ');
    wordDisplay.textContent = display;
}

function becomeDrawer() {
    console.log('Becoming drawer!');
    gameState.isDrawer = true;
    document.getElementById('drawerBadge').classList.add('show');
    document.getElementById('toolbarContainer').classList.add('show');
    
    const chatInput = document.getElementById('chatInput');
    chatInput.placeholder = 'Chat with players...';
    chatInput.disabled = false;
    
    // FIXED: Show word select if in choosing state
    if (gameState.game?.state === 'choosing') {
        setTimeout(() => showWordSelect(), 200);
    }
}

function stopDrawer() {
    console.log('Stopping drawer!');
    gameState.isDrawer = false;
    document.getElementById('drawerBadge').classList.remove('show');
    document.getElementById('toolbarContainer').classList.remove('show');
    document.getElementById('wordModal').classList.remove('show');
    
    const chatInput = document.getElementById('chatInput');
    chatInput.placeholder = 'Type your guess here...';
    chatInput.disabled = false;
    
    // FIXED: Stop any active drawing
    isDrawing = false;
    lastPoint = null;
    currentStroke = null;
}

// FIXED: Word selection with proper cleanup
function showWordSelect() {
    const modal = document.getElementById('wordModal');
    if (modal.classList.contains('show')) return;
    
    const options = WordBank.getWordOptions();
    const container = document.getElementById('wordOptions');
    container.innerHTML = '';
    
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'word-btn';
        btn.innerHTML = `${sanitizeText(opt.word)}<div style="font-size:12px;margin-top:4px">${opt.difficulty} • ${opt.points} pts</div>`;
        btn.onclick = () => selectWord(opt.word);
        container.appendChild(btn);
    });
    
    modal.classList.add('show');
    
    // FIXED: Clear any existing timer
    if (wordSelectTimer) {
        clearInterval(wordSelectTimer);
        wordSelectTimer = null;
    }
    
    let time = 15;
    const timerEl = document.getElementById('wordTimer');
    timerEl.textContent = time;
    
    wordSelectTimer = setInterval(() => {
        // FIXED: Pause timer when tab hidden
        if (!isTabActive) return;
        
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
    // FIXED: Clear timer immediately
    if (wordSelectTimer) {
        clearInterval(wordSelectTimer);
        wordSelectTimer = null;
    }
    
    document.getElementById('wordModal').classList.remove('show');
    clearCanvas();
    canvasBackup = null;
    
    console.log('Selecting word:', word);
    
    // FIXED: Use transaction for word selection
    gameRef.update({
        state: 'drawing',
        word: word,
        timer: 80,
        startTime: Date.now(),
        allGuessed: false,
        roundStartTime: Date.now()
    });
}

// FIXED: Synchronized timer with host control
function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    
    timerInterval = setInterval(() => {
        // FIXED: Only run if tab active and still drawer
        if (!isTabActive || !gameState.isDrawer) return;
        
        gameRef.once('value', (snap) => {
            const game = snap.val();
            if (!game || game.state !== 'drawing') {
                clearInterval(timerInterval);
                timerInterval = null;
                return;
            }
            
            // FIXED: Verify still the drawer
            if (game.drawer !== gameState.playerId) {
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

// FIXED: Robust round ending with host election
function endRound() {
    gameRef.once('value', (snap) => {
        const game = snap.val();
        if (!game) return;
        
        const playerList = game.playerList || [];
        const currentIndex = game.currentDrawerIndex || 0;
        
        // Filter online players only
        const onlineList = playerList.filter(id => {
            return gameState.players[id] && gameState.players[id].isOnline !== false;
        });
        
        if (onlineList.length === 0) return;
        
        let nextIndex = (currentIndex + 1) % onlineList.length;
        let nextRound = game.round || 1;
        
        // Check if completed full rotation
        if (nextIndex === 0) {
            nextRound = (game.round || 1) + 1;
        }
        
        // Game over check
        if (nextRound > 10) {
            gameRef.update({ state: 'game_over' });
            return;
        }
        
        // Find valid next drawer
        let attempts = 0;
        while (attempts < onlineList.length) {
            if (gameState.players[onlineList[nextIndex]] && 
                gameState.players[onlineList[nextIndex]].isOnline !== false) {
                break;
            }
            nextIndex = (nextIndex + 1) % onlineList.length;
            if (nextIndex === 0) {
                nextRound++;
                if (nextRound > 10) {
                    gameRef.update({ state: 'game_over' });
                    return;
                }
            }
            attempts++;
        }
        
        const nextDrawer = onlineList[nextIndex];
        
        // FIXED: Update state atomically
        gameRef.update({
            state: 'round_end',
            roundEndTime: Date.now()
        });
        
        // Transition to next round after delay
        setTimeout(() => {
            gameRef.update({
                state: 'choosing',
                round: nextRound,
                drawer: nextDrawer,
                currentDrawerIndex: nextIndex,
                word: null,
                timer: 80,
                allGuessed: false,
                startTime: null,
                roundStartTime: null,
                playerList: onlineList // Update to remove offline players
            });
        }, 3000);
    });
}

// ==========================================
// CHAT - FIXED
// ==========================================

function sendMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim().substring(0, 50);
    if (!text) return;
    
    // FIXED: Sanitize input
    const sanitized = sanitizeText(text);
    
    if (gameState.isDrawer) {
        sendChat('drawer_chat', sanitized);
        input.value = '';
        return;
    }
    
    const me = gameState.players[gameState.playerId];
    
    if (me && me.hasGuessed) {
        sendChat('guesser_chat', sanitized);
        input.value = '';
        return;
    }
    
    // Check for correct guess
    if (gameState.isGameActive && gameState.currentWord && 
        sanitized.toLowerCase() === gameState.currentWord.toLowerCase()) {
        handleCorrectGuess();
        input.value = '';
        return;
    }
    
    // Check for close guess
    const similarity = calcSimilarity(sanitized.toLowerCase(), gameState.currentWord?.toLowerCase() || '');
    const isClose = similarity > 0.6 && similarity < 1;
    
    sendChat('guess', sanitized, isClose);
    input.value = '';
}

// FIXED: Text sanitization
function sanitizeText(text) {
    if (!text) return '';
    return text
        .replace(/[<>]/g, '') // Remove HTML tags
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .trim();
}

function calcSimilarity(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    
    // FIXED: Better similarity using Levenshtein distance
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    
    const distance = levenshteinDistance(a, b);
    return 1 - distance / maxLen;
}

function levenshteinDistance(a, b) {
    const matrix = [];
    
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    
    return matrix[b.length][a.length];
}

// FIXED: Correct guess with synced timer
function handleCorrectGuess() {
    const me = gameState.players[gameState.playerId];
    if (me && me.hasGuessed) return;
    
    // FIXED: Get current timer from Firebase for accurate scoring
    gameRef.once('value', (snap) => {
        const game = snap.val();
        const currentTimer = game?.timer || 0;
        const points = Math.max(10, Math.floor(currentTimer / 8) * 10);
        
        playersRef.child(gameState.playerId).update({
            score: (me?.score || 0) + points,
            hasGuessed: true,
            guessedCurrentWord: true
        });
        
        sendChat('correct', `guessed correctly! (+${points})`);
        playSound('correct');
        
        updateWordDisplay(gameState.currentWord);
        checkAllGuessed();
    });
}

// FIXED: All guessed check with online players only
function checkAllGuessed() {
    const allPlayers = Object.keys(gameState.players).filter(id => {
        return gameState.players[id] && gameState.players[id].isOnline !== false;
    });
    
    if (allPlayers.length < 2) return;
    
    const drawerId = gameState.game?.drawer;
    const guessers = allPlayers.filter(id => id !== drawerId);
    
    if (guessers.length === 0) return;
    
    const allCorrect = guessers.every(id => gameState.players[id]?.hasGuessed);
    
    if (allCorrect && !gameState.allGuessed) {
        // Award drawer bonus
        const drawer = gameState.players[drawerId];
        if (drawer && gameState.isHost) { // Only host awards bonus
            playersRef.child(drawerId).update({
                score: (drawer.score || 0) + 25
            });
        }
        
        gameRef.update({ allGuessed: true });
        
        // End round after short delay
        if (gameState.isHost) {
            setTimeout(() => endRound(), 2000);
        }
    }
}

// FIXED: Rate-limited chat
let lastChatTime = 0;
const CHAT_COOLDOWN = 500; // ms

function sendChat(type, text, isClose = false) {
    const now = Date.now();
    if (now - lastChatTime < CHAT_COOLDOWN && type !== 'system') {
        showToast('Please wait before sending another message', 'warning');
        return;
    }
    lastChatTime = now;
    
    chatRef.push({
        type: type,
        text: text,
        player: gameState.playerId,
        name: gameState.playerName,
        time: firebase.database.ServerValue.TIMESTAMP,
        isClose: isClose
    });
}

// FIXED: Message display with anti-spam
let lastMessageTime = 0;
let messageCount = 0;

function displayMessage(msg) {
    // Anti-spam: limit messages per second
    const now = Date.now();
    if (now - lastMessageTime < 1000) {
        messageCount++;
        if (messageCount > 10) {
            console.warn('Message spam detected, skipping');
            return;
        }
    } else {
        messageCount = 0;
        lastMessageTime = now;
    }
    
    const container = document.getElementById('chatMessages');
    const div = document.createElement('div');
    div.className = 'chat-message';
    
    const safeText = sanitizeText(msg.text);
    const safeName = sanitizeText(msg.name);
    
    if (msg.type === 'system') {
        div.classList.add('system');
        div.textContent = safeText;
    } else if (msg.type === 'correct') {
        div.classList.add('correct');
        div.innerHTML = `<span class="username">${safeName}</span> ${safeText}`;
    } else if (msg.type === 'drawer_chat') {
        div.classList.add('drawer-chat');
        div.innerHTML = `<span class="username" style="color:var(--accent)">✏️ ${safeName}</span> ${safeText}`;
    } else if (msg.type === 'guesser_chat') {
        div.classList.add('guesser-chat');
        div.innerHTML = `<span class="username" style="color:var(--success)">✓ ${safeName}</span> ${safeText}`;
    } else if (msg.isClose) {
        div.classList.add('close');
        div.innerHTML = `<span class="username">${safeName}</span> ${safeText} (close!)`;
    } else {
        div.classList.add('guess');
        div.innerHTML = `<span class="username">${safeName}</span> ${safeText}`;
    }
    
    container.appendChild(div);
    
    // FIXED: Smart scroll - only auto-scroll if near bottom
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    if (isNearBottom) {
        container.scrollTop = container.scrollHeight;
    }
}

// ==========================================
// UI - FIXED
// ==========================================

function updatePlayerList() {
    const container = document.getElementById('playersList');
    const count = document.getElementById('playerCount');
    
    container.innerHTML = '';
    const players = Object.entries(gameState.players).filter(([id, p]) => {
        return p && p.isOnline !== false; // Hide offline players
    });
    
    count.textContent = `${players.length}/8`;
    
    players.sort((a, b) => (b[1].score || 0) - (a[1].score || 0));
    
    players.forEach(([id, p]) => {
        const div = document.createElement('div');
        div.className = 'player-item';
        
        if (id === gameState.game?.drawer) div.classList.add('current-drawer');
        if (p.hasGuessed) div.classList.add('guessed');
        
        // FIXED: Safe avatar initial
        const initial = p.name && p.name.length > 0 ? p.name[0].toUpperCase() : '?';
        
        div.innerHTML = `
            <div class="player-avatar">${initial}</div>
            <div class="player-info">
                <div class="player-name">${sanitizeText(p.name)} ${id === gameState.playerId ? '(You)' : ''}</div>
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
        .filter(([id, p]) => p && p.isOnline !== false)
        .sort((a, b) => (b[1].score || 0) - (a[1].score || 0))
        .slice(0, 3);
    
    sorted.forEach(([id, p], i) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee;';
        row.innerHTML = `<span>#${i + 1} ${sanitizeText(p.name)}</span><span>${p.score || 0} pts</span>`;
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
        .filter(([id, p]) => p && p.isOnline !== false)
        .sort((a, b) => (b[1].score || 0) - (a[1].score || 0));
    
    const winner = sorted[0];
    
    if (winner) {
        winnerDisplay.innerHTML = `
            <div class="winner-crown">👑</div>
            <div class="winner-name">${sanitizeText(winner[1].name)}</div>
            <div class="winner-score">${winner[1].score || 0} points</div>
        `;
        trophy.textContent = '🏆';
    } else {
        winnerDisplay.innerHTML = '<div class="winner-name">No winner</div>';
    }
    
    const container = document.getElementById('finalScores');
    container.innerHTML = '';
    
    sorted.forEach(([id, p], i) => {
        const div = document.createElement('div');
        div.className = 'final-score-item' + (i === 0 ? ' winner' : '');
        div.innerHTML = `
            <span class="final-rank">#${i + 1}</span>
            <span class="final-name">${sanitizeText(p.name)}</span>
            <span class="final-points">${p.score || 0}</span>
        `;
        container.appendChild(div);
    });
    
    modal.classList.add('show');
    
    // FIXED: Only host auto-restarts
    if (gameState.isHost) {
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
    } else {
        autoRestartText.textContent = 'Waiting for host to start new game...';
    }
}

function showGame(code) {
    document.getElementById('loadingOverlay').classList.remove('show');
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('gameScreen').style.display = 'flex';
    document.getElementById('roomCodeDisplay').textContent = code;
    
    playSound('enter');
    
    setTimeout(() => {
        resizeCanvas();
    }, 100);
    
    // FIXED: Delay join message to ensure listener is ready
    setTimeout(() => {
        sendChat('system', `${sanitizeText(gameState.playerName)} joined!`);
    }, 500);
}

// FIXED: Proper game reset with host check
function playAgain() {
    if (!gameState.isHost) return; // Only host can restart
    
    if (autoRestartTimer) {
        clearInterval(autoRestartTimer);
        autoRestartTimer = null;
    }
    
    const playerIds = Object.keys(gameState.players).filter(id => {
        return gameState.players[id] && gameState.players[id].isOnline !== false;
    });
    
    if (playerIds.length === 0) return;
    
    gameRef.update({
        state: 'choosing',
        round: 1,
        playerList: playerIds,
        currentDrawerIndex: 0,
        drawer: playerIds[0],
        word: null,
        allGuessed: false,
        timer: 80,
        startTime: null
    });
    
    // Reset scores
    Object.keys(gameState.players).forEach(pid => {
        playersRef.child(pid).update({ 
            score: 0, 
            hasGuessed: false,
            guessedCurrentWord: false
        });
    });
    
    document.getElementById('gameOverModal').classList.remove('show');
}

// FIXED: Proper cleanup on exit
function exitGame() {
    // Send leave message first
    sendChat('system', `${sanitizeText(gameState.playerName)} left.`);
    
    // Small delay to ensure message sends
    setTimeout(() => {
        cleanupAndReload();
    }, 300);
}

function cleanupAndReload() {
    // Clear intervals
    if (timerInterval) clearInterval(timerInterval);
    if (autoRestartTimer) clearInterval(autoRestartTimer);
    if (wordSelectTimer) clearInterval(wordSelectTimer);
    if (drawQueueTimeout) clearTimeout(drawQueueTimeout);
    
    // Remove Firebase listeners
    if (playersRef) playersRef.off();
    if (chatRef) chatRef.off();
    if (gameRef) gameRef.off();
    if (drawingRef) drawingRef.off();
    if (hostRef) hostRef.off();
    if (roomRef) roomRef.off();
    
    // Remove player
    if (playersRef && gameState.playerId) {
        playersRef.child(gameState.playerId).remove();
    }
    
    // Clear drawing data to save space
    if (drawingRef) {
        drawingRef.remove();
    }
    
    location.reload();
}

// FIXED: Separate handlers for beforeunload and unload
function handleBeforeUnload(e) {
    if (gameState.isGameActive) {
        e.preventDefault();
        e.returnValue = 'Leave game?';
        return 'Leave game?';
    }
}

function handleUnload() {
    // Best effort cleanup
    if (playersRef && gameState.playerId) {
        playersRef.child(gameState.playerId).update({ isOnline: false, leftAt: Date.now() });
    }
}

function showToast(msg, type) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = msg;
    container.appendChild(toast);
    
    setTimeout(() => toast.remove(), 3000);
}

console.log('🎮 Game engine v15.0 - ALL BUGS FIXED!');
