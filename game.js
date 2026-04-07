/**
 * Neon Bounce: Collector - TikTok Mini Game
 * Fixed: Add to Home Screen uses official API + manual guide; rendering stability improved.
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
    if (isTikTokEnv) {
        const sys = tt.getSystemInfoSync();
        screenWidth = sys.windowWidth;
        screenHeight = sys.windowHeight;
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
    
    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
}

if (isTikTokEnv) {
    canvas = tt.createCanvas();
    ctx = canvas.getContext('2d');
    updateCanvasScale();
    if (tt.onWindowResize) tt.onWindowResize(() => setTimeout(updateCanvasScale, 100));
} else {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    updateCanvasScale();
    window.addEventListener('resize', () => setTimeout(updateCanvasScale, 100));
    window.addEventListener('orientationchange', () => setTimeout(updateCanvasScale, 100));
}

// ==================== Game Config ====================
const CONFIG = {
    COLORS: { bg: '#0f0e17', player: '#25F4EE', spike: '#FE2C55', wall: '#333333', text: '#fffffe', combo: '#ffff00' },
    WALL_WIDTH: 30,
    GRAVITY: 0.42,
    JUMP_FORCE: -7.2,
    SPEED_X: 6.2
};

// ==================== Game State ====================
let state = {
    mode: 'START',
    score: 0,
    combo: 0,
    highScore: 0,
    side: 1,
    player: { x: 0, y: 0, r: 13, vy: 0 },
    spikes: [],
    shake: 0,
    particles: [],
    comboTimer: 0
};

// ==================== UI Rectangles (Enlarged, Centered) ====================
const UI_RECTS = {
    privacy:   { x: 20,                  y: LOGICAL_H - 70, w: 140, h: 45 },
    terms:     { x: LOGICAL_W - 160,     y: LOGICAL_H - 70, w: 140, h: 45 },
    addGuide:  { x: LOGICAL_W/2 - 130,   y: LOGICAL_H - 280, w: 260, h: 60 },
    watchAd:   { x: LOGICAL_W/2 - 100,   y: LOGICAL_H - 360, w: 200, h: 60 }
};

// ==================== Custom Toast (top position) ====================
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
            x: x, y: y,
            vx: (Math.random() - 0.5) * speed,
            vy: (Math.random() - 0.5) * speed,
            r: Math.random() * size,
            alpha: 1,
            color: color
        });
    }
}

function createSpikes() {
    state.spikes = [];
    const spikeSize = 20;
    const count = Math.min(3 + Math.floor(state.score / 5), 9);
    for (let i = 0; i < count; i++) {
        state.spikes.push({
            y: 120 + Math.random() * (LOGICAL_H - 240),
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
    state.comboTimer = 0;
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

// ==================== Core Game Logic ====================
function update() {
    if (state.mode !== 'PLAYING') return;

    let speedMult = 1 + (state.combo * 0.012);
    state.player.y += state.player.vy * speedMult;
    state.player.vy += CONFIG.GRAVITY * speedMult;
    state.player.x += (CONFIG.SPEED_X * speedMult) * state.side;

    if (state.shake > 0) state.shake -= 0.6;
    if (state.comboTimer > 0) state.comboTimer--;

    for (let i = 0; i < state.particles.length; i++) {
        let p = state.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= 0.02;
        if (p.alpha <= 0) {
            state.particles.splice(i, 1);
            i--;
        }
    }

    const currentWall = state.side === 1 ? LOGICAL_W - CONFIG.WALL_WIDTH : CONFIG.WALL_WIDTH;
    const isColliding = state.side === 1 ? (state.player.x + state.player.r >= currentWall) : (state.player.x - state.player.r <= currentWall);

    if (isColliding) bounce();

    if (state.player.y < 0 || state.player.y > LOGICAL_H) gameOver();

    for (let s of state.spikes) {
        const wallX = state.side === 1 ? LOGICAL_W - CONFIG.WALL_WIDTH : CONFIG.WALL_WIDTH;
        if (Math.abs(state.player.y - s.y) < s.h/2 && Math.abs(state.player.x - wallX) < state.player.r + s.w) {
            gameOver();
            break;
        }
    }
}

function bounce() {
    state.side *= -1;
    state.score++;
    state.combo++;
    state.comboTimer = 40;
    createSpikes();
    state.shake = 5;
    createBurst(state.player.x, state.player.y, CONFIG.COLORS.player, 12, 6, 4);
    const safeX = state.side === 1 ? CONFIG.WALL_WIDTH + 2 + state.player.r : LOGICAL_W - CONFIG.WALL_WIDTH - 2 - state.player.r;
    state.player.x = safeX;
}

// ==================== Screen Recording & Sharing ====================
let recorderManager = null;
let lastRecordedVideoPath = null;

function initRecorder() {
    if (!isTikTokEnv) return;
    try {
        recorderManager = tt.getGameRecorderManager();
        recorderManager.onStart(() => console.log('Recording started'));
        recorderManager.onStop((res) => {
            console.log('Recording stopped', res);
            if (res && res.videoPath) {
                lastRecordedVideoPath = res.videoPath;
            }
        });
        recorderManager.onError((err) => console.log('Recording error', err));
    } catch(e) { console.log('Recorder init failed', e); }
}

function startRecording() {
    if (isTikTokEnv && recorderManager) {
        try { recorderManager.start({ duration: 30 }); } catch(e) {}
    }
}

function stopAndShareRecording() {
    if (isTikTokEnv && recorderManager) {
        try { recorderManager.stop(); } catch(e) {}
    }
}

function shareGame() {
    if (!isTikTokEnv) {
        alert('Please share inside TikTok');
        return;
    }
    if (lastRecordedVideoPath) {
        tt.shareAppMessage({
            title: `I scored ${state.highScore} in Neon Bounce: Collector! Can you beat me?`,
            imageUrl: '',
            success: () => console.log('Share success'),
            fail: (err) => console.log('Share failed', err)
        });
    } else {
        showToast('Play a round first to record your gameplay', 2000);
    }
}

// ==================== Rewarded Video Ad ====================
let rewardedVideoAd = null;
let retryCount = 0;
const MAX_RETRY = 3;

function initRewardedVideo() {
    if (!isTikTokEnv) return;
    const AD_UNIT_ID = 'ad7624138143927715861';
    try {
        rewardedVideoAd = tt.createRewardedVideoAd({ adUnitId: AD_UNIT_ID });
        if (!rewardedVideoAd) {
            console.error('Rewarded ad creation failed');
            return;
        }
        rewardedVideoAd.onLoad(() => {
            console.log('Rewarded ad loaded');
            retryCount = 0;
        });
        rewardedVideoAd.onError((err) => {
            console.log('Rewarded ad error', err);
            if (retryCount < MAX_RETRY) {
                retryCount++;
                setTimeout(() => rewardedVideoAd.load(), 2000);
            }
        });
        rewardedVideoAd.onClose((res) => {
            if (res && res.isEnded) {
                giveAdReward();
            } else {
                showToast('Watch the full video to get the reward', 2000);
            }
        });
        rewardedVideoAd.load();
    } catch(e) { console.log('Rewarded ad init error', e); }
}

function showRewardedVideo() {
    if (!isTikTokEnv) {
        giveAdReward();
        return;
    }
    if (!rewardedVideoAd) {
        showToast('Ad not ready, try again later', 2000);
        return;
    }
    rewardedVideoAd.show().catch((err) => {
        console.log('Rewarded ad show failed', err);
        rewardedVideoAd.load();
        showToast('Unable to play ad now, please try again', 2000);
    });
}

function giveAdReward() {
    if (state.mode === 'GAMEOVER') {
        state.mode = 'PLAYING';
        state.player.x = LOGICAL_W / 2;
        state.player.y = LOGICAL_H / 2;
        state.player.vy = CONFIG.JUMP_FORCE * 1.2;
        state.shake = 10;
        createBurst(state.player.x, state.player.y, '#25F4EE', 20, 8, 5);
        showToast('Revived! Keep bouncing!', 1500);
    } else if (state.mode === 'PLAYING') {
        state.score += 10;
        state.combo++;
        state.comboTimer = 40;
        createSpikes();
        createBurst(state.player.x, state.player.y, '#ffff00', 15, 6, 4);
        showToast('+10 points!', 1000);
    }
}

// ==================== Interstitial Ad ====================
let interstitialAd = null;

function initInterstitialAd() {
    if (!isTikTokEnv) return;
    const INTERSTITIAL_AD_UNIT_ID = 'ad7624701133264570389';
    try {
        interstitialAd = tt.createInterstitialAd({ adUnitId: INTERSTITIAL_AD_UNIT_ID });
        if (!interstitialAd) {
            console.error('Interstitial ad creation failed');
            return;
        }
        interstitialAd.onLoad(() => console.log('Interstitial ad loaded'));
        interstitialAd.onError((err) => {
            console.error('Interstitial ad error', err);
            setTimeout(() => interstitialAd.load(), 3000);
        });
        interstitialAd.onClose((res) => console.log('Interstitial ad closed', res));
        interstitialAd.load();
    } catch(e) { console.log('Interstitial ad init error', e); }
}

function showInterstitialAd() {
    if (interstitialAd) {
        interstitialAd.show().catch(err => console.log('Interstitial ad show failed', err));
    }
}

// ==================== Legal Pages ====================
function openPrivacyPolicy() {
    const url = 'https://chunkit0625.github.io/NeonBounce.v2/privacy.html';
    if (isTikTokEnv) {
        tt.openSchema({ url: url, success: () => {}, fail: (err) => console.log(err) });
    } else {
        window.open(url, '_blank');
    }
}

function openTermsOfService() {
    const url = 'https://chunkit0625.github.io/NeonBounce.v2/terms.html';
    if (isTikTokEnv) {
        tt.openSchema({ url: url, success: () => {}, fail: (err) => console.log(err) });
    } else {
        window.open(url, '_blank');
    }
}

// ==================== Add to Home Screen (Official API + Manual Guide) ====================
function addToDesktopGuide() {
    if (!isTikTokEnv) {
        alert('Open this game in TikTok to add to home screen');
        return;
    }
    
    // Check if the API is available
    if (tt.canIUse && tt.canIUse('addShortcut')) {
        tt.addShortcut({
            success: () => {
                showToast('Added to home screen successfully!', 2000);
            },
            fail: (err) => {
                console.log('addShortcut failed', err);
                // Provide manual instructions
                showToast('Tap "..." → Add to Home Screen', 3000);
            }
        });
    } else {
        // Fallback manual guide
        showToast('Tap "..." → Add to Home Screen', 3000);
    }
}

// ==================== Touch Handling with Coordinate Mapping ====================
function getLogicalTouchPosition(clientX, clientY) {
    let logicalX = (clientX - offsetX) / scale;
    let logicalY = (clientY - offsetY) / scale;
    logicalX = Math.min(LOGICAL_W, Math.max(0, logicalX));
    logicalY = Math.min(LOGICAL_H, Math.max(0, logicalY));
    return { x: logicalX, y: logicalY };
}

function hitRect(px, py, rect) {
    return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
}

function handleAction(e) {
    let clientX, clientY;
    if (e.touches) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else if (e.clientX !== undefined) {
        clientX = e.clientX;
        clientY = e.clientY;
    } else {
        return;
    }
    const touch = getLogicalTouchPosition(clientX, clientY);
    const tx = touch.x, ty = touch.y;

    if (state.mode === 'START') {
        if (hitRect(tx, ty, UI_RECTS.privacy)) { openPrivacyPolicy(); return; }
        if (hitRect(tx, ty, UI_RECTS.terms)) { openTermsOfService(); return; }
        if (hitRect(tx, ty, UI_RECTS.addGuide)) { addToDesktopGuide(); return; }
        if (hitRect(tx, ty, UI_RECTS.watchAd)) { showRewardedVideo(); return; }
        state.mode = 'PLAYING';
        startRecording();
    } 
    else if (state.mode === 'PLAYING') {
        state.player.vy = CONFIG.JUMP_FORCE;
        createBurst(state.player.x, state.player.y, '#fff', 2, 2, 2);
    } 
    else if (state.mode === 'GAMEOVER') {
        const reviveBtn = { x: LOGICAL_W/2 - 150, y: LOGICAL_H/2 + 60, w: 300, h: 65 };
        const shareBtn = { x: LOGICAL_W/2 + 100, y: LOGICAL_H/2 + 60, w: 110, h: 65 };
        if (hitRect(tx, ty, reviveBtn)) {
            showRewardedVideo();
            return;
        }
        if (hitRect(tx, ty, shareBtn)) {
            shareGame();
            return;
        }
        resetGame();
        state.mode = 'START';
    }
}

// 事件绑定
if (isTikTokEnv) {
    tt.onTouchStart(handleAction);
} else {
    canvas.addEventListener('touchstart', handleAction, { passive: false });
    canvas.addEventListener('mousedown', handleAction);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

// ==================== Drawing (Unified Shake + Toast at top) ====================
function draw() {
    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
    
    // Reset context states to avoid interference
    ctx.shadowBlur = 0;
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 1.0;
    
    ctx.fillStyle = CONFIG.COLORS.bg;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    // 应用抖动
    if (state.shake > 0) {
        ctx.save();
        ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    }

    // 墙壁
    ctx.fillStyle = CONFIG.COLORS.wall;
    ctx.fillRect(0, 0, CONFIG.WALL_WIDTH, LOGICAL_H);
    ctx.fillRect(LOGICAL_W - CONFIG.WALL_WIDTH, 0, CONFIG.WALL_WIDTH, LOGICAL_H);

    // 粒子
    for (let p of state.particles) {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // 尖刺
    ctx.fillStyle = CONFIG.COLORS.spike;
    for (let s of state.spikes) {
        const x = state.side === 1 ? LOGICAL_W - CONFIG.WALL_WIDTH : CONFIG.WALL_WIDTH;
        ctx.beginPath();
        if (state.side === 1) {
            ctx.moveTo(x, s.y - s.h/2);
            ctx.lineTo(x - s.w, s.y);
            ctx.lineTo(x, s.y + s.h/2);
        } else {
            ctx.moveTo(x, s.y - s.h/2);
            ctx.lineTo(x + s.w, s.y);
            ctx.lineTo(x, s.y + s.h/2);
        }
        ctx.fill();
    }

    // 玩家
    ctx.fillStyle = CONFIG.COLORS.player;
    ctx.shadowBlur = 15;
    ctx.shadowColor = CONFIG.COLORS.player;
    ctx.beginPath();
    ctx.arc(state.player.x, state.player.y, state.player.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // 文字与UI
    ctx.fillStyle = CONFIG.COLORS.text;
    ctx.textAlign = 'center';

    if (state.mode === 'START') {
        ctx.font = 'bold 46px "Arial", "PingFang SC", "Microsoft YaHei", sans-serif';
        ctx.fillText('NEON BOUNCE', LOGICAL_W/2, LOGICAL_H/2 - 150);
        ctx.font = '26px "Arial", "PingFang SC", "Microsoft YaHei", sans-serif';
        ctx.fillText('Tap to Start', LOGICAL_W/2, LOGICAL_H/2 - 50);

        ctx.font = '18px "Arial", "PingFang SC", "Microsoft YaHei", sans-serif';
        ctx.fillStyle = '#aaaaaa';
        ctx.fillText('Privacy Policy', UI_RECTS.privacy.x + UI_RECTS.privacy.w/2, UI_RECTS.privacy.y + UI_RECTS.privacy.h/2);
        ctx.fillText('Terms of Use', UI_RECTS.terms.x + UI_RECTS.terms.w/2, UI_RECTS.terms.y + UI_RECTS.terms.h/2);

        ctx.fillStyle = '#25F4EE';
        ctx.fillRect(UI_RECTS.addGuide.x, UI_RECTS.addGuide.y, UI_RECTS.addGuide.w, UI_RECTS.addGuide.h);
        ctx.fillStyle = '#0f0e17';
        ctx.font = 'bold 20px "Arial", "PingFang SC", "Microsoft YaHei", sans-serif';
        ctx.fillText('📌 How to Add to Home', UI_RECTS.addGuide.x + UI_RECTS.addGuide.w/2, UI_RECTS.addGuide.y + UI_RECTS.addGuide.h/2);

        ctx.fillStyle = '#FE2C55';
        ctx.fillRect(UI_RECTS.watchAd.x, UI_RECTS.watchAd.y, UI_RECTS.watchAd.w, UI_RECTS.watchAd.h);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px "Arial", "PingFang SC", "Microsoft YaHei", sans-serif';
        ctx.fillText('▶ Free Revival', UI_RECTS.watchAd.x + UI_RECTS.watchAd.w/2, UI_RECTS.watchAd.y + UI_RECTS.watchAd.h/2);
    } 
    else if (state.mode === 'PLAYING') {
        ctx.font = 'bold 90px "Arial", "PingFang SC", "Microsoft YaHei", sans-serif';
        ctx.globalAlpha = 0.2;
        ctx.fillText(state.score, LOGICAL_W/2, LOGICAL_H/2);
        ctx.globalAlpha = 1.0;
        if (state.combo > 1 && state.comboTimer > 0) {
            ctx.fillStyle = CONFIG.COLORS.combo;
            ctx.font = 'bold 36px "Arial", "PingFang SC", "Microsoft YaHei", sans-serif';
            ctx.fillText(`${state.combo}x STREAK`, LOGICAL_W/2, 110);
        }
    } 
    else if (state.mode === 'GAMEOVER') {
        ctx.font = 'bold 56px "Arial", "PingFang SC", "Microsoft YaHei", sans-serif';
        ctx.fillStyle = CONFIG.COLORS.spike;
        ctx.fillText('GAME OVER', LOGICAL_W/2, LOGICAL_H/2 - 120);
        ctx.font = '24px "Arial", "PingFang SC", "Microsoft YaHei", sans-serif';
        ctx.fillStyle = CONFIG.COLORS.text;
        ctx.fillText('Tap screen to restart', LOGICAL_W/2, LOGICAL_H/2 - 20);

        // 复活按钮 (居中放大)
        ctx.fillStyle = '#25F4EE';
        ctx.fillRect(LOGICAL_W/2 - 150, LOGICAL_H/2 + 60, 300, 65);
        ctx.fillStyle = '#0f0e17';
        ctx.font = 'bold 22px "Arial", "PingFang SC", "Microsoft YaHei", sans-serif';
        ctx.fillText('▶ Watch Ad to Revive', LOGICAL_W/2, LOGICAL_H/2 + 92);

        // 分享按钮 (右侧)
        ctx.fillStyle = '#25F4EE';
        ctx.fillRect(LOGICAL_W/2 + 100, LOGICAL_H/2 + 60, 110, 65);
        ctx.fillStyle = '#0f0e17';
        ctx.font = 'bold 20px "Arial", "PingFang SC", "Microsoft YaHei", sans-serif';
        ctx.fillText('Share', LOGICAL_W/2 + 155, LOGICAL_H/2 + 92);

        ctx.font = '30px "Arial", "PingFang SC", "Microsoft YaHei", sans-serif';
        ctx.fillStyle = '#fffffe';
        ctx.fillText('Score: ' + state.score, LOGICAL_W/2, LOGICAL_H/2 + 180);
        ctx.fillText('Best: ' + state.highScore, LOGICAL_W/2, LOGICAL_H/2 + 230);
    }

    // 绘制 Toast (顶部居中)
    if (toastMessage && toastTimer > 0) {
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#000000';
        ctx.shadowBlur = 0;
        const tw = 500, th = 60;
        const tx = LOGICAL_W/2 - tw/2;
        const ty = 80;
        ctx.fillRect(tx, ty, tw, th);
        ctx.fillStyle = '#ffffff';
        ctx.font = '20px "Arial", "PingFang SC", "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(toastMessage, LOGICAL_W/2, ty + th/2);
        ctx.restore();
        toastTimer -= 16;
        if (toastTimer <= 0) toastMessage = null;
    }

    if (state.shake > 0) ctx.restore();
}

// ==================== Main Loop ====================
function frame() {
    update();
    draw();
    requestAnimationFrame(frame);
}

function init() {
    resetGame();
    initRecorder();
    initRewardedVideo();
    initInterstitialAd();
    frame();
}

init();
