/* 遊戲畫面：渲染快照 + 主迴圈（單機/連線共用）
   連線模式採「客戶端預測 + 實體插值」消除操作延遲感。 */
(function (root) {
'use strict';
const E = root.Engine;
const { T, COLS, ROWS, W, H } = E;
const PR = 14;                       // 與引擎玩家碰撞半寬一致
const FLOOR = '0', BUSH = '3';       // grid 字串中的字元

const ITEM = {
  b: { icon: '🎈', bg: '#ff7eb3' },
  p: { icon: '💧', bg: '#4fc3f7' },
  s: { icon: '👟', bg: '#aed581' },
  n: { icon: '📌', bg: '#ffd54f' }
};

/* ====================== 客戶端預測器（連線模式本機角色） ====================== */
const Predictor = {
  active: false,
  x: 0, y: 0, dir: 'down',
  initFrom(p) { this.x = p.x; this.y = p.y; this.dir = p.dir || 'down'; this.active = true; },

  // 與引擎 passable 相同的碰撞判定（讀快照）
  passable(snap, x, y, curX, curY) {
    if (x - PR < 0 || x + PR > W || y - PR < 0 || y + PR > H) return false;
    const x0 = Math.floor((x - PR) / T), x1 = Math.floor((x + PR - 0.01) / T);
    const y0 = Math.floor((y - PR) / T), y1 = Math.floor((y + PR - 0.01) / T);
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const c = snap.grid[gy * COLS + gx];
        if (c !== FLOOR && c !== BUSH) return false;
        const lv = (snap.lava || []).find(l => l.gx === gx && l.gy === gy && l.phase === 'on');
        if (lv) return false;
        const b = snap.bombs.find(bb => bb.gx === gx && bb.gy === gy);
        if (b && !overlapTile(curX, curY, gx, gy)) return false;
      }
    }
    return true;
  },

  // 用目前輸入推進本機角色（與引擎 movePlayer 相同，含轉角輔助）
  step(dt, snap, speed) {
    const dx = Controls.dx, dy = Controls.dy;
    if (!dx && !dy) return;
    if (dx) this.dir = dx > 0 ? 'right' : 'left';
    else if (dy) this.dir = dy > 0 ? 'down' : 'up';
    const d = speed * dt;
    const nx = this.x + dx * d, ny = this.y + dy * d;
    if (this.passable(snap, nx, ny, this.x, this.y)) { this.x = nx; this.y = ny; return; }
    if (dx) {
      const cy = Math.floor(this.y / T) * T + T / 2;
      const slide = Math.sign(cy - this.y) || 0;
      if (slide && this.passable(snap, this.x, this.y + slide * d, this.x, this.y) &&
          this.passable(snap, nx, cy, this.x, this.y)) this.y += slide * Math.min(d, Math.abs(cy - this.y));
    } else if (dy) {
      const cx = Math.floor(this.x / T) * T + T / 2;
      const slide = Math.sign(cx - this.x) || 0;
      if (slide && this.passable(snap, this.x + slide * d, this.y, this.x, this.y) &&
          this.passable(snap, cx, ny, this.x, this.y)) this.x += slide * Math.min(d, Math.abs(cx - this.x));
    }
  },

  // 收到權威快照後校正：誤差大就瞬移，否則柔性靠攏（避免抖動）
  reconcile(p) {
    if (!this.active) { this.initFrom(p); return; }
    const err = Math.hypot(p.x - this.x, p.y - this.y);
    if (err > T * 1.4) { this.x = p.x; this.y = p.y; }
    else { this.x += (p.x - this.x) * 0.2; this.y += (p.y - this.y) * 0.2; }
  }
};

function overlapTile(x, y, gx, gy) {
  return Math.abs(x - (gx * T + T / 2)) < T / 2 + PR &&
         Math.abs(y - (gy * T + T / 2)) < T / 2 + PR;
}

/* ====================== 遊戲畫面 ====================== */
const GameView = {
  canvas: null, ctx: null,
  mode: null, localGame: null, bots: [],
  snap: null, drawPos: {}, myId: null,
  running: false, lastTime: 0, botTimer: 0, bannerT: 0,

  init() {
    GameView.canvas = document.getElementById('game-canvas');
    GameView.ctx = GameView.canvas.getContext('2d');
    GameView.canvas.width = W;
    GameView.canvas.height = H;
    window.addEventListener('resize', GameView.fit);
    Controls.onChange = (dx, dy) => {
      if (!GameView.running) return;
      if (GameView.mode === 'local') GameView.localGame.setInput(GameView.myId, dx, dy);
      else Net.sendInput(dx, dy);
    };
    Controls.onAction = () => {
      if (!GameView.running) return;
      if (GameView.mode === 'local') GameView.localGame.action(GameView.myId);
      else Net.sendAction();
    };
  },

  fit() {
    const c = GameView.canvas;
    if (!c) return;
    const box = document.getElementById('game-wrap');
    const availW = box.clientWidth, availH = box.clientHeight;
    const scale = Math.min(availW / W, availH / H);
    c.style.width = Math.floor(W * scale) + 'px';
    c.style.height = Math.floor(H * scale) + 'px';
  },

  startLocal(mapId, botCount, playerName) {
    const info = [{ id: 'me', name: playerName }];
    GameView.bots = [];
    for (let i = 0; i < botCount; i++) {
      const id = 'bot' + i;
      GameView.bots.push(id);
      info.push({ id, name: '電腦' + (i + 1) });
    }
    GameView.mode = 'local';
    GameView.myId = 'me';
    GameView.localGame = new E.Game(mapId, info);
    GameView.snap = GameView.localGame.snapshot();
    Predictor.active = false;
    GameView._begin();
  },

  startNet(myId, firstSnap) {
    GameView.mode = 'net';
    GameView.myId = myId;
    GameView.localGame = null;
    GameView.snap = firstSnap || null;
    Predictor.active = false;
    if (firstSnap) {
      const me = firstSnap.players.find(p => p.id === myId);
      if (me) Predictor.initFrom(me);
    }
    GameView._begin();
  },

  onNetState(snap) {
    GameView.snap = snap;
    for (const ev of snap.events || []) Sound.play(ev);
    const me = snap.players.find(p => p.id === GameView.myId);
    if (me && me.alive && !me.trapped) Predictor.reconcile(me);
    else Predictor.active = false;
    if (snap.over) GameView._showResult(snap);
  },

  _begin() {
    GameView.drawPos = {};
    GameView.running = true;
    GameView.lastTime = performance.now();
    GameView.botTimer = 0;
    GameView.bannerT = 1.8;
    GameView._resultDone = false;
    document.getElementById('result-overlay').classList.add('hidden');
    GameView._showBanner();
    Controls.reset();
    GameView.fit();
    requestAnimationFrame(GameView._loop);
  },

  stop() { GameView.running = false; Controls.reset(); },

  _showBanner() {
    const map = E.MAPS[(GameView.snap && GameView.snap.mapId) || 0];
    const el = document.getElementById('match-banner');
    if (!el || !map) return;
    el.innerHTML = `<div class="mb-name">${esc(map.name)}</div><div class="mb-eff">${esc(map.desc)}</div>`;
    el.classList.remove('hidden');
    el.classList.add('show');
    setTimeout(() => { el.classList.remove('show'); }, 1500);
    setTimeout(() => { el.classList.add('hidden'); }, 1900);
  },

  _loop(now) {
    if (!GameView.running) return;
    const dt = Math.min(0.05, (now - GameView.lastTime) / 1000);
    GameView.lastTime = now;

    if (GameView.mode === 'local') {
      const g = GameView.localGame;
      GameView.botTimer -= dt;
      if (GameView.botTimer <= 0 && !g.over) {
        GameView.botTimer = 0.12;
        for (const id of GameView.bots) {
          const r = botThink(g, id);
          g.setInput(id, r.dx, r.dy);
          if (r.action) g.action(id);
        }
      }
      g.update(dt);
      const snap = g.snapshot();
      for (const ev of snap.events) Sound.play(ev);
      GameView.snap = snap;
      if (snap.over) GameView._showResult(snap);
    } else if (GameView.mode === 'net' && GameView.snap && Predictor.active) {
      const me = GameView.snap.players.find(p => p.id === GameView.myId);
      if (me) Predictor.step(dt, GameView.snap, me.speed || 130);
    }

    if (GameView.snap) GameView._render(GameView.snap, dt);
    requestAnimationFrame(GameView._loop);
  },

  _showResult(snap) {
    if (GameView._resultDone) return;
    GameView._resultDone = true;
    const ov = document.getElementById('result-overlay');
    const title = document.getElementById('result-title');
    const sub = document.getElementById('result-sub');
    const winner = snap.players.find(p => p.id === snap.winner);
    if (!snap.winner) { title.textContent = '🤝 平手！'; sub.textContent = '同歸於盡'; }
    else if (snap.winner === GameView.myId) { title.textContent = '🏆 勝利！'; sub.textContent = '你是最後的贏家'; Sound.win(); }
    else { title.textContent = '💧 落敗'; sub.textContent = `${winner ? winner.name : '?'} 獲勝`; Sound.lose(); }
    document.getElementById('btn-rematch').style.display = GameView.mode === 'local' ? '' : 'none';
    ov.classList.remove('hidden');
  },

  /* ---------- 渲染 ---------- */
  _render(s, dt) {
    const ctx = GameView.ctx;
    const theme = (E.MAPS[s.mapId] || E.MAPS[0]).theme;
    // 地板（含柔和格紋）
    for (let gy = 0; gy < ROWS; gy++) {
      for (let gx = 0; gx < COLS; gx++) {
        ctx.fillStyle = (gx + gy) % 2 ? theme.floor1 : theme.floor2;
        ctx.fillRect(gx * T, gy * T, T, T);
      }
    }
    // 牆、箱子、河流（草叢頂層最後畫）
    const bushCells = [];
    for (let gy = 0; gy < ROWS; gy++) {
      for (let gx = 0; gx < COLS; gx++) {
        const c = s.grid[gy * COLS + gx];
        const x = gx * T, y = gy * T;
        if (c === '1') {
          rr(ctx, x + 1, y + 1, T - 2, T - 2, 7);
          ctx.fillStyle = theme.wall; ctx.fill();
          rr(ctx, x + 3, y + 2, T - 6, T - 8, 6);
          ctx.fillStyle = theme.wallTop; ctx.fill();
        } else if (c === '2') {
          rr(ctx, x + 3, y + 3, T - 6, T - 6, 6);
          ctx.fillStyle = theme.box; ctx.fill();
          ctx.strokeStyle = theme.boxEdge; ctx.lineWidth = 2.5; ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x + 6, y + 6); ctx.lineTo(x + T - 6, y + T - 6);
          ctx.moveTo(x + T - 6, y + 6); ctx.lineTo(x + 6, y + T - 6);
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,.18)';
          rr(ctx, x + 6, y + 6, T - 12, 5, 2); ctx.fill();
        } else if (c === '3') {
          bushCells.push([x, y]);
        } else if (c === '4') {
          ctx.fillStyle = theme.water1 || '#4fb3e8';
          ctx.fillRect(x, y, T, T);
          ctx.strokeStyle = theme.water2 || '#7cc9f0';
          ctx.lineWidth = 2;
          for (let w = 0; w < 2; w++) {
            const wy = y + 12 + w * 16 + Math.sin(s.t * 3 + gx * 1.3 + w * 2) * 3;
            ctx.beginPath();
            ctx.moveTo(x + 5, wy);
            ctx.quadraticCurveTo(x + T / 2, wy - 4, x + T - 5, wy);
            ctx.stroke();
          }
        }
      }
    }
    // 熔岩地磚
    for (const l of s.lava || []) {
      const x = l.gx * T, y = l.gy * T;
      if (l.phase === 'warn') {
        const a = 0.3 + 0.28 * Math.sin(s.t * 12);
        rr(ctx, x + 2, y + 2, T - 4, T - 4, 6);
        ctx.fillStyle = `rgba(255,112,67,${a})`; ctx.fill();
        ctx.strokeStyle = `rgba(255,82,40,${a + 0.2})`; ctx.lineWidth = 2; ctx.stroke();
      } else {
        rr(ctx, x + 1, y + 1, T - 2, T - 2, 6);
        ctx.fillStyle = theme.lava1 || '#ff7043'; ctx.fill();
        ctx.fillStyle = theme.lava2 || '#ffab40';
        for (let i = 0; i < 3; i++) {
          const bx = x + 8 + ((l.gx * 7 + i * 11) % 24);
          const by = y + 8 + ((l.gy * 5 + i * 13) % 24);
          const r = 3 + Math.sin(s.t * 5 + i * 2 + l.gx) * 1.5;
          ctx.beginPath(); ctx.arc(bx, by, Math.max(1, r), 0, Math.PI * 2); ctx.fill();
        }
        rr(ctx, x + 1, y + 1, T - 2, T - 2, 6);
        ctx.strokeStyle = theme.lavaEdge || '#bf360c'; ctx.lineWidth = 2.5; ctx.stroke();
      }
    }
    // 道具（圓底徽章 + 浮動）
    for (const it of s.items) {
      const cx = it.gx * T + T / 2, cy = it.gy * T + T / 2 + Math.sin(s.t * 3 + it.gx + it.gy) * 2;
      const meta = ITEM[it.k] || { icon: '?', bg: '#fff' };
      ctx.fillStyle = meta.bg;
      ctx.beginPath(); ctx.arc(cx, cy, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.beginPath(); ctx.arc(cx - 4, cy - 5, 5, 0, Math.PI * 2); ctx.fill();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '17px sans-serif';
      ctx.fillText(meta.icon, cx, cy + 1);
    }
    // 水球
    for (const b of s.bombs) {
      if (b.hidden && b.owner !== GameView.myId) continue;
      const pulse = 1 + 0.08 * Math.sin((3 - b.t) * 10);
      const r = 15 * pulse;
      const cx = b.x, cy = b.y;
      ctx.globalAlpha = b.hidden ? 0.5 : 1;
      const grad = ctx.createRadialGradient(cx - 4, cy - 5, 2, cx, cy, r);
      const danger = b.t < 0.8;
      grad.addColorStop(0, danger ? '#ffd0b0' : '#bbe3ff');
      grad.addColorStop(1, danger ? '#ff7043' : '#42a5f5');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      ctx.beginPath(); ctx.arc(cx - r * 0.3, cy - r * 0.35, r * 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = danger ? '#c1440e' : '#1565c0'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // 水柱
    for (const e of s.ex) {
      const a = Math.min(1, e.t / 0.35);
      const cx = e.gx * T + T / 2, cy = e.gy * T + T / 2;
      ctx.fillStyle = `rgba(66,165,245,${0.7 * a})`;
      ctx.beginPath(); ctx.arc(cx, cy, T * 0.48, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(187,222,251,${0.95 * a})`;
      ctx.beginPath(); ctx.arc(cx, cy, T * 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${0.9 * a})`;
      ctx.beginPath(); ctx.arc(cx - 4, cy - 4, T * 0.1, 0, Math.PI * 2); ctx.fill();
    }
    // 玩家
    for (const p of s.players) {
      if (!p.alive) continue;
      if (p.hidden && p.id !== GameView.myId) { delete GameView.drawPos[p.id]; continue; }
      let dx, dy, dir = p.dir;
      if (p.id === GameView.myId && GameView.mode === 'net' && Predictor.active) {
        dx = Predictor.x; dy = Predictor.y; dir = Predictor.dir;
        GameView.drawPos[p.id] = { x: dx, y: dy };
      } else {
        let dp = GameView.drawPos[p.id];
        if (!dp) dp = GameView.drawPos[p.id] = { x: p.x, y: p.y };
        const lerp = GameView.mode === 'net' ? Math.min(1, dt * 22) : 1;
        dp.x += (p.x - dp.x) * lerp;
        dp.y += (p.y - dp.y) * lerp;
        dx = dp.x; dy = dp.y;
      }
      if (p.hidden) ctx.globalAlpha = 0.55;
      GameView._drawPlayer(ctx, p, dx, dy, s.t, dir);
      ctx.globalAlpha = 1;
    }
    // 草叢頂層
    for (const [x, y] of bushCells) {
      ctx.fillStyle = theme.bush1 || '#2e7d32';
      ctx.beginPath(); ctx.arc(x + 13, y + 22, 11, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 28, y + 24, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = theme.bush2 || '#43a047';
      ctx.beginPath(); ctx.arc(x + 20, y + 14, 11, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 31, y + 13, 8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 9, y + 12, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.12)';
      ctx.beginPath(); ctx.arc(x + 17, y + 11, 4, 0, Math.PI * 2); ctx.fill();
    }
    GameView._renderHud(s);
  },

  _drawPlayer(ctx, p, x, y, time, dir) {
    const blink = p.invuln > 0 && Math.floor(time * 10) % 2 === 0;
    if (blink) ctx.globalAlpha *= 0.4;
    const bob = p.moving ? Math.sin(time * 14) * 2 : 0;
    // 影子
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.beginPath(); ctx.ellipse(x, y + 14, 13, 5, 0, 0, Math.PI * 2); ctx.fill();
    // 身體（球面漸層）
    const grad = ctx.createRadialGradient(x - 4, y - 8 + bob, 2, x, y - 2 + bob, 15);
    grad.addColorStop(0, lighten(p.color, 0.4));
    grad.addColorStop(1, p.color);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(x, y - 2 + bob, 14, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.lineWidth = 2; ctx.stroke();
    // 眼睛
    const ex = dir === 'left' ? -4 : dir === 'right' ? 4 : 0;
    const ey = dir === 'up' ? -4 : dir === 'down' ? 2 : 0;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x - 5 + ex, y - 5 + ey + bob, 4.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 5 + ex, y - 5 + ey + bob, 4.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#333';
    ctx.beginPath(); ctx.arc(x - 5 + ex * 1.4, y - 5 + ey * 1.3 + bob, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 5 + ex * 1.4, y - 5 + ey * 1.3 + bob, 2, 0, Math.PI * 2); ctx.fill();
    // 泡泡
    if (p.trapped) {
      ctx.strokeStyle = 'rgba(100,181,246,.95)';
      ctx.fillStyle = 'rgba(144,202,249,.30)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y - 2, 21 + Math.sin(time * 6) * 1.5, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x - 7, y - 9, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d32f2f';
      ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(Math.ceil(p.trapT), x, y - 30);
    }
    // 名字
    ctx.fillStyle = p.id === GameView.myId ? '#fff176' : 'rgba(255,255,255,.95)';
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 3;
    ctx.strokeText(p.name, x, y - 24);
    ctx.fillText(p.name, x, y - 24);
    if (blink) ctx.globalAlpha /= 0.4;
  },

  _renderHud(s) {
    const hud = document.getElementById('game-hud');
    let html = '';
    for (const p of s.players) {
      const dead = !p.alive;
      const me = p.id === GameView.myId ? ' me' : '';
      const status = dead ? '<span class="hud-x">💀</span>'
        : p.trapped ? '<span class="hud-x">🫧</span>'
        : `<span class="hud-stat">🎈${p.maxBombs}</span><span class="hud-stat">💧${p.power}</span>${p.needles ? `<span class="hud-stat">📌${p.needles}</span>` : ''}`;
      html += `<div class="hud-p${me}${dead ? ' dead' : ''}">
        <span class="hud-av" style="background:${p.color}"></span>
        <span class="hud-info"><span class="hud-name">${esc(p.name)}</span><span class="hud-row">${status}</span></span>
      </div>`;
    }
    if (hud._last !== html) { hud.innerHTML = html; hud._last = html; }
  }
};

/* 圓角矩形 path */
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function lighten(hex, amt) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const f = v => Math.round(parseInt(v, 16) + (255 - parseInt(v, 16)) * amt);
  return `rgb(${f(m[1])},${f(m[2])},${f(m[3])})`;
}

function esc(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

root.GameView = GameView;
root.escHtml = esc;
})(window);
