/**
 * Neon Bounce: Collector — TikTok Native (canvas only)
 * Developer: TANYA DAVID LLC
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
      showToast: function (opts) {
        var t = (opts && opts.title) ? opts.title : '';
        console.log('[mock] showToast', t);
      },
      login: function (opts) {
        setTimeout(function () {
          if (opts && typeof opts.success === 'function') {
            opts.success({ code: 'mock_pc_silent_login_code' });
          }
          if (opts && typeof opts.complete === 'function') {
            opts.complete();
          }
        }, 0);
      }
    };
    window.addEventListener('focus', function () {
      _showListeners.forEach(function (fn) { try { fn({}); } catch (e) {} });
    });
    window.addEventListener('blur', function () {
      _hideListeners.forEach(function (fn) { try { fn({}); } catch (e) {} });
    });
  }

  /* TikTok docs: TTMinis.game — bridge onto tt if methods missing */
  if (typeof TTMinis !== 'undefined' && TTMinis.game && typeof tt === 'object') {
    var g = TTMinis.game;
    ['createRewardedVideoAd', 'createInterstitialAd', 'addShortcut', 'getShortcutMissionReward', 'onShow', 'onHide', 'getSystemInfoSync', 'createCanvas', 'showToast', 'login'].forEach(function (k) {
      if (typeof tt[k] !== 'function' && typeof g[k] === 'function') tt[k] = g[k].bind(g);
    });
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
  if (canvas.style) {
    canvas.style.width = LOGICAL_W + 'px';
    canvas.style.height = LOGICAL_H + 'px';
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  /**
   * Silent login (Mini Games SDK: TTMinis.game.login / tt.login).
   * Success returns `code` — exchange on your server for open_id per TikTok OAuth2 docs.
   * Some hosts may also return openId / open_id; we persist when present.
   */
  var loginAuthCode = '';
  var loginOpenId = '';

  function runSilentLogin() {
    if (typeof tt.login !== 'function') return;
    tt.login({
      success: function (result) {
        if (!result || typeof result !== 'object') return;
        if (typeof result.code === 'string' && result.code.length > 0) {
          loginAuthCode = result.code;
        }
        var oid = result.openId != null ? result.openId : result.open_id;
        if (typeof oid === 'string' && oid.length > 0) {
          loginOpenId = oid;
        }
      },
      fail: function () {},
      complete: function () {}
    });
  }
  runSilentLogin();

  function mapClientToLogical(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    var rw = rect.width || LOGICAL_W;
    var rh = rect.height || LOGICAL_H;
    return {
      x: (clientX - rect.left) * (LOGICAL_W / rw),
      y: (clientY - rect.top) * (LOGICAL_H / rh)
    };
  }

  var STATE = { MENU: 0, PLAYING: 1, REVIVE: 2, GAMEOVER: 3 };
  var state = STATE.MENU;
  var score = 0;
  var shortcutBonus = 0;
  var pausedByHost = false;
  var interstitialShownThisGameOver = false;
  var reviveUsed = false;

  /** Extra logical px around REVIVE / skip hitboxes — pairs with mapClientToLogical for Live Server. */
  var REVIVE_HIT_PAD = 12;

  var player = { x: LOGICAL_W * 0.5, y: LOGICAL_H * 0.82, r: 18, vx: 0 };
  var entities = [];
  var spawnTimer = 0;
  var invuln = 0;

  /** Last rewarded ad instance from tt.createRewardedVideoAd(REWARD_AD_ID), rebound when platform returns a new object. */
  var reviveRewardedAd = null;
  var interstitialAd = tt.createInterstitialAd({ adUnitId: INTER_AD_ID });

  function neonGlow(ctx2, color, blur) {
    ctx2.shadowColor = color;
    ctx2.shadowBlur = blur;
  }

  function clearGlow(ctx2) {
    ctx2.shadowBlur = 0;
  }

  function drawRoundedRect(x, y, w, h, r, fill, stroke, strokeWidth) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = strokeWidth != null ? strokeWidth : 2;
      ctx.stroke();
    }
  }

  function hitButton(px, py, bx, by, bw, bh) {
    return px >= bx && px <= bx + bw && py >= by && py <= by + bh;
  }

  /** Hit regions aligned with draw + padding; input (px,py) must be logical coords from mapClientToLogical. */
  function hitReviveArea(logicalX, logicalY) {
    return hitButton(
      logicalX,
      logicalY,
      ui.revive.x - REVIVE_HIT_PAD,
      ui.revive.y - REVIVE_HIT_PAD,
      ui.revive.w + 2 * REVIVE_HIT_PAD,
      ui.revive.h + 2 * REVIVE_HIT_PAD
    );
  }

  function hitSkipReviveArea(logicalX, logicalY) {
    return hitButton(
      logicalX,
      logicalY,
      ui.skipRevive.x - REVIVE_HIT_PAD,
      ui.skipRevive.y - REVIVE_HIT_PAD,
      ui.skipRevive.w + 2 * REVIVE_HIT_PAD,
      ui.skipRevive.h + 2 * REVIVE_HIT_PAD
    );
  }

  function showAdFailedToast() {
    try {
      if (typeof tt.showToast === 'function') {
        tt.showToast({ title: 'Ad failed to load', icon: 'none', duration: 2500 });
      }
    } catch (e) {}
  }

  var ui = {
    start: { x: 0, y: 0, w: 200, h: 52 },
    revive: { x: 0, y: 0, w: 220, h: 48 },
    skipRevive: { x: 0, y: 0, w: 200, h: 44 },
    restart: { x: 0, y: 0, w: 200, h: 48 },
    shortcut: { x: 0, y: 0, w: 240, h: 48 }
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
  }
  layoutUI();

  function resetRun() {
    score = 0;
    reviveUsed = false;
    entities = [];
    spawnTimer = 0;
    invuln = 0;
    player.x = LOGICAL_W * 0.5;
    player.vx = 0;
    interstitialShownThisGameOver = false;
  }

  function spawnEntity() {
    var lane = Math.random();
    var x = 40 + lane * (LOGICAL_W - 80);
    var isCollect = Math.random() > 0.38;
    entities.push({
      x: x,
      y: -30,
      r: isCollect ? 12 : 14,
      vy: isCollect ? (140 + Math.random() * 80) : (115 + Math.random() * 70),
      kind: isCollect ? 'orb' : 'spike'
    });
  }

  function goGameOver() {
    state = STATE.GAMEOVER;
    if (!interstitialShownThisGameOver && interstitialAd && typeof interstitialAd.show === 'function') {
      interstitialShownThisGameOver = true;
      interstitialAd.show().catch(function () {});
    }
  }

  function grantShortcutBonus() {
    tt.getShortcutMissionReward({
      success: function () {
        shortcutBonus += 50;
      },
      fail: function () {},
      complete: function () {}
    });
  }

  function tryAddShortcut() {
    tt.addShortcut({
      success: function () {
        grantShortcutBonus();
      },
      fail: function () {},
      complete: function () {}
    });
  }

  /**
   * TikTok / TTMinis: onClose receives { isEnded: boolean }. Only strict platform boolean true
   * counts as a full watch — rejects truthy coercion (e.g. 1, "true") so clients cannot fake reward.
   */
  function isRewardedVideoFullyWatched(res) {
    if (res == null || typeof res !== 'object') return false;
    if (typeof res.isEnded !== 'boolean') return false;
    return res.isEnded === true;
  }

  var reviveCloseHandler = function (res) {
    if (state !== STATE.REVIVE) return;
    if (isRewardedVideoFullyWatched(res)) {
      reviveUsed = true;
      invuln = 2.2;
      entities = entities.filter(function (e) { return e.y < LOGICAL_H * 0.35; });
      player.x = LOGICAL_W * 0.5;
      player.y = LOGICAL_H * 0.5;
      state = STATE.PLAYING;
    } else {
      goGameOver();
    }
  };

  function reviveAdErrorHandler() {
    showAdFailedToast();
  }

  function bindReviveAdInstance(ad) {
    if (!ad) return;
    if (ad !== reviveRewardedAd) {
      if (reviveRewardedAd && typeof reviveRewardedAd.offClose === 'function') {
        reviveRewardedAd.offClose(reviveCloseHandler);
      }
      if (reviveRewardedAd && typeof reviveRewardedAd.offError === 'function') {
        reviveRewardedAd.offError(reviveAdErrorHandler);
      }
      reviveRewardedAd = ad;
      if (typeof ad.onClose === 'function') ad.onClose(reviveCloseHandler);
      if (typeof ad.onError === 'function') ad.onError(reviveAdErrorHandler);
    }
  }

  function showReviveAd() {
    var ad = tt.createRewardedVideoAd({ adUnitId: REWARD_AD_ID });
    bindReviveAdInstance(ad);
    if (!ad || typeof ad.show !== 'function') {
      showAdFailedToast();
      return;
    }
    var loadP = typeof ad.load === 'function' ? ad.load() : Promise.resolve();
    loadP
      .then(function () {
        return ad.show();
      })
      .catch(function () {
        showAdFailedToast();
      });
  }

  tt.onShow(function () {
    pausedByHost = false;
  });
  tt.onHide(function () {
    pausedByHost = true;
  });

  function handleTap(logicalX, logicalY) {
    if (state === STATE.MENU) {
      if (hitButton(logicalX, logicalY, ui.start.x, ui.start.y, ui.start.w, ui.start.h)) {
        resetRun();
        state = STATE.PLAYING;
      }
      return;
    }
    if (state === STATE.REVIVE) {
      if (hitReviveArea(logicalX, logicalY)) {
        showReviveAd();
        return;
      }
      if (hitSkipReviveArea(logicalX, logicalY)) {
        goGameOver();
      }
      return;
    }
    if (state === STATE.GAMEOVER) {
      if (hitButton(logicalX, logicalY, ui.restart.x, ui.restart.y, ui.restart.w, ui.restart.h)) {
        resetRun();
        state = STATE.PLAYING;
        return;
      }
      if (hitButton(logicalX, logicalY, ui.shortcut.x, ui.shortcut.y, ui.shortcut.w, ui.shortcut.h)) {
        tryAddShortcut();
      }
      return;
    }
  }

  function onPointerDown(ev) {
    var t = ev.touches ? ev.touches[0] : ev;
    var p = mapClientToLogical(t.clientX, t.clientY);
    handleTap(p.x, p.y);
  }

  function onPointerMove(ev) {
    if (state !== STATE.PLAYING || pausedByHost) return;
    var t = ev.touches ? ev.touches[0] : ev;
    var p = mapClientToLogical(t.clientX, t.clientY);
    player.x = Math.max(player.r + 8, Math.min(LOGICAL_W - player.r - 8, p.x));
  }

  canvas.addEventListener('mousedown', onPointerDown);
  canvas.addEventListener('mousemove', onPointerMove);
  canvas.addEventListener('touchstart', function (e) {
    e.preventDefault();
    onPointerDown(e);
  }, { passive: false });
  canvas.addEventListener('touchmove', function (e) {
    e.preventDefault();
    onPointerMove(e);
  }, { passive: false });

  var lastT = performance.now() / 1000;

  function update(dt) {
    if (pausedByHost) return;
    if (state !== STATE.PLAYING) return;
    if (invuln > 0) invuln -= dt;

    spawnTimer += dt;
    if (spawnTimer > 0.55) {
      spawnTimer = 0;
      spawnEntity();
    }

    for (var i = entities.length - 1; i >= 0; i--) {
      var e = entities[i];
      e.y += e.vy * dt;
      var dx = e.x - player.x;
      var dy = e.y - player.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (e.kind === 'orb' && dist < player.r + e.r) {
        score += 10;
        entities.splice(i, 1);
        continue;
      }
      if (e.kind === 'spike' && invuln <= 0 && dist < player.r + e.r * 0.85) {
        if (!reviveUsed) state = STATE.REVIVE;
        else goGameOver();
        return;
      }
      if (e.y > LOGICAL_H + 40) entities.splice(i, 1);
    }
  }

  function drawBackground() {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    ctx.strokeStyle = 'rgba(0,255,200,0.06)';
    ctx.lineWidth = 1;
    for (var gx = 0; gx < LOGICAL_W; gx += 32) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, LOGICAL_H);
      ctx.stroke();
    }
    for (var gy = 0; gy < LOGICAL_H; gy += 32) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(LOGICAL_W, gy);
      ctx.stroke();
    }
  }

  function drawHUD() {
    ctx.font = '600 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    neonGlow(ctx, '#00ffd0', 12);
    ctx.fillStyle = '#e8fff9';
    ctx.fillText('SCORE ' + score, LOGICAL_W * 0.5, 16);
    clearGlow(ctx);
  }

  function drawMenu() {
    drawBackground();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    neonGlow(ctx, '#ff00aa', 20);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 26px system-ui, sans-serif';
    ctx.fillText(GAME_TITLE, LOGICAL_W * 0.5, LOGICAL_H * 0.28);
    clearGlow(ctx);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText(DEV_NAME, LOGICAL_W * 0.5, LOGICAL_H * 0.34);

    drawRoundedRect(ui.start.x, ui.start.y, ui.start.w, ui.start.h, 14, 'rgba(0,255,208,0.15)', '#00ffc8');
    ctx.fillStyle = '#00ffc8';
    ctx.font = '700 20px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('START', ui.start.x + ui.start.w * 0.5, ui.start.y + ui.start.h * 0.5);
  }

  function drawRevive() {
    drawBackground();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '600 22px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('CONTINUE?', LOGICAL_W * 0.5, LOGICAL_H * 0.36);
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('Watch ad to revive', LOGICAL_W * 0.5, LOGICAL_H * 0.41);

    drawRoundedRect(ui.revive.x, ui.revive.y, ui.revive.w, ui.revive.h, 12, 'rgba(255,0,170,0.2)', '#ff4db8', 2);
    neonGlow(ctx, '#39ff14', 14);
    drawRoundedRect(ui.revive.x, ui.revive.y, ui.revive.w, ui.revive.h, 12, null, '#39ff14', 4);
    clearGlow(ctx);
    ctx.fillStyle = '#ff4db8';
    ctx.font = '700 17px system-ui, sans-serif';
    ctx.fillText('REVIVE', ui.revive.x + ui.revive.w * 0.5, ui.revive.y + ui.revive.h * 0.5);

    drawRoundedRect(ui.skipRevive.x, ui.skipRevive.y, ui.skipRevive.w, ui.skipRevive.h, 10, 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.35)');
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.fillText('NO THANKS', ui.skipRevive.x + ui.skipRevive.w * 0.5, ui.skipRevive.y + ui.skipRevive.h * 0.5);
  }

  function drawGameOver() {
    drawBackground();
    ctx.textAlign = 'center';
    neonGlow(ctx, '#7c4dff', 16);
    ctx.fillStyle = '#fff';
    ctx.font = '700 24px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('GAME OVER', LOGICAL_W * 0.5, LOGICAL_H * 0.32);
    clearGlow(ctx);
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    var total = score + shortcutBonus;
    ctx.fillText('Final: ' + total + (shortcutBonus ? ' (incl. desktop +' + shortcutBonus + ')' : ''), LOGICAL_W * 0.5, LOGICAL_H * 0.39);

    drawRoundedRect(ui.restart.x, ui.restart.y, ui.restart.w, ui.restart.h, 12, 'rgba(0,255,200,0.18)', '#00ffd0');
    ctx.fillStyle = '#00ffd0';
    ctx.font = '700 17px system-ui, sans-serif';
    ctx.fillText('RESTART', ui.restart.x + ui.restart.w * 0.5, ui.restart.y + ui.restart.h * 0.5);

    drawRoundedRect(ui.shortcut.x, ui.shortcut.y, ui.shortcut.w, ui.shortcut.h, 12, 'rgba(124,77,255,0.25)', '#b388ff');
    ctx.fillStyle = '#e0d4ff';
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.fillText('ADD TO DESKTOP', ui.shortcut.x + ui.shortcut.w * 0.5, ui.shortcut.y + ui.shortcut.h * 0.5);
  }

  function drawWorld() {
    drawBackground();
    entities.forEach(function (e) {
      if (e.kind === 'orb') {
        neonGlow(ctx, '#00fff2', 14);
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fillStyle = '#00fff2';
        ctx.fill();
        clearGlow(ctx);
      } else {
        neonGlow(ctx, '#ff2d6a', 12);
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(Math.PI);
        ctx.beginPath();
        ctx.moveTo(0, -e.r);
        ctx.lineTo(e.r * 0.85, e.r * 0.7);
        ctx.lineTo(-e.r * 0.85, e.r * 0.7);
        ctx.closePath();
        ctx.fillStyle = '#ff2d6a';
        ctx.fill();
        ctx.restore();
        clearGlow(ctx);
      }
    });

    if (invuln > 0 && Math.floor(invuln * 8) % 2 === 0) {
      ctx.globalAlpha = 0.45;
    }
    neonGlow(ctx, '#00ffd0', 18);
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
    ctx.fillStyle = '#0d1f1c';
    ctx.fill();
    ctx.strokeStyle = '#00ffd0';
    ctx.lineWidth = 3;
    ctx.stroke();
    clearGlow(ctx);
    ctx.globalAlpha = 1;

    drawHUD();
  }

  function frame(now) {
    var t = now / 1000;
    var dt = Math.min(0.05, t - lastT);
    lastT = t;
    update(dt);
    if (state === STATE.MENU) drawMenu();
    else if (state === STATE.REVIVE) drawRevive();
    else if (state === STATE.GAMEOVER) drawGameOver();
    else drawWorld();
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
