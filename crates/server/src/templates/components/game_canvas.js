// Game canvas rendering, input handling, and game loop
// All game state is managed by the deterministic WASM engine.
// This JS layer handles: input capture, rendering, and input recording.

let engine = null;
let recorder = null;
let sessionId = null;
let gameInterval = null;
let gameSeed = null;
let pendingGameStart = false;

const FRAME_MS = 1000 / 60; // Fixed 60fps for determinism
const TIMING_SAMPLE_INTERVAL = 60; // Sample timing every 60 frames (once per second)

// Input state — tracks which keys are currently held
const keys = { thrust: false, left: false, right: false, shoot: false };

// Game timing
let gameStartTime = 0;
let frameCounter = 0;
let lastTimingSample = 0;
let timingSamples = [];

// DOM elements
let canvas, ctx, scoreElement, levelElement, timeElement, livesElement;
let gameOverDialog, finalScoreElement, restartButton;

// Sound effects
const sounds = { shoot: new Audio(), explosion: new Audio(), levelUp: new Audio() };
try {
    sounds.shoot.src = "https://www.soundjay.com/mechanical/sounds/laser-gun-19.mp3";
    sounds.explosion.src = "https://www.soundjay.com/mechanical/sounds/explosion-01.mp3";
    sounds.levelUp.src = "https://www.soundjay.com/mechanical/sounds/beep-07.mp3";
    Object.values(sounds).forEach((s) => { s.volume = 0.3; });
} catch (e) { /* sounds are optional */ }

function playSound(sound) {
    if (sound) { sound.currentTime = 0; sound.play().catch(() => {}); }
}

function initializeElements() {
    console.log("Initializing game elements");
    canvas = document.getElementById("gameCanvas");
    if (!canvas) {
        console.warn("Game canvas element not found - may not be on game page");
        return false;
    }
    ctx = canvas.getContext("2d");
    scoreElement = document.getElementById("score");
    levelElement = document.getElementById("level");
    timeElement = document.getElementById("time");
    livesElement = document.getElementById("lives");
    gameOverDialog = document.getElementById("game-over-dialog");
    finalScoreElement = document.getElementById("final-score");
    restartButton = document.getElementById("restart-button");

    if (restartButton) {
        restartButton.addEventListener("click", function () {
            if (gameOverDialog) gameOverDialog.style.display = "none";
            startGame();
        });
    }
    console.log("Game elements initialized successfully");
    return true;
}

function startGame() {
    console.log("Starting game...");
    const startGameBtn = document.getElementById("startGameBtn");
    if (startGameBtn) {
        startGameBtn.disabled = true;
        startGameBtn.textContent = "Loading...";
    }

    window.initializePaymentHandler()
        .then((paymentHandler) => {
            console.log("Payment handler ready, requesting game session");
            return paymentHandler.requestGameSession();
        })
        .then((result) => {
            if (startGameBtn) {
                startGameBtn.disabled = false;
                startGameBtn.textContent = "Start Game";
            }
            if (result && result.success) {
                startGameWithConfig(result.data);
            } else if (result && result.requiresPayment) {
                console.log("Waiting for payment to complete...");
                pendingGameStart = true;
            } else {
                console.error("Failed to start game:", result ? result.error : "Unknown error");
                alert("Failed to start game. Please try again.");
            }
        })
        .catch((error) => {
            console.error("Error starting game:", error);
            if (startGameBtn) {
                startGameBtn.disabled = false;
                startGameBtn.textContent = "Start Game";
            }
        });
}

function startGameWithConfig(sessionData) {
    console.log("Starting game with config:", sessionData);

    const startScreen = document.getElementById("start-screen");
    if (startScreen) startScreen.style.display = "none";
    const gameContainer = document.querySelector(".game-container");
    if (gameContainer) gameContainer.style.display = "block";

    sessionId = sessionData.config.sessionId || sessionData.config.session_id;

    // Parse seed from hex string into two u32 halves for WASM
    const seedHex = sessionData.config.seed || "0000000000000000";
    gameSeed = seedHex;
    const seedHigh = parseInt(seedHex.substring(0, 8), 16) >>> 0;
    const seedLow = parseInt(seedHex.substring(8, 16), 16) >>> 0;

    // Get engine config (snake_case JSON from server)
    const engineConfig = sessionData.config.engineConfig || sessionData.config.engine_config;
    const configJson = typeof engineConfig === "string" ? engineConfig : JSON.stringify(engineConfig);

    console.log("Creating WASM engine with seed:", seedHex);

    try {
        engine = new window.GameEngine(seedHigh, seedLow, configJson);
        recorder = new window.InputRecorder();
    } catch (e) {
        console.error("Failed to create WASM game engine:", e);
        alert("Failed to initialize game engine.");
        return;
    }

    if (!canvas || !ctx) {
        if (!initializeElements()) {
            console.error("Cannot start game: Canvas element not found");
            return;
        }
    }

    gameStartTime = Date.now();
    frameCounter = 0;
    lastTimingSample = 0;
    timingSamples = [];
    pendingGameStart = false;

    // Start the fixed-timestep game loop
    if (gameInterval) clearInterval(gameInterval);
    gameInterval = setInterval(gameTick, FRAME_MS);
}

function gameTick() {
    if (!engine) return;

    // Record input and advance engine
    recorder.record(keys.thrust, keys.left, keys.right, keys.shoot);
    engine.tick(keys.thrust, keys.left, keys.right, keys.shoot);

    // Sample frame timing every TIMING_SAMPLE_INTERVAL frames
    frameCounter++;
    if (frameCounter % TIMING_SAMPLE_INTERVAL === 0) {
        const now = performance.now();
        if (lastTimingSample > 0) {
            // Expected: TIMING_SAMPLE_INTERVAL * FRAME_MS ms (~1000ms)
            const expected = TIMING_SAMPLE_INTERVAL * FRAME_MS;
            const delta = now - lastTimingSample;
            // Offset from expected in microseconds
            const offsetUs = Math.round((delta - expected) * 1000);
            timingSamples.push(Math.max(-32768, Math.min(32767, offsetUs)));
        }
        lastTimingSample = now;
    }

    // Get state and render
    const stateJson = engine.get_state_json();
    const state = JSON.parse(stateJson);

    render(state);

    // Update HUD
    if (scoreElement) scoreElement.textContent = state.score;
    if (levelElement) levelElement.textContent = state.level;
    if (timeElement) timeElement.textContent = Math.floor((Date.now() - gameStartTime) / 1000);
    if (livesElement) livesElement.textContent = "♦ ".repeat(state.lives).trim();

    // Draw phase name at top center
    if (state.phase) {
        ctx.fillStyle = "#888";
        ctx.font = "12px monospace";
        ctx.textAlign = "center";
        ctx.fillText(state.phase, canvas.width / 2, 15);
        ctx.textAlign = "start";
    }

    // Draw active power-up indicator
    if (state.active_power_up) {
        const ap = state.active_power_up;
        const colors = { RapidFire: "#ffff00", Shield: "#00ffff", SpreadShot: "#ff00ff", SpeedBoost: "#ff8800" };
        ctx.fillStyle = colors[ap.power_type] || "#fff";
        ctx.font = "11px monospace";
        const label = ap.power_type === "Shield" ? "SHIELD" : `${ap.power_type.toUpperCase()} ${ap.remaining_secs.toFixed(1)}s`;
        ctx.fillText(label, canvas.width - 150, 15);
    }

    // Draw time bonus flash
    if (state.last_time_bonus > 0 && state.frame % 60 < 30) {
        ctx.fillStyle = "#ffff00";
        ctx.font = "16px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`TIME BONUS +${state.last_time_bonus}`, canvas.width / 2, 35);
        ctx.textAlign = "start";
    }

    // Draw shield circle around ship if active
    if (state.active_power_up && state.active_power_up.power_type === "Shield") {
        ctx.strokeStyle = "#00ffff";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(state.ship.x, state.ship.y, state.ship.radius * 2, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Check game over
    if (state.game_over) {
        clearInterval(gameInterval);
        gameInterval = null;
        handleGameOver(state);
    }
}

function render(state) {
    if (!ctx) return;

    // Clear
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw ship
    const ship = state.ship;
    ctx.strokeStyle = ship.invulnerable && Math.floor(Date.now() / 100) % 2 === 0 ? "gray" : "white";
    ctx.lineWidth = 2;
    ctx.beginPath();

    const x1 = ship.x + ship.radius * Math.cos(ship.angle);
    const y1 = ship.y - ship.radius * Math.sin(ship.angle);
    const x2 = ship.x - ship.radius * (Math.cos(ship.angle) + Math.sin(ship.angle));
    const y2 = ship.y + ship.radius * (Math.sin(ship.angle) - Math.cos(ship.angle));
    const x3 = ship.x - ship.radius * (Math.cos(ship.angle) - Math.sin(ship.angle));
    const y3 = ship.y + ship.radius * (Math.sin(ship.angle) + Math.cos(ship.angle));

    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.closePath();
    ctx.stroke();

    // Draw thrust flame
    if (ship.thrusting) {
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        const tx1 = ship.x - ship.radius * 1.5 * Math.cos(ship.angle);
        const ty1 = ship.y + ship.radius * 1.5 * Math.sin(ship.angle);
        ctx.lineTo(tx1, ty1);
        ctx.lineTo(x3, y3);
        ctx.strokeStyle = "orange";
        ctx.stroke();
    }

    // Draw bullets
    ctx.fillStyle = "white";
    for (const bullet of state.bullets) {
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
        ctx.fill();
    }

    // Draw power-ups
    for (const pu of (state.power_ups || [])) {
        const colors = { RapidFire: "#ffff00", Shield: "#00ffff", SpreadShot: "#ff00ff", SpeedBoost: "#ff8800" };
        ctx.fillStyle = colors[pu.power_type] || "#ffffff";
        ctx.beginPath();
        ctx.arc(pu.x, pu.y, pu.radius, 0, Math.PI * 2);
        ctx.fill();
        // Pulsing effect
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(pu.x, pu.y, pu.radius * 1.5 * (0.8 + 0.2 * Math.sin(Date.now() / 200)), 0, Math.PI * 2);
        ctx.stroke();
    }

    // Draw enemies
    for (const enemy of (state.enemies || [])) {
        const isBoss = enemy.enemy_type === "Boss";
        ctx.strokeStyle = enemy.enemy_type === "Drone" ? "#00ff00"
            : enemy.enemy_type === "Fighter" ? "#ff4444"
            : isBoss ? "#ff00ff"
            : "#ffaa00"; // Bomber
        ctx.lineWidth = 2;
        ctx.beginPath();
        // Diamond shape for enemies
        const er = enemy.radius;
        ctx.moveTo(enemy.x + er * Math.cos(enemy.angle), enemy.y - er * Math.sin(enemy.angle));
        ctx.lineTo(enemy.x + er * 0.6 * Math.cos(enemy.angle + 1.5), enemy.y - er * 0.6 * Math.sin(enemy.angle + 1.5));
        ctx.lineTo(enemy.x - er * Math.cos(enemy.angle), enemy.y + er * Math.sin(enemy.angle));
        ctx.lineTo(enemy.x + er * 0.6 * Math.cos(enemy.angle - 1.5), enemy.y - er * 0.6 * Math.sin(enemy.angle - 1.5));
        ctx.closePath();
        ctx.stroke();

        // Boss HP bar
        if (isBoss) {
            const barWidth = enemy.radius * 2;
            const barHeight = 3;
            const barX = enemy.x - barWidth / 2;
            const barY = enemy.y - enemy.radius - 8;
            ctx.fillStyle = "#333";
            ctx.fillRect(barX, barY, barWidth, barHeight);
            ctx.fillStyle = "#ff00ff";
            // We don't know max HP from render state, so show proportionally
            ctx.fillRect(barX, barY, barWidth * Math.min(enemy.hp / 10, 1), barHeight);
        }
    }

    // Draw enemy bullets
    ctx.fillStyle = "#ff4444";
    for (const eb of (state.enemy_bullets || [])) {
        ctx.beginPath();
        ctx.arc(eb.x, eb.y, eb.radius, 0, Math.PI * 2);
        ctx.fill();
    }

    // Draw asteroids
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    for (const asteroid of state.asteroids) {
        ctx.beginPath();
        for (let j = 0; j < asteroid.vertices; j++) {
            const angle = (j * Math.PI * 2) / asteroid.vertices;
            const offset = asteroid.offsets[j] || 1;
            const ax = asteroid.x + asteroid.radius * offset * Math.cos(angle + asteroid.angle);
            const ay = asteroid.y + asteroid.radius * offset * Math.sin(angle + asteroid.angle);
            if (j === 0) ctx.moveTo(ax, ay);
            else ctx.lineTo(ax, ay);
        }
        ctx.closePath();
        ctx.stroke();
    }
}

async function handleGameOver(state) {
    playSound(sounds.explosion);

    if (finalScoreElement) finalScoreElement.textContent = state.score;

    if (window.gameAuth && window.gameAuth.isLoggedIn() && sessionId && recorder) {
        const gameTime = Math.floor((Date.now() - gameStartTime) / 1000);
        const inputLog = recorder.finish(); // Uint8Array
        const frameCount = recorder.frame_count();

        // Compute SHA-256 hash of input log
        const hashBuffer = await crypto.subtle.digest("SHA-256", inputLog);
        const inputHash = Array.from(new Uint8Array(hashBuffer))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");

        // Base64 encode the input log
        const inputLogBase64 = btoa(String.fromCharCode(...inputLog));

        // Encode frame timings as Int16Array -> base64
        let frameTimingsB64 = null;
        if (timingSamples.length > 0) {
            const timingBuffer = new Int16Array(timingSamples);
            const timingBytes = new Uint8Array(timingBuffer.buffer);
            frameTimingsB64 = btoa(String.fromCharCode(...timingBytes));
        }

        await submitScore(state.score, state.level, gameTime, inputLogBase64, inputHash, frameCount, frameTimingsB64);
    }

    if (gameOverDialog) gameOverDialog.style.display = "block";
}

async function submitScore(score, level, gameTime, inputLog, inputHash, frames, frameTimings) {
    if (!window.gameAuth || !window.gameAuth.isLoggedIn() || !sessionId) {
        console.warn("No session ID available, cannot submit score");
        return;
    }
    try {
        const apiBase = window.API_BASE || document.body.getAttribute("data-api-base") || "";
        const response = await window.gameAuth.post(`${apiBase}/api/v1/game/score`, {
            score: score,
            level: level,
            play_time: gameTime,
            session_id: sessionId,
            input_log: inputLog,
            input_hash: inputHash,
            frames: frames,
            frame_timings: frameTimings,
        });
        if (!response.ok) {
            const text = await response.text();
            console.error("Score submission rejected:", text);
        } else {
            console.log("Score submitted and verified successfully");
        }
    } catch (error) {
        console.error("Failed to submit score:", error);
    }
}

// Keyboard input
document.addEventListener("keydown", function (event) {
    switch (event.key) {
        case "ArrowLeft": keys.left = true; break;
        case "ArrowRight": keys.right = true; break;
        case "ArrowUp": keys.thrust = true; break;
        case " ": keys.shoot = true; event.preventDefault(); break;
    }
});

document.addEventListener("keyup", function (event) {
    switch (event.key) {
        case "ArrowLeft": keys.left = false; break;
        case "ArrowRight": keys.right = false; break;
        case "ArrowUp": keys.thrust = false; break;
        case " ": keys.shoot = false; break;
    }
});

// Auth event listeners
window.addEventListener("auth:login", function (event) {
    console.log("Authentication successful", event.detail);
    if (!sessionId) sessionId = event.detail.sessionId;
});

window.addEventListener("auth:logout", function () {
    console.log("User logged out");
    sessionId = null;
    pendingGameStart = false;
    if (gameInterval) { clearInterval(gameInterval); gameInterval = null; }
    engine = null;
    recorder = null;
});

// Setup start game button
function setupStartGameButton() {
    const startGameBtn = document.getElementById("startGameBtn");
    if (startGameBtn) {
        startGameBtn.addEventListener("click", startGame);
    }
}

// Initialize
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
        initializeElements();
        setupStartGameButton();
    });
} else {
    initializeElements();
    setupStartGameButton();
}

// Re-initialize after HTMX swaps
document.body.addEventListener("htmx:afterSwap", function () {
    initializeElements();
    setupStartGameButton();
});

// Export for payment handler callback
window.startGameWithConfig = startGameWithConfig;
