// 模擬手機觸控測試（node test-mobile.js [url]）— 浮動搖桿
const { chromium, devices } = require('playwright-core');

(async () => {
  const url = process.argv[2] || 'http://localhost:3000/';
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
  await page.tap('#btn-menu-single');
  await page.waitForTimeout(300);
  await page.tap('#btn-single-start');
  await page.waitForTimeout(1500);
  console.log('遊戲畫面:', await page.isVisible('#screen-game'));
  console.log('touch class:', await page.evaluate(() => document.body.classList.contains('touch')));
  console.log('touch-ui 顯示:', await page.isVisible('#touch-ui'));

  const before = await page.evaluate(() => {
    const me = GameView.snap.players.find(p => p.id === GameView.myId);
    return { x: me.x, y: me.y };
  });

  // 浮動搖桿：在左下 joy-zone 內按下並往下拖
  const cdp = await ctx.newCDPSession(page);
  const vp = page.viewportSize();
  const sx = vp.width * 0.25, sy = vp.height * 0.78;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx, y: sy + 70, id: 1 }] });
  const joyVisible = await page.evaluate(() => document.getElementById('joystick').classList.contains('active'));
  console.log('搖桿浮現:', joyVisible);
  await page.waitForTimeout(700);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const after = await page.evaluate(() => {
    const me = GameView.snap.players.find(p => p.id === GameView.myId);
    return { x: me.x, y: me.y };
  });
  console.log('拖曳前:', JSON.stringify(before), '後:', JSON.stringify(after), after.y > before.y + 5 ? '✅ 往下移動' : '❌ 沒移動');

  // 放開後應停止輸入
  const stopped = await page.evaluate(() => Controls.dx === 0 && Controls.dy === 0);
  console.log('放開後停止:', stopped ? '✅' : '❌');

  // 按放彈鈕
  const btn = await page.locator('#btn-action').boundingBox();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: btn.x + btn.width / 2, y: btn.y + btn.height / 2, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(200);
  const bombs = await page.evaluate(() => GameView.snap.bombs.length);
  console.log('按💣後水球數:', bombs, bombs > 0 ? '✅' : '❌');

  await page.screenshot({ path: 'test-mobile-shot.png' });
  console.log('JS 錯誤:', errors.length ? errors.join('\n') : '無');
  await browser.close();
})().catch(e => { console.error('測試失敗:', e.message); process.exit(1); });
