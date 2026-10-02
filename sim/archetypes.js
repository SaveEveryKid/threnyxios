// Deck styles, proven. node sim/archetypes.js [games-per-pair=40] [--ratings] [--tune N]
//   --ratings  every card's Duel win rate in random Octaves (3600 matches),
//              written to engine/data/duel-ratings.js for the deck builder
//   (always)   the deck builder's best Octave for each archetype from the full
//              collection, a round robin between them (Expert AI both sides),
//              the spread, and how different the builds are (overlap)
//   --tune N   N passes moving each archetype's Bond bonus (engine/data/
//              arch-tune.js) a step toward a 50% style, kept within -1..+1.5 (half steps)
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs';
import os from 'node:os';

if (!isMainThread) {
  const { createDuel } = await import('../engine/duel.js');
  const { makeDuelAI, playOut } = await import('../engine/duel-ai.js');
  const T = (await import('../engine/data/arch-tune.js')).default;
  for (const k of Object.keys(T)) delete T[k];
  Object.assign(T, workerData.tune);
  const { makeRng } = await import('../engine/rng.js');
  const out = [];
  for (const j of workerData.jobs) {
    const rand = makeRng(j.seed * 31 + 7);
    const st = createDuel(j.decks, { seed: j.seed, lead: j.seed % 2 });
    playOut(st, [makeDuelAI({ skill: 1, rand }), makeDuelAI({ skill: 1, rand })]);
    out.push({ i: j.i, winner: st.winner, duels: st.history.length });
  }
  parentPort.postMessage(out);
} else {
  const { LIST, CARDS } = await import('../engine/cards/index.js');
  const { ARCHETYPES, bondsOf } = await import('../engine/archetypes.js');
  const args = process.argv.slice(2);
  const PER = +(args.find((a) => /^\d+$/.test(a)) || 40);
  const ti = args.indexOf('--tune');
  const passes = ti >= 0 ? +args[ti + 1] : 0;
  const tunePath = new URL('../engine/data/arch-tune.js', import.meta.url);
  let tune = JSON.parse(JSON.stringify((await import('../engine/data/arch-tune.js')).default));
  const W = Math.max(1, Math.min(8, os.cpus().length));
  const run = async (jobs) => {
    const chunks = Array.from({ length: W }, () => []);
    jobs.forEach((j, i) => chunks[i % W].push({ ...j, i }));
    const res = (await Promise.all(chunks.map((c) => new Promise((ok, bad) => { const w = new Worker(new URL(import.meta.url), { workerData: { jobs: c, tune } }); w.on('message', ok); w.on('error', bad); })))).flat();
    return res.sort((a, b) => a.i - b.i);
  };

  if (args.includes('--ratings')) {
    let x = 99;
    const rnd = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
    const randomDeck = () => { const ids = [], seen = new Set(); while (ids.length < 8) { const c = LIST[(rnd() * LIST.length) | 0]; if (seen.has(c.char)) continue; seen.add(c.char); ids.push(c.id); } return ids; };
    const jobs = Array.from({ length: 3600 }, (_, k) => ({ decks: [randomDeck(), randomDeck()], seed: k + 1 }));
    const res = await run(jobs);
    const t = {};
    res.forEach((r, k) => { for (const s of [0, 1]) for (const id of jobs[k].decks[s]) { const v = (t[id] ||= [0, 0]); v[1]++; v[0] += r.winner === s ? 1 : r.winner == null ? 0.5 : 0; } });
    const out = Object.fromEntries(LIST.map((c) => [c.id, t[c.id] ? Math.round((1000 * t[c.id][0]) / t[c.id][1]) / 10 : 50]));
    fs.writeFileSync(new URL('../engine/data/duel-ratings.js', import.meta.url), `// Each Champion's Duel win rate (%) in random Octaves, by \`node sim/archetypes.js --ratings\`.\n// The deck builder (engine/deckbuild.js) reads it.\nexport default ${JSON.stringify(out)};\n`);
    console.log('ratings written for', Object.keys(out).length, 'cards');
  }

  const { buildFor } = await import('../engine/deckbuild.js?' + Date.now());
  const full = LIST.map((c) => c.id);
  // the builder reads the live Bond tuning: rebuild every pass, as a player's builder would
  const LIVE = (await import('../engine/data/arch-tune.js')).default;
  let builds = [];
  const rebuild = () => {
    for (const k of Object.keys(LIVE)) delete LIVE[k];
    Object.assign(LIVE, tune);
    builds = ARCHETYPES.map((a) => ({ arch: a.id, ids: buildFor(full, CARDS, a.id) })).filter((b) => b.ids);
  };
  const robin = async () => {
    const jobs = [];
    let seed = 1;
    for (let a = 0; a < builds.length; a++) for (let b = a + 1; b < builds.length; b++) for (let k = 0; k < PER; k++) jobs.push({ a, b, decks: [builds[a].ids, builds[b].ids], seed: seed++ });
    const res = await run(jobs);
    const w = builds.map(() => [0, 0]);
    res.forEach((r, k) => { const j = jobs[k]; w[j.a][1]++; w[j.b][1]++; if (r.winner === 0) w[j.a][0]++; else if (r.winner === 1) w[j.b][0]++; else { w[j.a][0] += 0.5; w[j.b][0] += 0.5; } });
    return w.map(([x, n]) => (100 * x) / n);
  };
  let bestTune = null, bestDev = Infinity;
  for (let p = 0; p <= passes; p++) {
    if (p === passes && bestTune) tune = bestTune; // finish on the best state seen
    rebuild();
    const wr = await robin();
    const dev = Math.max(...wr.map((v) => Math.abs(v - 50)));
    if (dev < bestDev) (bestDev = dev), (bestTune = JSON.parse(JSON.stringify(tune)));
    const show = builds.map((b, i) => [b.arch, wr[i]]).sort((x, y) => y[1] - x[1]);
    console.log(`${p < passes ? `pass ${p + 1}` : 'RESULT'}: spread ${show.at(-1)[1].toFixed(1)}–${show[0][1].toFixed(1)}  ` + show.map(([a, v]) => `${a} ${v.toFixed(0)}${tune[a] ? `(${tune[a] > 0 ? '+' : ''}${tune[a]})` : ''}`).join(' · '));
    if (p === passes) break;
    // damped: only the three furthest from 50%, half a step each
    const far = builds.map((b, i) => ({ arch: b.arch, v: wr[i] })).filter((x) => Math.abs(x.v - 50) > 8).sort((x, y) => Math.abs(y.v - 50) - Math.abs(x.v - 50)).slice(0, 3);
    for (const { arch, v } of far) {
      const cur = tune[arch] || 0;
      const next = Math.max(-1, Math.min(1.5, cur + (v < 50 ? 0.5 : -0.5)));
      if (next) tune[arch] = next;
      else delete tune[arch];
    }
    fs.writeFileSync(tunePath, `// Per-archetype Bond adjustments, written by \`node sim/archetypes.js --tune\`.\nexport default ${JSON.stringify(tune)};\n`);
  }
  if (passes) fs.writeFileSync(tunePath, `// Per-archetype Bond adjustments, written by \`node sim/archetypes.js --tune\`.\nexport default ${JSON.stringify(tune)};\n`);
  // how different the builds are
  let pairs = 0, shared = 0, max = 0;
  for (let a = 0; a < builds.length; a++) for (let b = a + 1; b < builds.length; b++) {
    const s = builds[a].ids.filter((x) => builds[b].ids.includes(x)).length;
    pairs++, (shared += s), (max = Math.max(max, s));
  }
  console.log(`OVERLAP  builds from the full collection share ${(shared / pairs).toFixed(1)} of 8 Champions on average (most ${max})`);
  for (const b of builds) console.log(`  ${b.arch.padEnd(10)} ${b.ids.map((id) => `${id}${CARDS[id].rarity[0] === 'c' ? '' : '·' + CARDS[id].rarity[0].toUpperCase()}`).join(' ')}  bonds: ${bondsOf(b.ids, CARDS).map((x) => `${x.id}×${x.n}`).join(' ')}`);
}
