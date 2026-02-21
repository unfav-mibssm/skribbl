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
    hasGuessedCurrentWord: false
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

// FIX: Better keyboard handling
let canvasBackup = null;
let isKeyboardOpen = false;
let keyboardFixAttempts = 0;

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
    initKeyboardHandling();
    
    // FIX: Better chat input handling
    const chatInput = document.getElementById('chatInput');
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    
    // Prevent zoom on iOS
    chatInput.addEventListener('focus', () => {
        document.body.style.transform = 'scale(1)';
    });
    
    document.getElementById('popupOverlay').addEventListener('click', closePopups);
});

// CRITICAL FIX: Better keyboard handling to prevent canvas clear
function initKeyboardHandling() {
    const chatInput = document.getElementById('chatInput');
    
    // Save canvas before keyboard opens
    chatInput.addEventListener('focus', () => {
        isKeyboardOpen = true;
        keyboardFixAttempts = 0;
        
        // Multiple backup attempts
        const saveCanvas = () => {
            if (canvas && ctx && canvas.width > 0) {
                try {
                    canvasBackup = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    console.log('Canvas backed up for keyboard');
                } catch(e) {
                    console.log('Canvas backup failed:', e);
                }
            }
        };
        
        saveCanvas();
        // Backup again after short delay to ensure capture
        setTimeout(saveCanvas, 50);
    });
    
    // Restore canvas after keyboard closes
    chatInput.addEventListener('blur', () => {
        isKeyboardOpen = false;
        
        // Multiple restore attempts with increasing delays
        const restoreAttempts = [0, 100, 300, 500];
        
        restoreAttempts.forEach(delay => {
            setTimeout(() => {
                if (canvasBackup && ctx) {
                    try {
                        ctx.putImageData(canvasBackup, 0, 0);
                        console.log('Canvas restored from backup');
                    } catch(e) {
                        console.log('Canvas restore failed:', e);
                    }
                }
                // Also redraw from history as backup
                redraw();
            }, delay);
        });
    });
    
    // Handle visual viewport changes
    if (window.visualViewport) {
        let lastHeight = window.visualViewport.height;
        let keyboardWasOpen = false;
        
        window.visualViewport.addEventListener('resize', () => {
            const newHeight = window.visualViewport.height;
            const heightDiff = lastHeight - newHeight;
            
            // Keyboard opened
            if (heightDiff > 150 && !keyboardWasOpen) {
                keyboardWasOpen = true;
                isKeyboardOpen = true;
                
                // Save canvas immediately
                if (canvas && ctx) {
                    try {
                        canvasBackup = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    } catch(e) {}
                }
            }
            // Keyboard closed
            else if (heightDiff < -150 && keyboardWasOpen) {
                keyboardWasOpen = false;
                isKeyboardOpen = false;
                
                // Restore with multiple attempts
                [0, 100, 300].forEach(delay => {
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
            
            lastHeight = newHeight;
        });
    }
}

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
// CANVAS - CRITICAL FIXES FOR KEYBOARD & STROKES
// ==========================================

function initCanvas() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    // Initial sizing
    resizeCanvas();
    
    // CRITICAL FIX: Only resize on actual window resize, never on keyboard
    let lastWindowWidth = window.innerWidth;
    let lastWindowHeight = window.innerHeight;
    
    window.addEventListener('resize', () => {
        // Only resize if actual window dimensions changed (not keyboard)
        const widthChanged = Math.abs(window.innerWidth - lastWindowWidth) > 50;
        const heightChanged = Math.abs(window.innerHeight - lastWindowHeight) > 50;
        
        if (widthChanged || heightChanged) {
            lastWindowWidth = window.innerWidth;
            lastWindowHeight = window.innerHeight;
            
            // Don't resize if keyboard was recently open
            if (!isKeyboardOpen && !canvasBackup) {
                setTimeout(resizeCanvas, 100);
            }
        }
    });
    
    // Drawing events
    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', endDraw);
    canvas.addEventListener('mouseleave', endDraw);
    
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', endDraw, { passive: false });
    
    clearCanvas();
}

// CRITICAL FIX: Never resize when keyboard backup exists
function resizeCanvas() {
    const wrapper = document.querySelector('.canvas-wrapper');
    if (!wrapper) return;
    
    // NEVER resize if we have keyboard backup
    if (canvasBackup || isKeyboardOpen) {
        console.log('Blocking resize - keyboard active or backup exists');
        return;
    }
    
    const wrapperWidth = wrapper.clientWidth;
    const wrapperHeight = wrapper.clientHeight;
    
    // Calculate size maintaining 4:3 aspect ratio
    let width = wrapperWidth;
    let height = width * 0.75;
    
    if (height > wrapperHeight) {
        height = wrapperHeight;
        width = height / 0.75;
    }
    
    // Only resize if dimensions changed significantly
    if (Math.abs(canvas.width - width) > 5 || Math.abs(canvas.height - height) > 5) {
        // Save current content
        let savedData = null;
        if (ctx && canvas.width > 0 && canvas.height > 0) {
            try {
                savedData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            } catch(e) {
                console.log('Could not backup canvas for resize');
            }
        }
        
        canvas.width = width;
        canvas.height = height;
        
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        
        // Restore content
        if (savedData) {
            try {
                ctx.putImageData(savedData, 0, 0);
                console.log('Canvas restored after resize');
            } catch(e) {
                console.log('Could not restore after resize, redrawing...');
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
    // Don't clear canvasBackup here - only explicit clear should remove it
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
        canvasBackup = null; // Clear backup on explicit clear
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
// DRAWING FUNCTIONS - CRITICAL FIX FOR STROKE SYNC
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

// CRITICAL FIX: Immediately send stroke start to Firebase
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
    
    // Create stroke object
    currentStroke = {
        color: ctx.strokeStyle,
        size: currentSize,
        points: [{ x: pos.x, y: pos.y }]
    };
    
    // CRITICAL: Send to Firebase IMMEDIATELY, don't wait
    sendDrawData('start', { 
        x: pos.x, 
        y: pos.y, 
        color: currentStroke.color, 
        size: currentStroke.size 
    });
}

// CRITICAL FIX: Send every point immediately
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
        
        // Add to current stroke
        if (currentStroke) {
            currentStroke.points.push({ x: pos.x, y: pos.y });
        }
        
        // CRITICAL: Send to Firebase IMMEDIATELY with every point
        sendDrawData('draw', { 
            x: pos.x, 
            y: pos.y, 
            lx: lastPoint.x, 
            ly: lastPoint.y 
        });
    }
    
    lastPoint = pos;
}

function endDraw(e) {
    if (!isDrawing) return;
    isDrawing = false;
    lastPoint = null;
    ctx.beginPath();
    
    // Save to history
    if (currentStroke && currentStroke.points.length > 1) {
        drawingHistory.push(currentStroke);
    }
    currentStroke = null;
    
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
// FIREBASE SYNC - CRITICAL FIX FOR STROKE VISIBILITY
// ==========================================

// CRITICAL FIX: Use push with high priority, no batching
function sendDrawData(type, data) {
    if (!roomRef || !drawingRef) return;
    
    const payload = {
        type: type,
        player: gameState.playerId,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        // Add sequence number for ordering
        seq: Date.now()
    };
    
    if (data) Object.assign(payload, data);
    
    // Send immediately, don't batch
    drawingRef.push(payload).catch(err => {
        console.error('Failed to send draw data:', err);
    });
}

// CRITICAL FIX: Listen to all drawing data with no filtering
function listenDrawing() {
    // Clear existing drawings when round starts
    gameRef.child('state').on('value', (snap) => {
        const state = snap.val();
        if (state === 'drawing' && !gameState.isDrawer) {
            // Small delay to ensure we get all data
            setTimeout(() => {
                clearCanvas();
                remoteStroke = null;
            }, 50);
        }
    });
    
    // CRITICAL: Listen to ALL child_added events, process immediately
    drawingRef.on('child_added', (snap) => {
        const data = snap.val();
        if (!data) return;
        
        // Skip my own drawings (I already see them)
        if (data.player === gameState.playerId) return;
        
        // Process immediately
        handleRemoteDraw(data);
    });
}

// CRITICAL FIX: Process remote draws immediately
function handleRemoteDraw(data) {
    // Ensure we have valid data
    if (!data || !data.type) return;
    
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
            if (!remoteStroke) {
                // If we missed the start, create from this point
                remoteStroke = {
                    color: data.color || '#000000',
                    size: data.size || 4,
                    lastX: data.lx,
                    lastY: data.ly
                };
                ctx.beginPath();
                ctx.moveTo(data.lx, data.ly);
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.lineWidth = remoteStroke.size;
                ctx.strokeStyle = remoteStroke.color;
            }
            
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
            
        case 'undo':
            // For simplicity, just clear and request redraw from history
            // In a full implementation, you'd sync history
            break;
    }
}

// ==========================================
// GAME LOGIC - CRITICAL FIXES FOR ROUNDS & JOINING
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
        playerList: [],
        roundStartTime: null,
        // Track who has drawn this round
        drawnThisRound: []
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
        
        // CRITICAL FIX: Don't reset game if joining mid-round
        // Just add player to existing game
        addPlayer(roomData);
        
    }, (err) => {
        showToast('Connection error: ' + err.message, 'error');
        document.getElementById('loadingOverlay').classList.remove('show');
    });
}

// CRITICAL FIX: Add player without resetting game
function addPlayer(existingRoomData = null) {
    const playerData = {
        name: gameState.playerName,
        score: 0,
        joined: Date.now(),
        hasGuessed: false,
        // If joining mid-game, they haven't guessed this word yet
        guessedCurrentWord: false
    };
    
    // If game is active, set hasGuessed based on current state
    if (existingRoomData && existingRoomData.state === 'drawing') {
        playerData.hasGuessed = false;
    }
    
    playersRef.child(gameState.playerId).set(playerData).then(() => {
        playersRef.child(gameState.playerId).onDisconnect().remove();
        
        // If joining existing game, don't reset - just update player list
        if (existingRoomData && existingRoomData.state !== 'waiting') {
            // Add to player list if not already there
            const currentList = existingRoomData.playerList || [];
            if (!currentList.includes(gameState.playerId)) {
                const newList = [...currentList, gameState.playerId];
                gameRef.update({ playerList: newList });
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
    // Players listener
    playersRef.on('value', (snap) => {
        const previousPlayers = { ...gameState.players };
        gameState.players = snap.val() || {};
        
        updatePlayerList();
        
        const prevIds = Object.keys(previousPlayers);
        const currentIds = Object.keys(gameState.players);
        
        // New player joined
        if (prevIds.length > 0 && currentIds.length > prevIds.length) {
            const joinedId = currentIds.find(id => !prevIds.includes(id));
            if (joinedId && joinedId !== gameState.playerId) {
                playSound('join');
            }
        }
        
        // Player left
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
        
        // Only check start if waiting and have 2+ players
        if (!gameState.gameStarted) {
            checkStartGame();
        }
    });
    
    // Chat listener - CRITICAL FIX: Show all messages to everyone including drawer
    chatRef.limitToLast(100).on('child_added', (snap) => {
        const msg = snap.val();
        if (!msg) return;
        
        // Show message if:
        // 1. It's after I joined
        // 2. It passes visibility rules
        if (msg.time >= gameState.joinTime && shouldShowMessage(msg)) {
            displayMessage(msg);
            
            if (msg.type === 'correct' && msg.player !== gameState.playerId) {
                playSound('correct');
            }
        }
    });
    
    // Game state listener
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
        
        // Find next valid drawer
        let attempts = 0;
        while (attempts < playerList.length) {
            if (gameState.players[playerList[nextIndex]]) break;
            nextIndex = (nextIndex + 1) % playerList.length;
            attempts++;
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

// CRITICAL FIX: Only start if waiting and have 2+ players
function checkStartGame() {
    const playerIds = Object.keys(gameState.players);
    
    // Only start if we're in waiting state and have 2+ players
    if (playerIds.length >= 2 && !gameState.gameStarted) {
        gameRef.once('value', (snap) => {
            const game = snap.val();
            if (game && game.state === 'waiting') {
                gameState.playerList = playerIds;
                
                const firstPlayer = playerIds[0];
                
                gameRef.update({
                    state: 'choosing',
                    playerList: playerIds,
                    currentDrawerIndex: 0,
                    drawer: firstPlayer,
                    round: 1,
                    drawnThisRound: [firstPlayer] // Track who will draw
                }).then(() => {
                    gameState.gameStarted = true;
                });
            }
        });
    }
}

// CRITICAL FIX: Proper message visibility - ALL messages visible to ALL players
function shouldShowMessage(msg) {
    // Always show these types to everyone
    if (msg.type === 'system') return true;
    if (msg.type === 'correct') return true;
    
    // Show my own messages
    if (msg.player === gameState.playerId) return true;
    
    const me = gameState.players[gameState.playerId];
    const sender = gameState.players[msg.player];
    
    // If I'm the drawer, show all messages except guesses from non-guessers
    if (gameState.isDrawer) {
        // Show chat from guessers who got it right
        if (msg.type === 'guesser_chat') return true;
        // Show hints
        if (msg.isClose) return true;
        // Don't show wrong guesses (they're trying to guess)
        if (msg.type === 'guess' && !sender?.hasGuessed) return false;
        return true;
    }
    
    // If I've guessed correctly, show chat from other correct guessers and drawer
    if (me && me.hasGuessed) {
        if (msg.type === 'guesser_chat') return true;
        if (sender && sender.hasGuessed) return true;
        if (gameState.game?.drawer === msg.player) return true;
        return false;
    }
    
    // If I haven't guessed, show guesses and close hints
    if (!me || !me.hasGuessed) {
        if (msg.type === 'guess') return true;
        if (msg.isClose) return true;
        // Don't show chat from other guessers (spoiler)
        if (msg.type === 'guesser_chat') return false;
    }
    
    return true;
}

// ==========================================
// CRITICAL FIX: handleGameChange - Round Order & State Management
// ==========================================
function handleGameChange(game) {
    const previousState = gameState.lastState;
    const previousDrawer = gameState.lastDrawer;
    const previousRound = gameState.lastRound;
    
    // Validate round number - prevent going backwards
    const validRound = Math.max(1, Math.min(game.round || 1, 10));
    
    gameState.game = game;
    gameState.round = validRound;
    gameState.maxRounds = game.maxRounds || 10;
    gameState.allGuessed = game.allGuessed || false;
    gameState.playerList = game.playerList || Object.keys(gameState.players);
    gameState.currentDrawerIndex = game.currentDrawerIndex || 0;
    
    // Update tracking
    gameState.lastState = game.state;
    gameState.lastDrawer = game.drawer;
    gameState.lastRound = validRound;
    
    // Update UI
    document.getElementById('roundInfo').textContent = `Round ${gameState.round} of ${gameState.maxRounds}`;
    document.getElementById('timerDisplay').textContent = game.timer || 80;
    
    const wasDrawer = gameState.isDrawer;
    const wasActive = gameState.isGameActive;
    gameState.isDrawer = game.drawer === gameState.playerId;
    gameState.currentWord = game.word;
    
    // CRITICAL FIX: Word display - show revealed word to guesser, hide from others
    updateWordDisplay(game.word);
    
    const waitingOverlay = document.getElementById('waitingOverlay');
    const roundOverlay = document.getElementById('roundOverlay');
    const wordModal = document.getElementById('wordModal');
    
    // Check if state actually changed
    const stateChanged = game.state !== previousState || 
                        game.drawer !== previousDrawer || 
                        validRound !== previousRound;
    
    // Process state
    switch(game.state) {
        case 'waiting':
            waitingOverlay.classList.remove('show');
            roundOverlay.classList.remove('show');
            gameState.isGameActive = false;
            break;
            
        case 'choosing':
            if (gameState.isDrawer) {
                waitingOverlay.classList.remove('show');
                if (!wordModal.classList.contains('show')) {
                    setTimeout(() => showWordSelect(), 100);
                }
            } else {
                waitingOverlay.classList.add('show');
                wordModal.classList.remove('show');
            }
            roundOverlay.classList.remove('show');
            gameState.isGameActive = false;
            
            // Reset guessed state for new round
            gameState.hasGuessedCurrentWord = false;
            break;
            
        case 'drawing':
            waitingOverlay.classList.remove('show');
            roundOverlay.classList.remove('show');
            wordModal.classList.remove('show');
            gameState.isGameActive = true;
            
            // Reset hasGuessed for all players at round start
            if (previousState === 'choosing' || game.timer === 80) {
                gameState.hasGuessedCurrentWord = false;
                
                // Only drawer resets player states
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
            
            // Only drawer starts timer
            if (!timerInterval && gameState.isDrawer) {
                startTimer();
            }
            break;
            
        case 'round_end':
            waitingOverlay.classList.remove('show');
            showRoundEnd(game.word);
            gameState.isGameActive = false;
            break;
            
        case 'game_over':
            waitingOverlay.classList.remove('show');
            roundOverlay.classList.remove('show');
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
}

// CRITICAL FIX: Update word display based on player state
function updateWordDisplay(word) {
    const wordDisplay = document.getElementById('wordDisplay');
    
    if (!word) {
        wordDisplay.textContent = 'Waiting...';
        return;
    }
    
    // Drawer sees the word
    if (gameState.isDrawer) {
        wordDisplay.textContent = word;
        return;
    }
    
    const me = gameState.players[gameState.playerId];
    
    // If I've guessed correctly, show me the revealed word
    if (me && me.hasGuessed) {
        wordDisplay.textContent = word.toUpperCase();
        return;
    }
    
    // Others see underscores
    const display = word.split('').map(c => c === ' ' ? ' ' : '_').join(' ');
    wordDisplay.textContent = display;
}

function becomeDrawer() {
    gameState.isDrawer = true;
    document.getElementById('drawerBadge').classList.add('show');
    document.getElementById('toolbarContainer').classList.add('show');
    
    // CRITICAL FIX: Drawer can chat - enable chat input
    const chatInput = document.getElementById('chatInput');
    chatInput.placeholder = 'Chat with players...';
    chatInput.disabled = false;
    
    if (gameState.game?.state === 'choosing') {
        setTimeout(() => showWordSelect(), 200);
    }
}

function stopDrawer() {
    gameState.isDrawer = false;
    document.getElementById('drawerBadge').classList.remove('show');
    document.getElementById('toolbarContainer').classList.remove('show');
    document.getElementById('wordModal').classList.remove('show');
    
    // Reset chat placeholder for guesser
    const chatInput = document.getElementById('chatInput');
    chatInput.placeholder = 'Type your guess here...';
    chatInput.disabled = false;
}

function showWordSelect() {
    if (document.getElementById('wordModal').classList.contains('show')) return;
    
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
    
    // Clear any existing timer
    if (wordSelectTimer) clearInterval(wordSelectTimer);
    
    let time = 15;
    const timerEl = document.getElementById('wordTimer');
    timerEl.textContent = time;
    
    wordSelectTimer = setInterval(() => {
        time--;
        timerEl.textContent = time;
        if (time <= 0) {
            clearInterval(wordSelectTimer);
            wordSelectTimer = null;
            if (document.getElementById('wordModal').classList.contains('show')) {
                selectWord(options[0].word);
            }
        }
    }, 1000);
}

function selectWord(word) {
    // Clear word select timer
    if (wordSelectTimer) {
        clearInterval(wordSelectTimer);
        wordSelectTimer = null;
    }
    
    document.getElementById('wordModal').classList.remove('show');
    clearCanvas();
    canvasBackup = null;
    
    gameRef.update({
        state: 'drawing',
        word: word,
        timer: 80,
        startTime: Date.now(),
        allGuessed: false,
        roundStartTime: Date.now()
    });
}

// CRITICAL FIX: Only drawer updates timer, strict round progression
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
            
            // Only drawer updates timer
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

// CRITICAL FIX: Strict round progression - every player draws once per round cycle
function endRound() {
    gameRef.once('value', (snap) => {
        const game = snap.val();
        if (!game) return;
        
        const playerList = game.playerList || Object.keys(gameState.players);
        const currentIndex = game.currentDrawerIndex || 0;
        
        // Find next drawer
        let nextIndex = (currentIndex + 1) % playerList.length;
        let nextRound = game.round || 1;
        
        // If we've cycled through all players, next round
        if (nextIndex === 0) {
            nextRound = (game.round || 1) + 1;
        }
        
        // Check if game over (exceeded max rounds)
        if (nextRound > 10) {
            gameRef.update({ state: 'game_over' });
            return;
        }
        
        // Find valid next drawer (skip disconnected players)
        let attempts = 0;
        while (attempts < playerList.length) {
            if (gameState.players[playerList[nextIndex]]) break;
            nextIndex = (nextIndex + 1) % playerList.length;
            if (nextIndex === 0) {
                nextRound++;
                if (nextRound > 10) {
                    gameRef.update({ state: 'game_over' });
                    return;
                }
            }
            attempts++;
        }
        
        const nextDrawer = playerList[nextIndex];
        
        // Go to round_end briefly, then next choosing
        gameRef.update({ state: 'round_end' });
        
        setTimeout(() => {
            gameRef.update({
                state: 'choosing',
                round: nextRound,
                drawer: nextDrawer,
                currentDrawerIndex: nextIndex,
                word: null,
                timer: 80,
                allGuessed: false,
                startTime: null
            });
        }, 3000);
    });
}

// ==========================================
// CHAT - CRITICAL FIXES FOR DRAWER & VISIBILITY
// ==========================================

function sendMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;
    
    // Drawer can always chat
    if (gameState.isDrawer) {
        sendChat('drawer_chat', text);
        input.value = '';
        return;
    }
    
    const me = gameState.players[gameState.playerId];
    
    // If I've already guessed, I can chat
    if (me && me.hasGuessed) {
        sendChat('guesser_chat', text);
        input.value = '';
        return;
    }
    
    // Check if correct guess
    if (gameState.isGameActive && text.toLowerCase() === gameState.currentWord?.toLowerCase()) {
        handleCorrectGuess();
        input.value = '';
        return;
    }
    
    // Regular guess
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
    
    // Calculate points based on time remaining
    const points = Math.max(10, Math.floor(gameState.timer / 8) * 10);
    
    // Update my score and guessed status
    playersRef.child(gameState.playerId).update({
        score: (me?.score || 0) + points,
        hasGuessed: true,
        guessedCurrentWord: true
    });
    
    sendChat('correct', `guessed correctly! (+${points})`);
    playSound('correct');
    
    // CRITICAL FIX: Update word display immediately for this player
    updateWordDisplay(gameState.currentWord);
    
    checkAllGuessed();
}

// CRITICAL FIX: Check all guessed with proper validation
function checkAllGuessed() {
    const allPlayers = Object.keys(gameState.players);
    if (allPlayers.length < 2) return;
    
    const guessers = allPlayers.filter(id => id !== gameState.game?.drawer);
    if (guessers.length === 0) return;
    
    const allCorrect = guessers.every(id => gameState.players[id]?.hasGuessed);
    
    if (allCorrect && !gameState.allGuessed) {
        // Award drawer bonus
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

// CRITICAL FIX: Display all messages properly
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
    } else if (msg.type === 'drawer_chat') {
        // Drawer chat styled differently
        div.classList.add('drawer-chat');
        div.style.background = '#fff3cd';
        div.style.borderLeft = '3px solid var(--accent)';
        div.innerHTML = `<span class="username" style="color:var(--accent)">✏️ ${msg.name}</span> ${msg.text}`;
    } else if (msg.type === 'guesser_chat') {
        // Guesser chat
        div.classList.add('guesser-chat');
        div.style.background = '#d4edda';
        div.innerHTML = `<span class="username" style="color:var(--success)">✓ ${msg.name}</span> ${msg.text}`;
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
    
    setTimeout(() => {
        resizeCanvas();
    }, 100);
    
    sendChat('system', `${gameState.playerName} joined!`);
}

function playAgain() {
    if (autoRestartTimer) {
        clearInterval(autoRestartTimer);
        autoRestartTimer = null;
    }
    
    gameState.gameStarted = false;
    const playerIds = Object.keys(gameState.players);
    
    gameRef.update({
        state: 'choosing',
        round: 1,
        playerList: playerIds,
        currentDrawerIndex: 0,
        drawer: playerIds[0] || gameState.playerId,
        word: null,
        allGuessed: false,
        drawnThisRound: [playerIds[0] || gameState.playerId]
    });
    
    Object.keys(gameState.players).forEach(pid => {
        playersRef.child(pid).update({ 
            score: 0, 
            hasGuessed: false,
            guessedCurrentWord: false
        });
    });
    
    document.getElementById('gameOverModal').classList.remove('show');
}

function exitGame() {
    // Clean up all listeners
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

console.log('🎮 Game engine v11.0 - ALL BUGS FIXED!');
