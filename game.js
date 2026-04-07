/**
 * Neon Bounce: Collector - TikTok Mini Game (Fixed Version)
 */

// ==================== Initialization ====================
let canvas, ctx;
const isTikTokEnv = typeof tt !== 'undefined';

const LOGICAL_W = 750;
const LOGICAL_H = 1334;

let screenWidth = 0, screenHeight = 0;
let scale = 1, offsetX = 0, offsetY = 0;

function updateCanvasScale() {
    if (!canvas) return;
    
    // 增加冗余保护，确保在环境未准备好时有默认值
    if (isTikTokEnv) {
        try {
            const sys = tt.getSystemInfoSync();
            screenWidth = sys.windowWidth || window.innerWidth;
            screenHeight = sys.windowHeight || window.innerHeight;
        } catch(e) {
            screenWidth = window.innerWidth;
            screenHeight = window.innerHeight;
        }
    } else {
        screenWidth = window.innerWidth;
        screenHeight = window.innerHeight;
    }

    canvas.width = screenWidth;
    canvas.height = screenHeight;
    
    const scaleX = screenWidth / LOGICAL_W;
    const scaleY = screenHeight / LOGICAL_H;
    scale = Math.min(scaleX, scaleY);
    offsetX = (screenWidth - LOGICAL_W * scale) / 2;
    offsetY = (screenHeight - LOGICAL_H * scale) / 2;
    
    // 渲染修复：重置后再应用缩放，确保渲染层级正确
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height); 
    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
}

// 初始化 Canvas 逻辑
if (isTikTokEnv) {
    canvas = tt.createCanvas();
    ctx = canvas.getContext('2d');
    updateCanvasScale();
    // 针对部分安卓机型延迟更新
    tt.onWindowResize(() => {
        setTimeout(updateCanvasScale, 150);
    });
} else {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    updateCanvasScale();
    window.addEventListener('resize', () => setTimeout(updateCanvasScale, 150));
}

// ==================== Game Config & State ====================
const CONFIG = {
    COLORS: { bg: '#0f0e17', player: '#25F4EE', spike: '#FE2C55', wall: '#333333', text: '#fffffe', combo: '#ffff00' },
    WALL_WIDTH: 30,
    GRAVITY: 0.42,
    JUMP_FORCE: -7.2,
    SPEED_X: 6.2
};

let state = {
    mode: 'START',
    score: 0,
    combo: 0,
    highScore: 0,
    side: 1,
    player: { x: LOGICAL_W/2, y: LOGICAL_H/2, r: 13, vy: 0 },
    spikes: [],
    shake: 0,
    particles: [],
    comboTimer: 0
};

const UI_RECTS = {
    privacy:   { x: 20,                  y: LOGICAL_H - 80, w: 160, h: 50 },
    terms:     { x: LOGICAL_W - 180,     y: LOGICAL_H - 80, w: 160, h: 50 },
    addGuide:  { x: LOGICAL_W/2 - 130,   y: LOGICAL_H - 300, w: 260, h: 70 }, 
    watchAd:   { x: LOGICAL_W/2 - 100,   y: LOGICAL_H - 390, w: 200, h: 70 }
};

let toastMessage = null;
let toastTimer = 0;

function showToast(msg, duration = 2500) {
    toastMessage = msg;
    toastTimer = duration;
}

// ==================== Helper Functions ====================
function createBurst(x, y, color, count, speed, size) {
    for (let i = 0; i < count; i++) {
        state.particles.push({
            x, y,
            vx: (Math.random() - 0.5) * speed,
            vy: (Math.random() - 0.5) * speed,
            r: Math.random() * size,
            alpha: 1,
            color
        });
    }
}

function createSpikes() {
    state.spikes = [];
    const spikeSize = 20;
    const count = Math.min(3 + Math.floor(state.score / 5), 9);
    for (let i = 0; i < count; i++) {
        state.spikes.push({
            y: 150 + Math.random() * (LOGICAL_H - 300),
            w: spikeSize,
            h: spikeSize * 2.2
        });
    }
}

function resetGame() {
    state.score = 0;
    state.combo = 0;
    state.side = 1;
    state.player.x = LOGICAL_W / 2;
    state.player.y = LOGICAL_H / 2;
    state.player.vy = CONFIG.JUMP_FORCE * 1.2;
    state.spikes = [];
    state.particles = [];
    state.shake = 0;
    createSpikes();
    startRecording();
}

function gameOver() {
    state.mode = 'GAMEOVER';
    if (state.score > state.highScore) state.highScore = state.score;
    state.shake = 15;
    createBurst(state.player.x, state.player.y, CONFIG.COLORS.spike, 30, 10, 8);
    stopAndShareRecording();
    showInterstitialAd();
}

// ==================== Logic & Drawing ====================
function update() {
    if (state.mode !== 'PLAYING') return;

    let speedMult = 1 + (state.combo * 0.01);
    state.player.y += state.player.vy * speedMult;
    state.player.vy += CONFIG.GRAVITY * speedMult;
    state.player.x += (CONFIG.SPEED_X * speedMult) * state.side;

    if (state.shake > 0) state.shake -= 0.8;
    
    // 粒子更新
    state.particles.forEach((p, i) => {
        p.x += p.vx; p.y += p.vy; p.alpha -= 0.02;
        if (p.alpha <= 0) state.particles.splice(i, 1);
    });

    const wallX = state.side === 1 ? LOGICAL_W - CONFIG.WALL_WIDTH : CONFIG.WALL_WIDTH;
    const isColliding = state.side === 1 ? (state.player.x + state.player.r >= wallX) : (state.player.x - state.player.r <= wallX);

    if (isColliding) {
        state.side *= -1;
        state.score++;
        state.combo++;
        state.comboTimer = 40;
        createSpikes();
        state.shake = 5;
        createBurst(state.player.x, state.player.y, CONFIG.COLORS.player, 12, 6, 4);
    }

    if (state.player.y < 0 || state.player.y > LOGICAL_H) gameOver();

    state.spikes.forEach(s => {
        const sx = state.side === 1 ? LOGICAL_W - CONFIG.WALL_WIDTH : CONFIG.WALL_WIDTH;
        if (Math.abs(state.player.y - s.y) < s.h/2 && Math.abs(state.player.x - sx) < state.player.r + s.w) {
            gameOver();
        }
    });
}

function draw() {
    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
    ctx.fillStyle = CONFIG.COLORS.bg;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    if (state.shake > 0) {
        ctx.save();
        ctx.translate((Math.random()-0.5)*state.shake, (Math.random()-0.5)*state.shake);
    }

    // 墙壁
    ctx.fillStyle = CONFIG.COLORS.wall;
    ctx.fillRect(0, 0, CONFIG.WALL_WIDTH, LOGICAL_H);
    ctx.fillRect(LOGICAL_W - CONFIG.WALL_WIDTH, 0, CONFIG.WALL_WIDTH, LOGICAL_H);

    // 绘制尖刺
    ctx.fillStyle = CONFIG.COLORS.spike;
    state.spikes.forEach(s => {
        const x = state.side === 1 ? LOGICAL_W - CONFIG.WALL_WIDTH : CONFIG.WALL_WIDTH;
        ctx.beginPath();
        if (state.side === 1) {
            ctx.moveTo(x, s.y - s.h/2); ctx.lineTo(x - s.w, s.y); ctx.lineTo(x, s.y + s.h/2);
        } else {
            ctx.moveTo(x, s.y - s.h/2); ctx.lineTo(x + s.w, s.y); ctx.lineTo(x, s.y + s.h/2);
        }
        ctx.fill();
    });

    // 玩家
    ctx.fillStyle = CONFIG.COLORS.player;
    ctx.beginPath();
    ctx.arc(state.player.x, state.player.y, state.player.r, 0, Math.PI*2);
    ctx.fill();

    // UI 文字
    ctx.textAlign = 'center';
    if (state.mode === 'START') {
        ctx.fillStyle = CONFIG.COLORS.text;
        ctx.font = 'bold 50px Arial';
        ctx.fillText('NEON BOUNCE', LOGICAL_W/2, 400);
        ctx.font = '30px Arial';
        ctx.fillText('Tap to Start', LOGICAL_W/2, 550);

        // 按钮绘制
        ctx.fillStyle = '#25F4EE';
        ctx.fillRect(UI_RECTS.addGuide.x, UI_RECTS.addGuide.y, UI_RECTS.addGuide.w, UI_RECTS.addGuide.h);
        ctx.fillStyle = '#0f0e17';
        ctx.font = 'bold 22px Arial';
        ctx.fillText('📌 Add to Home Screen', LOGICAL_W/2, UI_RECTS.addGuide.y + 45);

        ctx.fillStyle = '#aaaaaa';
        ctx.font = '18px Arial';
        ctx.fillText('Privacy Policy', UI_RECTS.privacy.x + 80, UI_RECTS.privacy.y + 30);
        ctx.fillText('Terms of Use', UI_RECTS.terms.x + 80, UI_RECTS.terms.y + 30);
    } else if (state.mode === 'GAMEOVER') {
        ctx.fillStyle = CONFIG.COLORS.spike;
        ctx.font = 'bold 60px Arial';
        ctx.fillText('GAME OVER', LOGICAL_W/2, 450);
        ctx.fillStyle = CONFIG.COLORS.text;
        ctx.font = '30px Arial';
        ctx.fillText(`Score: ${state.score}`, LOGICAL_W/2, 550);
        ctx.fillText('Tap to Restart', LOGICAL_W/2, 650);
    }

    // Toast
    if (toastMessage && toastTimer > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(LOGICAL_W/2 - 200, 100, 400, 60);
        ctx.fillStyle = '#fff';
        ctx.font = '20px Arial';
        ctx.fillText(toastMessage, LOGICAL_W/2, 138);
        toastTimer -= 16;
    }

    if (state.shake > 0) ctx.restore();
}

// ==================== TikTok API Integration ====================
function addToDesktop() {
    if (!isTikTokEnv) {
        showToast("Only available in TikTok");
        return;
    }
    // 修复原因 2：明确调用系统添加快捷方式 API
    tt.addShortcut({
        success: () => showToast("Short cut requested!"),
        fail: (err) => {
            console.log("Add failed", err);
            showToast("Tap '...' then 'Add to Home'", 4000);
        }
    });
}

function startRecording() {
    if (isTikTokEnv) {
        const recorder = tt.getGameRecorderManager();
        recorder.start({ duration: 30 });
    }
}

function stopAndShareRecording() {
    if (isTikTokEnv) {
        const recorder = tt.getGameRecorderManager();
        recorder.stop();
    }
}

function showInterstitialAd() {
    if (!isTikTokEnv) return;
    const ad = tt.createInterstitialAd({ adUnitId: 'ad7624701133264570389' });
    ad.load().then(() => ad.show()).catch(err => console.log(err));
}

// ==================== Event Handling ====================
function handleTouch(e) {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    const tx = (clientX - offsetX) / scale;
    const ty = (clientY - offsetY) / scale;

    if (state.mode === 'START') {
        if (hitRect(tx, ty, UI_RECTS.privacy)) { tt.openSchema({url: 'https://chunkit0625.github.io/NeonBounce.v2/privacy.html'}); return; }
        if (hitRect(tx, ty, UI_RECTS.terms)) { tt.openSchema({url: 'https://chunkit0625.github.io/NeonBounce.v2/terms.html'}); return; }
        if (hitRect(tx, ty, UI_RECTS.addGuide)) { addToDesktop(); return; }
        state.mode = 'PLAYING';
        resetGame();
    } else if (state.mode === 'PLAYING') {
        state.player.vy = CONFIG.JUMP_FORCE;
    } else if (state.mode === 'GAMEOVER') {
        state.mode = 'START';
    }
}

function hitRect(px, py, r) { return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h; }

if (isTikTokEnv) tt.onTouchStart(handleTouch);
else canvas.addEventListener('mousedown', handleTouch);

// ==================== Main Loop ====================
function frame() {
    update();
    draw();
    requestAnimationFrame(frame);
}

frame();
