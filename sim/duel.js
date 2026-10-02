// Duel proofs: node sim/duel.js [games-per-pair] [--tune N] [--rules '{"voice":22}']
//   match length (and minutes at ~22 s a duel + 25 s around the match), first
//   Lead's edge, comebacks, how often the last duel decides it, skill gaps,
//   the 12 archetype Octaves round robin, per-card win rates in random Octaves.
//   --tune N: N passes nudging outlier cards one step, written to
//   engine/data/duel-tune.js.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs';
import os from 'node:os';

const DECKS = {
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

if (!isMainThread) {
  const { createDuel } = await import('../engine/duel.js');
  const { makeDuelAI, playOut } = await import('../engine/duel-ai.js');
  const TUNE = (await import('../engine/data/duel-tune.js')).default;
  for (const k of Object.keys(TUNE)) delete TUNE[k];
  Object.assign(TUNE, workerData.tune);
  const { makeRng } = await import('../engine/rng.js');
  const out = [];
  for (const j of workerData.jobs) {
    const rand = makeRng(j.seed * 31 + 7);
    const st = createDuel(j.decks, { seed: j.seed, rules: workerData.rules, lead: j.seed % 2 });
    const firstLead = st.lead;
    playOut(st, [makeDuelAI({ skill: j.skill[0], rand }), makeDuelAI({ skill: j.skill[1], rand })]);
    const h = st.history;
    const at4 = h[3]?.voice;
    const behind4 = at4 && Math.abs(at4[0] - at4[1]) >= 5 ? (at4[0] < at4[1] ? 0 : 1) : null;
    const pre = h.length >= 2 ? h[h.length - 2].voice : null; // before the final duel
    const leaderBeforeFinal = pre && pre[0] !== pre[1] ? (pre[0] > pre[1] ? 0 : 1) : null;
    const leadDuelWins = h.filter((x) => x.result?.winner === x.lead).length, decided = h.filter((x) => x.result?.winner != null).length;
    out.push({ ...j, winner: st.winner, duels: h.length, firstLead, behind4, leaderBeforeFinal, reachedFinal: h.length >= st.rules.duels, leadDuelWins, decided, reads: h.filter((x) => x.read).length, used: st.sides.map((s) => Object.keys(s.used).length + s.fallen.length) });
  }
  parentPort.postMessage(out);
} else {
  const { LIST, CARDS } = await import('../engine/cards/index.js');
  const args = process.argv.slice(2);
  const PER = +(args.find((a) => /^\d+$/.test(a)) || 16);
  const ti = args.indexOf('--tune');
  const tunePasses = ti >= 0 ? +args[ti + 1] : 0;
  const ri = args.indexOf('--rules');
  const rules = ri >= 0 ? JSON.parse(args[ri + 1]) : {};
  const tunePath = new URL('../engine/data/duel-tune.js', import.meta.url);
  let tune = (await import('../engine/data/duel-tune.js')).default;
  tune = JSON.parse(JSON.stringify(tune));
  const W = Math.max(1, Math.min(8, os.cpus().length));
  const run = async (jobs) => {
    const chunks = Array.from({ length: W }, () => []);
    jobs.forEach((j, i) => chunks[i % W].push(j));
    return (await Promise.all(chunks.map((c) => new Promise((ok, bad) => { const w = new Worker(new URL(import.meta.url), { workerData: { jobs: c, tune, rules } }); w.on('message', ok); w.on('error', bad); })))).flat();
  };
  let seedN = 1;
  const rng = ((s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296))(11);
  const randomDeck = () => { const ids = [], seen = new Set(); while (ids.length < 8) { const c = LIST[(rng() * LIST.length) | 0]; if (seen.has(c.char)) continue; seen.add(c.char); ids.push(c.id); } return ids; };
  const cardRates = (res) => {
    const t = {};
    for (const r of res) for (const s of [0, 1]) for (const id of r.decks[s]) { const x = (t[id] ||= [0, 0]); x[1]++; x[0] += r.winner === s ? 1 : r.winner == null ? 0.5 : 0; }
    return Object.fromEntries(Object.entries(t).map(([id, [w, n]]) => [id, (100 * w) / n]));
  };
  // --tune: nudge outliers, a step at a time
  for (let p = 0; p < tunePasses; p++) {
    const res = await run(Array.from({ length: 2400 }, () => ({ decks: [randomDeck(), randomDeck()], seed: seedN++, skill: [1, 1] })));
    const wr = cardRates(res);
    const vals = Object.values(wr), sd = Math.sqrt(vals.reduce((a, v) => a + (v - 50) ** 2, 0) / vals.length);
    console.log(`tune pass ${p + 1}: card sd ${sd.toFixed(1)}, within 44-56 ${vals.filter((v) => Math.abs(v - 50) <= 6).length}/${vals.length}`);
    for (const [id, w] of Object.entries(wr)) {
      if (Math.abs(w - 50) <= 4) continue;
      const o = (tune[id] ||= {}), c = CARDS[id];
      const cur = (k) => c.stats[k] + (o[k] || 0);
      const down = w > 50;
      // Strike and Guard stay as printed (they set the Lead/Answer balance):
      // a card is tuned through its Scheme (what a win is worth) and Health (how long it lasts)
      const k = Math.abs(w - 50) > 9 || (down ? cur('scheme') <= 2 : cur('scheme') >= 7) ? 'hp' : 'scheme';
      let moved = false;
      if (k === 'hp') { const nh = c.hp + (o.hp || 0) + (down ? -2 : 2); if (nh >= 2 && nh <= 14) (o.hp = (o.hp || 0) + (down ? -2 : 2)), (moved = true); }
      else (o.scheme = (o.scheme || 0) + (down ? -1 : 1)), (moved = true);
      // last resort for a far outlier with Health at its limit: its best (or worst) fighting stat, one step
      if (!moved && Math.abs(w - 50) > 9 && !o.strike) {
        // both together and once only, so Leading and Answering stay as even as they were
        for (const f of ['strike', 'guard']) o[f] = down ? -1 : 1;
      }
      if (!Object.values(o).some(Boolean)) delete tune[id];
    }
    fs.writeFileSync(tunePath, `// Duel tuning: per-card adjustments to Strike/Guard/Scheme/Health for the Duel,\n// written by sim/duel.js --tune (the printed card numbers stay the source).\nexport default ${JSON.stringify(tune, null, 1)};\n`);
  }
  // ---- the proofs
  const names = Object.keys(DECKS);
  const jobs = [];
  for (let a = 0; a < names.length; a++) for (let b = a + 1; b < names.length; b++) for (let k = 0; k < PER; k++) jobs.push({ kind: 'rr', a: names[a], b: names[b], decks: k % 2 ? [DECKS[names[b]], DECKS[names[a]]] : [DECKS[names[a]], DECKS[names[b]]], sw: k % 2 === 1, seed: seedN++, skill: [1, 1] });
  for (let k = 0; k < 400; k++) jobs.push({ kind: 'mid', decks: [randomDeck(), randomDeck()], seed: seedN++, skill: k % 2 ? [0.5, 1] : [1, 0.5] });
  for (let k = 0; k < 400; k++) jobs.push({ kind: 'new', decks: [randomDeck(), randomDeck()], seed: seedN++, skill: k % 2 ? [0, 1] : [1, 0] });
  for (let k = 0; k < 2400; k++) jobs.push({ kind: 'rand', decks: [randomDeck(), randomDeck()], seed: seedN++, skill: [1, 1] });
  const t0 = Date.now();
  const res = await run(jobs);
  const exp = res.filter((r) => r.kind === 'rr' || r.kind === 'rand');
  const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const pct = (n, d) => +(100 * n / Math.max(1, d)).toFixed(1);
  const duels = avg(exp.map((r) => r.duels));
  const earlyEnd = pct(exp.filter((r) => !r.reachedFinal).length, exp.length);
  const firstLeadWins = pct(exp.filter((r) => r.winner === r.firstLead).length, exp.filter((r) => r.winner != null).length);
  const leadDuel = pct(exp.reduce((a, r) => a + r.leadDuelWins, 0), exp.reduce((a, r) => a + r.decided, 0));
  const cbN = exp.filter((r) => r.behind4 != null);
  const comeback = pct(cbN.filter((r) => r.winner === r.behind4).length, cbN.length);
  const fin = exp.filter((r) => r.reachedFinal && r.leaderBeforeFinal != null);
  const finalFlip = pct(fin.filter((r) => r.winner !== r.leaderBeforeFinal).length, fin.length);
  const closeShare = pct(exp.filter((r) => r.reachedFinal).length, exp.length);
  const skillRate = (kind, hi) => { const r = res.filter((x) => x.kind === kind); return pct(r.filter((x) => x.winner != null && x.skill[x.winner] === hi).length, r.length); };
  const wr = Object.fromEntries(names.map((n) => [n, [0, 0]]));
  for (const r of res.filter((x) => x.kind === 'rr')) {
    const [s0, s1] = r.sw ? [r.b, r.a] : [r.a, r.b];
    wr[s0][1]++; wr[s1][1]++;
    if (r.winner === 0) wr[s0][0]++; else if (r.winner === 1) wr[s1][0]++; else (wr[s0][0] += 0.5), (wr[s1][0] += 0.5);
  }
  const arche = Object.fromEntries(Object.entries(wr).map(([k, [w, n]]) => [k, +(100 * w / n).toFixed(1)]).sort((a, b) => b[1] - a[1]));
  const cr = Object.values(cardRates(res.filter((r) => r.kind === 'rand')));
  const csd = Math.sqrt(avg(cr.map((v) => (v - 50) ** 2)));
  const mins = (duels * 22 + 25) / 60;
  console.log(`${res.length} matches in ${((Date.now() - t0) / 1000).toFixed(0)}s  rules ${JSON.stringify(rules)}  tuned cards ${Object.keys(tune).length}`);
  console.log(`LENGTH   ${duels.toFixed(1)} duels ≈ ${mins.toFixed(1)} min · ${earlyEnd}% end before the final duel`);
  console.log(`FAIRNESS first Lead wins ${firstLeadWins}% · the Lead wins its duel ${leadDuel}%`);
  console.log(`DRAMA    comeback from 5+ down after duel 4: ${comeback}% · reach the final duel ${closeShare}% · final duel flips the leader ${finalFlip}%`);
  console.log(`SKILL    expert vs decent ${skillRate('mid', 1)}% · expert vs beginner ${skillRate('new', 1)}% · READ switches ${avg(exp.map((r) => r.reads)).toFixed(2)}/match`);
  console.log(`DECKS    ${Math.min(...Object.values(arche))}–${Math.max(...Object.values(arche))} ${JSON.stringify(arche)}`);
  console.log(`CARDS    win-rate sd ${csd.toFixed(1)} · within 44-56: ${cr.filter((v) => Math.abs(v - 50) <= 6).length}/${cr.length} · Champions used per match ${avg(exp.map((r) => (r.used[0] + r.used[1]) / 2)).toFixed(1)}/8`);
}
