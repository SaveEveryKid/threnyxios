// Parallel runner for Reckoning simulations (worker_threads over all cores).
import { Worker } from 'node:worker_threads';
import os from 'node:os';

export async function parallel(task, N, seed, opts = {}) {
  const k = Math.max(1, Math.min(os.cpus().length, N));
  const per = Math.ceil(N / k);
  const jobs = [];
  for (let w = 0; w < k; w++) {
    const from = w * per, to = Math.min(N, from + per);
    if (from >= to) continue;
    jobs.push(new Promise((res, rej) => {
      const wk = new Worker(new URL('./rworker.js', import.meta.url), { workerData: { task, from, to, seed, opts } });
      wk.on('message', res);
      wk.on('error', rej);
    }));
  }
  const parts = await Promise.all(jobs);
  const out = { n: 0, cards: {}, pairs: {}, rounds: 0, falls: 0, hits: 0, voice: 0, orders: { strike: 0, guard: 0, scheme: 0 }, focus: 0, reads: 0, readsHit: 0, silence: 0, behind: 0, comeback: 0 };
  for (const p of parts) {
    out.n += p.n; out.rounds += p.rounds; out.falls += p.falls; out.hits += p.hits; out.voice += p.voice;
    for (const o in p.orders) out.orders[o] += p.orders[o];
    for (const k of ['focus', 'reads', 'readsHit', 'silence', 'behind', 'comeback']) out[k] += p[k];
    for (const [id, t] of Object.entries(p.cards)) {
      const o = (out.cards[id] ||= [0, 0, 0, 0]);
      t.forEach((v, i) => (o[i] += v));
    }
    for (const [key, t] of Object.entries(p.pairs)) {
      const o = (out.pairs[key] ||= [0, 0]);
      o[0] += t[0]; o[1] += t[1];
    }
  }
  return out;
}
