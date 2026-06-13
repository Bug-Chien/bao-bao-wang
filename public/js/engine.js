/* 爆爆王 共用遊戲引擎（瀏覽器 + Node.js 共用） */
(function (root) {
'use strict';

const T = 40;            // 格子像素
const COLS = 15, ROWS = 13;
const W = COLS * T, H = ROWS * T;
const PR = 14;           // 玩家碰撞半寬
const BOMB_TIME = 3;     // 水球引爆秒數
const EX_TIME = 0.55;    // 水柱持續秒數
const TRAP_TIME = 6;     // 泡泡受困秒數
const BASE_SPEED = 130, SPEED_STEP = 22, MAX_SPEED = 240;
const SLIDE_SPEED = 220; // 水球被推動的滑行速度
const COLORS = ['#ff5252', '#448aff', '#4caf50', '#ffb300'];

// 地圖：. 地板  # 硬牆  B 木箱  G 草叢  ~ 河流  1-4 出生點
const MAPS = [
  {
    id: 0, name: '翠綠森林', effect: 'bush', desc: '草叢可躲藏玩家與水球',
    theme: { floor1: '#a9d96d', floor2: '#9ecf60', wall: '#5d7d44', wallTop: '#73975a', box: '#c9914e', boxEdge: '#9c6a33', bush1: '#2e7d32', bush2: '#43a047' },
    rows: [
      '1.BBBBBGBBBBB.2',
      '.#B#B#B#B#B#B#.',
      'BBGB.B.B.B.BGBB',
      'B#B#B#B#B#B#B#B',
      'BB.B.B.B.B.B.BB',
      'B#B#B#B#B#B#B#B',
      'BB.B.BGBGB.B.BB',
      'B#B#B#B#B#B#B#B',
      'BB.B.B.B.B.B.BB',
      'B#B#B#B#B#B#B#B',
      'BBGB.B.B.B.BGBB',
      '.#B#B#B#B#B#B#.',
      '3.BBBBBGBBBBB.4'
    ]
  },
  {
    id: 1, name: '黃沙綠洲', effect: 'river', desc: '河流擋路，但水柱可越過',
    theme: { floor1: '#ecd49b', floor2: '#e3c98c', wall: '#a07f4f', wallTop: '#b8965f', box: '#b5793b', boxEdge: '#8a5a28', water1: '#4fb3e8', water2: '#7cc9f0' },
    rows: [
      '1..BB.....BB..2',
      '.#.B..#.#..B.#.',
      '..B...B.B...B..',
      'BB..#..B..#..BB',
      '.B.B..BBB..B.B.',
      '..#.B.B.B.B.#..',
      '~~~.~~~.~~~.~~~',
      '..#.B.B.B.B.#..',
      '.B.B..BBB..B.B.',
      'BB..#..B..#..BB',
      '..B...B.B...B..',
      '.#.B..#.#..B.#.',
      '3..BB.....BB..4'
    ]
  },
  {
    id: 2, name: '冰封迷宮', effect: 'push', desc: '走向水球可以把它推走',
    theme: { floor1: '#d4e9f6', floor2: '#c5def0', wall: '#6f93b5', wallTop: '#88a9c9', box: '#8fb3cc', boxEdge: '#67889f' },
    rows: [
      '1..B#.....#B..2',
      '.#B.BB#B#BB.B#.',
      'B.B#B.B.B.B#B.B',
      '.B.B.#.B.#.B.B.',
      '#.BB.B.B.B.BB.#',
      '.B#.B.#B#.B.#B.',
      '..B.B.B.B.B.B..',
      '.B#.B.#B#.B.#B.',
      '#.BB.B.B.B.BB.#',
      '.B.B.#.B.#.B.B.',
      'B.B#B.B.B.B#B.B',
      '.#B.BB#B#BB.B#.',
      '3..B#.....#B..4'
    ]
  },
  {
    id: 3, name: '熔岩火山', effect: 'lava', desc: '熔岩地磚隨機出現、消失',
    theme: { floor1: '#7a6055', floor2: '#71584e', wall: '#3e3434', wallTop: '#554645', box: '#8d5a3b', boxEdge: '#5f3a22', lava1: '#ff7043', lava2: '#ffab40', lavaEdge: '#bf360c' },
    rows: [
      '1..B.B.B.B.B..2',
      '.#B.#.BBB.#.B#.',
      '..B.B.B.B.B.B..',
      'B.#B..#.#..B#.B',
      '.B.B.BB.BB.B.B.',
      'B..#.B.#.B.#..B',
      '.BB.B.B.B.B.BB.',
      'B..#.B.#.B.#..B',
      '.B.B.BB.BB.B.B.',
      'B.#B..#.#..B#.B',
      '..B.B.B.B.B.B..',
      '.#B.#.BBB.#.B#.',
      '3..B.B.B.B.B..4'
    ]
  }
];

const FLOOR = 0, WALL = 1, BOX = 2, BUSH = 3, RIVER = 4;
const key = (gx, gy) => gx + ',' + gy;
const inB = (gx, gy) => gx >= 0 && gx < COLS && gy >= 0 && gy < ROWS;

// 熔岩參數
const LAVA_INTERVAL = 2.4;  // 每隔幾秒生成一批
const LAVA_WARN = 1.3;      // 預警時間
const LAVA_BATCH = 2;       // 每批數量
const LAVA_FIRST_DELAY = 5; // 開局緩衝

// 道具：b 水球+  p 威力+  s 跑鞋  n 針
const ITEM_DROP = 0.55;
function rollItem(rng) {
  const r = rng();
  if (r < 0.30) return 'b';
  if (r < 0.58) return 'p';
  if (r < 0.85) return 's';
  return 'n';
}

class Game {
  // playersInfo: [{id, name}]
  constructor(mapId, playersInfo, rng) {
    this.rng = rng || Math.random;
    this.map = MAPS[mapId] || MAPS[0];
    this.mapId = this.map.id;
    this.time = 0;
    this.over = false;
    this.winner = null;
    this.events = [];
    this.bombs = [];
    this.ex = [];           // 水柱格 {gx,gy,t}
    this.items = {};        // key -> type
    this.lava = [];         // {gx,gy,phase:'warn'|'on',t}
    this.lavaTimer = LAVA_FIRST_DELAY;
    this.grid = new Array(COLS * ROWS).fill(FLOOR);
    const spawns = {};
    for (let gy = 0; gy < ROWS; gy++) {
      for (let gx = 0; gx < COLS; gx++) {
        const c = this.map.rows[gy][gx];
        if (c === '#') this.grid[gy * COLS + gx] = WALL;
        else if (c === 'B') this.grid[gy * COLS + gx] = BOX;
        else if (c === 'G') this.grid[gy * COLS + gx] = BUSH;
        else if (c === '~') this.grid[gy * COLS + gx] = RIVER;
        else if (c >= '1' && c <= '4') spawns[c] = { gx, gy };
      }
    }
    this.players = playersInfo.slice(0, 4).map((info, i) => {
      const sp = spawns[String(i + 1)] || { gx: 0, gy: 0 };
      return {
        id: info.id, name: info.name, color: COLORS[i],
        x: sp.gx * T + T / 2, y: sp.gy * T + T / 2,
        dx: 0, dy: 0, dir: 'down', moving: false,
        speed: BASE_SPEED, maxBombs: 1, power: 1, needles: 0,
        alive: true, trapped: false, trapT: 0, invuln: 0, hidden: false,
        bombPass: new Set()
      };
    });
  }

  cell(gx, gy) { return inB(gx, gy) ? this.grid[gy * COLS + gx] : WALL; }
  bombAt(gx, gy) { return this.bombs.find(b => b.gx === gx && b.gy === gy); }
  lavaAt(gx, gy) { return this.lava.find(l => l.gx === gx && l.gy === gy); }
  player(id) { return this.players.find(p => p.id === id); }
  walkTile(gx, gy) { const c = this.cell(gx, gy); return c === FLOOR || c === BUSH; }

  setInput(id, dx, dy) {
    const p = this.player(id);
    if (!p || !p.alive) return;
    p.dx = Math.max(-1, Math.min(1, dx | 0));
    p.dy = Math.max(-1, Math.min(1, dy | 0));
    if (p.dx) { p.dir = p.dx > 0 ? 'right' : 'left'; p.dy = 0; }
    else if (p.dy) p.dir = p.dy > 0 ? 'down' : 'up';
  }

  // 放水球 / 受困時用針自救
  action(id) {
    const p = this.player(id);
    if (!p || !p.alive || this.over) return;
    if (p.trapped) {
      if (p.needles > 0) {
        p.needles--; p.trapped = false; p.invuln = 1.5;
        this.events.push({ k: 'needle', id: p.id });
      }
      return;
    }
    const gx = Math.floor(p.x / T), gy = Math.floor(p.y / T);
    if (this.bombAt(gx, gy)) return;
    if (!this.walkTile(gx, gy)) return;
    const lv = this.lavaAt(gx, gy);
    if (lv && lv.phase === 'on') return;
    const own = this.bombs.filter(b => b.owner === p.id).length;
    if (own >= p.maxBombs) return;
    const bomb = {
      gx, gy, t: BOMB_TIME, owner: p.id, power: p.power,
      px: gx * T + T / 2, py: gy * T + T / 2,
      sx: 0, sy: 0, tgx: gx, tgy: gy, hidden: false
    };
    this.bombs.push(bomb);
    // 站在水球上的玩家可以走出去
    const k = key(gx, gy);
    for (const q of this.players) {
      if (q.alive && this.overlapsTile(q, gx, gy)) q.bombPass.add(k);
    }
    this.events.push({ k: 'place' });
  }

  overlapsTile(p, gx, gy) {
    return Math.abs(p.x - (gx * T + T / 2)) < T / 2 + PR &&
           Math.abs(p.y - (gy * T + T / 2)) < T / 2 + PR;
  }

  passable(p, x, y) {
    if (x - PR < 0 || x + PR > W || y - PR < 0 || y + PR > H) return false;
    const x0 = Math.floor((x - PR) / T), x1 = Math.floor((x + PR - 0.01) / T);
    const y0 = Math.floor((y - PR) / T), y1 = Math.floor((y + PR - 0.01) / T);
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        if (!this.walkTile(gx, gy)) return false;
        const lv = this.lavaAt(gx, gy);
        if (lv && lv.phase === 'on') return false;
        if (this.bombAt(gx, gy) && !p.bombPass.has(key(gx, gy))) return false;
      }
    }
    return true;
  }

  // 水球可滑入的格子
  bombFree(gx, gy) {
    if (!this.walkTile(gx, gy)) return false;
    if (this.bombAt(gx, gy)) return false;
    const lv = this.lavaAt(gx, gy);
    if (lv && lv.phase === 'on') return false;
    return true;
  }

  movePlayer(p, dt) {
    if (!p.dx && !p.dy) { p.moving = false; return; }
    p.moving = true;
    const sp = p.trapped ? 45 : p.speed;
    const d = sp * dt;
    const nx = p.x + p.dx * d, ny = p.y + p.dy * d;
    if (this.passable(p, nx, ny)) { p.x = nx; p.y = ny; return; }
    // 冰封迷宮：走向水球可以推動它
    if (this.map.effect === 'push' && !p.trapped) {
      const fgx = Math.floor((p.x + p.dx * (PR + 4)) / T);
      const fgy = Math.floor((p.y + p.dy * (PR + 4)) / T);
      const b = this.bombAt(fgx, fgy);
      if (b && !p.bombPass.has(key(fgx, fgy)) && !b.sx && !b.sy &&
          this.bombFree(b.gx + p.dx, b.gy + p.dy)) {
        b.sx = p.dx; b.sy = p.dy;
        b.tgx = b.gx + p.dx; b.tgy = b.gy + p.dy;
        this.events.push({ k: 'push' });
      }
    }
    // 轉角輔助：卡牆時往最近的行/列中心滑動
    if (p.dx) {
      const cy = Math.floor(p.y / T) * T + T / 2;
      const slide = Math.sign(cy - p.y) || 0;
      if (slide && this.passable(p, p.x, p.y + slide * d) &&
          this.passable(p, nx, cy)) { p.y += slide * Math.min(d, Math.abs(cy - p.y)); }
    } else if (p.dy) {
      const cx = Math.floor(p.x / T) * T + T / 2;
      const slide = Math.sign(cx - p.x) || 0;
      if (slide && this.passable(p, p.x + slide * d, p.y) &&
          this.passable(p, cx, ny)) { p.x += slide * Math.min(d, Math.abs(cx - p.x)); }
    }
  }

  updateSlide(b, dt) {
    if (!b.sx && !b.sy) return;
    const d = SLIDE_SPEED * dt;
    b.px += b.sx * d; b.py += b.sy * d;
    const tx = b.tgx * T + T / 2, ty = b.tgy * T + T / 2;
    const arrived = (b.sx && (b.px - tx) * b.sx >= 0) || (b.sy && (b.py - ty) * b.sy >= 0);
    if (arrived) {
      b.px = tx; b.py = ty; b.gx = b.tgx; b.gy = b.tgy;
      const nx = b.gx + b.sx, ny = b.gy + b.sy;
      if (this.bombFree(nx, ny)) { b.tgx = nx; b.tgy = ny; }
      else { b.sx = 0; b.sy = 0; }
    } else {
      b.gx = Math.floor(b.px / T); b.gy = Math.floor(b.py / T);
    }
  }

  updateLava(dt) {
    if (this.map.effect !== 'lava') return;
    for (let i = this.lava.length - 1; i >= 0; i--) {
      const l = this.lava[i];
      l.t -= dt;
      if (l.phase === 'warn' && l.t <= 0) {
        // 啟動瞬間若有玩家或水球佔據則取消，避免卡死
        const blocked = this.bombAt(l.gx, l.gy) ||
          this.players.some(q => q.alive && this.overlapsTile(q, l.gx, l.gy));
        if (blocked) { this.lava.splice(i, 1); continue; }
        l.phase = 'on';
        l.t = 5 + this.rng() * 3;
        this.events.push({ k: 'lava' });
      } else if (l.phase === 'on' && l.t <= 0) {
        this.lava.splice(i, 1);
      }
    }
    this.lavaTimer -= dt;
    if (this.lavaTimer <= 0) {
      this.lavaTimer = LAVA_INTERVAL;
      for (let n = 0; n < LAVA_BATCH; n++) {
        const gx = Math.floor(this.rng() * COLS), gy = Math.floor(this.rng() * ROWS);
        if (this.cell(gx, gy) !== FLOOR) continue;
        if (this.lavaAt(gx, gy) || this.bombAt(gx, gy) || this.items[key(gx, gy)]) continue;
        if (this.players.some(q => q.alive && this.overlapsTile(q, gx, gy))) continue;
        this.lava.push({ gx, gy, phase: 'warn', t: LAVA_WARN });
      }
    }
  }

  explode(bomb, seen) {
    const idx = this.bombs.indexOf(bomb);
    if (idx >= 0) this.bombs.splice(idx, 1);
    seen.add(bomb);
    this.events.push({ k: 'boom' });
    const cells = [{ gx: bomb.gx, gy: bomb.gy }];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of dirs) {
      for (let i = 1; i <= bomb.power; i++) {
        const gx = bomb.gx + dx * i, gy = bomb.gy + dy * i;
        if (!inB(gx, gy)) break;
        const c = this.cell(gx, gy);
        if (c === WALL) break;            // 硬牆擋住
        if (c === BOX) {                  // 木箱：炸毀後停止
          this.grid[gy * COLS + gx] = FLOOR;
          if (this.rng() < ITEM_DROP) this.items[key(gx, gy)] = rollItem(this.rng);
          cells.push({ gx, gy });
          break;
        }
        // 草叢、河流、熔岩：水柱直接越過
        if (this.items[key(gx, gy)]) delete this.items[key(gx, gy)];
        cells.push({ gx, gy });
        const other = this.bombAt(gx, gy);
        if (other && !seen.has(other)) this.explode(other, seen);
      }
    }
    for (const c of cells) this.ex.push({ gx: c.gx, gy: c.gy, t: EX_TIME });
  }

  update(dt) {
    if (this.over) return;
    this.time += dt;
    this.updateLava(dt);
    for (const p of this.players) {
      if (!p.alive) continue;
      if (p.invuln > 0) p.invuln -= dt;
      this.movePlayer(p, dt);
      // 清除已離開/已爆的水球穿越權
      for (const k of p.bombPass) {
        const [gx, gy] = k.split(',').map(Number);
        if (!this.bombAt(gx, gy) || !this.overlapsTile(p, gx, gy)) p.bombPass.delete(k);
      }
      // 撿道具
      const gx = Math.floor(p.x / T), gy = Math.floor(p.y / T);
      const it = this.items[key(gx, gy)];
      if (it && !p.trapped) {
        delete this.items[key(gx, gy)];
        if (it === 'b') p.maxBombs = Math.min(8, p.maxBombs + 1);
        else if (it === 'p') p.power = Math.min(9, p.power + 1);
        else if (it === 's') p.speed = Math.min(MAX_SPEED, p.speed + SPEED_STEP);
        else if (it === 'n') p.needles++;
        this.events.push({ k: 'item', id: p.id });
      }
      // 草叢隱身（受困時現形）
      p.hidden = this.cell(gx, gy) === BUSH && !p.trapped;
    }
    // 水球：滑行 + 倒數
    const seen = new Set();
    for (const b of this.bombs.slice()) {
      this.updateSlide(b, dt);
      b.hidden = this.cell(b.gx, b.gy) === BUSH;
      b.t -= dt;
      if (b.t <= 0 && !seen.has(b)) this.explode(b, seen);
    }
    // 水柱消退
    for (let i = this.ex.length - 1; i >= 0; i--) {
      this.ex[i].t -= dt;
      if (this.ex[i].t <= 0) this.ex.splice(i, 1);
    }
    // 水柱命中 -> 困入泡泡
    for (const p of this.players) {
      if (!p.alive || p.trapped || p.invuln > 0) continue;
      const hit = this.ex.some(e =>
        Math.abs(p.x - (e.gx * T + T / 2)) < T / 2 + 8 &&
        Math.abs(p.y - (e.gy * T + T / 2)) < T / 2 + 8);
      if (hit) { p.trapped = true; p.trapT = TRAP_TIME; p.hidden = false; this.events.push({ k: 'trap', id: p.id }); }
    }
    // 泡泡：倒數死亡 / 被其他玩家戳破
    for (const p of this.players) {
      if (!p.alive || !p.trapped) continue;
      p.trapT -= dt;
      let popped = p.trapT <= 0;
      if (!popped) {
        for (const q of this.players) {
          if (q !== p && q.alive && !q.trapped &&
              Math.hypot(q.x - p.x, q.y - p.y) < 30) { popped = true; break; }
        }
      }
      if (popped) { p.alive = false; p.trapped = false; this.events.push({ k: 'pop', id: p.id }); }
    }
    // 勝負判定
    if (!this.over && this.players.length > 1) {
      const inGame = this.players.filter(p => p.alive);
      if (inGame.length <= 1) {
        this.over = true;
        this.winner = inGame.length ? inGame[0].id : null;
        this.events.push({ k: 'over' });
      }
    }
  }

  snapshot() {
    const snap = {
      t: this.time,
      mapId: this.mapId,
      grid: this.grid.join(''),
      players: this.players.map(p => ({
        id: p.id, name: p.name, color: p.color,
        x: Math.round(p.x), y: Math.round(p.y),
        dir: p.dir, moving: p.moving, hidden: p.hidden, speed: p.speed,
        alive: p.alive, trapped: p.trapped, trapT: p.trapT,
        maxBombs: p.maxBombs, power: p.power, needles: p.needles, invuln: p.invuln
      })),
      bombs: this.bombs.map(b => ({
        gx: b.gx, gy: b.gy, x: Math.round(b.px), y: Math.round(b.py),
        t: b.t, owner: b.owner, hidden: b.hidden
      })),
      ex: this.ex.map(e => ({ gx: e.gx, gy: e.gy, t: e.t })),
      items: Object.entries(this.items).map(([k, v]) => {
        const [gx, gy] = k.split(',').map(Number);
        return { gx, gy, k: v };
      }),
      lava: this.lava.map(l => ({ gx: l.gx, gy: l.gy, phase: l.phase, t: l.t })),
      events: this.events,
      over: this.over,
      winner: this.winner
    };
    this.events = [];
    return snap;
  }
}

const Engine = { T, COLS, ROWS, W, H, FLOOR, WALL, BOX, BUSH, RIVER, MAPS, COLORS, Game, key, inB };
if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
else root.Engine = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
