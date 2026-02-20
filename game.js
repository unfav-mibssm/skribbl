// game.js
import { db, auth, signInUser } from './firebase-config.js';
import { 
    ref, set, onValue, push, update, remove, onDisconnect,
    serverTimestamp 
} from "firebase/database";

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
    'glasses', 'hat', 'shoe', 'glove', 'umbrella', 'backpack'
];

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    
    // Set canvas white background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Setup color palette
    setupColorPalette();
    
    // Authenticate user
    try {
        await signInUser();
    } catch (error) {
        console.error('Auth error:', error);
    }
});

function setupColorPalette() {
    const palette = document.getElementById('colorPalette');
    colors.forEach(color => {
        const btn = document.createElement('div');
        btn.className = 'color-btn';
        btn.style.backgroundColor = color;
        if (color === '#000000') btn.classList.add('active');
        btn.onclick = () => setColor(color, btn);
        palette.appendChild(btn);
    });
}

// Join Game
window.joinGame = async function() {
    playerName = document.getElementById('playerName').value.trim();
    let roomCode = document.getElementById('roomCode').value.trim().toUpperCase();
    
    if (!playerName) {
        alert('Please enter your name!');
        return;
    }
    
    // Generate room code if not provided
    if (!roomCode) {
        roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    }
    
    roomId = roomCode;
    currentUser = auth.currentUser;
    
    // Join room
    const playerRef = ref(db, `rooms/${roomId}/players/${currentUser.uid}`);
    await set(playerRef, {
        name: playerName,
        score: 0,
        isActive: true,
        joinedAt: serverTimestamp()
    });
    
    // Handle disconnect
    onDisconnect(playerRef).remove();
    
    // Show game screen
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('gameScreen').style.display = 'block';
    document.getElementById('displayRoomCode').textContent = roomId;
    
    // Initialize game
    initGame();
};

function initGame() {
    // Listen to players
    onValue(ref(db, `rooms/${roomId}/players`), (snapshot) => {
        updatePlayersList(snapshot.val());
    });
    
    // Listen to game state
    onValue(ref(db, `rooms/${roomId}/game`), (snapshot) => {
        handleGameState(snapshot.val());
    });
    
    // Listen to drawing
    onValue(ref(db, `rooms/${roomId}/drawing`), (snapshot) => {
        if (!isDrawer) {
            const data = snapshot.val();
            if (data) replayDrawing(data);
        }
    });
    
    // Listen to chat
    onValue(ref(db, `rooms/${roomId}/chat`), (snapshot) => {
        updateChat(snapshot.val());
    });
    
    // Setup canvas events
    setupCanvasEvents();
    
    // Check if we need to start game
    checkGameStart();
}

function updatePlayersList(players) {
    const container = document.getElementById('playersList');
    container.innerHTML = '';
    
    if (!players) return;
    
    Object.entries(players).forEach(([uid, player]) => {
        const div = document.createElement('div');
        div.className = 'player-item';
        if (uid === currentUser.uid) div.classList.add('current-drawer');
        
        div.innerHTML = `
            <div class="player-avatar">${player.name[0].toUpperCase()}</div>
            <div class="player-info">
                <div class="player-name">${player.name} ${uid === currentUser.uid ? '(You)' : ''}</div>
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
        document.getElementById('timer').textContent = gameData.timeLeft;
        timeLeft = gameData.timeLeft;
    }
    
    // Check if it's our turn to draw
    isDrawer = gameData.currentDrawer === currentUser.uid;
    
    // Update UI based on drawer status
    if (isDrawer) {
        document.getElementById('toolsBar').style.display = 'flex';
        document.getElementById('waitingOverlay').style.display = 'none';
        
        if (gameData.status === 'choosing' && !gameData.currentWord) {
            showWordSelection();
        } else if (gameData.currentWord) {
            document.getElementById('wordDisplay').textContent = gameData.currentWord;
        }
    } else {
        document.getElementById('toolsBar').style.display = 'none';
        
        if (gameData.status === 'choosing') {
            document.getElementById('waitingOverlay').style.display = 'flex';
            document.getElementById('wordDisplay').textContent = 'Choosing word...';
        } else if (gameData.currentWord) {
            document.getElementById('waitingOverlay').style.display = 'none';
            // Show underscores for word
            const underscores = '_ '.repeat(gameData.currentWord.length);
            document.getElementById('wordDisplay').textContent = underscores;
        }
    }
    
    // Handle round end
    if (gameData.status === 'ended') {
        addSystemMessage(`Round ended! The word was: ${gameData.lastWord}`);
    }
}

function showWordSelection() {
    const modal = document.getElementById('wordModal');
    const options = document.getElementById('wordOptions');
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
    document.getElementById('wordModal').style.display = 'none';
    currentWord = word;
    
    await update(ref(db, `rooms/${roomId}/game`), {
        currentWord: word,
        status: 'drawing',
        timeLeft: 80
    });
    
    // Clear canvas
    clearCanvasLocal();
    
    // Start timer
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
    clearInterval(gameInterval);
    
    const gameRef = ref(db, `rooms/${roomId}/game`);
    const snapshot = await get(gameRef);
    const gameData = snapshot.val();
    
    // Move to next player
    const playersSnapshot = await get(ref(db, `rooms/${roomId}/players`));
    const players = Object.keys(playersSnapshot.val() || {});
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
}

function setupCanvasEvents() {
    let lastX = 0;
    let lastY = 0;
    
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
        if (!isDrawer) return;
        isDrawing = true;
        const coords = getCoordinates(e);
        lastX = coords.x;
        lastY = coords.y;
    }
    
    function draw(e) {
        if (!isDrawing || !isDrawer) return;
        e.preventDefault();
        
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
    canvas.addEventListener('touchstart', startDrawing);
    canvas.addEventListener('touchmove', draw);
    canvas.addEventListener('touchend', stopDrawing);
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

// Tools
window.setColor = function(color, btn) {
    currentColor = color;
    currentTool = 'brush';
    document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
};

window.setBrushSize = function(size) {
    currentSize = size;
    document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
};

window.setTool = function(tool) {
    currentTool = tool;
};

window.clearCanvas = async function() {
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await remove(ref(db, `rooms/${roomId}/drawing`));
};

function clearCanvasLocal() {
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// Chat
window.handleChatKeypress = function(e) {
    if (e.key === 'Enter') {
        const input = document.getElementById('chatInput');
        const message = input.value.trim();
        if (!message) return;
        
        // Check if correct guess
        if (!isDrawer && message.toLowerCase() === currentWord.toLowerCase()) {
            handleCorrectGuess();
        }
        
        sendChatMessage(message);
        input.value = '';
    }
};

async function sendChatMessage(message) {
    const chatRef = ref(db, `rooms/${roomId}/chat`);
    await push(chatRef, {
        username: playerName,
        message: message,
        uid: currentUser.uid,
        timestamp: serverTimestamp(),
        type: 'guess'
    });
}

async function handleCorrectGuess() {
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
        timestamp: serverTimestamp()
    });
}

function updateChat(messages) {
    const container = document.getElementById('chatMessages');
    container.innerHTML = '';
    
    if (!messages) return;
    
    Object.values(messages).sort((a, b) => a.timestamp - b.timestamp).forEach(msg => {
        const div = document.createElement('div');
        div.className = 'chat-message';
        
        if (msg.type === 'system') {
            div.classList.add('system');
            div.textContent = msg.message;
        } else {
            div.classList.add(msg.type || 'guess');
            div.innerHTML = `
                <div class="username">${msg.username}</div>
                <div class="text">${msg.message}</div>
            `;
        }
        
        container.appendChild(div);
    });
    
    container.scrollTop = container.scrollHeight;
}

function addSystemMessage(message) {
    const container = document.getElementById('chatMessages');
    const div = document.createElement('div');
    div.className = 'chat-message system';
    div.textContent = message;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

async function checkGameStart() {
    const gameRef = ref(db, `rooms/${roomId}/game`);
    const snapshot = await get(gameRef);
    
    if (!snapshot.exists()) {
        // First player, initialize game
        await set(gameRef, {
            currentDrawer: currentUser.uid,
            status: 'choosing',
            timeLeft: 80,
            round: 1
        });
    }
}

// Import get for async checks
import { get } from "firebase/database";
