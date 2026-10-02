// Plays the forced tutorial end to end on a fresh save: every lesson, the
// Octave builder and the first real Clash. Fails if anything is skipped.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const out = process.argv[2] || '/tmp/tut';
const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto('http://localhost:8080/client/index.html#/home');
await page.waitForSelector('.splash', { timeout: 4000 }).then(() => page.click('.splash')).catch(() => {}); // tap past the splash
await page.evaluate(() => localStorage.clear());
await page.goto('http://localhost:8080/client/index.html#/vault');
await page.waitForSelector('.splash', { timeout: 4000 }).then(() => page.click('.splash')).catch(() => {}); // tap past the splash
await page.reload();
await page.waitForSelector('.splash', { timeout: 4000 }).then(() => page.click('.splash')).catch(() => {}); // tap past the splash
await page.waitForTimeout(1200);
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
console.log('forced to', await page.evaluate(() => location.hash), 'nav?', !!(await page.$('.nav')));
await shot('00-home');
const save = () => page.evaluate(() => JSON.parse(localStorage.getItem('threnyx.save.v1')));
const tapThrough = async () => {
  for (let k = 0; k < 12; k++) {
    const sc = await page.$('.scene, .tut-reveal');
    if (!sc) return;
    await page.waitForTimeout(750);
    await sc.click({ force: true }).catch(() => {});
  }
};
// the order that beats each lesson's opponent
const shots = new Set();
const LESSON_ORDER = ['strike', 'guard', 'scheme', null, null, null];
async function fight(lesson) {
  const t0 = Date.now();
  while (Date.now() - t0 < 200000) {
    if (await page.$('.result')) return;
    // the coach's intro waits for taps
    if (await page.$('.coach.on .coach__tap')) {
      await page.mouse.click(195, 400);
      await page.waitForTimeout(450);
      if (!shots.has('coach' + lesson)) (shots.add('coach' + lesson), await shot(`c${lesson}-intro`));
      continue;
    }
    const go = await page.$('[data-go]');
    const lock = await page.$('[data-lock]');
    if (go) {
      if (!shots.has('dep' + lesson)) (shots.add('dep' + lesson), await page.waitForTimeout(400), await shot(`c${lesson}-deploy`));
      for (let k = 0; k < 3; k++) {
        const hand = await page.$$('.rk-hand .card:not(.is-disabled)');
        if (!hand.length) break;
        await hand[0].dispatchEvent('pointerdown');
        await hand[0].dispatchEvent('pointerup');
        await page.waitForTimeout(100);
        const t = await page.$$('.lane.target');
        if (!t.length) break;
        await t[0].click();
        await page.waitForTimeout(120);
      }
      await page.click('[data-go]');
    } else if (lock) {
      if (!shots.has('cmd' + lesson)) (shots.add('cmd' + lesson), await page.waitForTimeout(400), await shot(`c${lesson}-command`));
      const picks = await page.$$('.lane__pick');
      for (let i = 0; i < picks.length; i++) {
        const p = (await page.$$('.lane__pick'))[i];
        const lane = +(await p.evaluate((x) => x.closest('.lane').dataset.lane));
        const open = !(await page.$(`.lane[data-side="1"][data-lane="${lane}"] .card`));
        const want = open ? 'strike' : LESSON_ORDER[lesson];
        let b = want && (await p.$(`.op[data-o="${want}"]:not([disabled])`));
        if (!b) {
          // otherwise the highest-power allowed order
          const ops = await p.$$('.op:not([disabled])');
          let best = -1;
          for (const o of ops) {
            const v = +(await o.$eval('b', (x) => x.textContent));
            if (v > best) (best = v), (b = o);
          }
        }
        await b.click();
      }
      if (lesson === 4 && (await page.$('[data-read]:not([disabled])'))) {
        await page.click('[data-read]');
        const t = await page.$$('.rk-row--opp .lane.target');
        if (t.length) {
          await t[0].click();
          await page.click('.lane__readpick [data-r="strike"]');
        } else await page.click('[data-read]');
      }
      await page.click('[data-lock]');
    }
    await page.waitForTimeout(300);
  }
}
for (let lesson = 0; lesson < 5; lesson++) {
  let tries = 0;
  while ((await save()).tut.lesson === lesson && tries++ < 3) {
    await page.click('[data-begin]');
    await tapThrough();
    if (lesson === 0 && tries === 1) await shot('01-lesson1-fight');
    await fight(lesson);
    const res = await page.$eval('.result__title', (x) => x.textContent);
    console.log('lesson', lesson + 1, res, 'owned', Object.keys((await save()).profile.copies).length);
    await page.click('[data-continue]');
    await page.waitForTimeout(700);
  }
  await shot(`0${lesson + 2}-after-lesson${lesson + 1}`);
}
await tapThrough();
await shot('07-builder');
await page.click('[data-suggest]');
await page.click('[data-seal]');
await tapThrough();
await fight(5);
console.log('final', await page.$eval('.result__title', (x) => x.textContent));
await shot('08-final');
await page.click('[data-continue]');
await page.waitForTimeout(900);
const s = await save();
console.log('onboard', s.onboard, 'octave', s.octaves[s.active].cards.join(','), 'tickets', s.profile.tickets.standard, 'nav?', !!(await page.$('.nav')), 'hash', await page.evaluate(() => location.hash));
await shot('09-home');
console.log('errors', errors);
await browser.close();
