// First-session test: fresh save -> first pack -> Chapter I story clash.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const out = process.argv[2] || '/tmp/shots';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto('http://localhost:8080/client/index.html#/home');
await page.waitForSelector('.splash', { timeout: 4000 }).then(() => page.click('.splash')).catch(() => {}); // tap past the splash
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('.splash', { timeout: 4000 }).then(() => page.click('.splash')).catch(() => {}); // tap past the splash
await page.waitForTimeout(900);
await page.click('[data-go="primary"]');
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/10-pack-hold.png` });
const pack = await page.$('.opening .pack');
const box = await pack.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.waitForTimeout(1000);
await page.mouse.up();
await page.waitForTimeout(900);
for (let i = 0; i < 3; i++) {
  await page.click('.reveal-stage .flip');
  await page.waitForTimeout(1500);
  if (i === 2) await page.screenshot({ path: `${out}/11-reveal.png` });
  await page.click('.reveal-stage');
  await page.waitForTimeout(500);
}
await page.screenshot({ path: `${out}/12-summary.png` });
await page.click('[data-done]');
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/13-story.png` });
await page.click('.chapter');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/14-scene.png` });
for (let i = 0; i < 8; i++) { if (!(await page.$('.scene'))) break; await page.click('.scene'); await page.waitForTimeout(250); }
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/15-ch1.png` });
// Play Chapter I to the end.
const tap = async (el) => { await el.dispatchEvent('pointerdown'); await page.waitForTimeout(40); await el.dispatchEvent('pointerup'); };
for (let step = 0; step < 150 && !(await page.$('.result')); step++) {
  if (await page.$('[data-go]')) {
    for (let k = 0; k < 2; k++) {
      const hand = await page.$$('.rk-hand .card:not(.is-disabled)');
      if (!hand.length) break;
      await tap(hand[0]);
      await page.waitForTimeout(100);
      const t = await page.$$('.lane.target');
      if (!t.length) break;
      await t[0].click();
      await page.waitForTimeout(120);
    }
    if (step === 0) await page.screenshot({ path: `${out}/16-ch1-deploy.png` });
    await page.click('[data-go]');
  } else if (await page.$('[data-lock]')) {
    for (let i = 0; i < 3; i++) {
      const picks = await page.$$('.lane__pick');
      if (i >= picks.length) break;
      const ops = await picks[i].$$('.op:not([disabled])');
      await ops[0].click();
      await page.waitForTimeout(50);
    }
    const lk = await page.$('[data-lock]:not([disabled])');
    if (lk) await lk.click();
  }
  await page.waitForTimeout(700);
}
await page.waitForTimeout(1000);
await page.screenshot({ path: `${out}/17-ch1-result.png` });
const won = await page.$('.result__title.win');
console.log('chapter I finished:', !!(await page.$('.result')), won ? 'won' : 'lost');
console.log('errors', errors);
await browser.close();
