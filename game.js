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

document.addEventListener('DOMContentLoaded', async () => {
    canvas = document.getElementById('gameCanvas');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    setupColorPalette();
    
    try {
        currentUser = await initAuth();
    } catch (error) {
        showError("Connection failed. Refresh page.");
    }
});

function resizeCanvas() {
    const container = document.querySelector('.canvas-section');
    if (canvas && container) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
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
    const err = document.getElementById('errorDisplay');
    if (err) {
        err.textContent = msg;
        err.style.display = 'block';
        setTimeout(() => err.style.display = 'none', 3000);
    }
}

window.joinGame = async function() {
    if (!currentUser) return;
    
    playerName = document.getElementById('playerName').value.trim();
    let roomCode = document.getElementById('roomCode').value.trim().toUpperCase();
    
    if (!playerName) {
        alert('Enter your name!');
        return;
    }
    
    if (!roomCode) {
        roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    }
    
    roomId = roomCode;
    
    try {
        const playerRef = ref(db, `rooms/${roomId}/players/${currentUser.uid}`);
        await set(playerRef, {
            name: playerName,
            score: 0,
            isActive: true,
            hasGuessed: false,
            joinedAt: Date.now()
        });
        
        onDisconnect(playerRef).remove();
        
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('gameScreen').style.display = 'flex';
        document.getElementById('displayRoomCode').textContent = roomId;
        
        initGame();
    } catch (error) {
        showError("Failed to join: " + error.message);
    }
};

window.exitGame = function() {
    if (gameInterval) clearInterval(gameInterval);
    if (roomId && currentUser) {
        remove(ref(db, `rooms/${roomId}/players/${currentUser.uid}`));
    }
    location.reload();
};

function initGame() {
    // Players listener
    onValue(ref(db, `rooms/${roomId}/players`), (snapshot) => {
        const players = snapshot.val() || {};
        totalPlayers = Object.keys(players).length;
        updatePlayersList(players);
        checkAllGuessed(players);
    });
    
    // Game state listener
    onValue(ref(db, `rooms/${roomId}/game`), (snapshot) => {
        handleGameState(snapshot.val());
    });
    
    // Drawing listener
    onValue(ref(db, `rooms/${roomId}/drawing`), (snapshot) => {
        if (!isDrawer && snapshot.val()) {
            replayDrawing(snapshot.val());
        }
    });
    
    // Chat listener
    onValue(ref(db, `rooms/${roomId}/chat`), (snapshot) => {
        updateChat(snapshot.val());
    });
    
    // Drawer disconnect detection
    onValue(ref(db, `rooms/${roomId}/game/currentDrawer`), (snapshot) => {
        const drawerId = snapshot.val();
        if (drawerId) {
            const drawerRef = ref(db, `rooms/${roomId}/players/${drawerId}`);
            get(drawerRef).then((playerSnap) => {
                if (!playerSnap.exists()) {
                    // Drawer left, end round
                    handleDrawerDisconnect();
                }
            });
        }
    });
    
    setupCanvasEvents();
    checkGameStart();
}

function updatePlayersList(players) {
    const container = document.getElementById('playersList');
    if (!container) return;
    container.innerHTML = '';
    
    const gameRef = ref(db, `rooms/${roomId}/game`);
    get(gameRef).then((gameSnap) => {
        const gameData = gameSnap.val() || {};
        const currentDrawerId = gameData.currentDrawer;
        
        Object.entries(players).forEach(([uid, player]) => {
            const div = document.createElement('div');
            div.className = 'player-item';
            div.id = `player-${uid}`;
            
            if (uid === currentDrawerId) {
                div.classList.add('current-drawer');
            }
            if (player.hasGuessed) {
                div.classList.add('guessed-correct');
            }
            if (uid === currentUser.uid) {
                div.style.background = '#e3f2fd';
            }
            
            div.innerHTML = `
                <div class="player-avatar">${player.name[0].toUpperCase()}</div>
                <div class="player-info">
                    <div class="player-name">${player.name} ${uid === currentUser.uid ? '(You)' : ''}</div>
                    <div class="player-status">${uid === currentDrawerId ? '✏️ Drawing' : (player.hasGuessed ? '✓ Guessed' : 'Guessing...')}</div>
                    <div class="player-score">Score: ${player.score || 0}</div>
                </div>
            `;
            container.appendChild(div);
        });
    });
}

function handleGameState(gameData) {
    if (!gameData) return;
    
    if (gameData.timeLeft !== undefined) {
        document.getElementById('timer').textContent = gameData.timeLeft;
        timeLeft = gameData.timeLeft;
    }
    
    isDrawer = gameData.currentDrawer === currentUser.uid;
    const wordDisplay = document.getElementById('wordDisplay');
    const toolsBar = document.getElementById('toolsBar');
    const waitingOverlay = document.getElementById('waitingOverlay');
    const drawerIndicator = document.getElementById('drawerIndicator');
    
    // Reset guess status for new round
    if (gameData.status === 'choosing') {
        hasGuessedCorrectly = false;
        playersWhoGuessed.clear();
        resetPlayerGuessStatus();
    }
    
    if (isDrawer) {
        drawerIndicator.style.display = 'block';
        toolsBar.style.display = 'flex';
        waitingOverlay.style.display = 'none';
        
        if (gameData.status === 'choosing' && !gameData.currentWord) {
            showWordSelection();
        } else if (gameData.currentWord) {
            currentWord = gameData.currentWord;
            wordDisplay.textContent = currentWord;
        }
    } else {
        drawerIndicator.style.display = 'none';
        toolsBar.style.display = 'none';
        
        if (gameData.status === 'choosing') {
            waitingOverlay.style.display = 'flex';
            wordDisplay.textContent = '...';
        } else if (gameData.currentWord) {
            waitingOverlay.style.display = 'none';
            currentWord = gameData.currentWord;
            
            if (hasGuessedCorrectly) {
                wordDisplay.textContent = currentWord;
            } else {
                wordDisplay.textContent = '_ '.repeat(currentWord.length);
            }
        }
    }
}

function resetPlayerGuessStatus() {
    get(ref(db, `rooms/${roomId}/players`)).then((snapshot) => {
        const players = snapshot.val() || {};
        Object.keys(players).forEach((uid) => {
            update(ref(db, `rooms/${roomId}/players/${uid}`), { hasGuessed: false });
        });
    });
}

function checkAllGuessed(players) {
    if (!isDrawer || !currentWord) return;
    
    const otherPlayers = Object.entries(players).filter(([uid]) => uid !== currentUser.uid);
    const allOthersGuessed = otherPlayers.length > 0 && otherPlayers.every(([, p]) => p.hasGuessed);
    
    if (allOthersGuessed) {
        setTimeout(() => endRound(), 2000);
    }
}

async function handleDrawerDisconnect() {
    // Reveal word to everyone
    const gameRef = ref(db, `rooms/${roomId}/game`);
    const gameSnap = await get(gameRef);
    const gameData = gameSnap.val();
    
    if (gameData && gameData.currentWord) {
        await push(ref(db, `rooms/${roomId}/chat`), {
            username: 'System',
            message: `Drawer left! The word was: ${gameData.currentWord}`,
            type: 'system',
            timestamp: Date.now()
        });
        
        // Move to next player immediately
        endRound();
    }
}

function showWordSelection() {
    const modal = document.getElementById('wordModal');
    const options = document.getElementById('wordOptions');
    options.innerHTML = '';
    
    const shuffled = [...wordBank].sort(() => 0.5 - Math.random());
    const choices = shuffled.slice(0, 3);
    
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
    document.getElementById('wordModal').style.display = 'none';
    currentWord = word;
    
    await update(ref(db, `rooms/${roomId}/game`), {
        currentWord: word,
        status: 'drawing',
        timeLeft: 80,
        startTime: Date.now()
    });
    
    clearCanvasLocal();
    startTimer();
}

function startTimer() {
    if (gameInterval) clearInterval(gameInterval);
    
    gameInterval = setInterval(async () => {
        timeLeft--;
        await update(ref(db, `rooms/${roomId}/game`), { timeLeft });
        
        if (timeLeft <= 0) {
            endRound();
        }
    }, 1000);
}

async function endRound() {
    if (gameInterval) clearInterval(gameInterval);
    
    const gameRef = ref(db, `rooms/${roomId}/game`);
    const gameSnap = await get(gameRef);
    const gameData = gameSnap.val();
    
    if (!gameData) return;
    
    // Reveal word if time ran out
    if (timeLeft <= 0) {
        await push(ref(db, `rooms/${roomId}/chat`), {
            username: 'System',
            message: `Time up! The word was: ${gameData.currentWord}`,
            type: 'system',
            timestamp: Date.now()
        });
    }
    
    // Find next drawer
    const playersSnap = await get(ref(db, `rooms/${roomId}/players`));
    const players = Object.keys(playersSnap.val() || {});
    
    if (players.length === 0) return;
    
    const currentIndex = players.indexOf(gameData.currentDrawer);
    let nextIndex = (currentIndex + 1) % players.length;
    let nextDrawer = players[nextIndex];
    
    // Skip if next drawer is disconnected (shouldn't happen with onDisconnect)
    let attempts = 0;
    while (attempts < players.length) {
        const nextPlayerSnap = await get(ref(db, `rooms/${roomId}/players/${nextDrawer}`));
        if (nextPlayerSnap.exists()) break;
        nextIndex = (nextIndex + 1) % players.length;
        nextDrawer = players[nextIndex];
        attempts++;
    }
    
    await update(gameRef, {
        currentDrawer: nextDrawer,
        currentWord: null,
        status: 'choosing',
        timeLeft: 80
    });
    
    await remove(ref(db, `rooms/${roomId}/drawing`));
    clearCanvasLocal();
}

function setupCanvasEvents() {
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
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

window.handleChatKeypress = async function(e) {
    if (e.key !== 'Enter') return;
    
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    if (!message) return;
    
    // Drawer can't guess
    if (isDrawer) {
        input.value = '';
        return;
    }
    
    // Check correct guess
    if (!hasGuessedCorrectly && currentWord && message.toLowerCase() === currentWord.toLowerCase()) {
        hasGuessedCorrectly = true;
        playersWhoGuessed.add(currentUser.uid);
        
        // Update player status
        await update(ref(db, `rooms/${roomId}/players/${currentUser.uid}`), {
            hasGuessed: true
        });
        
        // Add score
        const playerRef = ref(db, `rooms/${roomId}/players/${currentUser.uid}`);
        const snap = await get(playerRef);
        const score = (snap.val()?.score || 0) + Math.ceil(timeLeft / 2) + 10;
        await update(playerRef, { score });
        
        // System message
        await push(ref(db, `rooms/${roomId}/chat`), {
            username: 'System',
            message: `${playerName} guessed the word!`,
            type: 'system',
            timestamp: Date.now()
        });
        
        input.value = '';
        return;
    }
    
    // Send message with visibility logic
    const chatData = {
        username: playerName,
        message: message,
        uid: currentUser.uid,
        timestamp: Date.now(),
        type: 'guess'
    };
    
    // If player has guessed, message is private (only drawer and other guessers see it)
    if (hasGuessedCorrectly) {
        chatData.isPrivate = true;
        chatData.visibleTo = [gameData?.currentDrawer, ...Array.from(playersWhoGuessed)];
    }
    
    await push(ref(db, `rooms/${roomId}/chat`), chatData);
    input.value = '';
};

function updateChat(messages) {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    container.innerHTML = '';
    
    if (!messages) return;
    
    get(ref(db, `rooms/${roomId}/game/currentDrawer`)).then((drawerSnap) => {
        const drawerId = drawerSnap.val();
        
        Object.values(messages).sort((a, b) => a.timestamp - b.timestamp).forEach(msg => {
            // Filter private messages
            if (msg.isPrivate && msg.visibleTo) {
                const canSee = msg.visibleTo.includes(currentUser.uid) || msg.uid === currentUser.uid;
                if (!canSee) return;
            }
            
            const div = document.createElement('div');
            div.className = 'chat-message';
            
            if (msg.type === 'system') {
                div.classList.add('system');
                div.textContent = msg.message;
            } else {
                if (msg.isPrivate) div.classList.add('private');
                else div.classList.add('guess');
                
                div.innerHTML = `
                    <div class="username">${msg.username} ${msg.isPrivate ? '🔒' : ''}</div>
                    <div class="text">${msg.message}</div>
                `;
            }
            
            container.appendChild(div);
        });
        
        container.scrollTop = container.scrollHeight;
    });
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
