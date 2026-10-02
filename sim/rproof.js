// The Reckoning proof suite (docs/07-balance.md). Usage: node sim/rproof.js [scale]
// 1. mono-faction Octaves (round robin)  2. archetype Octaves (round robin)
// 3. skill matchups  4. expert-mirror flow metrics  5. spending (A-E Octaves)
import fs from 'node:fs';
import { parallel } from './rpar.js';
import { CARDS } from '../engine/cards/index.js';

const scale = +(process.argv[2] || 1);
const only = process.argv[3] ? process.argv[3].split(',') : null; // e.g. 'decks,factions'
const want = (k) => !only || only.includes(k);
const out = {};
const pct = (w, n) => +((100 * w) / n).toFixed(1);

// Archetype Octaves built around the kits.
export const DECKS = {
  lastWords: ['cassius', 'seraphine', 'tamsin', 'wynn', 'ashenChoir', 'aurelle', 'hollis', 'bastian'],
  knights: ['orla', 'hadric', 'mira', 'iver', 'doran', 'dunstan', 'caska', 'ebb'],
  silencers: ['firstSilence', 'unrung', 'oriel', 'lucan', 'sable', 'veyra', 'gorm', 'castor'],
  readers: ['lirae', 'maud', 'edric', 'nils', 'ingrid', 'evander', 'sefa', 'odo'],
  focusEngine: ['ilsabet', 'brask', 'hourbell', 'amaranth', 'imre', 'tomas', 'pellPim', 'twelveHanded'],
  machines: ['gideon', 'hourbell', 'tock', 'ada', 'sentry9', 'twelveHanded', 'debtHounds', 'sabine'],
  unsung: ['hollowKing', 'paperKnight', 'tamsk', 'dask', 'inklings', 'nyx', 'quill', 'lenka'],
  tricksters: ['thessaly', 'iris', 'verity', 'hob', 'kestrel', 'ivo', 'mote', 'rue'],
  sleepless: ['absolom', 'caska', 'oriane', 'aldo', 'anselm', 'ottilie', 'sleeplessChoir', 'maren'],
  aggro: ['pip', 'corwin', 'lina', 'tallis', 'maren', 'horne', 'corbel', 'sera'],
  sustain: ['teodor', 'oriane', 'evander', 'lirae', 'sefa', 'procession', 'sleeplessChoir', 'bess'],
  children: ['tamsin', 'wren', 'dilly', 'wick', 'mote', 'juno', 'ione', 'lina'],
};
for (const [k, d] of Object.entries(DECKS)) {
  if (new Set(d).size !== 8) throw new Error(k + ' has duplicates');
  for (const id of d) if (!CARDS[id]) throw new Error(k + ': unknown ' + id);
}

function roundRobin(r, names) {
  const tot = {};
  const cells = {};
  for (const [key, [n, w]] of Object.entries(r.pairs)) {
    const [a, b] = key.split('|');
    (tot[a] ||= [0, 0])[0] += n;
    tot[a][1] += w;
    (tot[b] ||= [0, 0])[0] += n;
    tot[b][1] += n - w;
    (cells[a] ||= {})[b] = [(cells[a][b]?.[0] || 0) + n, (cells[a][b]?.[1] || 0) + w];
    (cells[b] ||= {})[a] = [(cells[b][a]?.[0] || 0) + n, (cells[b][a]?.[1] || 0) + n - w];
  }
  const res = {};
  for (const x of names) {
    res[x] = { overall: pct(tot[x][1], tot[x][0]) };
    const m = Object.entries(cells[x]).map(([y, [n, w]]) => [y, pct(w, n)]).sort((p, q) => q[1] - p[1]);
    res[x].best = m.slice(0, 2);
    res[x].worst = m.slice(-2);
  }
  return res;
}

const t0 = Date.now();
// 1. factions
if (want('factions')) {
  const F = ['crown', 'quiet', 'hour', 'margin', 'vigil'];
  const pairs = [];
  for (let i = 0; i < F.length; i++) for (let j = i + 1; j < F.length; j++) pairs.push({ a: F[i], b: F[j] });
  const r = await parallel('factions', Math.round(6000 * scale), 101, { pairs });
  out.factions = roundRobin(r, F);
  console.log('FACTIONS', JSON.stringify(Object.fromEntries(Object.entries(out.factions).map(([k, v]) => [k, v.overall]))));
}
// 2. archetypes
if (want('decks')) {
  const names = Object.keys(DECKS);
  const pairs = [];
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) pairs.push({ a: names[i], b: names[j] });
  const r = await parallel('decks', Math.round(13200 * scale), 202, { pairs, decks: DECKS });
  out.decks = roundRobin(r, names);
  console.log('DECKS', JSON.stringify(Object.fromEntries(Object.entries(out.decks).map(([k, v]) => [k, v.overall]).sort((a, b) => b[1] - a[1]))));
}
// 3. skill
out.skill = {};
if (want('skill')) for (const [a, b, o] of [['expert', 'novice'], ['expert', 'greedy'], ['expert', 'random'], ['novice', 'random'], ['expert', 'novice', { aOpts: { exploit: 0.7 } }]]) {
  const r = await parallel('skill', Math.round(1600 * scale), 303, { agents: [a, b], ...(o || {}) });
  const k = `${a}${o ? '(exploit .7)' : ''} vs ${b}`;
  out.skill[k] = pct(r.pairs.skill[1], r.pairs.skill[0]);
}
if (want('skill')) console.log('SKILL', JSON.stringify(out.skill));
// 4. flow (expert mirror, random Octaves)
if (want('flow')) {
  const r = await parallel('octaves', Math.round(6000 * scale), 404);
  const ot = r.orders.strike + r.orders.guard + r.orders.scheme;
  out.flow = {
    matches: r.n,
    roundsPerMatch: +(r.rounds / r.n).toFixed(2),
    endedBySilence: pct(r.silence, r.n),
    fallsPerMatch: +(r.falls / r.n).toFixed(2),
    hitsPerRound: +(r.hits / r.rounds).toFixed(2),
    voiceDmgPerRound: +(r.voice / r.rounds).toFixed(2),
    orders: Object.fromEntries(Object.entries(r.orders).map(([k, v]) => [k, pct(v, ot)])),
    focusPerPlayer: +(r.focus / r.n / 2).toFixed(2),
    readsPerPlayer: +(r.reads / r.n / 2).toFixed(2),
    readHitRate: pct(r.readsHit, r.reads),
    comebackFrom6DownAtRound3: pct(r.comeback, r.behind),
  };
  console.log('FLOW', JSON.stringify(out.flow));
}
// 5. spending: best buildable Octaves of players A-E (sim/economy.js)
if (want('spend')) try {
  const octs = JSON.parse(fs.readFileSync(new URL('./cache/econ-octaves.json', import.meta.url)));
  out.spend = {};
  for (const [a, b, w] of [['A', 'E', 'w1'], ['A', 'E', 'w2'], ['A', 'E', 'w4'], ['B', 'E', 'w2'], ['C', 'D', 'w2']]) {
    // six simulated players per tier: pair trial t of one tier with trial t of the other
    const decks = {};
    const pairs = [];
    const A = octs[`${a}-${w}`], B = octs[`${b}-${w}`];
    for (let t = 0; t < Math.min(A.length, B.length); t++) {
      decks[a + t] = A[t];
      decks[b + t] = B[t];
      pairs.push({ a: a + t, b: b + t });
    }
    const r = await parallel('decks', Math.round(2400 * scale), 505, { pairs, decks });
    const [n, wA] = Object.entries(r.pairs).reduce((acc, [k, [nn, ww]]) => (k.startsWith(a) ? [acc[0] + nn, acc[1] + ww] : [acc[0] + nn, acc[1] + nn - ww]), [0, 0]);
    out.spend[`${a}-${w} vs ${b}-${w}`] = pct(wA, n);
  }
  console.log('SPEND', JSON.stringify(out.spend));
} catch (e) {
  console.log('SPEND skipped:', e.message);
}
fs.writeFileSync(new URL(`./cache/rproof${only ? '-' + only.join('-') : ''}.json`, import.meta.url), JSON.stringify(out, null, 1));
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
