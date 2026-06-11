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
    // 牆與箱子
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
        }
      }
    }
    // 道具
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '24px sans-serif';
    for (const it of s.items) {
      ctx.fillText(ITEM_EMOJI[it.k] || '?', it.gx * T + T / 2, it.gy * T + T / 2 + 1);
    }
    // 水球（脈動）
    for (const b of s.bombs) {
      const pulse = 1 + 0.08 * Math.sin((3 - b.t) * 10);
      const r = 15 * pulse;
      const cx = b.gx * T + T / 2, cy = b.gy * T + T / 2;
      ctx.fillStyle = b.t < 0.8 ? '#ff7043' : '#42a5f5';
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.beginPath(); ctx.arc(cx - r * 0.3, cy - r * 0.35, r * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1565c0'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
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
    // 玩家
    for (const p of s.players) {
      if (!p.alive) continue;
      // 平滑插值（網路模式抖動消除）
      let dp = GameView.drawPos[p.id];
      if (!dp) dp = GameView.drawPos[p.id] = { x: p.x, y: p.y };
      const lerp = GameView.mode === 'net' ? Math.min(1, dt * 14) : 1;
      dp.x += (p.x - dp.x) * lerp;
      dp.y += (p.y - dp.y) * lerp;
      GameView._drawPlayer(ctx, p, dp.x, dp.y, s.t);
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
