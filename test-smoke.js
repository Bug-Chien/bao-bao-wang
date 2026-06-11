// 引擎煙霧測試（node test-smoke.js）
const E = require('./public/js/engine.js');

for (const m of E.MAPS) {
  if (m.rows.length !== 13) throw new Error(m.name + ' rows=' + m.rows.length);
  for (const r of m.rows) if (r.length !== 15) throw new Error(m.name + ' row width=' + r.length);
}
console.log('地圖格式 OK (3 張地圖, 13x15)');

for (let mapId = 0; mapId < 3; mapId++) {
  const g = new E.Game(mapId, [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }, { id: 'd', name: 'D' }]);
  if (g.players.length !== 4) throw new Error('玩家數錯誤');
  // 出生點不可重疊且必須在地板上
  for (const p of g.players) {
    const gx = Math.floor(p.x / E.T), gy = Math.floor(p.y / E.T);
    if (g.cell(gx, gy) !== E.FLOOR) throw new Error('出生點不在地板: map' + mapId);
  }
}
console.log('出生點 OK');

const g = new E.Game(0, [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
const pa = g.player('a');
g.action('a');
if (g.bombs.length !== 1) throw new Error('放水球失敗');
g.action('a');
if (g.bombs.length !== 1) throw new Error('上限應為 1 顆');

// 站在水球上可走出去
g.setInput('a', 0, 1);
for (let i = 0; i < 30; i++) g.update(1 / 30);
if (Math.round(pa.y) <= 20) throw new Error('無法走離水球');
console.log('移動/穿越水球 OK, A 位置:', Math.round(pa.x), Math.round(pa.y));

// 等爆炸
g.setInput('a', 0, 0);
for (let i = 0; i < 90; i++) g.update(1 / 30);
if (g.bombs.length !== 0) throw new Error('水球未爆炸');
console.log('爆炸 OK');

// A 在 (0,1)，爆心 (0,0) 威力 1 的水柱涵蓋 (0,1) -> 應被困
if (!pa.trapped && pa.alive) throw new Error('A 應被水柱困住');
console.log('水柱命中/泡泡 OK');

// 泡泡倒數死亡
if (pa.trapped) {
  for (let i = 0; i < 200; i++) g.update(1 / 30);
  if (pa.alive) throw new Error('泡泡倒數未出局');
  if (!g.over || g.winner !== 'b') throw new Error('勝負判定錯誤');
  console.log('泡泡出局/勝負判定 OK, 勝者:', g.winner);
}

const snap = g.snapshot();
if (snap.grid.length !== 15 * 13) throw new Error('snapshot grid 長度錯誤');
console.log('snapshot OK');
console.log('全部煙霧測試通過 ✅');
