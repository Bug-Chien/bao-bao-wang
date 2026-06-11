// 引擎煙霧測試（node test-smoke.js）
const E = require('./public/js/engine.js');
const T = E.T;

for (const m of E.MAPS) {
  if (m.rows.length !== 13) throw new Error(m.name + ' rows=' + m.rows.length);
  for (const r of m.rows) if (r.length !== 15) throw new Error(m.name + ' row width=' + r.length);
}
console.log(`地圖格式 OK (${E.MAPS.length} 張地圖, 13x15)`);

for (let mapId = 0; mapId < E.MAPS.length; mapId++) {
  const g = new E.Game(mapId, [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }, { id: 'd', name: 'D' }]);
  if (g.players.length !== 4) throw new Error('玩家數錯誤');
  for (const p of g.players) {
    const gx = Math.floor(p.x / T), gy = Math.floor(p.y / T);
    if (g.cell(gx, gy) !== E.FLOOR) throw new Error('出生點不在地板: map' + mapId);
  }
}
console.log('出生點 OK');

/* ---- 基本流程（地圖0） ---- */
{
  const g = new E.Game(0, [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
  const pa = g.player('a');
  g.action('a');
  if (g.bombs.length !== 1) throw new Error('放水球失敗');
  g.action('a');
  if (g.bombs.length !== 1) throw new Error('上限應為 1 顆');
  g.setInput('a', 0, 1);
  for (let i = 0; i < 30; i++) g.update(1 / 30);
  if (Math.round(pa.y) <= 20) throw new Error('無法走離水球');
  g.setInput('a', 0, 0);
  for (let i = 0; i < 90; i++) g.update(1 / 30);
  if (g.bombs.length !== 0) throw new Error('水球未爆炸');
  if (!pa.trapped && pa.alive) throw new Error('A 應被水柱困住');
  for (let i = 0; i < 200; i++) g.update(1 / 30);
  if (pa.alive) throw new Error('泡泡倒數未出局');
  if (!g.over || g.winner !== 'b') throw new Error('勝負判定錯誤');
  const snap = g.snapshot();
  if (snap.grid.length !== 15 * 13) throw new Error('snapshot grid 長度錯誤');
  console.log('基本流程（放彈/爆炸/泡泡/勝負）OK');
}

/* ---- 草叢隱身（地圖0：(7,0) 是 G） ---- */
{
  const g = new E.Game(0, [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
  const pa = g.player('a');
  pa.x = 7 * T + T / 2; pa.y = 0 * T + T / 2; // 直接放進草叢
  g.update(1 / 30);
  if (!pa.hidden) throw new Error('站在草叢應隱身');
  g.action('a'); // 草叢上可放水球
  if (g.bombs.length !== 1 || !g.bombs[0]) throw new Error('草叢上應可放水球');
  g.update(1 / 30);
  if (!g.bombs[0].hidden) throw new Error('草叢裡的水球應隱藏');
  console.log('草叢隱身 OK');
}

/* ---- 河流（地圖1：row6 是河，(3,6) 是缺口） ---- */
{
  const g = new E.Game(1, [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
  if (g.cell(0, 6) !== E.RIVER) throw new Error('(0,6) 應為河流');
  const pa = g.player('a');
  pa.x = 0 * T + T / 2; pa.y = 5 * T + T / 2; // 河岸上方
  g.setInput('a', 0, 1);
  for (let i = 0; i < 60; i++) g.update(1 / 30);
  if (Math.floor(pa.y / T) >= 6) throw new Error('玩家不應能越過河流');
  // 水柱越過河流：在 (0,5) 放威力 3 的水球，應炸到對岸 (0,7)
  const g2 = new E.Game(1, [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
  g2.player('a').x = T / 2; g2.player('a').y = 5 * T + T / 2;
  g2.player('a').power = 3;
  g2.action('a');
  g2.player('a').x = 7 * T; g2.player('a').y = T / 2; // 逃遠
  for (let i = 0; i < 95; i++) g2.update(1 / 30);
  if (!g2.ex.some(e => e.gx === 0 && e.gy === 7)) throw new Error('水柱應越過河流炸到對岸');
  console.log('河流（擋人、水柱越過）OK');
}

/* ---- 推水球（地圖2） ---- */
{
  const g = new E.Game(2, [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
  const pa = g.player('a');
  g.action('a'); // 在 (0,0) 放水球
  const b = g.bombs[0];
  // 走出水球再回頭推：往右走到 (2,0)，再往左推
  g.setInput('a', 1, 0);
  for (let i = 0; i < 45; i++) g.update(1 / 30);
  g.setInput('a', -1, 0);
  for (let i = 0; i < 30 && (b.gx === 0); i++) g.update(1 / 30);
  // 水球被夾在牆角推不動（(−1,0) 出界）；改測往右推：
  const g3 = new E.Game(2, [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
  const p3 = g3.player('a');
  p3.x = 2 * T + T / 2; p3.y = T / 2; // (2,0)，左右 (1,0)(3,0) 是地板？(3,0)='B'
  // 地圖2 row0='1..B#...'：(1,0)(2,0) 地板，(3,0) 箱子。改放 (1,0) 往左推到 (0,0)
  p3.x = 1 * T + T / 2;
  g3.action('a');
  const b3 = g3.bombs[0];
  p3.x = 2 * T + T / 2; p3.bombPass.clear(); // 站到右邊
  g3.setInput('a', -1, 0);
  for (let i = 0; i < 30; i++) g3.update(1 / 30);
  if (b3.gx !== 0) throw new Error('水球應被往左推到 (0,0)，目前在 ' + b3.gx);
  console.log('推水球 OK');
}

/* ---- 熔岩（地圖3） ---- */
{
  const g = new E.Game(3, [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], () => 0.5);
  for (let i = 0; i < 30 * 12; i++) g.update(1 / 30);
  // rng 固定 0.5 -> 每批都選 (7,6)，地圖3 (7,6) 是 '.'，會生成
  if (!g.lava.length) throw new Error('熔岩應已生成');
  const on = g.lava.filter(l => l.phase === 'on');
  if (!on.length) throw new Error('熔岩應已啟動');
  // 啟動中的熔岩不可通行
  const l = on[0];
  const pa = g.player('a');
  pa.x = (l.gx - 1) * T + T / 2; pa.y = l.gy * T + T / 2;
  const can = g.passable(pa, l.gx * T + T / 2, l.gy * T + T / 2);
  if (can) throw new Error('熔岩格不應可通行');
  const snap = g.snapshot();
  if (!snap.lava.length) throw new Error('snapshot 應含熔岩');
  console.log('熔岩（生成/啟動/阻擋）OK');
}

console.log('全部煙霧測試通過 ✅');
