// UI 視覺截圖（node test-ui-shots.js [url]）
const { chromium } = require('playwright-core');
(async () => {
  const url = process.argv[2] || 'http://localhost:3000/';
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 720 }, deviceScaleFactor: 2 });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'ui-menu.png' });
  await page.click('#btn-menu-single');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'ui-single.png' });
  await page.click('#btn-single-start');
  await page.waitForTimeout(2200); // 含開場橫幅
  await page.screenshot({ path: 'ui-game.png' });
  await browser.close();
  console.log('截圖完成');
})().catch(e => { console.error(e.message); process.exit(1); });
