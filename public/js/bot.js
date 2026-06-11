/* 單機模式 AI 機器人 */
(function (root) {
'use strict';
const E = root.Engine;
const { T, COLS, ROWS, FLOOR, BOX, WALL } = E;

const HIT = T / 2 + 8;        // 引擎水柱命中寬容範圍（engine.js 同值）
const CROSS_MARGIN = 0.3;     // 穿越爆炸格的安全餘裕（秒）

function tileOf(p) { return { gx: Math.floor(p.x / T), gy: Math.floor(p.y / T) }; }
function center(gx, gy) { return { x: gx * T + T / 2, y: gy * T + T / 2 }; }

// 某顆水球（含穿透規則）會炸到的格子
function blastCells(game, bx, by, power) {
  const cells = new Set([bx + ',' + by]);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    for (let i = 1; i <= power; i++) {
      const gx = bx + dx * i, gy = by + dy * i;
      const c = game.cell(gx, gy);
      if (c === WALL) break;
      cells.add(gx + ',' + gy);
      if (c === BOX) break;
    }
  }
  return cells;
}

// 危險地圖：key -> 最早爆炸時間（秒）。含連鎖引爆與現存水柱(0秒)
function dangerInfo(game, extraBomb) {
  const bombs = game.bombs.slice();
  if (extraBomb) bombs.push(extraBomb);
  const eff = new Map();
  for (const b of bombs) eff.set(b, b.t);
  // 連鎖：A 的爆炸範圍蓋到 B，B 的時間提前為 A 的時間
  let changed = true, guard = 0;
  while (changed && guard++ < 8) {
    changed = false;
    for (const a of bombs) {
      const cells = blastCells(game, a.gx, a.gy, a.power);
      for (const b of bombs) {
        if (b !== a && cells.has(b.gx + ',' + b.gy) && eff.get(b) > eff.get(a)) {
          eff.set(b, eff.get(a));
          changed = true;
        }
      }
    }
  }
  const ct = new Map();
  const put = (k, t) => { if (!ct.has(k) || ct.get(k) > t) ct.set(k, t); };
  for (const e of game.ex) put(e.gx + ',' + e.gy, 0);
  for (const b of bombs) for (const k of blastCells(game, b.gx, b.gy, b.power)) put(k, eff.get(b));
  return ct;
}

// 用引擎相同的±28px重疊判定：身體是否碰到任一危險格（不只看所在格）
function inDangerPx(p, ct) {
  for (const k of ct.keys()) {
    const [gx, gy] = k.split(',').map(Number);
    const c = center(gx, gy);
    if (Math.abs(p.x - c.x) < HIT && Math.abs(p.y - c.y) < HIT) return true;
  }
  return false;
}

function walkable(game, gx, gy, allowBombAt) {
  if (!E.inB(gx, gy)) return false;
  const c = game.cell(gx, gy);
  if (c !== FLOOR && c !== E.BUSH) return false;
  const lv = game.lavaAt(gx, gy);
  if (lv) return false; // 熔岩（含預警中）一律繞路
  const b = game.bombAt(gx, gy);
  if (b && !(allowBombAt && allowBombAt.gx === gx && allowBombAt.gy === gy)) return false;
  return true;
}

// 時間感知 BFS：goalFn 為目標；危險格只有在「抵達時間 + 餘裕 < 爆炸時間」才能穿越
// strict=false 時忽略時間限制（絕境模式）
function bfs(game, start, goalFn, ct, tileTime, strict, allowBombAt) {
  const q = [{ gx: start.gx, gy: start.gy, d: 0 }];
  const prev = {};
  const seen = new Set([start.gx + ',' + start.gy]);
  while (q.length) {
    const cur = q.shift();
    if (goalFn(cur.gx, cur.gy)) {
      let node = cur, k = node.gx + ',' + node.gy;
      while (prev[k] && (prev[k].gx !== start.gx || prev[k].gy !== start.gy)) {
        node = prev[k]; k = node.gx + ',' + node.gy;
      }
      return { step: (cur.gx === start.gx && cur.gy === start.gy) ? cur : node, goal: cur, depth: cur.d };
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const gx = cur.gx + dx, gy = cur.gy + dy, k = gx + ',' + gy;
      if (seen.has(k)) continue;
      if (!walkable(game, gx, gy, allowBombAt)) continue;
      if (strict && ct && ct.has(k)) {
        const arrive = (cur.d + 1) * tileTime;
        if (ct.get(k) < arrive + CROSS_MARGIN) continue; // 來不及在爆炸前通過
      }
      seen.add(k);
      prev[k] = cur;
      q.push({ gx, gy, d: cur.d + 1 });
    }
  }
  return null;
}

// 逃生：先嘗試時間感知路線，找不到就放寬
function fleeStep(game, p, me, ct, tileTime) {
  const safe = (x, y) => !ct.has(x + ',' + y);
  let r = bfs(game, me, safe, ct, tileTime, true, null);
  if (!r) r = bfs(game, me, safe, ct, tileTime, false, null);
  return r;
}

// 假設在 (gx,gy) 放水球，是否有把握逃掉
function canEscapeAfterBomb(game, p, gx, gy) {
  const k = gx + ',' + gy;
  const baseCt = dangerInfo(game);
  // 新水球若被現有爆炸蓋到會連鎖，引爆時間提前
  const newT = Math.min(3, baseCt.has(k) ? baseCt.get(k) : 3);
  const ct = dangerInfo(game, { gx, gy, t: newT, power: p.power });
  const tileTime = (T / p.speed) * 1.25; // 含轉向與貼牆滑動的損耗
  const fake = { gx, gy };
  const r = bfs(game, { gx, gy }, (x, y) => !ct.has(x + ',' + y), ct, tileTime, true, fake);
  // 必須能在自己的水球爆炸前抵達安全格
  return !!r && r.depth * tileTime + CROSS_MARGIN < newT;
}

function nextToBox(game, gx, gy) {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => game.cell(gx + dx, gy + dy) === BOX);
}

function stepToward(p, cell) {
  const c = center(cell.gx, cell.gy);
  const ddx = c.x - p.x, ddy = c.y - p.y;
  // 死區 = 一個思考週期的移動量，避免在中心點左右抖動
  if (Math.abs(ddx) < 9 && Math.abs(ddy) < 9) return { dx: 0, dy: 0 };
  if (Math.abs(ddx) > Math.abs(ddy)) return { dx: Math.sign(ddx), dy: 0 };
  return { dx: 0, dy: Math.sign(ddy) };
}

// 每次思考回傳 {dx, dy, action}
function botThink(game, pid) {
  const p = game.player(pid);
  if (!p || !p.alive) return { dx: 0, dy: 0, action: false };
  if (p.trapped) return { dx: 0, dy: 0, action: p.needles > 0 };

  const me = tileOf(p);
  const ct = dangerInfo(game);
  const tileTime = (T / p.speed) * 1.25; // 含轉向與貼牆滑動的損耗

  // 1) 身體碰到危險範圍（與引擎相同的判定）-> 逃往安全格「中心」
  if (inDangerPx(p, ct)) {
    const r = fleeStep(game, p, me, ct, tileTime);
    if (r) return { ...stepToward(p, r.step), action: false };
    return { dx: 0, dy: 0, action: false };
  }

  // 2) 站在箱子旁或敵人附近 -> 放水球（先確認自己能在爆炸前逃到安全處）
  const enemyNear = game.players.some(q =>
    q.id !== pid && q.alive && !q.trapped && !q.hidden &&
    Math.abs(q.x - p.x) + Math.abs(q.y - p.y) < T * 2.2);
  const ownBombs = game.bombs.filter(b => b.owner === pid).length;
  if (ownBombs < p.maxBombs && (nextToBox(game, me.gx, me.gy) || enemyNear) &&
      !game.bombAt(me.gx, me.gy) && canEscapeAfterBomb(game, p, me.gx, me.gy)) {
    return { dx: 0, dy: 0, action: true };
  }

  // 3) 找目標：受困敵人 > 道具 > 箱子旁 > 敵人；路線避開危險格
  const goals = [];
  for (const q of game.players) {
    if (q.id !== pid && q.alive && q.trapped) {
      const qt = tileOf(q);
      goals.push((x, y) => x === qt.gx && y === qt.gy);
    }
  }
  goals.push((x, y) => !ct.has(x + ',' + y) && !!game.items[x + ',' + y]);
  goals.push((x, y) => !ct.has(x + ',' + y) && nextToBox(game, x, y));
  for (const q of game.players) {
    if (q.id !== pid && q.alive && !q.trapped && !q.hidden) { // 躲在草叢裡的敵人看不見
      const qt = tileOf(q);
      goals.push((x, y) => Math.abs(x - qt.gx) + Math.abs(y - qt.gy) <= 1);
    }
  }
  for (const goalFn of goals) {
    const r = bfs(game, me, goalFn, ct, tileTime, true, null);
    if (r) {
      // 已在目標格：回到格子中心待命（避免站在邊緣被波及）
      return { ...stepToward(p, r.step), action: false };
    }
  }
  // 沒有可達目標：站回中心
  return { ...stepToward(p, me), action: false };
}

root.botThink = botThink;
})(typeof window !== 'undefined' ? window : globalThis);
