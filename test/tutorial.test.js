import test from 'node:test';
import assert from 'node:assert/strict';
import { prove } from '../sim/tutorial-proof.js';

test('following the coach wins every training battle', () => {
  const { fails, report } = prove(400, () => {});
  assert.equal(fails, 0, JSON.stringify(report));
});
