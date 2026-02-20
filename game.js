// game.js
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
let isJoining = false;

// Extended color palette
const colors = [
    '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff',
    '#ffff00', '#ff00ff', '#00ffff', '#ffa500', '#800080',
    '#ffc0cb', '#a52a2a', '#808080', '#90ee90', '#ffb6c1',
    '#dda0dd', '#f0e68c', '#e6e6fa', '#ff6347', '#40e0d0'
];

// Word bank
const wordBank = [
    'cat', 'dog', 'house', 'car', 'tree', 'sun', 'moon', 'star',
    'flower', 'bird', 'fish', 'book', 'phone', 'computer', 'chair',
    'table', 'door', 'window', 'ball', 'bike', 'train', 'plane',
    'boat', 'apple', 'banana', 'pizza', 'cake', 'robot', 'dragon',
    'unicorn', 'pirate', 'ninja', 'superhero', 'monster', 'alien',
    'castle', 'mountain', 'beach', 'desert', 'forest', 'river',
    'guitar', 'piano', 'violin', 'microphone', 'camera', 'clock',
    'glasses', 'hat', 'shoe', 'glove', 'umbrella', 'backpack',
    'butterfly', 'elephant', 'giraffe', 'penguin', 'dolphin',
    'rocket', 'spaceship', 'planet', 'rainbow', 'thunder',
    'tornado', 'volcano', 'island', 'waterfall', 'bridge',
    'skyscraper', 'pyramid', 'statue', 'painting', 'statue',
    'bicycle', 'motorcycle', 'helicopter', 'submarine', 'tank',
    'fireworks', 'balloon', 'kite', 'slide', 'swing',
    'pizza', 'burger', 'sushi', 'ice cream', 'donut',
    'basketball', 'football', 'tennis', 'golf', 'swimming',
    'dancing', 'singing', 'reading', 'sleeping', 'cooking'
];

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    console.log("Page loaded, initializing...");
    
    canvas = document.getElementById('gameCanvas');
    if (!canvas) {
        console.error("Canvas not found!");
        return;
    }
    
    ctx = canvas.getContext('2d');
    
    // Set canvas white background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Setup color palette
    setupColorPalette();
    
    // Initialize auth
    try {
        currentUser = await initAuth();
        console.log("Auth initialized successfully, user:", currentUser.uid);
        
        // Enable join button
        const joinBtn = document.getElementById('joinBtn');
        if (joinBtn) {
            joinBtn.disabled = false;
            joinBtn.textContent = 'Join Game';
        }
    } catch (error) {
        console.error("Failed to initialize auth:", error);
        showError("Failed to connect to game server. Please refresh the page.");
        
        const joinBtn = document.getElementById('joinBtn');
        if (joinBtn) {
            joinBtn.disabled = true;
            joinBtn.textContent = 'Connection Failed';
        }
    }
});

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

function showError(message) {
    const errDiv = document.getElementById('errorDisplay');
    if (errDiv) {
        errDiv.style.display = 'block';
        errDiv.textContent = message;
        setTimeout(() => errDiv.style.display = 'none', 5000);
    }
    console.error(message);
}

// Join Game
window.joinGame = async function() {
    console.log("Join game clicked");
    
    if (isJoining) {
        console.log("Already joining...");
        return;
    }
    
    if (!currentUser) {
        showError("Please wait, connecting to server...");
        return;
    }
    
    playerName = document.getElementById('playerName').value.trim();
    let roomCode = document.getElementById('roomCode').value.trim().toUpperCase();
    
    if (!playerName) {
        alert('Please enter your name!');
        return;
    }
    
    // Generate room code if not provided
    if (!roomCode) {
        roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        console.log("Generated new room code:", roomCode);
    }
    
    roomId = roomCode;
    isJoining = true;
    
    const joinBtn = document.getElementById('joinBtn');
    if (joinBtn) {
        joinBtn.disabled = true;
        joinBtn.textContent = 'Joining...';
    }
    
    console.log("Joining room:", roomId, "as", playerName);
    
    try {
        // Join room
        const playerRef = ref(db, `rooms/${roomId}/players/${currentUser.uid}`);
        await set(playerRef, {
            name: playerName,
            score: 0,
            isActive: true,
            joinedAt: Date.now()
        });
        
        console.log("Player added to room successfully");
        
        // Handle disconnect
        onDisconnect(playerRef).remove();
        
        // Show game screen
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('gameScreen').style.display = 'block';
        document.getElementById('displayRoomCode').textContent = roomId;
        
        // Initialize game
        initGame();
        
    } catch (error) {
        console.error("Error joining game:", error);
        showError("Failed to join game: " + error.message);
        isJoining = false;
        
        if (joinBtn) {
            joinBtn.disabled = false;
            joinBtn.textContent = 'Join Game';
        }
    }
};

function initGame() {
    console.log("Initializing game...");
    
    // Listen to players
    const playersRef = ref(db, `rooms/${roomId}/players`);
    onValue(playersRef, (snapshot) => {
        console.log("Players updated:", snapshot.val());
        updatePlayersList(snapshot.val());
    }, (error) => {
        console.error("Error loading players:", error);
    });
    
    // Listen to game state
    const gameRef = ref(db, `rooms/${roomId}/game`);
    onValue(gameRef, (snapshot) => {
        console.log("Game state updated:", snapshot.val());
        handleGameState(snapshot.val());
    }, (error) => {
        console.error("Error loading game state:", error);
    });
    
    // Listen to drawing
    const drawingRef = ref(db, `rooms/${roomId}/drawing`);
    onValue(drawingRef, (snapshot) => {
        if (!isDrawer) {
            const data = snapshot.val();
            if (data) replayDrawing(data);
        }
    });
    
    // Listen to chat
    const chatRef = ref(db, `rooms/${roomId}/chat`);
    onValue(chatRef, (snapshot) => {
        updateChat(snapshot.val());
    });
    
    // Setup canvas events
    setupCanvasEvents();
    
    // Check if we need to start game
    checkGameStart();
}

function updatePlayersList(players) {
    const container = document.getElementById('playersList');
    if (!container) return;
    container.innerHTML = '';
    
    if (!players) return;
    
    Object.entries(players).forEach(([uid, player]) => {
        const div = document.createElement('div');
        div.className = 'player-item';
        if (uid === currentUser?.uid) {
            div.style.border = '2px solid #667eea';
            div.style.background = '#e3f2fd';
        }
        
        // Check if this player is the current drawer
        const gameRef = ref(db, `rooms/${roomId}/game/currentDrawer`);
        get(gameRef).then((snapshot) => {
            if (snapshot.val() === uid) {
                div.classList.add('current-drawer');
            }
        });
        
        div.innerHTML = `
            <div class="player-avatar">${player.name ? player.name[0].toUpperCase() : '?'}</div>
            <div class="player-info">
                <div class="player-name">${player.name || 'Unknown'} ${uid === currentUser?.uid ? '(You)' : ''}</div>
                <div class="player-score">Score: ${player.score || 0}</div>
            </div>
        `;
        container.appendChild(div);
    });
}

function handleGameState(gameData) {
    if (!gameData) return;
    
    // Update timer
    if (gameData.timeLeft !== undefined) {
        const timerEl = document.getElementById('timer');
        if (timerEl) timerEl.textContent = gameData.timeLeft;
        timeLeft = gameData.timeLeft;
    }
    
    // Check if it's our turn to draw
    isDrawer = gameData.currentDrawer === currentUser?.uid;
    
    const wordDisplay = document.getElementById('wordDisplay');
    const toolsBar = document.getElementById('toolsBar');
    const waitingOverlay = document.getElementById('waitingOverlay');
    
    // Reset guess status when new round starts
    if (gameData.status === 'choosing') {
        hasGuessedCorrectly = false;
    }
    
    if (isDrawer) {
        if (toolsBar) toolsBar.style.display = 'flex';
        if (waitingOverlay) waitingOverlay.style.display = 'none';
        
        if (gameData.status === 'choosing' && !gameData.currentWord) {
            showWordSelection();
        } else if (gameData.currentWord) {
            currentWord = gameData.currentWord;
            if (wordDisplay) wordDisplay.textContent = gameData.currentWord;
        }
    } else {
        if (toolsBar) toolsBar.style.display = 'none';
        
        if (gameData.status === 'choosing') {
            if (waitingOverlay) waitingOverlay.style.display = 'flex';
            if (wordDisplay) wordDisplay.textContent = 'Choosing word...';
        } else if (gameData.currentWord) {
            currentWord = gameData.currentWord;
            if (waitingOverlay) waitingOverlay.style.display = 'none';
            // Show underscores for word
            if (!hasGuessedCorrectly) {
                const underscores = '_ '.repeat(gameData.currentWord.length);
                if (wordDisplay) wordDisplay.textContent = underscores;
            } else {
                if (wordDisplay) wordDisplay.textContent = gameData.currentWord;
            }
        }
    }
    
    // Handle round end
    if (gameData.status === 'ended' && gameData.lastWord) {
        addSystemMessage(`Round ended! The word was: ${gameData.lastWord}`);
        // Clear canvas after showing result
        setTimeout(() => {
            clearCanvasLocal();
        }, 3000);
    }
}

function showWordSelection() {
    const modal = document.getElementById('wordModal');
    const options = document.getElementById('wordOptions');
    if (!modal || !options) return;
    
    options.innerHTML = '';
    
    // Get 3 random words
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
    const modal = document.getElementById('wordModal');
    if (modal) modal.style.display = 'none';
    
    currentWord = word;
    
    try {
        await update(ref(db, `rooms/${roomId}/game`), {
            currentWord: word,
            status: 'drawing',
            timeLeft: 80
        });
        
        // Clear canvas
        clearCanvasLocal();
        
        // Start timer
        startTimer();
    } catch (error) {
        console.error("Error selecting word:", error);
        showError("Failed to start round. Please try again.");
    }
}

function startTimer() {
    if (gameInterval) clearInterval(gameInterval);
    
    gameInterval = setInterval(async () => {
        timeLeft--;
        
        try {
            await update(ref(db, `rooms/${roomId}/game`), { timeLeft });
        } catch (error) {
            console.error("Timer update error:", error);
        }
        
        if (timeLeft <= 0) {
            endRound();
        }
    }, 1000);
}

async function endRound() {
    if (gameInterval) clearInterval(gameInterval);
    
    try {
        const gameRef = ref(db, `rooms/${roomId}/game`);
        const snapshot = await get(gameRef);
        const gameData = snapshot.val();
        
        if (!gameData) return;
        
        // Move to next player
        const playersSnapshot = await get(ref(db, `rooms/${roomId}/players`));
        const players = Object.keys(playersSnapshot.val() || {});
        
        if (players.length === 0) return;
        
        const currentIndex = players.indexOf(gameData.currentDrawer);
        const nextIndex = (currentIndex + 1) % players.length;
        const nextDrawer = players[nextIndex];
        
        await update(gameRef, {
            currentDrawer: nextDrawer,
            currentWord: null,
            status: 'choosing',
            lastWord: gameData.currentWord,
            timeLeft: 80
        });
        
        // Clear drawing
        await remove(ref(db, `rooms/${roomId}/drawing`));
        
        // Clear canvas locally for everyone
        clearCanvasLocal();
    } catch (error) {
        console.error("Error ending round:", error);
    }
}

function setupCanvasEvents() {
    if (!canvas) return;
    
    let lastX = 0;
    let lastY = 0;
    
    function getCoordinates(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    }
    
    function startDrawing(e) {
        if (!isDrawer) return;
        isDrawing = true;
        const coords = getCoordinates(e);
        lastX = coords.x;
        lastY = coords.y;
    }
    
    function draw(e) {
        if (!isDrawing || !isDrawer) return;
        if (e.preventDefault) e.preventDefault();
        
        const coords = getCoordinates(e);
        
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(coords.x, coords.y);
        
        if (currentTool === 'eraser') {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = currentSize * 2;
        } else {
            ctx.strokeStyle = currentColor;
            ctx.lineWidth = currentSize;
        }
        
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        
        // Save drawing data to Firebase
        const drawData = {
            x0: lastX,
            y0: lastY,
            x1: coords.x,
            y1: coords.y,
            color: currentTool === 'eraser' ? '#ffffff' : currentColor,
            size: currentTool === 'eraser' ? currentSize * 2 : currentSize,
            timestamp: Date.now()
        };
        
        push(ref(db, `rooms/${roomId}/drawing`), drawData);
        
        lastX = coords.x;
        lastY = coords.y;
    }
    
    function stopDrawing() {
        isDrawing = false;
    }
    
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);
    
    // Touch support
    canvas.addEventListener('touchstart', startDrawing, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', stopDrawing);
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

// Tools
window.setColor = function(color, btn) {
    currentColor = color;
    currentTool = 'brush';
    document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    
    // Update brush button
    const brushBtn = document.getElementById('brushTool');
    if (brushBtn) brushBtn.classList.add('active');
};

window.setBrushSize = function(size, btn) {
    currentSize = size;
    document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
};

window.setTool = function(tool) {
    currentTool = tool;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
};

window.clearCanvas = async function() {
    clearCanvasLocal();
    try {
        await remove(ref(db, `rooms/${roomId}/drawing`));
    } catch (error) {
        console.error("Error clearing canvas:", error);
    }
};

function clearCanvasLocal() {
    if (!ctx) return;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// Chat
window.handleChatKeypress = function(e) {
    if (e.key === 'Enter') {
        const input = document.getElementById('chatInput');
        if (!input) return;
        
        const message = input.value.trim();
        if (!message) return;
        
        // Check if correct guess (only if not drawer and haven't guessed correctly yet)
        if (!isDrawer && !hasGuessedCorrectly && currentWord && message.toLowerCase() === currentWord.toLowerCase()) {
            handleCorrectGuess();
            hasGuessedCorrectly = true;
            input.value = '';
            return; // Don't send the correct word in chat
        }
        
        sendChatMessage(message);
        input.value = '';
    }
};

async function sendChatMessage(message) {
    try {
        const chatRef = ref(db, `rooms/${roomId}/chat`);
        await push(chatRef, {
            username: playerName,
            message: message,
            uid: currentUser?.uid,
            timestamp: Date.now(),
            type: 'guess'
        });
    } catch (error) {
        console.error("Error sending message:", error);
    }
}

async function handleCorrectGuess() {
    try {
        // Update score
        const playerRef = ref(db, `rooms/${roomId}/players/${currentUser.uid}`);
        const snapshot = await get(playerRef);
        const currentScore = snapshot.val()?.score || 0;
        
        await update(playerRef, {
            score: currentScore + Math.ceil(timeLeft / 2) + 10
        });
        
        // Announce correct guess
        const chatRef = ref(db, `rooms/${roomId}/chat`);
        await push(chatRef, {
            username: 'System',
            message: `${playerName} guessed the word!`,
            type: 'system',
            timestamp: Date.now()
        });
    } catch (error) {
        console.error("Error handling correct guess:", error);
    }
}

function updateChat(messages) {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (!messages) return;
    
    const sortedMessages = Object.values(messages).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    
    sortedMessages.forEach(msg => {
        const div = document.createElement('div');
        div.className = 'chat-message';
        
        if (msg.type === 'system') {
            div.classList.add('system');
            div.textContent = msg.message;
        } else {
            div.classList.add(msg.type || 'guess');
            div.innerHTML = `
                <div class="username">${msg.username || 'Unknown'}</div>
                <div class="text">${msg.message}</div>
            `;
        }
        
        container.appendChild(div);
    });
    
    container.scrollTop = container.scrollHeight;
}

function addSystemMessage(message) {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    
    const div = document.createElement('div');
    div.className = 'chat-message system';
    div.textContent = message;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

async function checkGameStart() {
    try {
        const gameRef = ref(db, `rooms/${roomId}/game`);
        const snapshot = await get(gameRef);
        
        if (!snapshot.exists()) {
            // First player, initialize game
            console.log("Initializing new game...");
            await set(gameRef, {
                currentDrawer: currentUser.uid,
                status: 'choosing',
                timeLeft: 80,
                round: 1
            });
        }
    } catch (error) {
        console.error("Error checking game start:", error);
    }
}
