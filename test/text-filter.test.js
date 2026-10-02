import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textProblem } from '../engine/text-filter.js';

test('blocks swearing, slurs and sexual words, however they are spelled', () => {
  for (const t of ['fuck off', 'F U C K', 'fuuuuck', 'sh1t lords', 'a$$ kickers', 'Bitches', 'Big Ass Club', 'sexy squad', 'n1gga', 'motherfuckers', 'fück this']) assert.ok(textProblem(t), t);
});
test('blocks contact details', () => {
  for (const t of ['add me on snapchat', 'discord kings', 'www.site.com', 'visit site . com', 'call 555-123-4567', '@myhandle']) assert.ok(textProblem(t), t);
});
test('lets ordinary names through (no Scunthorpe problems for these)', () => {
  for (const t of ['Bellwardens', 'Class of Steel', 'Cockatoo Knights', 'Sussex Squad', 'Grapes of Wrath', 'Charge!', 'Est. 1999', 'This hit hard', 'Canal Watch', 'Analysis Guild', 'Bastion of Hope', 'Add steel to the fire', 'Glass Assassins', 'Torpedo Bay', 'Scrap Heap', 'Café Knights', '']) assert.equal(textProblem(t), null, t);
});
