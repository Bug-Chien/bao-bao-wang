// 四張地圖視覺檢查：各開一場單機並截圖（node test-maps-visual.js [url]）
const { chromium } = require('playwright-core');

(async () => {
  const url = process.argv[2] || 'http://localhost:3000/';
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

  const n = await page.evaluate(() => Engine.MAPS.length);
  for (let i = 0; i < n; i++) {
    await page.click('#btn-menu-single');
    await page.waitForTimeout(200);
    await page.click(`.map-card[data-map-id="${i}"]`);
    await page.click('#btn-single-start');
    await page.waitForTimeout(i === 3 ? 8000 : 2500); // 熔岩圖等它噴發
    const info = await page.evaluate(() => ({
      running: GameView.running,
      lava: GameView.snap.lava ? GameView.snap.lava.length : 0,
      alive: GameView.snap.players.filter(p => p.alive).length
    }));
    await page.screenshot({ path: `test-map${i}.png` });
    console.log(`地圖${i}: running=${info.running} 存活=${info.alive} 熔岩=${info.lava}`);
    await page.evaluate(() => { GameView.stop(); document.getElementById('result-overlay').classList.add('hidden'); });
    await page.evaluate(() => { for (const s of document.querySelectorAll('.screen')) s.classList.add('hidden'); document.getElementById('screen-menu').classList.remove('hidden'); });
  }
  console.log('JS 錯誤:', errors.length ? errors.join('\n') : '無');
  await browser.close();
})().catch(e => { console.error('測試失敗:', e.message); process.exit(1); });
