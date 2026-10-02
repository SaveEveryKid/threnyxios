// Premium motion check: renders premium cards, drives them with synthetic
// device-orientation events and with the pointer, screenshots each pose and
// measures frame times. Usage: node tools/motion.mjs <outdir>
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const out = process.argv[2] || '.';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto('http://localhost:8080/client/index.html#vault');
await page.waitForSelector('.splash', { timeout: 4000 }).then(() => page.click('.splash')).catch(() => {}); // tap past the splash
await page.waitForTimeout(800);
await page.evaluate(async () => {
  const { renderCard } = await import('/client/js/ui/card.js');
  const { CARDS } = await import('/engine/cards/index.js');
  const lab = document.createElement('div');
  lab.id = 'lab';
  lab.style.cssText = 'position:fixed;inset:0;z-index:999;background:#07070b;display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:14px;align-content:start;justify-items:center';
  document.body.appendChild(lab);
  const add = (id, o) => lab.appendChild(renderCard(CARDS[id], { width: 172, tilt: true, ...o }));
  add('hollowKing', { size: 'full' });
  add('maelis', { treatment: 'immortal', serial: '00824 / 10000', size: 'full' });
  const leg = Object.values(CARDS).find((c) => c.rarity === 'legendary');
  add(leg.id, { size: 'full' });
  const com = Object.values(CARDS).find((c) => c.rarity === 'rare');
  add(com.id, { size: 'full', treatment: 'foil' });
});
const orient = (beta, gamma) => page.evaluate(([b, g]) => window.dispatchEvent(Object.assign(new Event('deviceorientation'), { beta: b, gamma: g, alpha: 0 })), [beta, gamma]);
// hold at a natural 40° grip, then tilt
for (let i = 0; i < 10; i++) { await orient(40, 0); await page.waitForTimeout(16); }
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/rest.png` });
const poses = { right: [40, 14], left: [40, -14], toward: [28, 0], away: [52, 6] };
for (const [name, [b, g]] of Object.entries(poses)) {
  for (let i = 0; i < 12; i++) { await orient(40 + ((b - 40) * (i + 1)) / 12, (g * (i + 1)) / 12); await page.waitForTimeout(16); }
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${out}/gyro-${name}.png` });
}
// frame timing during a continuous sway
const stats = await page.evaluate(async () => {
  const times = [];
  let last = performance.now(), t0 = last;
  await new Promise((res) => {
    const f = (now) => {
      times.push(now - last); last = now;
      const t = (now - t0) / 1000;
      window.dispatchEvent(Object.assign(new Event('deviceorientation'), { beta: 40 + Math.sin(t * 2.1) * 10, gamma: Math.sin(t * 1.3) * 12, alpha: 0 }));
      if (now - t0 < 3000) requestAnimationFrame(f); else res();
    };
    requestAnimationFrame(f);
  });
  times.sort((a, b) => a - b);
  return { frames: times.length, p50: times[times.length >> 1].toFixed(1), p95: times[Math.floor(times.length * 0.95)].toFixed(1), max: times[times.length - 1].toFixed(1), status: (await import('/client/js/core/motion.js')).motionState() };
});
console.log('gyro sway 3s:', JSON.stringify(stats));
// sensors go quiet -> pointer fallback
await page.waitForTimeout(1200);
const box = await page.locator('#lab .card').first().boundingBox();
await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.15, { steps: 6 });
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/pointer.png` });
// close-up of the Hollow King
await page.evaluate(async () => {
  const { renderCard } = await import('/client/js/ui/card.js');
  const { CARDS } = await import('/engine/cards/index.js');
  const lab = document.getElementById('lab');
  lab.innerHTML = '';
  lab.style.gridTemplateColumns = '1fr';
  lab.appendChild(renderCard(CARDS.hollowKing, { size: 'full', width: 340, tilt: true }));
  // optional sample painting (not shipped): sim/cache/king-art.jpg
  const ok = await fetch('/sim/cache/king-art.jpg', { method: 'HEAD' }).then((r) => r.ok).catch(() => false);
  if (ok) lab.querySelector('.card__layer--art').src = '/sim/cache/king-art.jpg';
});
await page.waitForTimeout(300);
for (const [name, [b, g]] of Object.entries({ a: [40, 0], b: [34, 12], c: [47, -12] })) {
  for (let i = 0; i < 20; i++) { await orient(b, g); await page.waitForTimeout(16); }
  await page.screenshot({ path: `${out}/king-${name}.png` });
}
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
