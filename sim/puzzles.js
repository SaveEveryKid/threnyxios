// Finds each day's Duel puzzle ahead of time, so a phone builds only the
// attempt that works (engine/dailies.js). node sim/puzzles.js [days=400] [from=today]
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs';
import os from 'node:os';

if (!isMainThread) {
  const { puzzleAttempt } = await import('../engine/dailies.js');
  const out = {};
  for (const day of workerData.days) {
    for (let k = 0; k < 400; k++) if (puzzleAttempt(day, k)) { out[day] = k; break; }
  }
  parentPort.postMessage(out);
} else {
  const n = +(process.argv[2] || 400);
  const from = +(process.argv[3] || Math.floor(Date.now() / 86400000));
  const days = Array.from({ length: n }, (_, i) => from + i);
  const W = Math.max(1, Math.min(8, os.cpus().length));
  const chunks = Array.from({ length: W }, (_, w) => days.filter((_, i) => i % W === w));
  const res = Object.assign({}, ...(await Promise.all(chunks.map((c) => new Promise((ok, bad) => { const w = new Worker(new URL(import.meta.url), { workerData: { days: c } }); w.on('message', ok); w.on('error', bad); })))));
  const path = new URL('../engine/data/puzzle-days.js', import.meta.url);
  const old = (await import('../engine/data/puzzle-days.js')).default;
  const all = Object.fromEntries(Object.entries({ ...old, ...res }).sort((a, b) => a[0] - b[0]));
  fs.writeFileSync(path, `// Which attempt makes each day's Duel puzzle (engine/dailies.js), found by \`node sim/puzzles.js\`.\nexport default ${JSON.stringify(all)};\n`);
  console.log(`puzzles found for ${Object.keys(res).length} of ${n} days`);
}
