// Tunes the Expert's value weights: each variant plays the current default in
// a seat-alternating mirror on generated Octaves. Usage:
//   node sim/aitune.js <N> '<weightsJSON>'   -> win % of the variant
import { runPair } from './reckon.js';
import { makeExpert } from '../engine/battle-ai.js';
const N = +(process.argv[2] || 400);
const weights = JSON.parse(process.argv[3] || '{}');
const extra = JSON.parse(process.argv[4] || '{}'); // agent options (exploit, focusBar...)
const rules = JSON.parse(process.argv[5] || '{}');
const r = runPair((cards, rand) => [makeExpert({ cards, rand, weights, ...extra }), makeExpert({ cards, rand })], N, rules, {}, 17);
console.log(JSON.stringify({ weights, extra, win: r.winA }));
