// Helpers for the browser tests: the built site (python3 -m http.server 8091 in game/site),
// with Supabase replaced by fake-supabase-browser.js running the real bundled functions.
let pw;
try { pw = (await import('playwright')).default; } catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }
import fs from 'fs';
import os from 'os';
import path from 'path';
const HERE = new URL('.', import.meta.url).pathname;
// screenshots go here
export const S = (process.env.SHOTS || path.join(os.tmpdir(), 'threnyx-guest-shots')) + '/';
fs.mkdirSync(S, { recursive: true });
const FN = path.join(HERE, '../../supabase/functions/') + '/';
export const browser = await pw.chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
export async function page({ w = 390, h = 844 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(e.message));
  p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && p.errs.push(m.text()));
  await p.route('https://cdn.jsdelivr.net/npm/@supabase/**', (r) => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(HERE + 'fake-supabase-browser.js') }));
  await p.route('**/__fn/*.ts', (r) => { const n = r.request().url().split('/').pop().replace('.ts', ''); r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(FN + n + '/index.ts') }); });
  return p;
}
export const BASE = process.env.BASE || 'http://localhost:8091/';
export async function open(p, url = BASE) {
  await p.goto(url);
  await p.waitForTimeout(1200);
  await p.locator('.splash').click().catch(() => {});
  await p.waitForTimeout(1800);
}
export const text = (p, sel = '#app') => p.evaluate((s) => document.querySelector(s)?.innerText?.replace(/\s+/g, ' ').trim() || '', sel);
export const fake = (p) => p.evaluate(() => ({ db: window.__fake?.db, users: window.__fake?.users }));
let n = 0;
export const shot = (p, tag) => p.screenshot({ path: `${S}${String(++n).padStart(2, '0')}-${tag}.png` });
const results = [];
export function ok(cond, msg) { results.push([!!cond, msg]); console.log(cond ? '✓' : '✗', msg); }
export function done() { const bad = results.filter((r) => !r[0]); console.log(`\n${results.length - bad.length}/${results.length} passed`); return bad.length; }
// every visible button on screen and not covered
export async function tappable(p) {
  return p.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('button, a.btn, input')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || el.closest('[hidden]') || getComputedStyle(el).visibility === 'hidden') continue;
      const label = (el.textContent || el.placeholder || el.getAttribute('aria-label') || '').trim().slice(0, 30);
      if (r.right > innerWidth + 1 || r.left < -1) out.push(`off-screen sideways: "${label}"`);
      if (r.height < 36 && !el.closest('.nav') && el.tagName !== 'INPUT') out.push(`small target (${Math.round(r.height)}px): "${label}"`);
    }
    if (document.documentElement.scrollWidth > innerWidth + 1) out.push('page scrolls sideways');
    return out;
  });
}
