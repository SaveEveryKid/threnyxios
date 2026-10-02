import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto('http://localhost:8080/client/index.html#/home');
await page.waitForSelector('.splash', { timeout: 4000 }).then(() => page.click('.splash')).catch(() => {}); // tap past the splash
await page.waitForTimeout(800);
for (const s of ['vault', 'octave', 'daily', 'draft', 'codex', 'more', 'packs', 'rivals']) {
  await page.goto('http://localhost:8080/client/index.html#/' + s);
  await page.waitForSelector('.splash', { timeout: 4000 }).then(() => page.click('.splash')).catch(() => {}); // tap past the splash
  await page.waitForTimeout(s === 'daily' ? 6000 : 1200);
  await page.screenshot({ path: `${out}/s-${s}.png` });
}
// open a vault card
await page.goto('http://localhost:8080/client/index.html#/vault');
await page.waitForSelector('.splash', { timeout: 4000 }).then(() => page.click('.splash')).catch(() => {}); // tap past the splash
await page.waitForTimeout(800);
await page.click('.vault-grid .cell');
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/s-vault-detail.png` });
console.log('errors', errors);
await browser.close();
