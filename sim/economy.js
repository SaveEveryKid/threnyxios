// Economy simulation: Players A-E over 12 weeks using the real pack engine.
import { LIST, CARDS } from '../engine/cards/index.js';
import { newProfile, openPack, owned, BURN, CRAFT, RARITY_ORDER } from '../engine/collection.js';
import fs from 'node:fs';

// Weekly income, in pack openings, by source. (See docs/06 for derivation.)
const PLAYERS = {
  A: { label: 'Free, 15 min/day', usd: 0, std: 12 + 3.5 + 2 + 2 + 1 + 1, coll: 0, craftFor: 'compete' },
  B: { label: 'Free, 1 hr/day', usd: 0, std: 14 + 7 + 2 + 5 + 2 + 3, coll: 1, craftFor: 'compete' },
  C: { label: '~$10/month', usd: 10, std: 26 + 3.1 + 1.2, coll: 0.5 + 0.5, craftFor: 'compete' },
  D: { label: '~$25/month', usd: 25, std: 33 + 3.1 + 4.6, coll: 1 + 0.5 + 0.7, craftFor: 'compete' },
  E: { label: 'Heavy collector (~$150/month)', usd: 150, std: 33 + 3.1 + 30, coll: 1 + 0.5 + 14, craftFor: 'complete' },
};
const WEEKS = 12;
const TRIALS = 20;
const rarityOf = (id) => CARDS[id].rarity;
// Card competitive value from the balance pass (random-Octave win rate).
let power = {};
try {
  const rows = JSON.parse(fs.readFileSync(new URL('./cache/rtune-final.json', import.meta.url)));
  for (const r of rows) power[r.id] = r.wr / 100;
} catch { for (const c of LIST) power[c.id] = 0.5; }

function burnExtras(p) {
  // Keep 1 + up to 3 spares (Ascension stock) for C/R/E; burn the rest.
  for (const [id, copies] of Object.entries(p.copies)) {
    const keep = RARITY_ORDER.indexOf(rarityOf(id)) >= 3 ? 2 : 4;
    while (copies.length > keep) {
      const c = copies.pop();
      if (p.items[c].treatment !== 'standard') { copies.unshift(c); break; }
      delete p.items[c];
      p.embers += BURN[rarityOf(id)];
    }
  }
}
function craftMissing(p, mode) {
  const missing = LIST.filter((c) => owned(p, c.id) === 0);
  missing.sort((a, b) => (mode === 'compete' ? power[b.id] - power[a.id] : CRAFT[a.rarity] - CRAFT[b.rarity]));
  for (const c of missing) {
    if (mode === 'compete' && power[c.id] < 0.5) break;
    if (p.embers >= CRAFT[c.rarity]) {
      p.embers -= CRAFT[c.rarity];
      (p.copies[c.id] ||= []).push('crafted-' + c.id);
      p.items['crafted-' + c.id] = { cardId: c.id, treatment: 'standard' };
    }
  }
}
export function bestOctave(p) {
  return LIST.filter((c) => owned(p, c.id) > 0).sort((a, b) => power[b.id] - power[a.id]).slice(0, 8).map((c) => c.id);
}

const out = {};
const octs = {};
for (const [key, P] of Object.entries(PLAYERS)) {
  const weeks = [];
  for (let t = 0; t < TRIALS; t++) {
    const rng = { seed: 777 + t * 31 + key.charCodeAt(0) };
    let p = newProfile(key);
    let carryS = 0, carryC = 0;
    for (let w = 1; w <= WEEKS; w++) {
      carryS += P.std; carryC += P.coll;
      while (carryS >= 1) { p = openPack(p, 'standard', LIST, rng).profile; carryS--; }
      while (carryC >= 1) { p = openPack(p, 'collector', LIST, rng).profile; carryC--; }
      burnExtras(p);
      craftMissing(p, P.craftFor);
      const own = Object.fromEntries(RARITY_ORDER.map((r) => [r, LIST.filter((c) => c.rarity === r && owned(p, c.id) > 0).length]));
      const total = Object.values(own).reduce((a, b) => a + b, 0);
      const oct = bestOctave(p);
      const octPower = oct.reduce((s, id) => s + power[id], 0) / 8;
      const immortals = Object.values(p.items).filter((i) => i.treatment === 'immortal').length;
      const altart = Object.values(p.items).filter((i) => i.treatment === 'altart').length;
      (weeks[w - 1] ||= []).push({ total, own, octPower, immortals, altart, packs: p.packsOpened });
      if ([1, 2, 4].includes(w) && t < 6) (octs[`${key}-w${w}`] ||= []).push(oct);
    }
    if (t === 0) fs.writeFileSync(new URL(`./cache/econ-octave-${key}.json`, import.meta.url), JSON.stringify({ w12: bestOctave(p) }));
  }
  out[key] = weeks.map((arr) => {
    const avg = (f) => arr.reduce((s, x) => s + f(x), 0) / arr.length;
    return {
      total: avg((x) => x.total), leg: avg((x) => x.own.legendary), myth: avg((x) => x.own.mythic),
      octPower: avg((x) => x.octPower), immortals: avg((x) => x.immortals), altart: avg((x) => x.altart), packs: avg((x) => x.packs),
    };
  });
}
console.log('Week | ' + Object.keys(PLAYERS).map((k) => `${k}: cards/120 (L/15, M/5) oct`).join(' | '));
for (const w of [1, 2, 4, 8, 12]) {
  console.log(`W${w} | ` + Object.keys(PLAYERS).map((k) => { const r = out[k][w - 1]; return `${r.total.toFixed(0)} (${r.leg.toFixed(1)}, ${r.myth.toFixed(1)}) ${(r.octPower * 100).toFixed(1)}`; }).join(' | '));
}
console.log('\nImmortals / Alt-arts by week 12:', Object.keys(PLAYERS).map((k) => `${k}: ${out[k][11].immortals.toFixed(2)} / ${out[k][11].altart.toFixed(1)}`).join(', '));
fs.writeFileSync(new URL('./cache/economy.json', import.meta.url), JSON.stringify(out));
fs.writeFileSync(new URL('./cache/econ-octaves.json', import.meta.url), JSON.stringify(octs));
