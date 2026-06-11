// 機器人自我對戰模擬：統計開局自爆率（node test-bots.js [場數]）
const E = require('./public/js/engine.js');

// bot.js 是瀏覽器腳本，掛一個假 window 載入
global.window = { Engine: E };
require('./public/js/bot.js');
const botThink = global.window.botThink;

const GAMES = +(process.argv[2] || 30);
const DT = 1 / 30;

for (let mapId = 0; mapId < E.MAPS.length; mapId++) {
  let earlyDeaths = 0;   // 15 秒內出局數
  let selfTraps = 0;     // 被「自己的」水球困住次數
  let totalGames = 0, finished = 0;

  for (let g = 0; g < GAMES; g++) {
    const ids = ['b0', 'b1', 'b2', 'b3'];
    const game = new E.Game(mapId, ids.map((id, i) => ({ id, name: 'B' + i })));
    // 紀錄每顆水球的主人，爆炸時比對受困者
    const origExplode = game.explode.bind(game);
    let lastOwnerCells = null;
    game.explode = (bomb, seen) => {
      const before = game.ex.length;
      origExplode(bomb, seen);
      const cells = game.ex.slice(before).map(e => ({ gx: e.gx, gy: e.gy, owner: bomb.owner }));
      (lastOwnerCells = lastOwnerCells || []).push(...cells);
    };
    const wasTrapped = {};
    let think = 0;
    totalGames++;
    for (let t = 0; t < 90 / DT && !game.over; t++) {
      think -= DT;
      if (think <= 0) {
        think = 0.12;
        for (const id of ids) {
          const r = botThink(game, id);
          game.setInput(id, r.dx, r.dy);
          if (r.action) game.action(id);
        }
      }
      lastOwnerCells = [];
      game.update(DT);
      const time = t * DT;
      for (const p of game.players) {
        if (p.trapped && !wasTrapped[p.id]) {
          wasTrapped[p.id] = true;
          const cell = lastOwnerCells.find(c =>
            Math.abs(p.x - (c.gx * 40 + 20)) < 28 && Math.abs(p.y - (c.gy * 40 + 20)) < 28);
          if (cell && cell.owner === p.id) selfTraps++;
        }
        if (!p.alive && !p._counted) { p._counted = true; if (time < 15) earlyDeaths++; }
        if (!p.trapped) wasTrapped[p.id] = false;
      }
    }
    if (game.over) finished++;
  }
  console.log(`地圖${mapId} ${E.MAPS[mapId].name}: ${totalGames} 場 | 15秒內出局 ${earlyDeaths} 人 | 自己水球困到自己 ${selfTraps} 次 | 90秒內分出勝負 ${finished} 場`);
}
