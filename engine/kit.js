// Ability kits for the Reckoning. A card's `kit` is declarative data compiled
// into hook functions the battle engine calls (reveal, power, aura, hit, voice,
// fall, allyFall, enemyFall, roundEnd, readHit, readMiss) plus static flags.
// The same data generates the card's rules text.

const cache = new WeakMap();
let compiler = null;

export function setKitCompiler(fn) {
  compiler = fn;
}

export function kitOf(card) {
  if (!card || !card.kit) return null;
  let k = cache.get(card);
  if (k === undefined) {
    k = compiler ? compiler(card.kit, card) : null;
    cache.set(card, k);
  }
  return k;
}
