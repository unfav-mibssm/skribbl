import { db, auth, initAuth, ref, set, onValue, push, update, remove, onDisconnect, serverTimestamp, get } from './firebase-config.js';

// Game State
let currentUser = null;
let roomId = null;
let playerName = '';
let isDrawer = false;
let currentWord = '';
let canvas, ctx;
let isDrawing = false;
let currentTool = 'brush';
let currentColor = '#000000';
let currentSize = 8;
let gameInterval;
let timeLeft = 80;
let hasGuessedCorrectly = false;
let playersWhoGuessed = new Set();
let totalPlayers = 0;
let isJoining = false;
let gameData = null;

const colors = [
    '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff',
    '#ffff00', '#ff00ff', '#00ffff', '#ffa500', '#800080',
    '#ffc0cb', '#a52a2a', '#808080', '#90ee90', '#ffb6c1',
    '#dda0dd', '#f0e68c', '#e6e6fa', '#ff6347', '#40e0d0'
];

const wordBank = [
    'cat', 'dog', 'house', 'car', 'tree', 'sun', 'moon', 'star',
    'flower', 'bird', 'fish', 'book', 'phone', 'computer', 'chair',
    'table', 'door', 'window', 'ball', 'bike', 'train', 'plane',
    'boat', 'apple', 'banana', 'pizza', 'cake', 'robot', 'dragon',
    'unicorn', 'pirate', 'ninja', 'superhero', 'monster', 'alien',
    'castle', 'mountain', 'beach', 'desert', 'forest', 'river',
    'guitar', 'piano', 'violin', 'microphone', 'camera', 'clock',
    'glasses', 'hat', 'shoe', 'glove', 'umbrella', 'backpack'
];

// Initialize immediately when page loads
document.addEventListener('DOMContentLoaded', async () => {
    console.log("Page loaded, starting initialization...");
    
    const joinBtn = document.getElementById('joinBtn');
    const statusText = document.getElementById('statusText');
    
    // Setup canvas
    canvas = document.getElementById('gameCanvas');
    if (canvas) {
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    setupColorPalette();
    
    // Initialize Firebase Auth
    try {
        console.log("Initializing auth...");
        currentUser = await initAuth();
        console.log("Auth successful, user:", currentUser.uid);
        
        // Enable button
        if (joinBtn) {
            joinBtn.disabled = false;
            joinBtn.textContent = 'Play Now';
            joinBtn.onclick = joinGame;
        }
        if (statusText) statusText.textContent = 'Ready to play!';
        
    } catch (error) {
        console.error("Auth failed:", error);
        if (joinBtn) {
            joinBtn.textContent = 'Connection Failed';
        }
        if (statusText) statusText.textContent = 'Error: ' + error.message;
    }
});

function resizeCanvas() {
    if (!canvas) return;
    const container = document.querySelector('.canvas-section');
    if (container) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        if (ctx) {
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
    }
}

function setupColorPalette() {
    const palette = document.getElementById('colorPalette');
    if (!palette) return;
    
    palette.innerHTML = '';
    colors.forEach(color => {
        const btn = document.createElement('div');
        btn.className = 'color-btn';
        btn.style.backgroundColor = color;
        if (color === '#000000') btn.classList.add('active');
        btn.onclick = () => setColor(color, btn);
        palette.appendChild(btn);
    });
}

function showError(msg) {
    console.error(msg);
    const err = document.getElementById('errorDisplay');
    if (err) {
        err.textContent = msg;
        err.style.display = 'block';
        setTimeout(() => err.style.display = 'none', 3000);
    }
}

// MAIN JOIN FUNCTION - attached to button
async function joinGame() {
    console.log("Join game clicked!");
    
    if (isJoining) {
        console.log("Already joining, ignoring click");
        return;
    }
    
    if (!currentUser) {
        showError("Not connected yet. Please wait...");
        return;
    }
    
    const nameInput = document.getElementById('playerName');
    const codeInput = document.getElementById('roomCode');
    const joinBtn = document.getElementById('joinBtn');
    
    playerName = nameInput ? nameInput.value.trim() : '';
    let roomCode = codeInput ? codeInput.value.trim().toUpperCase() : '';
    
    if (!playerName) {
        alert('Enter your name!');
        return;
    }
    
    if (!roomCode) {
        roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    }
    
    roomId = roomCode;
    isJoining = true;
    
    // Update UI
    if (joinBtn) {
        joinBtn.disabled = true;
        joinBtn.classList.add('loading');
        joinBtn.textContent = 'Joining...';
    }
    
    console.log("Joining room:", roomId, "as", playerName);
    
    try {
        // Add player to room
        const playerRef = ref(db, `rooms/${roomId}/players/${currentUser.uid}`);
        await set(playerRef, {
            name: playerName,
            score: 0,
            isActive: true,
            hasGuessed: false,
            joinedAt: Date.now()
        });
        
        console.log("Player added to database");
        
        // Setup disconnect cleanup
        onDisconnect(playerRef).remove();
        
        // Switch screens
        const loginScreen = document.getElementById('loginScreen');
        const gameScreen = document.getElementById('gameScreen');
        
        if (loginScreen) loginScreen.style.display = 'none';
        if (gameScreen) gameScreen.style.display = 'flex';
        
        const roomCodeDisplay = document.getElementById('displayRoomCode');
        if (roomCodeDisplay) roomCodeDisplay.textContent = roomId;
        
        // Start game
        initGame();
        
    } catch (error) {
        console.error("Join error:", error);
        showError("Failed to join: " + error.message);
        isJoining = false;
        
        if (joinBtn) {
            joinBtn.disabled = false;
            joinBtn.classList.remove('loading');
            joinBtn.textContent = 'Play Now';
        }
    }
}

// Make it global so HTML can access it
window.joinGame = joinGame;

function initGame() {
    console.log("Initializing game...");
    
    // Listen to players
    onValue(ref(db, `rooms/${roomId}/players`), (snapshot) => {
        const players = snapshot.val() || {};
        totalPlayers = Object.keys(players).length;
        updatePlayersList(players);
        checkAllGuessed(players);
    });
    
    // Listen to game state
    onValue(ref(db, `rooms/${roomId}/game`), (snapshot) => {
        gameData = snapshot.val();
        handleGameState(gameData);
    });
    
    // Listen to drawing
    onValue(ref(db, `rooms/${roomId}/drawing`), (snapshot) => {
        if (!isDrawer && snapshot.val()) {
            replayDrawing(snapshot.val());
        }
    });
    
    // Listen to chat
    onValue(ref(db, `rooms/${roomId}/chat`), (snapshot) => {
        updateChat(snapshot.val());
    });
    
    setupCanvasEvents();
    checkGameStart();
}

function updatePlayersList(players) {
    const container = document.getElementById('playersList');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (!gameData) return;
    
    const currentDrawerId = gameData.currentDrawer;
    
    Object.entries(players).forEach(([uid, player]) => {
        const div = document.createElement('div');
        div.className = 'player-item';
        
        if (uid === currentDrawerId) div.classList.add('current-drawer');
        if (player.hasGuessed) div.classList.add('guessed-correct');
        if (uid === currentUser.uid) div.style.background = '#e3f2fd';
        
        div.innerHTML = `
            <div class="player-avatar">${player.name ? player.name[0].toUpperCase() : '?'}</div>
            <div class="player-info">
                <div class="player-name">${player.name || 'Unknown'} ${uid === currentUser.uid ? '(You)' : ''}</div>
                <div class="player-status">${uid === currentDrawerId ? '✏️ Drawing' : (player.hasGuessed ? '✓ Guessed' : 'Guessing...')}</div>
                <div class="player-score">${player.score || 0} pts</div>
            </div>
        `;
        container.appendChild(div);
    });
}

function handleGameState(data) {
    if (!data) return;
    
    gameData = data;
    
    if (data.timeLeft !== undefined) {
        const timerEl = document.getElementById('timer');
        if (timerEl) timerEl.textContent = data.timeLeft;
        timeLeft = data.timeLeft;
    }
    
    isDrawer = data.currentDrawer === currentUser.uid;
    
    const wordDisplay = document.getElementById('wordDisplay');
    const toolsBar = document.getElementById('toolsBar');
    const waitingOverlay = document.getElementById('waitingOverlay');
    const drawerIndicator = document.getElementById('drawerIndicator');
    
    if (data.status === 'choosing') {
        hasGuessedCorrectly = false;
        playersWhoGuessed.clear();
    }
    
    if (isDrawer) {
        if (drawerIndicator) drawerIndicator.style.display = 'block';
        if (toolsBar) toolsBar.style.display = 'flex';
        if (waitingOverlay) waitingOverlay.style.display = 'none';
        
        if (data.status === 'choosing' && !data.currentWord) {
            showWordSelection();
        } else if (data.currentWord) {
            currentWord = data.currentWord;
            if (wordDisplay) wordDisplay.textContent = currentWord;
        }
    } else {
        if (drawerIndicator) drawerIndicator.style.display = 'none';
        if (toolsBar) toolsBar.style.display = 'none';
        
        if (data.status === 'choosing') {
            if (waitingOverlay) waitingOverlay.style.display = 'flex';
            if (wordDisplay) wordDisplay.textContent = '...';
        } else if (data.currentWord) {
            currentWord = data.currentWord;
            if (waitingOverlay) waitingOverlay.style.display = 'none';
            
            if (hasGuessedCorrectly) {
                if (wordDisplay) wordDisplay.textContent = currentWord;
            } else {
                if (wordDisplay) wordDisplay.textContent = '_ '.repeat(currentWord.length);
            }
        }
    }
}

function checkAllGuessed(players) {
    if (!isDrawer || !currentWord) return;
    
    const others = Object.entries(players).filter(([uid]) => uid !== currentUser.uid);
    if (others.length > 0 && others.every(([, p]) => p.hasGuessed)) {
        setTimeout(() => endRound(), 1500);
    }
}

function showWordSelection() {
    const modal = document.getElementById('wordModal');
    const options = document.getElementById('wordOptions');
    if (!modal || !options) return;
    
    options.innerHTML = '';
    const choices = [...wordBank].sort(() => 0.5 - Math.random()).slice(0, 3);
    
    choices.forEach(word => {
        const btn = document.createElement('button');
        btn.className = 'word-option';
        btn.textContent = word;
        btn.onclick = () => selectWord(word);
        options.appendChild(btn);
    });
    
    modal.style.display = 'flex';
}

async function selectWord(word) {
    const modal = document.getElementById('wordModal');
    if (modal) modal.style.display = 'none';
    
    currentWord = word;
    
    await update(ref(db, `rooms/${roomId}/game`), {
        currentWord: word,
        status: 'drawing',
        timeLeft: 80
    });
    
    clearCanvasLocal();
    startTimer();
}

function startTimer() {
    if (gameInterval) clearInterval(gameInterval);
    
    gameInterval = setInterval(async () => {
        timeLeft--;
        await update(ref(db, `rooms/${roomId}/game`), { timeLeft });
        if (timeLeft <= 0) endRound();
    }, 1000);
}

async function endRound() {
    if (gameInterval) clearInterval(gameInterval);
    
    const gameRef = ref(db, `rooms/${roomId}/game`);
    const snap = await get(gameRef);
    const data = snap.val();
    if (!data) return;
    
    if (timeLeft <= 0) {
        await push(ref(db, `rooms/${roomId}/chat`), {
            username: 'System',
            message: `Time up! Word was: ${data.currentWord}`,
            type: 'system',
            timestamp: Date.now()
        });
    }
    
    const playersSnap = await get(ref(db, `rooms/${roomId}/players`));
    const players = Object.keys(playersSnap.val() || {});
    if (players.length === 0) return;
    
    const idx = players.indexOf(data.currentDrawer);
    const nextDrawer = players[(idx + 1) % players.length];
    
    await update(gameRef, {
        currentDrawer: nextDrawer,
        currentWord: null,
        status: 'choosing',
        timeLeft: 80
    });
    
    await remove(ref(db, `rooms/${roomId}/drawing`));
    clearCanvasLocal();
    
    // Reset guess status
    players.forEach(uid => {
        update(ref(db, `rooms/${roomId}/players/${uid}`), { hasGuessed: false });
    });
}

function setupCanvasEvents() {
    if (!canvas) return;
    
    let lastX = 0, lastY = 0;
    
    function getCoords(e) {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: (clientX - rect.left) * (canvas.width / rect.width),
            y: (clientY - rect.top) * (canvas.height / rect.height)
        };
    }
    
    function start(e) {
        if (!isDrawer) return;
        isDrawing = true;
        const coords = getCoords(e);
        lastX = coords.x;
        lastY = coords.y;
    }
    
    function move(e) {
        if (!isDrawing || !isDrawer) return;
        e.preventDefault();
        
        const coords = getCoords(e);
        
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(coords.x, coords.y);
        ctx.strokeStyle = currentTool === 'eraser' ? '#ffffff' : currentColor;
        ctx.lineWidth = currentTool === 'eraser' ? currentSize * 2 : currentSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        
        push(ref(db, `rooms/${roomId}/drawing`), {
            x0: lastX, y0: lastY, x1: coords.x, y1: coords.y,
            color: ctx.strokeStyle,
            size: ctx.lineWidth,
            timestamp: Date.now()
        });
        
        lastX = coords.x;
        lastY = coords.y;
    }
    
    function stop() {
        isDrawing = false;
    }
    
    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mouseup', stop);
    canvas.addEventListener('mouseout', stop);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', stop);
}

function replayDrawing(drawingData) {
    if (!ctx) return;
    Object.values(drawingData).forEach(stroke => {
        ctx.beginPath();
        ctx.moveTo(stroke.x0, stroke.y0);
        ctx.lineTo(stroke.x1, stroke.y1);
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
    });
}

window.setColor = function(color, btn) {
    currentColor = color;
    currentTool = 'brush';
    document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
};

window.setBrushSize = function(size, btn) {
    currentSize = size;
    document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
};

window.setTool = function(tool, btn) {
    currentTool = tool;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
};

window.clearCanvas = async function() {
    clearCanvasLocal();
    await remove(ref(db, `rooms/${roomId}/drawing`));
};

function clearCanvasLocal() {
    if (!ctx) return;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

window.handleChatKeypress = async function(e) {
    if (e.key !== 'Enter') return;
    
    const input = document.getElementById('chatInput');
    if (!input) return;
    
    const message = input.value.trim();
    if (!message) return;
    
    if (isDrawer) {
        input.value = '';
        return;
    }
    
    if (!hasGuessedCorrectly && currentWord && message.toLowerCase() === currentWord.toLowerCase()) {
        hasGuessedCorrectly = true;
        
        await update(ref(db, `rooms/${roomId}/players/${currentUser.uid}`), { hasGuessed: true });
        
        const playerRef = ref(db, `rooms/${roomId}/players/${currentUser.uid}`);
        const snap = await get(playerRef);
        const newScore = (snap.val()?.score || 0) + Math.ceil(timeLeft / 2) + 10;
        await update(playerRef, { score: newScore });
        
        await push(ref(db, `rooms/${roomId}/chat`), {
            username: 'System',
            message: `${playerName} guessed it!`,
            type: 'system',
            timestamp: Date.now()
        });
        
        input.value = '';
        return;
    }
    
    // Private message if already guessed
    const chatData = {
        username: playerName,
        message: message,
        uid: currentUser.uid,
        timestamp: Date.now(),
        type: 'guess'
    };
    
    if (hasGuessedCorrectly && gameData) {
        chatData.isPrivate = true;
        const guessers = Object.keys((await get(ref(db, `rooms/${roomId}/players`))).val() || {};
        chatData.visibleTo = [gameData.currentDrawer, ...Object.entries(guessers).filter(([uid, p]) => p.hasGuessed).map(([uid]) => uid)];
    }
    
    await push(ref(db, `rooms/${roomId}/chat`), chatData);
    input.value = '';
};

function updateChat(messages) {
    const container = document.getElementById('chatMessages');
    if (!container || !messages) return;
    
    container.innerHTML = '';
    
    Object.values(messages).sort((a, b) => a.timestamp - b.timestamp).forEach(msg => {
        if (msg.isPrivate && msg.visibleTo && !msg.visibleTo.includes(currentUser.uid) && msg.uid !== currentUser.uid) {
            return;
        }
        
        const div = document.createElement('div');
        div.className = 'chat-message';
        
        if (msg.type === 'system') {
            div.classList.add('system');
            div.textContent = msg.message;
        } else {
            div.classList.add(msg.isPrivate ? 'private' : 'guess');
            div.innerHTML = `<div class="username">${msg.username} ${msg.isPrivate ? '🔒' : ''}</div><div class="text">${msg.message}</div>`;
        }
        container.appendChild(div);
    });
    
    container.scrollTop = container.scrollHeight;
}

async function checkGameStart() {
    const gameRef = ref(db, `rooms/${roomId}/game`);
    const snap = await get(gameRef);
    
    if (!snap.exists()) {
        await set(gameRef, {
            currentDrawer: currentUser.uid,
            status: 'choosing',
            timeLeft: 80,
            round: 1
        });
    }
}

window.exitGame = function() {
    if (gameInterval) clearInterval(gameInterval);
    if (roomId && currentUser) {
        remove(ref(db, `rooms/${roomId}/players/${currentUser.uid}`));
    }
    location.reload();
};
