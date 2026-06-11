// 用系統 Edge 無頭測試線上網站（node test-browser.js [url]）
const { chromium } = require('playwright-core');

(async () => {
  const url = process.argv[2] || 'https://bao-bao-wang.onrender.com/';
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
  console.log('標題:', await page.title());

  // 進入單機模式
  await page.click('#btn-menu-single');
  await page.waitForTimeout(300);
  const singleVisible = await page.isVisible('#screen-single');
  console.log('單機設定畫面顯示:', singleVisible);

  await page.click('#btn-single-start');
  await page.waitForTimeout(1500);
  const gameVisible = await page.isVisible('#screen-game');
  console.log('遊戲畫面顯示:', gameVisible);

  // 檢查遊戲是否真的在跑（canvas 有繪製、玩家存在）
  const state = await page.evaluate(() => ({
    running: window.GameView && GameView.running,
    players: GameView && GameView.snap ? GameView.snap.players.length : 0,
    canvasW: document.getElementById('game-canvas').style.width
  }));
  console.log('遊戲狀態:', JSON.stringify(state));

  // 模擬按鍵移動
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(500);
  await page.keyboard.up('ArrowDown');
  const pos = await page.evaluate(() => {
    const me = GameView.snap.players.find(p => p.id === GameView.myId);
    return me ? { x: me.x, y: me.y } : null;
  });
  console.log('按下方向鍵後玩家位置:', JSON.stringify(pos));

  await page.screenshot({ path: 'test-shot.png' });

  // 測試線上模式
  await page.evaluate(() => { GameView.stop(); });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.click('#btn-menu-online');
  await page.waitForTimeout(3000);
  const onlineStatus = await page.textContent('#online-status');
  const roomList = await page.textContent('#room-list');
  console.log('線上狀態:', onlineStatus.trim() || '(連線成功)');
  console.log('房間列表:', roomList.trim().slice(0, 60));

  console.log('JS 錯誤:', errors.length ? errors.join('\n') : '無');
  await browser.close();
})().catch(e => { console.error('測試失敗:', e.message); process.exit(1); });
