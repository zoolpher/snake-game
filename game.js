"use strict";

// ============================================================
// CANVAS & CONFIGURATION
// ============================================================
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const GRID_SIZE = 20; // 20x20 grid (each cell is 20px)
const TILE_COUNT = canvas.width / GRID_SIZE; // 20 tiles

let snake = [];
let food = { x: 15, y: 15 };
let dx = 1;
let dy = 0;
let nextDx = 1;
let nextDy = 0;

let score = 0;
let highScore = localStorage.getItem("snake_high_score") || 0;
let gameInterval = null;
let isPlaying = false;
let particles = [];

// DOM Elements
const currentScoreEl = document.getElementById("currentScore");
const highScoreEl = document.getElementById("highScore");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlaySubtitle = document.getElementById("overlaySubtitle");
const startBtn = document.getElementById("startBtn");
const speedSlider = document.getElementById("speedSlider");
const speedValueText = document.getElementById("speedValueText");

// Speed calculation: Level 1 (Slow 185ms) to Level 10 (Hyper 45ms)
function getSpeedDelay(level) {
    return Math.round(200 - (level * 15.5));
}

function getSpeedLabel(level) {
    if (level <= 2) return `SLOW (${level})`;
    if (level <= 4) return `EASY (${level})`;
    if (level <= 6) return `NORMAL (${level})`;
    if (level <= 8) return `FAST (${level})`;
    return `HYPER 🔥 (${level})`;
}

let currentSpeedDelay = getSpeedDelay(parseInt(speedSlider ? speedSlider.value : 5, 10));

if (speedSlider) {
    speedSlider.addEventListener("input", (e) => {
        const val = parseInt(e.target.value, 10);
        currentSpeedDelay = getSpeedDelay(val);
        if (speedValueText) speedValueText.textContent = getSpeedLabel(val);

        // Dynamically update game speed live while playing!
        if (isPlaying) {
            clearInterval(gameInterval);
            gameInterval = setInterval(gameLoop, currentSpeedDelay);
        }
    });
}

highScoreEl.textContent = highScore;

// ============================================================
// RETRO SYNTH AUDIO (Pure Web Audio API - No external assets)
// ============================================================
let audioCtx = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playSound(type) {
    if (!audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        const now = audioCtx.currentTime;

        if (type === "eat") {
            osc.type = "sine";
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
            osc.start(now);
            osc.stop(now + 0.12);
        } else if (type === "die") {
            osc.type = "sawtooth";
            osc.frequency.setValueAtTime(220, now);
            osc.frequency.exponentialRampToValueAtTime(55, now + 0.35);
            gain.gain.setValueAtTime(0.4, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
            osc.start(now);
            osc.stop(now + 0.35);
        }
    } catch (e) {
        // Audio playback fallback ignored
    }
}

// ============================================================
// GAME INITIALIZATION
// ============================================================
function resetGame() {
    snake = [
        { x: 8, y: 10 },
        { x: 7, y: 10 },
        { x: 6, y: 10 }
    ];
    dx = 1;
    dy = 0;
    nextDx = 1;
    nextDy = 0;
    score = 0;
    particles = [];
    currentScoreEl.textContent = score;
    spawnFood();
}

function spawnFood() {
    let valid = false;
    while (!valid) {
        food.x = Math.floor(Math.random() * TILE_COUNT);
        food.y = Math.floor(Math.random() * TILE_COUNT);
        valid = !snake.some(segment => segment.x === food.x && segment.y === food.y);
    }
}

function startGame() {
    initAudio();
    resetGame();
    isPlaying = true;
    overlay.classList.add("hidden");

    if (gameInterval) clearInterval(gameInterval);
    gameInterval = setInterval(gameLoop, 110); // Steady responsive tick speed
}

function gameOver() {
    isPlaying = false;
    clearInterval(gameInterval);
    playSound("die");

    if (score > highScore) {
        highScore = score;
        localStorage.setItem("snake_high_score", highScore);
        highScoreEl.textContent = highScore;
    }

    overlayTitle.textContent = "GAME OVER";
    overlaySubtitle.textContent = `Score: ${score} | Best: ${highScore}`;
    startBtn.textContent = "PLAY AGAIN";
    overlay.classList.remove("hidden");
}

// ============================================================
// PARTICLE EXPLOSION EFFECT
// ============================================================
function createFoodBurst(x, y) {
    const px = x * GRID_SIZE + GRID_SIZE / 2;
    const py = y * GRID_SIZE + GRID_SIZE / 2;
    for (let i = 0; i < 12; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 3 + 1;
        particles.push({
            x: px,
            y: py,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1.0,
            color: Math.random() > 0.5 ? "#00ff88" : "#ff0077"
        });
    }
}

function updateAndDrawParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.05;

        if (p.life <= 0) {
            particles.splice(i, 1);
            continue;
        }

        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

// ============================================================
// MAIN GAME LOOP & RENDERING
// ============================================================
function gameLoop() {
    // Apply buffered direction change
    dx = nextDx;
    dy = nextDy;

    // Move head
    const head = { x: snake[0].x + dx, y: snake[0].y + dy };

    // Wall collision (Wrap around or Die - here we die for classic challenge)
    if (head.x < 0 || head.x >= TILE_COUNT || head.y < 0 || head.y >= TILE_COUNT) {
        gameOver();
        return;
    }

    // Self collision
    if (snake.some(segment => segment.x === head.x && segment.y === head.y)) {
        gameOver();
        return;
    }

    snake.unshift(head);

    // Food collision
    if (head.x === food.x && head.y === food.y) {
        score += 10;
        currentScoreEl.textContent = score;
        createFoodBurst(food.x, food.y);
        playSound("eat");
        spawnFood();
    } else {
        snake.pop(); // Remove tail
    }

    render();
}

function render() {
    // Background clear with slight grid
    ctx.fillStyle = "#090d16";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle grid pattern
    ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= canvas.width; i += GRID_SIZE) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, canvas.height);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(canvas.width, i);
        ctx.stroke();
    }

    // Draw Food (Pulsing glowing orb)
    ctx.shadowBlur = 15;
    ctx.shadowColor = "#ff0077";
    ctx.fillStyle = "#ff0077";
    ctx.beginPath();
    ctx.arc(
        food.x * GRID_SIZE + GRID_SIZE / 2,
        food.y * GRID_SIZE + GRID_SIZE / 2,
        GRID_SIZE / 2 - 2,
        0,
        Math.PI * 2
    );
    ctx.fill();
    ctx.shadowBlur = 0; // reset shadow

    // Draw Snake
    snake.forEach((segment, index) => {
        const isHead = index === 0;

        if (isHead) {
            ctx.shadowBlur = 16;
            ctx.shadowColor = "#00ff88";
            ctx.fillStyle = "#00ff88";
        } else {
            ctx.shadowBlur = 0;
            // Gradient green to cyan along body
            ctx.fillStyle = index % 2 === 0 ? "#00d977" : "#00bcd4";
        }

        ctx.fillRect(
            segment.x * GRID_SIZE + 1,
            segment.y * GRID_SIZE + 1,
            GRID_SIZE - 2,
            GRID_SIZE - 2
        );
    });
    ctx.shadowBlur = 0;

    // Draw particle bursts
    updateAndDrawParticles();
}

// Initial idle draw
render();

// ============================================================
// CONTROLS & EVENT LISTENERS
// ============================================================
function setDirection(newDx, newDy) {
    // Prevent 180 degree instant reversal
    if (newDx !== 0 && dx === -newDx) return;
    if (newDy !== 0 && dy === -newDy) return;
    nextDx = newDx;
    nextDy = newDy;
}

window.addEventListener("keydown", (e) => {
    const isArrowOrWasd = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "W", "s", "S", "a", "A", "d", "D"].includes(e.key);
    
    // Prevent default browser scrolling on arrow keys and space
    if (isArrowOrWasd || e.code === "Space") {
        e.preventDefault();
    }

    // If game is not active, ANY arrow key, WASD, Space, or Enter immediately starts it!
    if (!isPlaying) {
        if (isArrowOrWasd || e.code === "Space" || e.key === "Enter") {
            startGame();
            // Apply initial direction if an arrow key was pressed to start
            if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") setDirection(0, -1);
            else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") setDirection(0, 1);
            else if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") setDirection(-1, 0);
            else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") setDirection(1, 0);
        }
        return;
    }

    // In-game directional controls
    switch (e.key) {
        case "ArrowUp":
        case "w":
        case "W":
            setDirection(0, -1);
            break;
        case "ArrowDown":
        case "s":
        case "S":
            setDirection(0, 1);
            break;
        case "ArrowLeft":
        case "a":
        case "A":
            setDirection(-1, 0);
            break;
        case "ArrowRight":
        case "d":
        case "D":
            setDirection(1, 0);
            break;
    }
});

// Touch D-Pad buttons
document.getElementById("btnUp").addEventListener("click", () => setDirection(0, -1));
document.getElementById("btnDown").addEventListener("click", () => setDirection(0, 1));
document.getElementById("btnLeft").addEventListener("click", () => setDirection(-1, 0));
document.getElementById("btnRight").addEventListener("click", () => setDirection(1, 0));

// Canvas swipe gesture controls for mobile touchscreens
let touchStartX = 0;
let touchStartY = 0;

canvas.addEventListener("touchstart", (e) => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
}, { passive: true });

canvas.addEventListener("touchend", (e) => {
    const diffX = e.changedTouches[0].screenX - touchStartX;
    const diffY = e.changedTouches[0].screenY - touchStartY;

    if (Math.abs(diffX) > Math.abs(diffY)) {
        // Horizontal swipe
        if (diffX > 30) setDirection(1, 0);
        else if (diffX < -30) setDirection(-1, 0);
    } else {
        // Vertical swipe
        if (diffY > 30) setDirection(0, 1);
        else if (diffY < -30) setDirection(0, -1);
    }
}, { passive: true });

startBtn.addEventListener("click", startGame);
