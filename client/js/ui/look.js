// How YOUR copy of a card looks: its best finish (Immortal > Oktoberfest > Alt Art > Foil)
// and its Ascension tier. Spread into renderCard options for your own cards.
import * as store from '../core/store.js';

const RANK = { immortal: 4, oktober: 3, altart: 2, foil: 1, standard: 0 };

export function lookFor(id) {
  const p = store.get().profile;
  const copies = (p.copies[id] || []).map((c) => p.items[c]).filter(Boolean);
  const best = copies.sort((a, b) => (RANK[b.treatment] || 0) - (RANK[a.treatment] || 0))[0];
  return {
    ascension: p.ascension?.[id] || 0,
    treatment: best && best.treatment !== 'standard' ? best.treatment : null,
    serial: best?.serial ? String(best.serial).padStart(5, '0') + ' / 10000' : null,
  };
}
