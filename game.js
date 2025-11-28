const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const bestScoreEl = document.getElementById("bestScore");
const statusText = document.getElementById("statusText");

const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayMessage = document.getElementById("overlayMessage");
const startButton = document.getElementById("startButton");
const jumpButton = document.getElementById("jumpButton");

// ---------- Sonidos ----------
const sJump = new Audio("assets/jump.wav");
const sCoin = new Audio("assets/coin.wav");
const sDeath = new Audio("assets/death.wav");
sJump.volume = 0.6;
sCoin.volume = 0.7;
sDeath.volume = 0.7;

// ---------- UI extra: botón checkpoint + selector de skins ----------
const overlayContent = document.querySelector(".overlay-content");

// Botón "Continuar desde checkpoint"
const checkpointButton = document.createElement("button");
checkpointButton.id = "checkpointButton";
checkpointButton.className = "btn-primary";
checkpointButton.textContent = "Continuar desde checkpoint";
checkpointButton.style.display = "none";
checkpointButton.style.marginTop = "8px";
overlayContent.appendChild(checkpointButton);

// Contenedor selector de skin
const skinContainer = document.createElement("div");
skinContainer.style.marginTop = "12px";
skinContainer.style.display = "flex";
skinContainer.style.flexDirection = "column";
skinContainer.style.alignItems = "center";
skinContainer.style.gap = "4px";

// Línea con botones < > y nombre
const skinRow = document.createElement("div");
skinRow.style.display = "flex";
skinRow.style.alignItems = "center";
skinRow.style.gap = "8px";

const skinPrevBtn = document.createElement("button");
skinPrevBtn.textContent = "◀";
skinPrevBtn.className = "btn-secondary";

const skinNextBtn = document.createElement("button");
skinNextBtn.textContent = "▶";
skinNextBtn.className = "btn-secondary";

const skinNameLabel = document.createElement("span");
skinNameLabel.style.minWidth = "120px";
skinNameLabel.style.textAlign = "center";
skinNameLabel.style.fontWeight = "600";

skinRow.appendChild(skinPrevBtn);
skinRow.appendChild(skinNameLabel);
skinRow.appendChild(skinNextBtn);

// Texto de estado del skin
const skinStatusLabel = document.createElement("small");
skinStatusLabel.style.fontSize = "11px";
skinStatusLabel.style.opacity = "0.8";

skinContainer.appendChild(skinRow);
skinContainer.appendChild(skinStatusLabel);
overlayContent.appendChild(skinContainer);

// ---------- Canvas ----------
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
let W = canvas.width;
let H = canvas.height;

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    W = canvas.width;
    H = canvas.height;
    groundY = H - 60;
}

window.addEventListener('resize', resize);

// ---------- Estado básico ----------
let gameState = "menu"; // "menu" | "playing" | "dead"
let player;
let groundY = H - 60;

let obstacles = [];
let platforms = [];
let coins = [];
let checkpoints = [];
let particles = [];
let trail = [];

// Parallax
let bgOffsetFar = 0;
let bgOffsetMid = 0;
let bgOffsetNear = 0;

let scrollSpeed = 260;
const BASE_SCROLL_SPEED = 260;
const MAX_SCROLL_SPEED = 520;

const SPIKE_WIDTH = 28;
const SPIKE_HEIGHT = 40;

// Ajustes hitbox
const SPIKE_COLLISION_INSET_X = 0.25;   // 25% a cada lado
const SPIKE_COLLISION_HEIGHT = 0.75;    // 75% superior
const PLAYER_COLLISION_INSET = 4;       // recorte en el jugador

const gravity = 3200;
const jumpForce = -900;

let score = 0;
let bestScore = 0;
let coinCount = 0;
let totalCoinsEver = 0;

let lastTime = 0;

let jumpQueued = false;

let checkpointIndex = 0;
let latestCheckpoint = null; // { label, score, coinCount, scrollSpeed }

let hitFlash = 0;

// ---------- Skins ----------
const SKINS = [
    {
        name: "Classic",
        requiredCoins: 0,
        color: "#22c55e",
        border: "#bbf7d0",
        face: "#022c22",
        trailBase: "34,197,94"
    },
    {
        name: "Neón",
        requiredCoins: 50,
        color: "#22d3ee",
        border: "#e0f2fe",
        face: "#0f172a",
        trailBase: "34,211,238"
    },
    {
        name: "Fuego",
        requiredCoins: 120,
        color: "#f97316",
        border: "#fed7aa",
        face: "#7c2d12",
        trailBase: "249,115,22"
    },
    {
        name: "Oscuro",
        requiredCoins: 250,
        color: "#a855f7",
        border: "#e9d5ff",
        face: "#0f172a",
        trailBase: "168,85,247"
    }
];

let selectedSkinIndex = 0;

// ---------- LocalStorage ----------
try {
    const storedBest = localStorage.getItem("mini-gd-best");
    if (storedBest) bestScore = parseInt(storedBest, 10) || 0;

    const storedTotalCoins = localStorage.getItem("mini-gd-totalCoins");
    if (storedTotalCoins) totalCoinsEver = parseInt(storedTotalCoins, 10) || 0;

    const storedSkin = localStorage.getItem("mini-gd-skinIndex");
    if (storedSkin) {
        const idx = parseInt(storedSkin, 10);
        if (!Number.isNaN(idx) && idx >= 0 && idx < SKINS.length) {
            selectedSkinIndex = idx;
        }
    }
} catch (_) { }

// ---------- Utils ----------
function randRange(min, max) {
    return Math.random() * (max - min) + min;
}

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function rectsCollide(a, b) {
    return !(
        a.x + a.w < b.x ||
        a.x > b.x + b.w ||
        a.y + a.h < b.y ||
        a.y > b.y + b.h
    );
}

function isSkinUnlocked(index) {
    return totalCoinsEver >= SKINS[index].requiredCoins;
}

function updateSkinUI() {
    const skin = SKINS[selectedSkinIndex];
    skinNameLabel.textContent = skin.name;

    if (isSkinUnlocked(selectedSkinIndex)) {
        skinStatusLabel.textContent = `Desbloqueado (monedas totales: ${totalCoinsEver})`;
    } else {
        skinStatusLabel.textContent =
            `Bloqueado: requiere ${skin.requiredCoins} monedas totales (tienes ${totalCoinsEver}).`;
    }
}

function selectNextSkin() {
    selectedSkinIndex = (selectedSkinIndex + 1) % SKINS.length;
    try {
        localStorage.setItem("mini-gd-skinIndex", String(selectedSkinIndex));
    } catch (_) { }
    updateSkinUI();
}

function selectPrevSkin() {
    selectedSkinIndex =
        (selectedSkinIndex - 1 + SKINS.length) % SKINS.length;
    try {
        localStorage.setItem("mini-gd-skinIndex", String(selectedSkinIndex));
    } catch (_) { }
    updateSkinUI();
}

// ---------- Objetos ----------
function createPlayer() {
    return {
        x: W * 0.25,
        y: groundY - 40,
        w: 32,
        h: 32,
        vy: 0,
        onGround: true
    };
}

/**
 * Obstáculos:
 * - "spike": pico suelo
 * - "double": dos picos suelo
 * - "air": pico flotante
 * - "pit": hoyo blanco
 * - "spikePlatform": pico sobre plataforma
 */
function spawnObstacle(baseX) {
    const difficultyFactor = clamp(score / 1000, 0, 0.4);

    let gapMin = 240 - difficultyFactor * 30;
    let gapMax = 340 - difficultyFactor * 50;
    const MIN_GAP_ABSOLUTE = 220;
    if (gapMin < MIN_GAP_ABSOLUTE) gapMin = MIN_GAP_ABSOLUTE;
    if (gapMax < gapMin + 40) gapMax = gapMin + 40;

    const gap = randRange(gapMin, gapMax);
    const x = baseX + gap;

    const r = Math.random();
    let type;
    if (r < 0.4) type = "spike";
    else if (r < 0.7) type = "double";
    else if (r < 0.9) type = "air";
    else type = "pit";

    const o = { x, type, passed: false };

    if (type === "spike") {
        o.y = groundY;
        o.w = SPIKE_WIDTH;
        o.h = SPIKE_HEIGHT;
    } else if (type === "double") {
        o.y = groundY;
        o.w = SPIKE_WIDTH * 2;
        o.h = SPIKE_HEIGHT;
    } else if (type === "air") {
        o.y = groundY - 60;
        o.w = SPIKE_WIDTH;
        o.h = SPIKE_HEIGHT;
    } else if (type === "pit") {
        o.y = groundY;
        o.w = randRange(80, 130);
        o.h = 0;
    }

    obstacles.push(o);
}

function resetObstacles() {
    obstacles = [];
    let baseX = W + 40;
    for (let i = 0; i < 6; i++) {
        spawnObstacle(baseX);
        const last = obstacles[obstacles.length - 1];
        baseX = last.x + (last.w || 0);
    }
}

// Plataformas con lógica para evitar combos imposibles
function spawnPlatform(baseX) {
    const gap = randRange(260, 420);
    const x = baseX + gap;

    const width = randRange(90, 150);
    const height = 14;
    const y = groundY - randRange(60, 110);

    const pl = { x, y, w: width, h: height };
    platforms.push(pl);

    // Pico en plataforma solo si hay altura y sin pico de suelo muy alineado
    if (Math.random() < 0.4 && pl.y < groundY - 40) {
        const spikeX = randRange(pl.x + 10, pl.x + pl.w - 10 - SPIKE_WIDTH);
        const spikeCenter = spikeX + SPIKE_WIDTH / 2;

        const tooCloseToGroundSpike = obstacles.some(o => {
            if (o.type !== "spike" && o.type !== "double") return false;
            const oCenter = o.x + o.w / 2;
            return Math.abs(oCenter - spikeCenter) < 40;
        });

        if (!tooCloseToGroundSpike) {
            obstacles.push({
                x: spikeX,
                y: pl.y,
                w: SPIKE_WIDTH,
                h: SPIKE_HEIGHT,
                type: "spikePlatform",
                passed: false
            });
        }
    }

    return x + width;
}

function resetPlatforms() {
    platforms = [];
    let baseX = W + 120;
    for (let i = 0; i < 4; i++) {
        baseX = spawnPlatform(baseX);
    }
}

function spawnCoin(baseX) {
    const gap = randRange(180, 340);
    const x = baseX + gap;
    const y = randRange(groundY - 120, groundY - 40);

    coins.push({
        x,
        y,
        w: 16,
        h: 16,
        collected: false
    });

    return x + 16;
}

function resetCoins() {
    coins = [];
    coinCount = latestCheckpoint ? latestCheckpoint.coinCount : 0;
    let baseX = W + 80;
    for (let i = 0; i < 6; i++) {
        baseX = spawnCoin(baseX);
    }
}

function resetCheckpoints() {
    checkpoints = [];
    checkpointIndex = latestCheckpoint ? latestCheckpoint.label : 0;

    const baseX = W + 600;
    const spacing = 900;
    for (let i = 0; i < 3; i++) {
        const label = i + 1 + checkpointIndex;
        checkpoints.push({
            x: baseX + spacing * i,
            y: groundY,
            w: 16,
            h: 40,
            reached: false,
            label
        });
    }
}

// ---------- Partículas & HUD ----------
function spawnParticles(x, y, color, amount = 10) {
    for (let i = 0; i < amount; i++) {
        particles.push({
            x,
            y,
            vx: (Math.random() - 0.5) * 320,
            vy: (Math.random() - 0.7) * 320,
            life: Math.random() * 0.4 + 0.2,
            color
        });
    }
}

function updateHUD() {
    scoreEl.textContent = Math.floor(score);
    bestScoreEl.textContent = bestScore;
}

// ---------- Juego ----------
function resetGame(fromCheckpoint = false) {
    player = createPlayer();
    particles = [];
    trail = [];

    if (fromCheckpoint && latestCheckpoint) {
        score = latestCheckpoint.score;
        coinCount = latestCheckpoint.coinCount;
        scrollSpeed = clamp(
            latestCheckpoint.scrollSpeed,
            BASE_SCROLL_SPEED,
            MAX_SCROLL_SPEED
        );
        statusText.textContent = `Reinicias desde el checkpoint ${latestCheckpoint.label}.`;
    } else {
        score = 0;
        coinCount = 0;
        scrollSpeed = BASE_SCROLL_SPEED;
        latestCheckpoint = null;
        checkpointIndex = 0;
        statusText.textContent = "¡Usa plataformas, evita picos, salta los hoyos y recoge monedas!";
    }

    resetObstacles();
    resetPlatforms();
    resetCoins();
    resetCheckpoints();
    updateHUD();
}

function startGame(fromCheckpoint = false) {
    resetGame(fromCheckpoint);
    gameState = "playing";
    overlay.classList.add("hidden");
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

function gameOver() {
    gameState = "dead";
    hitFlash = 0.4;
    try { sDeath.currentTime = 0; sDeath.play(); } catch (_) { }

    if (latestCheckpoint) {
        statusText.textContent =
            `Has perdido. Puedes reiniciar o continuar desde checkpoint ${latestCheckpoint.label}.`;
        checkpointButton.style.display = "block";
        checkpointButton.disabled = false;
        checkpointButton.textContent =
            `Continuar desde checkpoint ${latestCheckpoint.label}`;
    } else {
        statusText.textContent =
            "Has perdido. Puedes reiniciar desde el inicio.";
        checkpointButton.style.display = "none";
    }

    if (score > bestScore) {
        bestScore = Math.floor(score);
        try {
            localStorage.setItem("mini-gd-best", String(bestScore));
        } catch (_) { }
    }

    overlayTitle.textContent = "Game Over";
    overlayMessage.textContent =
        `Puntaje: ${Math.floor(score)} — Mejor: ${bestScore}\nMonedas en esta partida: ${coinCount}\nMonedas totales: ${totalCoinsEver}`;
    startButton.textContent = "Reiniciar desde inicio";
    overlay.classList.remove("hidden");
    updateHUD();
}

// ---------- Input ----------
function queueJump() {
    jumpQueued = true;
}

window.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    if (key === " " || key === "arrowup" || key === "w") {
        e.preventDefault();
        queueJump();
    }
});

jumpButton.addEventListener("mousedown", (e) => {
    e.preventDefault();
    queueJump();
});
jumpButton.addEventListener("touchstart", (e) => {
    e.preventDefault();
    queueJump();
}, { passive: false });

// Start siempre inicio completo
startButton.addEventListener("click", () => {
    startGame(false);
});

// Continuar desde checkpoint
checkpointButton.addEventListener("click", () => {
    if (latestCheckpoint) {
        startGame(true);
    }
});

// Selector de skins
skinPrevBtn.addEventListener("click", () => {
    selectPrevSkin();
});
skinNextBtn.addEventListener("click", () => {
    selectNextSkin();
});

// ---------- Update ----------
function update(dt) {
    if (gameState !== "playing") return;

    const prevY = player.y;

    // Físicas jugador
    if (jumpQueued) {
        if (player.onGround) {
            player.vy = jumpForce;
            player.onGround = false;
            try { sJump.currentTime = 0; sJump.play(); } catch (_) { }
            spawnParticles(
                player.x + player.w / 2,
                player.y + player.h,
                "#22c55e",
                10
            );
        }
        jumpQueued = false;
    }

    player.vy += gravity * dt;
    player.y += player.vy * dt;
    player.onGround = false;

    // Suelo
    if (player.y + player.h >= groundY) {
        player.y = groundY - player.h;
        player.vy = 0;
        player.onGround = true;
    }

    // Plataformas como suelo elevado
    const playerFeetX1 = player.x;
    const playerFeetX2 = player.x + player.w;
    platforms.forEach((pl) => {
        const overlapX =
            playerFeetX2 > pl.x && playerFeetX1 < pl.x + pl.w;

        const wasAbove = prevY + player.h <= pl.y;
        const nowBelowTop = player.y + player.h >= pl.y;

        if (overlapX && wasAbove && nowBelowTop && player.vy >= 0) {
            player.y = pl.y - player.h;
            player.vy = 0;
            player.onGround = true;
        }
    });

    player.y = clamp(player.y, 0, groundY - player.h);

    // Trail del jugador
    trail.push({
        x: player.x + player.w / 2,
        y: player.y + player.h / 2,
        life: 0.25
    });
    trail.forEach((t) => {
        t.life -= dt;
    });
    trail = trail.filter((t) => t.life > 0);

    // Parallax offsets
    bgOffsetFar += scrollSpeed * 0.15 * dt;
    bgOffsetMid += scrollSpeed * 0.35 * dt;
    bgOffsetNear += scrollSpeed * 0.6 * dt;

    // Movimiento de mundo
    obstacles.forEach((o) => {
        o.x -= scrollSpeed * dt;
    });
    platforms.forEach((pl) => {
        pl.x -= scrollSpeed * dt;
    });
    coins.forEach((c) => {
        c.x -= scrollSpeed * dt;
    });
    checkpoints.forEach((cp) => {
        cp.x -= scrollSpeed * dt;
    });

    // Reciclar obstáculos / score
    for (let i = 0; i < obstacles.length; i++) {
        const o = obstacles[i];
        if (!o.passed && o.x + (o.w || 0) < player.x) {
            o.passed = true;
            score += 10;
            scrollSpeed = clamp(scrollSpeed + 4, BASE_SCROLL_SPEED, MAX_SCROLL_SPEED);
            updateHUD();
        }

        if (o.x + (o.w || 0) < -80) {
            obstacles.splice(i, 1);
            const last = obstacles[obstacles.length - 1];
            const baseX = last ? last.x + (last.w || 0) : W + 40;
            spawnObstacle(baseX);
            i--;
        }
    }

    // Reciclar plataformas
    for (let i = 0; i < platforms.length; i++) {
        const pl = platforms[i];
        if (pl.x + pl.w < -80) {
            platforms.splice(i, 1);
            const lastPl = platforms[platforms.length - 1];
            const baseX = lastPl ? lastPl.x + lastPl.w : W + 120;
            spawnPlatform(baseX);
            i--;
        }
    }

    // Monedas
    for (let i = 0; i < coins.length; i++) {
        const c = coins[i];
        if (c.x + c.w < -80 || c.collected) {
            coins.splice(i, 1);
            i--;
        }
    }
    while (coins.length < 6) {
        const lastC = coins[coins.length - 1];
        const baseX = lastC ? lastC.x + lastC.w : W + 80;
        spawnCoin(baseX);
    }

    // Checkpoints
    checkpoints.forEach((cp) => {
        if (!cp.reached && player.x > cp.x + cp.w) {
            cp.reached = true;
            checkpointIndex = cp.label;
            latestCheckpoint = {
                label: cp.label,
                score,
                coinCount,
                scrollSpeed
            };
            spawnParticles(cp.x, cp.y - cp.h, "#38bdf8", 18);
            statusText.textContent = `Checkpoint ${cp.label} alcanzado – Monedas: ${coinCount}`;
        }
    });
    checkpoints = checkpoints.filter((cp) => cp.x + cp.w > -60);

    // Colisiones con obstáculos (hitbox reducido)
    const playerRect = {
        x: player.x + PLAYER_COLLISION_INSET,
        y: player.y + PLAYER_COLLISION_INSET,
        w: player.w - PLAYER_COLLISION_INSET * 2,
        h: player.h - PLAYER_COLLISION_INSET * 2
    };

    for (const o of obstacles) {
        if (o.type === "pit") {
            const inX =
                playerRect.x + playerRect.w > o.x &&
                playerRect.x < o.x + o.w;

            const onBaseGround =
                playerRect.y + playerRect.h >= groundY - 1 &&
                playerRect.y + playerRect.h <= groundY + 2;

            if (inX && onBaseGround) {
                spawnParticles(
                    player.x + player.w / 2,
                    player.y + player.h / 2,
                    "#0ea5e9",
                    22
                );
                gameOver();
                return;
            }
            continue;
        }

        const spikeCollisionWidth = o.w * (1 - 2 * SPIKE_COLLISION_INSET_X);
        const spikeRect = {
            x: o.x + o.w * SPIKE_COLLISION_INSET_X,
            y: o.y - o.h * SPIKE_COLLISION_HEIGHT,
            w: spikeCollisionWidth,
            h: o.h * SPIKE_COLLISION_HEIGHT
        };

        if (rectsCollide(playerRect, spikeRect)) {
            spawnParticles(
                player.x + player.w / 2,
                player.y + player.h / 2,
                "#f97316",
                25
            );
            gameOver();
            return;
        }
    }

    // Colisiones con monedas
    coins.forEach((c) => {
        if (c.collected) return;
        const cRect = { x: c.x, y: c.y, w: c.w, h: c.h };
        if (rectsCollide(playerRect, cRect)) {
            c.collected = true;
            coinCount += 1;
            score += 5;
            totalCoinsEver += 1;
            try { sCoin.currentTime = 0; sCoin.play(); } catch (_) { }
            try {
                localStorage.setItem("mini-gd-totalCoins", String(totalCoinsEver));
            } catch (_) { }
            spawnParticles(
                c.x + c.w / 2,
                c.y + c.h / 2,
                "#facc15",
                14
            );
            statusText.textContent =
                `¡Moneda! Partida: ${coinCount} • Totales: ${totalCoinsEver}`;
            updateHUD();
            updateSkinUI();
        }
    });

    // Partículas
    particles.forEach((p) => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 1400 * dt;
        p.life -= dt;
    });
    particles = particles.filter((p) => p.life > 0);

    if (hitFlash > 0) {
        hitFlash -= dt;
        if (hitFlash < 0) hitFlash = 0;
    }
}

// ---------- Dibujar ----------
function drawParallaxBackground() {
    const t = clamp(score / 500, 0, 1);
    let topColor = "#020617";
    let bottomColor = "#000000";

    if (t < 0.33) {
        topColor = "#020617";
        bottomColor = "#312e81";
    } else if (t < 0.66) {
        topColor = "#312e81";
        bottomColor = "#9d174d";
    } else {
        topColor = "#9d174d";
        bottomColor = "#7f1d1d";
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, topColor);
    gradient.addColorStop(1, bottomColor);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);

    // Capa lejana: estrellas
    ctx.save();
    const starOffset = -(bgOffsetFar % 40);
    ctx.translate(starOffset, 0);
    ctx.fillStyle = "rgba(248,250,252,0.35)";
    for (let x = -40; x < W + 40; x += 40) {
        for (let y = 10; y < groundY - 40; y += 40) {
            ctx.fillRect(x, y, 2, 2);
        }
    }
    ctx.restore();

    // Capa media: montañas
    ctx.save();
    const midOffset = -(bgOffsetMid % 120);
    ctx.translate(midOffset, 0);
    const mountainBaseY = groundY + 10;
    for (let x = -160; x < W + 160; x += 120) {
        ctx.fillStyle = "#0b1120";
        ctx.beginPath();
        ctx.moveTo(x, mountainBaseY);
        ctx.lineTo(x + 60, mountainBaseY - 70);
        ctx.lineTo(x + 120, mountainBaseY);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();

    // Capa cercana: colinas
    ctx.save();
    const nearOffset = -(bgOffsetNear % 80);
    ctx.translate(nearOffset, 0);
    ctx.fillStyle = "#020617";
    for (let x = -80; x < W + 80; x += 80) {
        ctx.beginPath();
        ctx.arc(x + 40, groundY + 20, 45, Math.PI, 0);
        ctx.fill();
    }
    ctx.restore();

    // Suelo y bloques
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, groundY, W, H - groundY);

    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, groundY + 0.5);
    ctx.lineTo(W, groundY + 0.5);
    ctx.stroke();

    const blockWidth = 40;
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += blockWidth) {
        ctx.strokeRect(x, groundY + 2, blockWidth, H - groundY - 4);
    }
}

function drawTrail() {
    const skin = SKINS[selectedSkinIndex];
    trail.forEach((t) => {
        const alpha = t.life / 0.25;
        ctx.fillStyle = `rgba(${skin.trailBase},${alpha * 0.7})`;
        ctx.fillRect(t.x - 12, t.y - 12, 24, 24);
    });
}

function drawPlayer() {
    const skin = SKINS[selectedSkinIndex];
    const unlocked = isSkinUnlocked(selectedSkinIndex);

    ctx.save();
    ctx.translate(player.x + player.w / 2, player.y + player.h / 2);

    if (!player.onGround) {
        ctx.rotate((player.vy / 900) * 0.25);
    }

    ctx.fillStyle = unlocked ? skin.color : "#6b7280";
    ctx.fillRect(-player.w / 2, -player.h / 2, player.w, player.h);

    ctx.strokeStyle = unlocked ? skin.border : "#9ca3af";
    ctx.lineWidth = 2;
    ctx.strokeRect(-player.w / 2, -player.h / 2, player.w, player.h);

    ctx.fillStyle = unlocked ? skin.face : "#111827";
    ctx.fillRect(-8, -4, 4, 4);
    ctx.fillRect(4, -4, 4, 4);
    ctx.fillRect(-4, 4, 8, 3);

    ctx.restore();
}

function drawObstacles() {
    obstacles.forEach((o) => {
        if (o.type === "pit") {
            ctx.fillStyle = "#f9fafb";
            ctx.fillRect(o.x, groundY + 1, o.w, H - groundY - 2);

            ctx.strokeStyle = "#111827";
            ctx.lineWidth = 2;
            ctx.strokeRect(o.x, groundY + 1, o.w, H - groundY - 2);
            return;
        }

        if (o.type === "spike" || o.type === "spikePlatform") {
            ctx.fillStyle = "#f97316";
            ctx.beginPath();
            ctx.moveTo(o.x, o.y);
            ctx.lineTo(o.x + o.w / 2, o.y - o.h);
            ctx.lineTo(o.x + o.w, o.y);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = "#fed7aa";
            ctx.lineWidth = 2;
            ctx.stroke();
        } else if (o.type === "double") {
            const half = o.w / 2;
            ctx.fillStyle = "#fb923c";

            ctx.beginPath();
            ctx.moveTo(o.x, o.y);
            ctx.lineTo(o.x + half / 2, o.y - o.h);
            ctx.lineTo(o.x + half, o.y);
            ctx.closePath();
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(o.x + half, o.y);
            ctx.lineTo(o.x + half + half / 2, o.y - o.h);
            ctx.lineTo(o.x + o.w, o.y);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = "#fed7aa";
            ctx.lineWidth = 2;
            ctx.stroke();
        } else if (o.type === "air") {
            const cx = o.x + o.w / 2;
            const baseY = o.y;

            ctx.fillStyle = "#eab308";
            ctx.beginPath();
            ctx.moveTo(cx, baseY - o.h);
            ctx.lineTo(cx + o.w / 2, baseY - o.h / 2);
            ctx.lineTo(cx, baseY);
            ctx.lineTo(cx - o.w / 2, baseY - o.h / 2);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = "#fef3c7";
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    });
}

function drawPlatforms() {
    platforms.forEach((pl) => {
        ctx.fillStyle = "#22c55e";
        ctx.fillRect(pl.x, pl.y, pl.w, pl.h);

        ctx.strokeStyle = "#bbf7d0";
        ctx.lineWidth = 2;
        ctx.strokeRect(pl.x, pl.y, pl.w, pl.h);
    });
}

function drawCoins() {
    coins.forEach((c) => {
        if (c.collected) return;
        ctx.save();
        ctx.translate(c.x + c.w / 2, c.y + c.h / 2);
        ctx.fillStyle = "#facc15";
        ctx.beginPath();
        ctx.arc(0, 0, c.w / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#f59e0b";
        ctx.beginPath();
        ctx.arc(0, 0, c.w / 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });
}

function drawCheckpoints() {
    checkpoints.forEach((cp) => {
        ctx.fillStyle = "#38bdf8";
        ctx.fillRect(cp.x, cp.y - cp.h, 4, cp.h);
        ctx.fillStyle = "#22c55e";
        ctx.fillRect(cp.x - 6, cp.y - cp.h, 16, 10);

        ctx.fillStyle = "#e5e7eb";
        ctx.font = "10px system-ui";
        ctx.fillText(
            cp.label.toString(),
            cp.x - 2,
            cp.y - cp.h - 4
        );
    });
}

function drawParticles() {
    particles.forEach((p) => {
        const alpha = Math.max(0, p.life * 2);
        ctx.fillStyle = `rgba(248,113,113,${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
    });
}

function drawScore() {
    ctx.fillStyle = "rgba(15,23,42,0.75)";
    ctx.fillRect(0, 0, 150, 46);
    ctx.fillStyle = "#e5e7eb";
    ctx.font = "14px system-ui";
    ctx.fillText("Score", 8, 14);
    ctx.font = "bold 16px system-ui";
    ctx.fillText(Math.floor(score).toString(), 8, 30);

    ctx.font = "11px system-ui";
    ctx.fillText("Coins: " + coinCount, 80, 16);
    ctx.fillText("Total: " + totalCoinsEver, 80, 32);
}

// ---------- Loop ----------
function gameLoop(timestamp) {
    if (gameState !== "playing") return;

    const dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    const clampedDt = Math.min(dt, 0.035);
    update(clampedDt);

    drawParallaxBackground();
    drawPlatforms();
    drawObstacles();
    drawCoins();
    drawCheckpoints();
    drawTrail();
    drawPlayer();
    drawParticles();
    drawScore();

    if (hitFlash > 0) {
        const alpha = hitFlash / 0.4;
        ctx.fillStyle = `rgba(248,113,113,${alpha})`;
        ctx.fillRect(0, 0, W, H);
    }

    requestAnimationFrame(gameLoop);
}

// ---------- Estado inicial ----------
overlay.classList.remove("hidden");
checkpointButton.style.display = "none";
overlayTitle.textContent = "Mini Geometry Dash+";
overlayMessage.textContent =
    "Parallax, monedas, checkpoints, hoyos blancos y skins desbloqueables por monedas totales. ¡A grindear!";
startButton.textContent = "Iniciar";
updateHUD();
statusText.textContent = "Toca SALTAR o presiona ESPACIO.";

updateSkinUI();
