// 單一機器人決策追蹤（地圖0）
const E = require('./public/js/engine.js');
global.window = { Engine: E };
require('./public/js/bot.js');
const botThink = global.window.botThink;

const game = new E.Game(0, [{ id: 'b0', name: 'B0' }, { id: 'x', name: 'X' }]);
// 把第二位玩家移到遠處不動（佔位讓遊戲不立即結束）
const p = game.player('b0');
const DT = 1 / 30;
let think = 0;
let lastLog = '';
for (let t = 0; t < 12 / DT; t++) {
  think -= DT;
  if (think <= 0) {
    think = 0.12;
    const r = botThink(game, 'b0');
    game.setInput('b0', r.dx, r.dy);
    if (r.action) game.action('b0');
    const msg = `t=${(t * DT).toFixed(2)} pos=(${Math.round(p.x)},${Math.round(p.y)}) tile=(${Math.floor(p.x / 40)},${Math.floor(p.y / 40)}) input=(${r.dx},${r.dy}) act=${r.action} bombs=${game.bombs.length} trapped=${p.trapped} alive=${p.alive}`;
    if (msg.slice(7) !== lastLog.slice(7)) console.log(msg);
    lastLog = msg;
  }
  game.update(DT);
  if (!p.alive) { console.log('B0 出局 t=' + (t * DT).toFixed(2)); break; }
}
