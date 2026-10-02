// Spoils odds, card history, and history surviving a trade.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newProfile, grant, rollSpoils, spoilsOdds, SPOILS_ODDS, addHistory, executeTrade, HISTORY_MAX } from '../engine/collection.js';
import { LIST } from '../engine/cards/index.js';

test('published Spoils odds sum to 1 and mythic is about 1 in 3,300', () => {
  const sum = Object.values(SPOILS_ODDS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.equal(SPOILS_ODDS.mythic, 0.0003);
  const b = spoilsOdds(1);
  assert.ok(Math.abs(Object.values(b).reduce((a, x) => a + x, 0) - 1) < 1e-9);
  assert.ok(Math.abs(b.mythic - 0.0006) < 1e-12); // the best boost only doubles it
});

test('Spoils rolls land near the published odds', () => {
  let p = newProfile('You');
  const rng = { seed: 12345 };
  const n = {};
  const N = 20000;
  for (let i = 0; i < N; i++) {
    const r = rollSpoils(p, LIST, rng, { origin: 'test' });
    n[r.rarity] = (n[r.rarity] || 0) + 1;
    if (i % 500 === 0) p = newProfile('You'); // keep the profile small
  }
  assert.ok(Math.abs(n.common / N - 0.74) < 0.02, `common ${n.common / N}`);
  assert.ok(Math.abs(n.rare / N - 0.21) < 0.02, `rare ${n.rare / N}`);
  assert.ok((n.mythic || 0) / N < 0.003, `mythic ${n.mythic / N}`);
});

test('a copy carries its history, including through a trade', () => {
  const a = newProfile('Ana', 0);
  const b = newProfile('Bo', 0);
  const c = grant(a, 'hadric', { now: 0, origin: 'Taken as Spoils from Marrow.' });
  addHistory(a, c, 'Felled 3 Champions against Kess.');
  const { b: b2 } = executeTrade(a, b, [c], []);
  const h = b2.items[c].history.map((x) => x.text);
  assert.deepEqual(h, ['Taken as Spoils from Marrow.', 'Felled 3 Champions against Kess.', 'Traded from Ana to Bo.']);
  for (let i = 0; i < 100; i++) addHistory(b2, c, 'x' + i);
  assert.equal(b2.items[c].history.length, HISTORY_MAX);
  assert.equal(b2.items[c].history[0].text, 'Taken as Spoils from Marrow.'); // origin is never dropped
});
