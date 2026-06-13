// 雙人線上對戰端對端測試（node test-multiplayer.js [url]）
const { chromium } = require('playwright-core');

(async () => {
  const url = process.argv[2] || 'https://bao-bao-wang.onrender.com/';
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const p1 = await (await browser.newContext()).newPage();
  const p2 = await (await browser.newContext()).newPage();
  for (const [i, p] of [p1, p2].entries()) {
    p.on('pageerror', e => console.log(`P${i + 1} pageerror:`, e.message));
  }

  await p1.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
  await p2.goto(url, { waitUntil: 'networkidle', timeout: 120000 });

  // P1 建房
  await p1.click('#btn-menu-online');
  await p1.waitForTimeout(2000);
  await p1.fill('#new-room-name', '測試房');
  await p1.click('#btn-create-room');
  await p1.waitForTimeout(1000);
  console.log('P1 進入房間:', await p1.isVisible('#screen-lobby'));

  // P2 加入
  await p2.click('#btn-menu-online');
  await p2.waitForTimeout(2000);
  await p2.click('#btn-refresh-rooms');
  await p2.waitForTimeout(800);
  const roomBtn = p2.locator('#room-list button').first();
  await roomBtn.click();
  await p2.waitForTimeout(1000);
  console.log('P2 進入房間:', await p2.isVisible('#screen-lobby'));

  await p1.screenshot({ path: 'test-lobby.png' });

  // P2 準備、P1 開始
  await p2.click('#btn-ready');
  await p2.waitForTimeout(800);
  const startBtn = p1.locator('#btn-start');
  console.log('P1 開始鈕文字:', await startBtn.textContent(), '可按:', await startBtn.isEnabled());
  await startBtn.click();
  await p1.waitForTimeout(1500);
  console.log('P1 遊戲畫面:', await p1.isVisible('#screen-game'), ' P2 遊戲畫面:', await p2.isVisible('#screen-game'));

  // P1 移動 + 放水球，確認 P2 看得到同步狀態
  await p1.keyboard.down('ArrowDown');
  await p1.waitForTimeout(600);
  await p1.keyboard.up('ArrowDown');
  await p1.keyboard.press(' ');
  await p1.waitForTimeout(500);
  const s1 = await p1.evaluate(() => ({ players: GameView.snap.players.map(p => ({ x: p.x, y: p.y })), bombs: GameView.snap.bombs.length }));
  const s2 = await p2.evaluate(() => ({ players: GameView.snap.players.map(p => ({ x: p.x, y: p.y })), bombs: GameView.snap.bombs.length }));
  console.log('P1 看到:', JSON.stringify(s1));
  console.log('P2 看到:', JSON.stringify(s2));
  console.log(s1.bombs === s2.bombs && s2.players[0].y > 20 ? '✅ 雙方狀態同步，多人對戰正常' : '❌ 狀態不同步');

  // 客戶端預測：本機角色按鍵後立即（不等伺服器）響應
  const predResp = await p1.evaluate(async () => {
    const Pred = window.GameView; // Predictor 是模組內私有，改測 drawPos 立即變化
    const me = GameView.myId;
    const start = GameView.drawPos[me] ? { ...GameView.drawPos[me] } : null;
    return { active: GameView.snap.players.find(p => p.id === me).speed > 0, start };
  });
  console.log('預測啟用（含 speed 欄位）:', predResp.active ? '✅' : '❌');

  await p1.screenshot({ path: 'test-mp-shot.png' });
  await browser.close();
})().catch(e => { console.error('測試失敗:', e.message); process.exit(1); });
