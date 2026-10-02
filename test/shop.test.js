import test from 'node:test';
import assert from 'node:assert/strict';
import { newProfile } from '../engine/collection.js';
import { OFFERS, PRODUCTS, buyWithChimes, grantProduct } from '../engine/shop.js';
import fs from 'node:fs';

test('Chimes buy packs; paid products grant what they say', () => {
  const p = newProfile('T', Date.now());
  assert.equal(buyWithChimes(p, 'collector1'), false, 'no Chimes');
  grantProduct(p, 'chimes1100');
  assert.equal(p.chimes, 1100);
  assert.ok(buyWithChimes(p, 'collector1'));
  assert.equal(p.chimes, 820);
  assert.equal(p.tickets.collector, 1);
  grantProduct(p, 'starter');
  assert.equal(p.tickets.collector, 4);
  assert.equal(p.tickets.standard, 10);
  assert.ok(p.copies.aurelle.some((c) => p.items[c].treatment === 'altart'));
});

test('the server price list matches the shop', () => {
  const src = fs.readFileSync(new URL('../supabase/functions/create-checkout/index.ts', import.meta.url), 'utf8');
  for (const p of PRODUCTS) {
    const sold = new RegExp(`\\n\\s*${p.id}: \\{ name: '[^']+', cents: ${p.cents}`);
    if (p.hidden) assert.doesNotMatch(src, sold, `${p.id} is off sale in the shop, so the server mustn't sell it`);
    else assert.match(src, sold, p.id);
  }
  assert.ok(OFFERS.every((o) => o.chimes > 0));
});
