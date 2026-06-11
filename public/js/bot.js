/* 單機模式 AI 機器人 */
(function (root) {
'use strict';
const E = root.Engine;
const { T, COLS, ROWS, FLOOR, BOX, WALL } = E;

function tileOf(p) { return { gx: Math.floor(p.x / T), gy: Math.floor(p.y / T) }; }

// 危險地圖：所有水球的預計爆炸範圍 + 現存水柱
function dangerMap(game) {
  const danger = new Set();
  const mark = (gx, gy) => danger.add(gx + ',' + gy);
  for (const e of game.ex) mark(e.gx, e.gy);
  for (const b of game.bombs) markBlast(game, b.gx, b.gy, b.power, mark);
  return danger;
}

function markBlast(game, bx, by, power, mark) {
  mark(bx, by);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    for (let i = 1; i <= power; i++) {
      const gx = bx + dx * i, gy = by + dy * i;
      const c = game.cell(gx, gy);
      if (c === WALL) break;
      mark(gx, gy);
      if (c === BOX) break;
    }
  }
}

function walkable(game, gx, gy, allowBombAt) {
  if (!E.inB(gx, gy)) return false;
  if (game.cell(gx, gy) !== FLOOR) return false;
  const b = game.bombAt(gx, gy);
  if (b && !(allowBombAt && allowBombAt.gx === gx && allowBombAt.gy === gy)) return false;
  return true;
}

// BFS：回傳從 start 到第一個滿足 goalFn 的格子的「第一步」與目標
function bfs(game, start, goalFn, avoid, allowBombAt) {
  const q = [start];
  const prev = {};
  const seen = new Set([start.gx + ',' + start.gy]);
  while (q.length) {
    const cur = q.shift();
    if (goalFn(cur.gx, cur.gy)) {
      // 回溯第一步
      let node = cur, k = node.gx + ',' + node.gy;
      while (prev[k] && (prev[k].gx !== start.gx || prev[k].gy !== start.gy)) {
        node = prev[k]; k = node.gx + ',' + node.gy;
      }
      return { step: (cur.gx === start.gx && cur.gy === start.gy) ? cur : node, goal: cur };
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const gx = cur.gx + dx, gy = cur.gy + dy, k = gx + ',' + gy;
      if (seen.has(k)) continue;
      if (!walkable(game, gx, gy, allowBombAt)) continue;
      if (avoid && avoid.has(k)) continue;
      seen.add(k);
      prev[k] = cur;
      q.push({ gx, gy });
    }
  }
  return null;
}

// 假設在 (gx,gy) 放水球後，是否還有路可逃
function canEscapeAfterBomb(game, p, gx, gy) {
  const danger = dangerMap(game);
  markBlast(game, gx, gy, p.power, (x, y) => danger.add(x + ',' + y));
  const fake = { gx, gy };
  const r = bfs(game, { gx, gy }, (x, y) => !danger.has(x + ',' + y), null, fake);
  return !!r;
}

function nextToBox(game, gx, gy) {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => game.cell(gx + dx, gy + dy) === BOX);
}

function stepToward(p, cell) {
  const tx = cell.gx * T + T / 2, ty = cell.gy * T + T / 2;
  const ddx = tx - p.x, ddy = ty - p.y;
  if (Math.abs(ddx) < 3 && Math.abs(ddy) < 3) return { dx: 0, dy: 0 };
  if (Math.abs(ddx) > Math.abs(ddy)) return { dx: Math.sign(ddx), dy: 0 };
  return { dx: 0, dy: Math.sign(ddy) };
}

// 每次思考回傳 {dx, dy, action}
function botThink(game, pid) {
  const p = game.player(pid);
  if (!p || !p.alive) return { dx: 0, dy: 0, action: false };
  if (p.trapped) return { dx: 0, dy: 0, action: p.needles > 0 };

  const me = tileOf(p);
  const danger = dangerMap(game);
  const myKey = me.gx + ',' + me.gy;

  // 1) 在危險區 -> 逃到最近安全格（逃跑時允許穿越危險格）
  if (danger.has(myKey)) {
    const r = bfs(game, me, (x, y) => !danger.has(x + ',' + y), null, null);
    if (r) return { ...stepToward(p, r.step), action: false };
    return { dx: 0, dy: 0, action: false };
  }

  // 2) 站在箱子旁或敵人附近 -> 放水球（要先確認能逃）
  const enemyNear = game.players.some(q =>
    q.id !== pid && q.alive && !q.trapped &&
    Math.abs(q.x - p.x) + Math.abs(q.y - p.y) < T * 2.2);
  const ownBombs = game.bombs.filter(b => b.owner === pid).length;
  if (ownBombs < p.maxBombs && (nextToBox(game, me.gx, me.gy) || enemyNear) &&
      !game.bombAt(me.gx, me.gy) && canEscapeAfterBomb(game, p, me.gx, me.gy)) {
    return { dx: 0, dy: 0, action: true };
  }

  // 3) 找目標：受困敵人 > 道具 > 箱子旁 > 敵人
  const goals = [];
  for (const q of game.players) {
    if (q.id !== pid && q.alive && q.trapped) {
      goals.push((x, y) => Math.abs(x - Math.floor(q.x / T)) + Math.abs(y - Math.floor(q.y / T)) <= 0);
    }
  }
  goals.push((x, y) => !!game.items[x + ',' + y]);
  goals.push((x, y) => nextToBox(game, x, y));
  for (const q of game.players) {
    if (q.id !== pid && q.alive && !q.trapped) {
      const qt = { gx: Math.floor(q.x / T), gy: Math.floor(q.y / T) };
      goals.push((x, y) => Math.abs(x - qt.gx) + Math.abs(y - qt.gy) <= 1);
    }
  }
  for (const goalFn of goals) {
    const r = bfs(game, me, goalFn, danger, null);
    if (r && (r.goal.gx !== me.gx || r.goal.gy !== me.gy)) {
      return { ...stepToward(p, r.step), action: false };
    }
    if (r) break; // 已在目標上
  }
  return { dx: 0, dy: 0, action: false };
}

root.botThink = botThink;
})(window);
