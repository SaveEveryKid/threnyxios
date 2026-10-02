// Ability text in Duel words. The kit's rules text is generated from the same
// data the Duel plays (engine/kitdsl.js), then its Order and lane words are
// translated to what they mean in a duel (engine/duel.js `cond`/`runOps`).
import { kitText } from '../../../engine/kitdsl.js';

const SWAPS = [
  [/when using STRIKE/g, 'when Leading'],
  [/when using GUARD/g, 'when Answering'],
  [/when using SCHEME/g, ''],
  [/when using its lowest printed Order/g, 'when it is the weaker Champion in the duel'],
  [/when using its highest printed Order/g, 'when it is the stronger Champion in the duel'],
  [/can't use GUARD/g, 'loses 2 Guard'],
  [/can't use STRIKE/g, 'loses 2 Strike'],
  [/can't use SCHEME/g, 'deals no Voice damage'],
  [/can't use its highest printed Order/g, 'loses 2 Power'],
  [/can't use its lowest printed Order/g, 'loses 2 Power'],
  [/(T|t)he enemy opposite/g, '$1he enemy it duels'],
  [/(T|t)he Champion opposite/g, '$1he Champion it duels'],
  [/this round/g, 'this duel'],
  [/from round (\d)/g, 'from duel $1'],
  [/End of round/g, 'After its duel'],
  [/Champions beside this/g, 'your Champions still to fight'],
  [/your Champions beside this/g, 'your Champions still to fight'],
  [/move this Champion to an empty lane/g, 'this Champion returns to your hand'],
  [/Reveal (\d|a) (random )?cards? in your opponent's hand/g, 'gain a READ'],
  [/If your READ here is correct/g, 'When you use a READ'],
  [/If your READ here misses/g, 'When you use a READ'],
  [/READs against this Champion always miss/g, 'Your opponent can’t READ against this Champion'],
  [/you hold Initiative/g, 'you are Leading'],
  [/your opponent READs/g, 'your opponent uses a READ'],
  [/\bSCHEME\b/g, 'Wound'],
  [/\bScheme\b/g, 'Wound'],
  [/\bSTRIKE\b/g, 'Strike'],
  [/\bGUARD\b/g, 'Guard'],
  [/ {2,}/g, ' '],
  [/ ([.,;])/g, '$1'],
];

export function duelText(card) {
  let t = kitText(card.kit) || '';
  for (const [a, b] of SWAPS) t = t.replace(a, b);
  return t.trim();
}

/** The short version for a chip: the ability's name and its first clause. */
export function duelShort(card) {
  const t = duelText(card);
  if (!t) return '';
  const first = t.split(/(?<=\.)\s/)[0];
  return first.length > 90 ? first.slice(0, 88) + '…' : first;
}
