// Per-card balance for the Reckoning: Octave win rate of every Champion in
// random 8-of-120 Octaves (Expert mirror). Usage: node sim/rtune.js [N] [seed] [--apply]
// With --apply, cards outside the band get one stat step toward 50% and the
// change is written to engine/cards/reckoning.js.
import fs from 'node:fs';
import { parallel } from './rpar.js';
import { CARDS, LIST } from '../engine/cards/index.js';

const N = +(process.argv[2] || 4000);
const seed = +(process.argv[3] || 1);
const apply = process.argv.includes('--apply');
const band = 3; // +-3 points
const t0 = Date.now();
const r = await parallel('octaves', N, seed);
const rows = LIST.map((c) => {
  const t = r.cards[c.id] || [0, 0, 0, 0];
  return { id: c.id, f: c.faction, rar: c.rarity, n: t[0], wr: t[0] ? (100 * t[1]) / t[0] : 50, playedWr: t[2] ? (100 * t[3]) / t[2] : 50, played: t[0] ? t[2] / t[0] : 0 };
}).sort((a, b) => b.wr - a.wr);
const sd = Math.sqrt(rows.reduce((a, x) => a + (x.wr - 50) ** 2, 0) / rows.length);
const noise = 100 * Math.sqrt(0.25 / (rows.reduce((a, x) => a + x.n, 0) / rows.length));
console.log(`N=${r.n} in ${((Date.now() - t0) / 1000).toFixed(0)}s  rounds/match ${(r.rounds / r.n).toFixed(2)}  falls ${(r.falls / r.n).toFixed(2)}  hits/round ${(r.hits / r.rounds).toFixed(2)}  voice dmg/round ${(r.voice / r.rounds).toFixed(2)}`);
console.log(`per-card Octave WR sd ${sd.toFixed(2)} (noise ${noise.toFixed(2)})  within 47-53: ${rows.filter((x) => Math.abs(x.wr - 50) <= 3).length}/120`);
const by = (k) => {
  const g = {};
  for (const x of rows) (g[x[k]] ||= []).push(x.wr);
  return Object.fromEntries(Object.entries(g).map(([a, v]) => [a, +(v.reduce((s, y) => s + y, 0) / v.length).toFixed(1)]));
};
console.log('by rarity', JSON.stringify(by('rar')), ' by faction', JSON.stringify(by('f')));
console.log('TOP', rows.slice(0, 12).map((x) => `${x.id} ${x.wr.toFixed(1)}`).join(' | '));
console.log('BOTTOM', rows.slice(-12).map((x) => `${x.id} ${x.wr.toFixed(1)}`).join(' | '));
fs.mkdirSync(new URL('./cache/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL(`./cache/rtune-${seed}.json`, import.meta.url), JSON.stringify(rows, null, 1));
if (!apply) {
  // a measurement of the set as it stands: publish it for the economy sim and the Draft AI
  fs.writeFileSync(new URL('./cache/rtune-final.json', import.meta.url), JSON.stringify(rows, null, 1));
  fs.writeFileSync(new URL('../engine/data/ratings.json', import.meta.url), JSON.stringify(Object.fromEntries(rows.map((x) => [x.id, +(x.wr / 100).toFixed(4)]))));
}

if (apply) {
  const path = new URL('../engine/cards/reckoning.js', import.meta.url);
  let src = fs.readFileSync(path, 'utf8');
  const changes = [];
  for (const x of rows) {
    const d = x.wr - 50;
    if (Math.abs(d) <= band) continue;
    const c = CARDS[x.id];
    let [S, G, C, H] = [c.stats.strike, c.stats.guard, c.stats.scheme, c.hp];
    const steps = Math.abs(d) > 7 ? 2 : 1;
    for (let k = 0; k < steps; k++) {
      // small corrections move health only (worth ~half a stat point)
      if (Math.abs(d) <= 5 && H > 3 && H < 11) {
        H += d > 0 ? -1 : 1;
        continue;
      }
      if (d > 0) {
        // too strong: trim health first if it's high, else the best attacking stat
        if (H >= 7) H--;
        else if (S >= C && S > 1) S--;
        else if (C > 1) C--;
        else H--;
      } else {
        if (H <= 5) H++;
        else if (S >= C && S < 9) S++;
        else if (C < 9) C++;
        else H++;
      }
    }
    const re = new RegExp(`(\\n  ${x.id}: \\{ r: \\[)[^\\]]*(\\])`);
    if (!re.test(src)) throw new Error('cannot find ' + x.id);
    src = src.replace(re, `$1${S}, ${G}, ${C}, ${H}$2`);
    changes.push(`${x.id} ${x.wr.toFixed(1)}: [${c.stats.strike},${c.stats.guard},${c.stats.scheme},${c.hp}] -> [${S},${G},${C},${H}]`);
  }
  fs.writeFileSync(path, src);
  console.log(`applied ${changes.length} changes:\n` + changes.join('\n'));
}
