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
const COLORS = ['#ff5252', '#448aff', '#4caf50', '#ffb300'];

// 地圖：. 地板  # 硬牆  B 木箱  1-4 出生點
const MAPS = [
  {
    id: 0, name: '翠綠森林',
    theme: { floor1: '#a9d96d', floor2: '#9ecf60', wall: '#5d7d44', wallTop: '#73975a', box: '#c9914e', boxEdge: '#9c6a33' },
    rows: [
      '1.BBBBBBBBBBB.2',
      '.#B#B#B#B#B#B#.',
      'BB.B.B.B.B.B.BB',
      'B#B#B#B#B#B#B#B',
      'BB.B.B.B.B.B.BB',
      'B#B#B#B#B#B#B#B',
      'BB.B.B.B.B.B.BB',
      'B#B#B#B#B#B#B#B',
      'BB.B.B.B.B.B.BB',
      'B#B#B#B#B#B#B#B',
      'BB.B.B.B.B.B.BB',
      '.#B#B#B#B#B#B#.',
      '3.BBBBBBBBBBB.4'
    ]
  },
  {
    id: 1, name: '黃沙綠洲',
    theme: { floor1: '#ecd49b', floor2: '#e3c98c', wall: '#a07f4f', wallTop: '#b8965f', box: '#b5793b', boxEdge: '#8a5a28' },
    rows: [
      '1..BB.....BB..2',
      '.#.B..#.#..B.#.',
      '..B...B.B...B..',
      'BB..#..B..#..BB',
      '.B.B..BBB..B.B.',
      '..#.B.B.B.B.#..',
      '...B..BBB..B...',
      '..#.B.B.B.B.#..',
      '.B.B..BBB..B.B.',
      'BB..#..B..#..BB',
      '..B...B.B...B..',
      '.#.B..#.#..B.#.',
      '3..BB.....BB..4'
    ]
  },
  {
    id: 2, name: '冰封迷宮',
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
  }
];

const FLOOR = 0, WALL = 1, BOX = 2;
const key = (gx, gy) => gx + ',' + gy;
const inB = (gx, gy) => gx >= 0 && gx < COLS && gy >= 0 && gy < ROWS;

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
    this.grid = new Array(COLS * ROWS).fill(FLOOR);
    const spawns = {};
    const rows = this.map.rows.length === ROWS ? this.map.rows : padRows(this.map.rows);
    for (let gy = 0; gy < ROWS; gy++) {
      for (let gx = 0; gx < COLS; gx++) {
        const c = rows[gy][gx];
        if (c === '#') this.grid[gy * COLS + gx] = WALL;
        else if (c === 'B') this.grid[gy * COLS + gx] = BOX;
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
        alive: true, trapped: false, trapT: 0, invuln: 0,
        bombPass: new Set()
      };
    });
  }

  cell(gx, gy) { return inB(gx, gy) ? this.grid[gy * COLS + gx] : WALL; }
  bombAt(gx, gy) { return this.bombs.find(b => b.gx === gx && b.gy === gy); }
  player(id) { return this.players.find(p => p.id === id); }

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
    if (this.cell(gx, gy) !== FLOOR) return;
    const own = this.bombs.filter(b => b.owner === p.id).length;
    if (own >= p.maxBombs) return;
    const bomb = { gx, gy, t: BOMB_TIME, owner: p.id, power: p.power };
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
        if (this.cell(gx, gy) !== FLOOR) return false;
        if (this.bombAt(gx, gy) && !p.bombPass.has(key(gx, gy))) return false;
      }
    }
    return true;
  }

  movePlayer(p, dt) {
    if (!p.dx && !p.dy) { p.moving = false; return; }
    p.moving = true;
    const sp = p.trapped ? 45 : p.speed;
    const d = sp * dt;
    const nx = p.x + p.dx * d, ny = p.y + p.dy * d;
    if (this.passable(p, nx, ny)) { p.x = nx; p.y = ny; return; }
    // 轉角輔助：卡牆時往最近的行/列中心滑動
    if (p.dx) {
      const cy = Math.floor(p.y / T) * T + T / 2;
      const ty = Math.floor((p.y + Math.sign(cy - p.y) * (T / 2)) / T); // 不需要，直接試滑
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
        if (!inB(gx, gy) || this.cell(gx, gy) === WALL) break;
        if (this.cell(gx, gy) === BOX) {
          this.grid[gy * COLS + gx] = FLOOR;
          if (this.rng() < ITEM_DROP) this.items[key(gx, gy)] = rollItem(this.rng);
          cells.push({ gx, gy });
          break;
        }
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
    }
    // 水球倒數
    const seen = new Set();
    for (const b of this.bombs.slice()) {
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
      if (hit) { p.trapped = true; p.trapT = TRAP_TIME; this.events.push({ k: 'trap', id: p.id }); }
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
        dir: p.dir, moving: p.moving,
        alive: p.alive, trapped: p.trapped, trapT: p.trapT,
        maxBombs: p.maxBombs, power: p.power, needles: p.needles, invuln: p.invuln
      })),
      bombs: this.bombs.map(b => ({ gx: b.gx, gy: b.gy, t: b.t })),
      ex: this.ex.map(e => ({ gx: e.gx, gy: e.gy, t: e.t })),
      items: Object.entries(this.items).map(([k, v]) => {
        const [gx, gy] = k.split(',').map(Number);
        return { gx, gy, k: v };
      }),
      events: this.events,
      over: this.over,
      winner: this.winner
    };
    this.events = [];
    return snap;
  }
}

function padRows(rows) {
  const out = rows.slice();
  while (out.length < ROWS) out.push('.'.repeat(COLS));
  return out;
}

const Engine = { T, COLS, ROWS, W, H, FLOOR, WALL, BOX, MAPS, COLORS, Game, key, inB };
if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
else root.Engine = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
