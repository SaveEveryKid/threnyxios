// Drives the client in a phone viewport: plays a full ladder match with
// random (legal) clicks and screenshots key moments.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const out = process.argv[2] || '/tmp/shots';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const tracks = [];
page.on('request', (r) => /audio\/music\//.test(r.url()) && tracks.push(r.url().split('/').pop()));
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.type() + ': ' + m.text()));

await page.goto('http://localhost:8080/client/index.html#/home');
await page.waitForSelector('.splash', { timeout: 4000 }).then(() => page.click('.splash')).catch(() => {}); // tap past the splash
await page.waitForTimeout(1200);
// skip training: hand over what the tutorial would have (tools/tutorial.mjs covers it)
await page.evaluate(async () => {
  const store = await import('/client/js/core/store.js');
  store.update((st) => {
    if (st.onboard !== 'done') {
      store.grantStarter(st, store.STARTER, 'Test save.');
      st.octaves[st.active] = { name: 'Test Octave', cards: ['hadric', 'tamsin', 'ossian', 'dunstan', 'odo', 'aria', 'nan', 'anselm'] };
    }
    st.onboard = 'done';
    st.unlock = { focus: true, read: true };
  });
});
await page.goto('http://localhost:8080/client/index.html#/play');
await page.waitForSelector('.splash', { timeout: 4000 }).then(() => page.click('.splash')).catch(() => {}); // tap past the splash
await page.waitForTimeout(800);
await page.click('[data-ladder]');
await page.waitForTimeout(1200);
const shot = async (name) => page.screenshot({ path: `${out}/${name}.png` });
const tap = async (el) => { await el.dispatchEvent('pointerdown'); await page.waitForTimeout(40); await el.dispatchEvent('pointerup'); await el.click({ force: true }).catch(() => {}); };
let rounds = 0, shots = new Set();
const t0 = Date.now();
for (let step = 0; step < 200 && Date.now() - t0 < 240000; step++) {
  if (await page.$('.result')) break;
  const go = await page.$('[data-go]');
  const lock = await page.$('[data-lock]');
  if (go) {
    // deploy: place up to the allowed number of cards
    for (let k = 0; k < 2; k++) {
      const hand = await page.$$('.rk-hand .card:not(.is-disabled)');
      if (!hand.length) break;
      await tap(hand[Math.floor(Math.random() * hand.length)]);
      await page.waitForTimeout(120);
      const targets = await page.$$('.lane.target');
      if (!targets.length) break;
      await targets[Math.floor(Math.random() * targets.length)].click();
      await page.waitForTimeout(150);
    }
    if (!shots.has('deploy')) (shots.add('deploy'), await shot('03-deploy'));
    await page.click('[data-go]');
    await page.waitForTimeout(400);
    if (!shots.has('reveal')) (shots.add('reveal'), await page.waitForTimeout(250), await shot('04-reveal'));
  } else if (lock) {
    // each pick re-renders the pickers, so query fresh every time
    for (let i = 0; i < 3; i++) {
      const picks = await page.$$('.lane__pick');
      if (i >= picks.length) break;
      const ops = await picks[i].$$('.op:not([disabled])');
      await ops[Math.floor(Math.random() * ops.length)].click();
      await page.waitForTimeout(60);
    }
    if (Math.random() < 0.35 && (await page.$('[data-focus]:not([disabled])'))) {
      await page.click('[data-focus]');
      const my = await page.$$('.rk-row--me .lane.target');
      if (my.length) await my[0].click();
    }
    if (rounds >= 2 && Math.random() < 0.5 && (await page.$('[data-read]:not([disabled])'))) {
      await page.click('[data-read]');
      await page.waitForTimeout(80);
      const t = await page.$$('.rk-row--opp .lane.target');
      if (t.length) {
        await t[0].click();
        await page.waitForTimeout(80);
        const rs = await page.$$('.lane__readpick [data-r]');
        if (rs.length) await rs[Math.floor(Math.random() * 3)].click();
      } else await page.click('[data-read]');
    }
    await page.waitForTimeout(80);
    if (!shots.has('command')) (shots.add('command'), await shot('05-command'));
    const lk = await page.$('[data-lock]:not([disabled])');
    if (!lk) { await page.waitForTimeout(200); continue; }
    await lk.click();
    rounds++;
    if (!shots.has('resolve')) {
      shots.add('resolve');
      for (const [i, ms] of [[1, 1300], [2, 700], [3, 700], [4, 900]]) { await page.waitForTimeout(ms); await shot('06-resolve-' + i); }
    }
  }
  await page.waitForTimeout(500);
}
await page.waitForTimeout(1200);
await shot('07-result');
console.log('rounds played', rounds, 'result shown', !!(await page.$('.result')), 'seconds', ((Date.now() - t0) / 1000).toFixed(0));
await page.waitForTimeout(2200);
console.log('result:', (await page.$eval('.result', (r) => r.innerText.replace(/\s+/g, ' ')).catch(() => '-')).slice(0, 400));
await page.screenshot({ path: `${out}/09-result-spoils.png` });
if (await page.$('[data-replay]')) {
  await page.click('[data-replay]');
  // wait for the finished match's result screen to go, then for the replay's own
  await page.waitForFunction(() => !document.querySelector('.result'), null, { timeout: 10000 }).catch(() => {});
  const fin = await page.waitForSelector('.result', { timeout: 150000 }).then(() => true).catch(() => false);
  console.log('replay finished', fin);
}
console.log('music requested:', [...new Set(tracks)].join(', ') || 'none');
console.log('errors:', errors.slice(0, 10));
await browser.close();
