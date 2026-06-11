/* 遊戲畫面：渲染快照 + 主迴圈（單機/連線共用） */
(function (root) {
'use strict';
const E = root.Engine;
const { T, COLS, ROWS, W, H } = E;

const ITEM_EMOJI = { b: '🎈', p: '💧', s: '👟', n: '📌' };

const GameView = {
  canvas: null, ctx: null,
  mode: null,          // 'local' | 'net'
  localGame: null,
  bots: [],            // 單機機器人 id
  snap: null,
  drawPos: {},         // id -> {x,y} 平滑顯示位置
  myId: null,
  running: false,
  lastTime: 0,
  botTimer: 0,
  onExit: null,        // 離開遊戲畫面回呼

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
    GameView._begin();
  },

  startNet(myId, firstSnap) {
    GameView.mode = 'net';
    GameView.myId = myId;
    GameView.localGame = null;
    GameView.snap = firstSnap || null;
    GameView._begin();
  },

  onNetState(snap) {
    GameView.snap = snap;
    for (const ev of snap.events || []) Sound.play(ev);
    if (snap.over) GameView._showResult(snap);
  },

  _begin() {
    GameView.drawPos = {};
    GameView.running = true;
    GameView.lastTime = performance.now();
    GameView.botTimer = 0;
    document.getElementById('result-overlay').classList.add('hidden');
    Controls.reset();
    GameView.fit();
    requestAnimationFrame(GameView._loop);
  },

  stop() {
    GameView.running = false;
    Controls.reset();
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
    }

    if (GameView.snap) GameView._render(GameView.snap, dt);
    requestAnimationFrame(GameView._loop);
  },

  _showResult(snap) {
    if (GameView._resultShown === snap.over && GameView._resultT === snap.t) return;
    if (GameView._resultDone) return;
    GameView._resultDone = true;
    const ov = document.getElementById('result-overlay');
    const title = document.getElementById('result-title');
    const winner = snap.players.find(p => p.id === snap.winner);
    if (!snap.winner) title.textContent = '平手！';
    else if (snap.winner === GameView.myId) { title.textContent = '🏆 你贏了！'; Sound.win(); }
    else { title.textContent = `🏆 ${winner ? winner.name : '?'} 獲勝`; if (snap.winner !== GameView.myId) Sound.lose(); }
    document.getElementById('btn-rematch').style.display = GameView.mode === 'local' ? '' : 'none';
    ov.classList.remove('hidden');
    setTimeout(() => { GameView._resultDone = false; }, 100);
  },

  /* ---------- 渲染 ---------- */
  _render(s, dt) {
    const ctx = GameView.ctx;
    const theme = (E.MAPS[s.mapId] || E.MAPS[0]).theme;
    // 地板
    for (let gy = 0; gy < ROWS; gy++) {
      for (let gx = 0; gx < COLS; gx++) {
        ctx.fillStyle = (gx + gy) % 2 ? theme.floor1 : theme.floor2;
        ctx.fillRect(gx * T, gy * T, T, T);
      }
    }
    // 牆、箱子、河流（草叢頂層最後畫，才能蓋住玩家）
    const bushCells = [];
    for (let gy = 0; gy < ROWS; gy++) {
      for (let gx = 0; gx < COLS; gx++) {
        const c = s.grid[gy * COLS + gx];
        const x = gx * T, y = gy * T;
        if (c === '1') {           // 硬牆
          ctx.fillStyle = theme.wall;
          ctx.fillRect(x + 1, y + 1, T - 2, T - 2);
          ctx.fillStyle = theme.wallTop;
          ctx.fillRect(x + 1, y + 1, T - 2, 8);
        } else if (c === '2') {    // 木箱
          ctx.fillStyle = theme.box;
          ctx.fillRect(x + 3, y + 3, T - 6, T - 6);
          ctx.strokeStyle = theme.boxEdge;
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 3, y + 3, T - 6, T - 6);
          ctx.beginPath();
          ctx.moveTo(x + 3, y + 3); ctx.lineTo(x + T - 3, y + T - 3);
          ctx.moveTo(x + T - 3, y + 3); ctx.lineTo(x + 3, y + T - 3);
          ctx.stroke();
        } else if (c === '3') {    // 草叢（底色，頂層稍後畫）
          bushCells.push([x, y]);
        } else if (c === '4') {    // 河流（流動水波）
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
    // 熔岩地磚（預警閃爍 / 噴發）
    for (const l of s.lava || []) {
      const x = l.gx * T, y = l.gy * T;
      if (l.phase === 'warn') {
        const a = 0.3 + 0.25 * Math.sin(s.t * 12);
        ctx.fillStyle = `rgba(255,112,67,${a})`;
        ctx.fillRect(x + 2, y + 2, T - 4, T - 4);
      } else {
        ctx.fillStyle = theme.lava1 || '#ff7043';
        ctx.fillRect(x + 1, y + 1, T - 2, T - 2);
        ctx.fillStyle = theme.lava2 || '#ffab40';
        for (let i = 0; i < 3; i++) {
          const bx = x + 8 + ((l.gx * 7 + i * 11) % 24);
          const by = y + 8 + ((l.gy * 5 + i * 13) % 24);
          const r = 3 + Math.sin(s.t * 5 + i * 2 + l.gx) * 1.5;
          ctx.beginPath(); ctx.arc(bx, by, Math.max(1, r), 0, Math.PI * 2); ctx.fill();
        }
        ctx.strokeStyle = theme.lavaEdge || '#bf360c';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, T - 2, T - 2);
      }
    }
    // 道具
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '24px sans-serif';
    for (const it of s.items) {
      ctx.fillText(ITEM_EMOJI[it.k] || '?', it.gx * T + T / 2, it.gy * T + T / 2 + 1);
    }
    // 水球（脈動；別人藏在草叢裡的看不到，滑行中畫在實際像素位置）
    for (const b of s.bombs) {
      if (b.hidden && b.owner !== GameView.myId) continue;
      const pulse = 1 + 0.08 * Math.sin((3 - b.t) * 10);
      const r = 15 * pulse;
      const cx = b.x, cy = b.y;
      ctx.globalAlpha = b.hidden ? 0.5 : 1;
      ctx.fillStyle = b.t < 0.8 ? '#ff7043' : '#42a5f5';
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.beginPath(); ctx.arc(cx - r * 0.3, cy - r * 0.35, r * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1565c0'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // 水柱
    for (const e of s.ex) {
      const a = Math.min(1, e.t / 0.35);
      const cx = e.gx * T + T / 2, cy = e.gy * T + T / 2;
      ctx.fillStyle = `rgba(66,165,245,${0.75 * a})`;
      ctx.beginPath(); ctx.arc(cx, cy, T * 0.48, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(187,222,251,${0.9 * a})`;
      ctx.beginPath(); ctx.arc(cx, cy, T * 0.28, 0, Math.PI * 2); ctx.fill();
    }
    // 玩家（躲在草叢裡的別人不畫；自己半透明）
    for (const p of s.players) {
      if (!p.alive) continue;
      if (p.hidden && p.id !== GameView.myId) { delete GameView.drawPos[p.id]; continue; }
      // 平滑插值（網路模式抖動消除）
      let dp = GameView.drawPos[p.id];
      if (!dp) dp = GameView.drawPos[p.id] = { x: p.x, y: p.y };
      const lerp = GameView.mode === 'net' ? Math.min(1, dt * 14) : 1;
      dp.x += (p.x - dp.x) * lerp;
      dp.y += (p.y - dp.y) * lerp;
      if (p.hidden) ctx.globalAlpha = 0.55; // 自己躲草叢時半透明
      GameView._drawPlayer(ctx, p, dp.x, dp.y, s.t);
      ctx.globalAlpha = 1;
    }
    // 草叢頂層（蓋在玩家上面）
    for (const [x, y] of bushCells) {
      ctx.fillStyle = theme.bush1 || '#2e7d32';
      ctx.beginPath(); ctx.arc(x + 13, y + 22, 11, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 28, y + 24, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = theme.bush2 || '#43a047';
      ctx.beginPath(); ctx.arc(x + 20, y + 14, 11, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 31, y + 13, 8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 9, y + 12, 8, 0, Math.PI * 2); ctx.fill();
    }
    GameView._renderHud(s);
  },

  _drawPlayer(ctx, p, x, y, time) {
    const blink = p.invuln > 0 && Math.floor(time * 10) % 2 === 0;
    if (blink) return;
    const bob = p.moving ? Math.sin(time * 14) * 2 : 0;
    // 影子
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.beginPath(); ctx.ellipse(x, y + 14, 13, 5, 0, 0, Math.PI * 2); ctx.fill();
    // 身體
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(x, y - 2 + bob, 14, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 2; ctx.stroke();
    // 眼睛
    const ex = p.dir === 'left' ? -4 : p.dir === 'right' ? 4 : 0;
    const ey = p.dir === 'up' ? -4 : p.dir === 'down' ? 2 : 0;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x - 5 + ex, y - 5 + ey + bob, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 5 + ex, y - 5 + ey + bob, 4, 0, Math.PI * 2); ctx.fill();
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
      // 倒數
      ctx.fillStyle = '#d32f2f';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(Math.ceil(p.trapT), x, y - 30);
    }
    // 名字
    ctx.fillStyle = p.id === GameView.myId ? '#fff176' : 'rgba(255,255,255,.92)';
    ctx.font = 'bold 11px sans-serif';
    ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 3;
    ctx.strokeText(p.name, x, y - 24);
    ctx.fillText(p.name, x, y - 24);
  },

  _renderHud(s) {
    const hud = document.getElementById('game-hud');
    let html = '';
    for (const p of s.players) {
      const dead = !p.alive;
      html += `<div class="hud-p ${dead ? 'dead' : ''}">
        <span class="dot" style="background:${p.color}"></span>
        <span class="hud-name">${esc(p.name)}</span>
        ${dead ? '💀' : p.trapped ? '🫧' : `🎈${p.maxBombs} 💧${p.power}${p.needles ? ' 📌' + p.needles : ''}`}
      </div>`;
    }
    if (hud._last !== html) { hud.innerHTML = html; hud._last = html; }
  }
};

function esc(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

root.GameView = GameView;
root.escHtml = esc;
})(window);
