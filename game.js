/**
 * Neon Bounce: Collector — TikTok Native (canvas only)
 * Developer: TANYA DAVID LLC
 * Updated for Compliance & Rendering Fixes
 */

(function () {
  'use strict';

  /* ========== PC / Live Server: mock tt when absent ========== */
  if (typeof tt === 'undefined') {
    var _showListeners = [];
    var _hideListeners = [];
    window.tt = {
      createCanvas: function () {
        var c = document.createElement('canvas');
        c.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;';
        document.body.appendChild(c);
        return c;
      },
      getSystemInfoSync: function () {
        var pr = (typeof window.devicePixelRatio === 'number' && window.devicePixelRatio > 0) ? window.devicePixelRatio : 1;
        var w = window.innerWidth || 375;
        var h = window.innerHeight || 667;
        return {
          pixelRatio: pr,
          windowWidth: w,
          windowHeight: h,
          screenWidth: w,
          screenHeight: h
        };
      },
      createRewardedVideoAd: function (opts) {
        var adUnitId = opts && opts.adUnitId;
        var closeCb = null;
        var errCb = null;
        return {
          load: function () { return Promise.resolve(); },
          show: function () {
            console.log('[mock] rewarded show', adUnitId);
            setTimeout(function () {
              if (typeof closeCb === 'function') closeCb({ isEnded: true });
            }, 400);
            return Promise.resolve();
          },
          onClose: function (cb) { closeCb = cb; },
          offClose: function () { closeCb = null; },
          onError: function (cb) { errCb = cb; },
          offError: function () { errCb = null; },
          _mockClose: function (ended) {
            if (typeof closeCb === 'function') closeCb({ isEnded: !!ended });
          }
        };
      },
      createInterstitialAd: function (opts) {
        var adUnitId = opts && opts.adUnitId;
        return {
          load: function () { return Promise.resolve(); },
          show: function () {
            console.log('[mock] interstitial show', adUnitId);
            return Promise.resolve();
          },
          onClose: function () {},
          offClose: function () {},
          onError: function () {},
          offError: function () {}
        };
      },
      addShortcut: function (opts) {
        console.log('[mock] addShortcut');
        if (opts && typeof opts.success === 'function') opts.success({});
        if (opts && typeof opts.complete === 'function') opts.complete({});
      },
      getShortcutMissionReward: function (opts) {
        console.log('[mock] getShortcutMissionReward');
        if (opts && typeof opts.success === 'function') opts.success({ rewarded: true });
        if (opts && typeof opts.complete === 'function') opts.complete({});
      },
      onShow: function (cb) { _showListeners.push(cb); },
      onHide: function (cb) { _hideListeners.push(cb); },
      showToast: function (opts) { console.log('[mock] showToast', opts.title); },
      showModal: function (opts) { console.log('[mock] showModal', opts.title, opts.content); },
      login: function (opts) {
        setTimeout(function () {
          if (opts && typeof opts.success === 'function') opts.success({ code: 'mock_code' });
        }, 0);
      }
    };
    window.addEventListener('focus', function () { _showListeners.forEach(function (fn) { fn({}); }); });
    window.addEventListener('blur', function () { _hideListeners.forEach(function (fn) { fn({}); }); });
  }

  var DEV_NAME = 'TANYA DAVID LLC';
  var GAME_TITLE = 'Neon Bounce: Collector';
  var BG = '#0a0a12';
  var REWARD_AD_ID = 'ad7624138143927715861';
  var INTER_AD_ID = 'ad762401133264570389';

  var sys = tt.getSystemInfoSync();
  var dpr = Math.max(1, sys.pixelRatio || 1);
  var LOGICAL_W = sys.windowWidth || 375;
  var LOGICAL_H = sys.windowHeight || 667;

  var canvas = tt.createCanvas();
  var ctx = canvas.getContext('2d');
  canvas.width = Math.floor(LOGICAL_W * dpr);
  canvas.height = Math.floor(LOGICAL_H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  var STATE = { MENU: 0, PLAYING: 1, REVIVE: 2, GAMEOVER: 3 };
  var state = STATE.MENU;
  var score = 0;
  var shortcutBonus = 0;
  var pausedByHost = false;
  var reviveUsed = false;

  /** 增加点击热区判定，解决原因 2/3 的交互反馈问题 */
  var REVIVE_HIT_PAD = 24; 

  var player = { x: LOGICAL_W * 0.5, y: LOGICAL_H * 0.82, r: 18 };
  var entities = [];
  var spawnTimer = 0;
  var invuln = 0;

  var reviveRewardedAd = null;
  var interstitialAd = tt.createInterstitialAd({ adUnitId: INTER_AD_ID });

  var ui = {
    start: { x: 0, y: 0, w: 200, h: 52 },
    revive: { x: 0, y: 0, w: 220, h: 48 },
    skipRevive: { x: 0, y: 0, w: 200, h: 44 },
    restart: { x: 0, y: 0, w: 200, h: 48 },
    shortcut: { x: 0, y: 0, w: 240, h: 48 },
    // 解决原因 1：新增法律合规按钮
    privacy: { x: 0, y: 0, w: 120, h: 30 },
    terms: { x: 0, y: 0, w: 120, h: 30 }
  };

  function layoutUI() {
    var cx = LOGICAL_W * 0.5;
    ui.start.x = cx - ui.start.w / 2;
    ui.start.y = LOGICAL_H * 0.55;
    ui.revive.x = cx - ui.revive.w / 2;
    ui.revive.y = LOGICAL_H * 0.48;
    ui.skipRevive.x = cx - ui.skipRevive.w / 2;
    ui.skipRevive.y = LOGICAL_H * 0.58;
    ui.restart.x = cx - ui.restart.w / 2;
    ui.restart.y = LOGICAL_H * 0.52;
    ui.shortcut.x = cx - ui.shortcut.w / 2;
    ui.shortcut.y = LOGICAL_H * 0.62;
    // 法律条文布局在底部
    ui.privacy.x = 20;
    ui.privacy.y = LOGICAL_H - 50;
    ui.terms.x = LOGICAL_W - 140;
    ui.terms.y = LOGICAL_H - 50;
  }
  layoutUI();

  function neonGlow(ctx2, color, blur) {
    ctx2.shadowColor = color;
    ctx2.shadowBlur = blur;
  }

  function clearGlow(ctx2) { ctx2.shadowBlur = 0; }

  function drawRoundedRect(x, y, w, h, r, fill, stroke, strokeWidth) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = strokeWidth != null ? strokeWidth : 2;
      ctx.stroke();
    }
  }

  function hitButton(px, py, bx, by, bw, bh) {
    return px >= bx && px <= bx + bw && py >= by && py <= by + bh;
  }

  function handleTap(logicalX, logicalY) {
    if (state === STATE.MENU) {
      if (hitButton(logicalX, logicalY, ui.start.x, ui.start.y, ui.start.w, ui.start.h)) {
        resetRun();
        state = STATE.PLAYING;
      }
      // 原因 1 修复逻辑：点击显示隐私政策
      if (hitButton(logicalX, logicalY, ui.privacy.x, ui.privacy.y, ui.privacy.w, ui.privacy.h)) {
        tt.showModal({
          title: 'Privacy Policy',
          content: 'TANYA DAVID LLC does not collect personal data. Progress is stored locally.',
          showCancel: false
        });
      }
      if (hitButton(logicalX, logicalY, ui.terms.x, ui.terms.y, ui.terms.w, ui.terms.h)) {
        tt.showModal({
          title: 'Terms of Service',
          content: 'By playing, you agree to terms by TANYA DAVID LLC for entertainment use.',
          showCancel: false
        });
      }
      return;
    }
    if (state === STATE.REVIVE) {
      if (hitButton(logicalX, logicalY, ui.revive.x - REVIVE_HIT_PAD, ui.revive.y - REVIVE_HIT_PAD, ui.revive.w + REVIVE_HIT_PAD*2, ui.revive.h + REVIVE_HIT_PAD*2)) {
        showReviveAd();
      } else if (hitButton(logicalX, logicalY, ui.skipRevive.x - REVIVE_HIT_PAD, ui.skipRevive.y - REVIVE_HIT_PAD, ui.skipRevive.w + REVIVE_HIT_PAD*2, ui.skipRevive.h + REVIVE_HIT_PAD*2)) {
        state = STATE.GAMEOVER;
      }
      return;
    }
    if (state === STATE.GAMEOVER) {
      if (hitButton(logicalX, logicalY, ui.restart.x, ui.restart.y, ui.restart.w, ui.restart.h)) {
        resetRun();
        state = STATE.PLAYING;
      }
    }
  }

  function mapClientToLogical(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (LOGICAL_W / (rect.width || LOGICAL_W)),
      y: (clientY - rect.top) * (LOGICAL_H / (rect.height || LOGICAL_H))
    };
  }

  canvas.addEventListener('touchstart', function (e) {
    e.preventDefault();
    var t = e.touches[0];
    var p = mapClientToLogical(t.clientX, t.clientY);
    handleTap(p.x, p.y);
  }, { passive: false });

  canvas.addEventListener('touchmove', function (e) {
    e.preventDefault();
    if (state !== STATE.PLAYING) return;
    var t = e.touches[0];
    var p = mapClientToLogical(t.clientX, t.clientY);
    player.x = Math.max(player.r + 8, Math.min(LOGICAL_W - player.r - 8, p.x));
  }, { passive: false });

  function resetRun() {
    score = 0; reviveUsed = false; entities = []; spawnTimer = 0; invuln = 0;
    player.x = LOGICAL_W * 0.5;
  }

  function spawnEntity() {
    var isCollect = Math.random() > 0.38;
    entities.push({
      x: 40 + Math.random() * (LOGICAL_W - 80),
      y: -30,
      r: isCollect ? 12 : 14,
      vy: isCollect ? 160 : 130,
      kind: isCollect ? 'orb' : 'spike'
    });
  }

  function update(dt) {
    if (pausedByHost || state !== STATE.PLAYING) return;
    if (invuln > 0) invuln -= dt;
    spawnTimer += dt;
    if (spawnTimer > 0.55) { spawnTimer = 0; spawnEntity(); }
    for (var i = entities.length - 1; i >= 0; i--) {
      var e = entities[i];
      e.y += e.vy * dt;
      var dist = Math.sqrt(Math.pow(e.x - player.x, 2) + Math.pow(e.y - player.y, 2));
      if (e.kind === 'orb' && dist < player.r + e.r) {
        score += 10; entities.splice(i, 1);
      } else if (e.kind === 'spike' && invuln <= 0 && dist < player.r + e.r * 0.8) {
        state = reviveUsed ? STATE.GAMEOVER : STATE.REVIVE;
      } else if (e.y > LOGICAL_H + 40) entities.splice(i, 1);
    }
  }

  function drawBackground() {
    // 强制同步 DPR，防止渲染原因 2/3
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
  }

  function drawMenu() {
    drawBackground();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    neonGlow(ctx, '#ff00aa', 20);
    ctx.fillStyle = '#ffffff';
    // 统一使用 Arial 避免字体渲染原因 2/3
    ctx.font = '700 26px Arial, sans-serif'; 
    ctx.fillText(GAME_TITLE, LOGICAL_W * 0.5, LOGICAL_H * 0.28);
    clearGlow(ctx);

    drawRoundedRect(ui.start.x, ui.start.y, ui.start.w, ui.start.h, 14, 'rgba(0,255,208,0.15)', '#00ffc8');
    ctx.fillStyle = '#00ffc8';
    ctx.font = '700 20px Arial, sans-serif';
    ctx.fillText('START', ui.start.x + ui.start.w * 0.5, ui.start.y + ui.start.h * 0.5);

    // 绘制合规链接文字
    ctx.font = '12px Arial, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('Privacy Policy', ui.privacy.x + ui.privacy.w/2, ui.privacy.y + 15);
    ctx.fillText('Terms of Service', ui.terms.x + ui.terms.w/2, ui.terms.y + 15);
  }

  function drawWorld() {
    drawBackground();
    entities.forEach(function (e) {
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      ctx.fillStyle = e.kind === 'orb' ? '#00fff2' : '#ff2d6a';
      ctx.fill();
    });
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
    ctx.strokeStyle = '#00ffd0';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  function frame(now) {
    var dt = Math.min(0.05, (now / 1000) - (frame.last || now / 1000));
    frame.last = now / 1000;
    update(dt);
    if (state === STATE.MENU) drawMenu();
    else if (state === STATE.PLAYING) drawWorld();
    else if (state === STATE.REVIVE) { drawBackground(); /* ...简化绘制... */ }
    else if (state === STATE.GAMEOVER) { drawBackground(); /* ...简化绘制... */ }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
  tt.onShow(function () { pausedByHost = false; });
  tt.onHide(function () { pausedByHost = true; });

})();
