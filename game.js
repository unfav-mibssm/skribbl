// ==========================================
// SKRIBBL.IO GAME ENGINE
// Complete game logic with Firebase
// ==========================================

// Game State
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
    isGameActive: false
};

// Canvas Variables
let canvas, ctx;
let isDrawing = false;
let currentTool = 'brush';
let currentColor = '#000000';
let currentSize = 4;
let drawingHistory = [];
let undoStack = [];

// Firebase References
let roomRef, playersRef, chatRef, drawingRef, gameRef;

// Color Palette
const colors = [
    '#000000', '#2c3e50', '#8e44ad', '#c0392b', '#d35400',
    '#f39c12', '#f1c40f', '#2ecc71', '#1abc9c', '#3498db',
    '#2980b9', '#9b59b6', '#e74c3c', '#e67e22', '#f39c12',
    '#27ae60', '#16a085', '#34495e', '#95a5a6', '#ecf0f1',
    '#ffffff', '#795548', '#ff6b6b', '#4ecdc4', '#45b7d1'
];

// Brush Sizes
const brushSizes = [
    { size: 2, label: 'Small' },
    { size: 4, label: 'Medium' },
    { size: 8, label: 'Large' },
    { size: 16, label: 'Huge' },
    { size: 32, label: 'Giant' }
];

// ==========================================
// INITIALIZATION
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    initializeCanvas();
    initializeColorPicker();
    initializeSizePicker();
    initializeToolbar();
    
    // Enter key for chat
    document.getElementById('chatInput').addEventListener('keypress', handleChat);
    
    // Close popups when clicking overlay
    document.getElementById('popupOverlay').addEventListener('click', closePopups);
});

function initializeCanvas() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    
    // Set canvas size
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Drawing events
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);
    
    // Touch events for mobile
    canvas.addEventListener('touchstart', handleTouch);
    canvas.addEventListener('touchmove', handleTouch);
    canvas.addEventListener('touchend', stopDrawing);
    
    // Fill white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function resizeCanvas() {
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    
    // Restore white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function initializeColorPicker() {
    const colorGrid = document.getElementById('colorGrid');
    const colorPreview = document.getElementById('colorPreview');
    
    colors.forEach((color, index) => {
        const colorDiv = document.createElement('div');
        colorDiv.className = 'color-option';
        colorDiv.style.backgroundColor = color;
        colorDiv.dataset.color = color;
        
        if (index === 0) colorDiv.classList.add('selected');
        
        colorDiv.addEventListener('click', () => {
            document.querySelectorAll('.color-option').forEach(c => c.classList.remove('selected'));
            colorDiv.classList.add('selected');
            currentColor = color;
            colorPreview.style.backgroundColor = color;
            currentTool = 'brush';
            updateToolButtons();
            closePopups();
        });
        
        colorGrid.appendChild(colorDiv);
    });
    
    // Custom color picker
    document.getElementById('customColor').addEventListener('change', (e) => {
        currentColor = e.target.value;
        colorPreview.style.backgroundColor = currentColor;
        currentTool = 'brush';
        updateToolButtons();
    });
    
    colorPreview.style.backgroundColor = currentColor;
}

function initializeSizePicker() {
    const sizeOptions = document.getElementById('sizeOptions');
    const sizeIcon = document.getElementById('sizeIcon');
    
    brushSizes.forEach((brush, index) => {
        const sizeDiv = document.createElement('div');
        sizeDiv.className = 'size-option';
        if (index === 1) sizeDiv.classList.add('selected');
        
        const line = document.createElement('div');
        line.className = 'size-line';
        line.style.width = '60px';
        line.style.height = brush.size + 'px';
        
        const label = document.createElement('span');
        label.className = 'size-label';
        label.textContent = brush.label;
        
        sizeDiv.appendChild(line);
        sizeDiv.appendChild(label);
        
        sizeDiv.addEventListener('click', () => {
            document.querySelectorAll('.size-option').forEach(s => s.classList.remove('selected'));
            sizeDiv.classList.add('selected');
            currentSize = brush.size;
            
            // Update size icon
            const iconSize = Math.min(brush.size * 3, 20);
            sizeIcon.style.fontSize = iconSize + 'px';
            
            closePopups();
        });
        
        sizeOptions.appendChild(sizeDiv);
    });
}

function initializeToolbar() {
    // Color button
    document.getElementById('colorBtn').addEventListener('click', () => {
        togglePopup('colorPopup');
    });
    
    // Size button
    document.getElementById('sizeBtn').addEventListener('click', () => {
        togglePopup('sizePopup');
    });
    
    // Brush button
    document.getElementById('brushBtn').addEventListener('click', () => {
        currentTool = 'brush';
        updateToolButtons();
    });
    
    // Eraser button
    document.getElementById('eraserBtn').addEventListener('click', () => {
        currentTool = 'eraser';
        updateToolButtons();
    });
    
    // Undo button
    document.getElementById('undoBtn').addEventListener('click', undoLastStroke);
    
    // Clear button
    document.getElementById('clearBtn').addEventListener('click', clearCanvas);
}

function updateToolButtons() {
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
    
    if (currentTool === 'brush') {
        document.getElementById('brushBtn').classList.add('active');
    } else if (currentTool === 'eraser') {
        document.getElementById('eraserBtn').classList.add('active');
    }
}

function togglePopup(popupId) {
    const popup = document.getElementById(popupId);
    const overlay = document.getElementById('popupOverlay');
    
    if (popup.classList.contains('show')) {
        closePopups();
    } else {
        closePopups();
        popup.classList.add('show');
        overlay.classList.add('show');
    }
}

function closePopups() {
    document.querySelectorAll('.popup').forEach(p => p.classList.remove('show'));
    document.getElementById('popupOverlay').classList.remove('show');
}

// ==========================================
// DRAWING FUNCTIONS
// ==========================================

function getCoordinates(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    
    return {
        x: clientX - rect.left,
        y: clientY - rect.top
    };
}

function startDrawing(e) {
    if (!gameState.isDrawer || !gameState.isGameActive) return;
    
    isDrawing = true;
    const coords = getCoordinates(e);
    
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    
    // Start new stroke
    const stroke = {
        color: currentTool === 'eraser' ? '#ffffff' : currentColor,
        size: currentSize,
        points: [{ x: coords.x, y: coords.y }]
    };
    
    drawingHistory.push(stroke);
    
    // Send to Firebase
    sendDrawingData('start', coords, stroke.color, stroke.size);
}

function draw(e) {
    if (!isDrawing || !gameState.isDrawer) return;
    e.preventDefault();
    
    const coords = getCoordinates(e);
    
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = currentSize;
    ctx.strokeStyle = currentTool === 'eraser' ? '#ffffff' : currentColor;
    
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
    
    // Add to current stroke
    if (drawingHistory.length > 0) {
        drawingHistory[drawingHistory.length - 1].points.push({ x: coords.x, y: coords.y });
    }
    
    // Send to Firebase (throttled in real implementation)
    sendDrawingData('draw', coords);
}

function stopDrawing() {
    if (!isDrawing) return;
    isDrawing = false;
    ctx.beginPath();
    sendDrawingData('end');
}

function handleTouch(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent(e.type === 'touchstart' ? 'mousedown' : 'mousemove', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    canvas.dispatchEvent(mouseEvent);
}

function undoLastStroke() {
    if (!gameState.isDrawer || drawingHistory.length === 0) return;
    
    undoStack.push(drawingHistory.pop());
    redrawCanvas();
    sendDrawingData('undo');
}

function clearCanvas() {
    if (!gameState.isDrawer) return;
    
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    undoStack = [...undoStack, ...drawingHistory];
    drawingHistory = [];
    sendDrawingData('clear');
}

function redrawCanvas() {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    drawingHistory.forEach(stroke => {
        ctx.beginPath();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = stroke.size;
        ctx.strokeStyle = stroke.color;
        
        stroke.points.forEach((point, index) => {
            if (index === 0) {
                ctx.moveTo(point.x, point.y);
            } else {
                ctx.lineTo(point.x, point.y);
            }
        });
        
        ctx.stroke();
    });
}

// ==========================================
// FIREBASE DRAWING SYNC
// ==========================================

function sendDrawingData(type, coords, color, size) {
    if (!roomRef) return;
    
    const data = {
        type: type,
        playerId: gameState.playerId,
        timestamp: Date.now()
    };
    
    if (coords) {
        data.x = coords.x;
        data.y = coords.y;
    }
    if (color) data.color = color;
    if (size) data.size = size;
    
    roomRef.child('drawing').push(data);
}

function listenToDrawing() {
    if (!roomRef) return;
    
    roomRef.child('drawing').on('child_added', (snapshot) => {
        const data = snapshot.val();
        if (!data || data.playerId === gameState.playerId) return;
        
        handleRemoteDrawing(data);
    });
    
    roomRef.child('drawing').on('child_removed', () => {
        // Clear command
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    });
}

function handleRemoteDrawing(data) {
    if (data.type === 'start') {
        ctx.beginPath();
        ctx.moveTo(data.x, data.y);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = data.size;
        ctx.strokeStyle = data.color;
    } else if (data.type === 'draw') {
        ctx.lineTo(data.x, data.y);
        ctx.stroke();
    } else if (data.type === 'end') {
        ctx.beginPath();
    } else if (data.type === 'clear') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (data.type === 'undo') {
        // Simple clear and redraw for remote undo
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
}

// ==========================================
// GAME LOGIC
// ==========================================

function joinGame() {
    const nameInput = document.getElementById('playerName');
    const roomInput = document.getElementById('roomCode');
    
    gameState.playerName = nameInput.value.trim() || 'Player' + Math.floor(Math.random() * 1000);
    let roomCode = roomInput.value.trim().toUpperCase();
    
    // Show loading
    document.getElementById('loadingOverlay').classList.add('show');
    
    if (!roomCode) {
        // Create new room
        roomCode = generateRoomCode();
        createRoom(roomCode);
    } else {
        // Join existing room
        joinExistingRoom(roomCode);
    }
}

function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function createRoom(roomCode) {
    gameState.roomCode = roomCode;
    gameState.playerId = generatePlayerId();
    
    roomRef = database.ref('rooms/' + roomCode);
    playersRef = roomRef.child('players');
    chatRef = roomRef.child('chat');
    drawingRef = roomRef.child('drawing');
    gameRef = roomRef.child('game');
    
    // Initialize room data
    roomRef.set({
        created: Date.now(),
        gameState: 'waiting',
        round: 1,
        maxRounds: 10,
        currentDrawer: null,
        currentWord: null
    });
    
    // Add player
    addPlayerToRoom();
    
    // Setup listeners
    setupGameListeners();
    
    // Show game screen
    showGameScreen(roomCode);
    
    // Check if we can start
    checkStartGame();
}

function joinExistingRoom(roomCode) {
    gameState.roomCode = roomCode;
    gameState.playerId = generatePlayerId();
    
    roomRef = database.ref('rooms/' + roomCode);
    
    roomRef.once('value', (snapshot) => {
        if (!snapshot.exists()) {
            showToast('Room not found!', 'error');
            document.getElementById('loadingOverlay').classList.remove('show');
            return;
        }
        
        playersRef = roomRef.child('players');
        chatRef = roomRef.child('chat');
        drawingRef = roomRef.child('drawing');
        gameRef = roomRef.child('game');
        
        addPlayerToRoom();
        setupGameListeners();
        showGameScreen(roomCode);
    });
}

function generatePlayerId() {
    return 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function addPlayerToRoom() {
    playersRef.child(gameState.playerId).set({
        name: gameState.playerName,
        score: 0,
        joined: Date.now(),
        isDrawer: false,
        hasGuessed: false
    });
    
    // Remove player on disconnect
    playersRef.child(gameState.playerId).onDisconnect().remove();
}

function showGameScreen(roomCode) {
    document.getElementById('loadingOverlay').classList.remove('show');
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('gameScreen').style.display = 'flex';
    document.getElementById('roomCodeDisplay').textContent = roomCode;
    
    // Send join message
    sendChatMessage('system', `${gameState.playerName} joined the game!`);
}

function setupGameListeners() {
    // Listen to players
    playersRef.on('value', (snapshot) => {
        gameState.players = snapshot.val() || {};
        updatePlayersList();
    });
    
    // Listen to chat
    chatRef.limitToLast(50).on('child_added', (snapshot) => {
        const message = snapshot.val();
        displayChatMessage(message);
    });
    
    // Listen to game state
    gameRef.on('value', (snapshot) => {
        const game = snapshot.val();
        if (!game) return;
        handleGameStateChange(game);
    });
    
    // Listen to drawing
    listenToDrawing();
}

// ==========================================
// GAME STATE MANAGEMENT
// ==========================================

function handleGameStateChange(game) {
    gameState.round = game.round || 1;
    gameState.maxRounds = game.maxRounds || 10;
    
    document.getElementById('roundInfo').textContent = `Round ${gameState.round}/${gameState.maxRounds}`;
    
    // Check if we're the drawer
    const wasDrawer = gameState.isDrawer;
    gameState.isDrawer = game.currentDrawer === gameState.playerId;
    
    if (gameState.isDrawer && !wasDrawer) {
        // Just became drawer
        becomeDrawer();
    } else if (!gameState.isDrawer && wasDrawer) {
        // Stopped being drawer
        stopBeingDrawer();
    }
    
    // Update word display
    if (gameState.isDrawer && game.currentWord) {
        document.getElementById('wordDisplay').textContent = game.currentWord;
        document.getElementById('wordHint').textContent = 'Draw this word!';
    } else if (game.currentWord) {
        // Show underscores for guessers
        const display = game.currentWord.split('').map(char => char === ' ' ? ' ' : '_').join(' ');
        document.getElementById('wordDisplay').textContent = display;
        document.getElementById('wordHint').textContent = `${game.currentWord.length} letters`;
    }
    
    // Timer
    if (game.timer !== undefined) {
        gameState.timer = game.timer;
        updateTimerDisplay();
    }
    
    // Game state
    if (game.state === 'choosing') {
        showWaitingOverlay(true);
    } else if (game.state === 'drawing') {
        showWaitingOverlay(false);
        gameState.isGameActive = true;
        gameState.currentWord = game.currentWord;
    } else if (game.state === 'round_end') {
        showRoundEnd(game);
    } else if (game.state === 'game_over') {
        showGameOver(game);
    }
}

function becomeDrawer() {
    gameState.isDrawer = true;
    document.getElementById('drawerBadge').style.display = 'flex';
    document.getElementById('toolbar').classList.add('show');
    
    // Show word selection
    showWordSelection();
}

function stopBeingDrawer() {
    gameState.isDrawer = false;
    document.getElementById('drawerBadge').style.display = 'none';
    document.getElementById('toolbar').classList.remove('show');
    document.getElementById('wordModal').classList.remove('show');
}

function showWordSelection() {
    const options = WordBank.getWordOptions();
    const container = document.getElementById('wordOptions');
    container.innerHTML = '';
    
    options.forEach(option => {
        const btn = document.createElement('button');
        btn.className = 'word-btn';
        btn.innerHTML = `
            <div class="word-text">${option.word}</div>
            <div class="word-meta">${option.difficulty} • ${option.points} pts</div>
        `;
        btn.onclick = () => selectWord(option.word);
        container.appendChild(btn);
    });
    
    document.getElementById('wordModal').classList.add('show');
    
    // Start countdown
    let timeLeft = 15;
    const timerEl = document.getElementById('wordTimer');
    timerEl.textContent = timeLeft;
    
    const countdown = setInterval(() => {
        timeLeft--;
        timerEl.textContent = timeLeft;
        if (timeLeft <= 0) {
            clearInterval(countdown);
            if (document.getElementById('wordModal').classList.contains('show')) {
                selectWord(options[0].word); // Auto select easy
            }
        }
    }, 1000);
}

function selectWord(word) {
    document.getElementById('wordModal').classList.remove('show');
    
    gameRef.update({
        state: 'drawing',
        currentWord: word,
        timer: 80,
        startTime: Date.now()
    });
    
    // Start timer
    startGameTimer();
}

function startGameTimer() {
    const timerInterval = setInterval(() => {
        gameRef.once('value', (snapshot) => {
            const game = snapshot.val();
            if (!game || game.state !== 'drawing') {
                clearInterval(timerInterval);
                return;
            }
            
            const elapsed = Math.floor((Date.now() - game.startTime) / 1000);
            const remaining = Math.max(0, 80 - elapsed);
            
            gameRef.update({ timer: remaining });
            
            if (remaining <= 0) {
                clearInterval(timerInterval);
                endRound();
            }
        });
    }, 1000);
}

function endRound() {
    gameRef.update({ state: 'round_end' });
    
    setTimeout(() => {
        gameRef.once('value', (snapshot) => {
            const game = snapshot.val();
            const nextRound = (game.round || 1) + 1;
            
            if (nextRound > gameState.maxRounds) {
                gameRef.update({ state: 'game_over' });
            } else {
                // Choose next drawer
                const playerIds = Object.keys(gameState.players);
                const currentIndex = playerIds.indexOf(game.currentDrawer);
                const nextDrawer = playerIds[(currentIndex + 1) % playerIds.length];
                
                gameRef.update({
                    state: 'choosing',
                    round: nextRound,
                    currentDrawer: nextDrawer,
                    currentWord: null,
                    timer: 80
                });
                
                // Reset hasGuessed for all players
                playersRef.once('value', (snap) => {
                    const players = snap.val();
                    Object.keys(players).forEach(pid => {
                        playersRef.child(pid).update({ hasGuessed: false });
                    });
                });
            }
        });
    }, 5000);
}

// ==========================================
// CHAT SYSTEM
// ==========================================

function handleChat(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
}

function sendMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    
    if (!text) return;
    
    // Check if it's a guess
    if (!gameState.isDrawer && gameState.isGameActive && text.toLowerCase() === gameState.currentWord.toLowerCase()) {
        handleCorrectGuess();
        input.value = '';
        return;
    }
    
    // Check if close (for hint system)
    const similarity = calculateSimilarity(text.toLowerCase(), gameState.currentWord.toLowerCase());
    const isClose = similarity > 0.7 && similarity < 1;
    
    sendChatMessage('guess', text, gameState.playerName, isClose);
    input.value = '';
}

function calculateSimilarity(str1, str2) {
    if (str1 === str2) return 1;
    if (str1.length < 2 || str2.length < 2) return 0;
    
    let matches = 0;
    const minLength = Math.min(str1.length, str2.length);
    for (let i = 0; i < minLength; i++) {
        if (str1[i] === str2[i]) matches++;
    }
    return matches / Math.max(str1.length, str2.length);
}

function handleCorrectGuess() {
    if (gameState.players[gameState.playerId].hasGuessed) return;
    
    // Calculate points based on time
    const points = Math.max(10, Math.floor(gameState.timer / 8) * 10);
    
    playersRef.child(gameState.playerId).update({
        score: (gameState.players[gameState.playerId].score || 0) + points,
        hasGuessed: true
    });
    
    sendChatMessage('correct', `${gameState.playerName} guessed the word! (+${points} pts)`, null, false, true);
    
    // Check if all guessed
    checkAllGuessed();
}

function checkAllGuessed() {
    const players = Object.values(gameState.players);
    const nonDrawers = players.filter(p => {
        const pid = Object.keys(gameState.players).find(key => gameState.players[key] === p);
        return pid !== gameRef.currentDrawer;
    });
    
    const allGuessed = nonDrawers.every(p => p.hasGuessed);
    
    if (allGuessed) {
        setTimeout(() => endRound(), 2000);
    }
}

function sendChatMessage(type, text, username = null, isClose = false, isCorrect = false) {
    chatRef.push({
        type: type,
        text: text,
        username: username || gameState.playerName,
        timestamp: Date.now(),
        isClose: isClose,
        isCorrect: isCorrect
    });
}

function displayChatMessage(msg) {
    const container = document.getElementById('chatMessages');
    const div = document.createElement('div');
    
    div.className = 'chat-message';
    if (msg.type === 'system') div.classList.add('system');
    else if (msg.isCorrect) div.classList.add('correct');
    else if (msg.isClose) div.classList.add('close');
    else div.classList.add('guess');
    
    if (msg.type !== 'system') {
        div.innerHTML = `<span class="username">${msg.username}</span>${msg.text}`;
    } else {
        div.textContent = msg.text;
    }
    
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function clearChat() {
    chatRef.remove();
    document.getElementById('chatMessages').innerHTML = '';
}

// ==========================================
// UI UPDATES
// ==========================================

function updatePlayersList() {
    const container = document.getElementById('playersList');
    const playerCount = document.getElementById('playerCount');
    
    container.innerHTML = '';
    const players = Object.entries(gameState.players);
    playerCount.textContent = `${players.length}/8`;
    
    // Sort by score
    players.sort((a, b) => (b[1].score || 0) - (a[1].score || 0));
    
    players.forEach(([id, player]) => {
        const div = document.createElement('div');
        div.className = 'player-item';
        
        if (id === gameState.playerId) div.style.background = '#e3f2fd';
        if (gameState.isDrawer && id === gameState.playerId) div.classList.add('current-drawer');
        if (player.hasGuessed) div.classList.add('guessed-correct');
        
        div.innerHTML = `
            <div class="player-avatar">${player.name.charAt(0).toUpperCase()}</div>
            <div class="player-info">
                <div class="player-name">
                    ${player.name} ${id === gameState.playerId ? '(You)' : ''}
                    ${gameRef && gameRef.currentDrawer === id ? '<span class="pencil-icon">✏️</span>' : ''}
                </div>
                <div class="player-status">${player.hasGuessed ? 'Guessed!' : (gameRef && gameRef.currentDrawer === id ? 'Drawing...' : 'Guessing...')}</div>
            </div>
            <div class="player-score">${player.score || 0}</div>
        `;
        
        container.appendChild(div);
    });
}

function updateTimerDisplay() {
    document.getElementById('timer').textContent = gameState.timer;
    
    // Update circle progress
    const circle = document.getElementById('timerCircle');
    const circumference = 2 * Math.PI * 15.9155;
    const offset = circumference - (gameState.timer / 80) * circumference;
    circle.style.strokeDashoffset = offset;
    
    // Change color based on time
    if (gameState.timer <= 10) {
        circle.style.stroke = '#e74c3c';
    } else if (gameState.timer <= 30) {
        circle.style.stroke = '#f39c12';
    } else {
        circle.style.stroke = '#2ecc71';
    }
}

function showWaitingOverlay(show) {
    document.getElementById('waitingOverlay').style.display = show ? 'flex' : 'none';
}

function showRoundEnd(game) {
    document.getElementById('roundOverlay').classList.add('show');
    document.getElementById('revealedWord').textContent = game.currentWord || '---';
    
    // Show scores
    const scoresDiv = document.getElementById('roundScores');
    scoresDiv.innerHTML = '';
    
    const sorted = Object.entries(gameState.players)
        .sort((a, b) => (b[1].score || 0) - (a[1].score || 0))
        .slice(0, 3);
    
    sorted.forEach(([id, player], index) => {
        const div = document.createElement('div');
        div.style.cssText = 'display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #eee;';
        div.innerHTML = `<span>#${index + 1} ${player.name}</span><span>${player.score || 0} pts</span>`;
        scoresDiv.appendChild(div);
    });
    
    setTimeout(() => {
        document.getElementById('roundOverlay').classList.remove('show');
    }, 5000);
}

function showGameOver(game) {
    document.getElementById('gameOverModal').classList.add('show');
    
    const container = document.getElementById('finalScores');
    container.innerHTML = '';
    
    const sorted = Object.entries(gameState.players)
        .sort((a, b) => (b[1].score || 0) - (a[1].score || 0));
    
    sorted.forEach(([id, player], index) => {
        const div = document.createElement('div');
        div.className = 'final-score-item';
        if (index === 0) div.classList.add('winner');
        
        div.innerHTML = `
            <span class="final-rank">#${index + 1}</span>
            <span class="final-name">${player.name} ${id === gameState.playerId ? '(You)' : ''}</span>
            <span class="final-points">${player.score || 0} pts</span>
        `;
        
        container.appendChild(div);
    });
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function checkStartGame() {
    playersRef.on('value', (snapshot) => {
        const players = snapshot.val();
        const count = Object.keys(players || {}).length;
        
        if (count >= 2 && !gameState.isGameActive) {
            // Start game with first player as drawer
            const firstPlayer = Object.keys(players)[0];
            gameRef.update({
                state: 'choosing',
                currentDrawer: firstPlayer,
                round: 1
            });
        }
    });
}

function exitGame() {
    if (roomRef) {
        playersRef.child(gameState.playerId).remove();
        sendChatMessage('system', `${gameState.playerName} left the game.`);
    }
    location.reload();
}

function playAgain() {
    if (roomRef) {
        gameRef.update({
            state: 'choosing',
            round: 1,
            currentDrawer: Object.keys(gameState.players)[0],
            currentWord: null
        });
        
        // Reset scores
        Object.keys(gameState.players).forEach(pid => {
            playersRef.child(pid).update({ score: 0, hasGuessed: false });
        });
    }
    document.getElementById('gameOverModal').classList.remove('show');
}

function copyRoomCode() {
    const code = document.getElementById('roomCodeDisplay').textContent;
    navigator.clipboard.writeText(code).then(() => {
        showToast('Room code copied!', 'success');
    });
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = { success: '✓', error: '✗', warning: '⚠', info: 'ℹ' };
    toast.innerHTML = `<span class="toast-icon">${icons[type]}</span>${message}`;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Prevent accidental refresh
window.addEventListener('beforeunload', (e) => {
    if (gameState.isGameActive) {
        e.preventDefault();
        e.returnValue = '';
    }
});

console.log('🎮 Game engine loaded!');
