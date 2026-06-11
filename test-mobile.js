// 模擬手機觸控測試（node test-mobile.js [url]）
const { chromium, devices } = require('playwright-core');

(async () => {
  const url = process.argv[2] || 'https://bao-bao-wang.onrender.com/';
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });

  // 點單機模式
  await page.tap('#btn-menu-single');
  await page.waitForTimeout(300);
  console.log('單機畫面:', await page.isVisible('#screen-single'));
  await page.tap('#btn-single-start');
  await page.waitForTimeout(1200);
  console.log('遊戲畫面:', await page.isVisible('#screen-game'));
  console.log('觸控UI顯示:', await page.isVisible('#joystick'), await page.isVisible('#btn-action'));

  const before = await page.evaluate(() => {
    const me = GameView.snap.players.find(p => p.id === GameView.myId);
    return { x: me.x, y: me.y };
  });

  // 拖搖桿往下
  const joy = await page.locator('#joystick').boundingBox();
  if (joy) {
    const cx = joy.x + joy.width / 2, cy = joy.y + joy.height / 2;
    await page.touchscreen.tap(cx, cy); // 喚醒
    // 模擬 touch 拖曳：用 CDP dispatch
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx, y: cy + 40, id: 1 }] });
    await page.waitForTimeout(600);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  const after = await page.evaluate(() => {
    const me = GameView.snap.players.find(p => p.id === GameView.myId);
    return { x: me.x, y: me.y };
  });
  console.log('搖桿拖曳前:', JSON.stringify(before), '後:', JSON.stringify(after), after.y > before.y ? '✅ 有移動' : '❌ 沒移動');

  // 按放彈鈕
  await page.tap('#btn-action');
  await page.waitForTimeout(200);
  const bombs = await page.evaluate(() => GameView.snap.bombs.length);
  console.log('按💣後水球數:', bombs, bombs > 0 ? '✅' : '❌');

  await page.screenshot({ path: 'test-mobile-shot.png' });
  console.log('JS 錯誤:', errors.length ? errors.join('\n') : '無');
  await browser.close();
})().catch(e => { console.error('測試失敗:', e.message); process.exit(1); });
