// Usage: node tools/shot.mjs <url-path> <out.png> [width] [height] [fullPage]
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const [path, out, w = '1300', h = '1200', full = '1'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
page.on('console', (m) => console.log('console:', m.text()));
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto('http://localhost:8080/' + path);
await page.waitForTimeout(1500);
await page.screenshot({ path: out, fullPage: full === '1' });
await browser.close();
