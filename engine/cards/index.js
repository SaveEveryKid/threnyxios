// The Firstfall set: 120 Champions. Card data is authored per faction; this
// module normalises it and validates set-wide invariants.
import crown from './crown.js';
import quiet from './quiet.js';
import hour from './hour.js';
import margin from './margin.js';
import vigil from './vigil.js';
import RECKONING from './reckoning.js';
import UNIQUE from './unique.js';
import { setKitNames, kitText, compileKit } from '../kitdsl.js';

const RAW = { crown, quiet, hour, margin, vigil };
export const FACTIONS = ['crown', 'quiet', 'hour', 'margin', 'vigil'];
export const RARITIES = ['common', 'rare', 'epic', 'legendary', 'mythic'];

export const CARDS = {};
export const LIST = [];
for (const faction of FACTIONS) {
  RAW[faction].forEach((c, i) => {
    const card = {
      ...c,
      faction,
      char: c.char || c.id,
      set: 'firstfall',
      no: LIST.length + 1,
    };
    const R = RECKONING[c.id];
    if (!R) throw new Error('No Reckoning data for ' + c.id);
    card.stats = { strike: R.r[0], guard: R.r[1], scheme: R.r[2] };
    card.hp = R.r[3];
    card.kit = R.kit;
    card.abilityName = R.kit?.name || c.ab?.name || '';
    if (CARDS[card.id]) throw new Error('Duplicate card id ' + card.id);
    CARDS[card.id] = card;
    LIST.push(card);
  });
}
// One-of-ones: in CARDS, never in LIST (see unique.js).
export const UNIQUE_IDS = new Set();
for (const u of UNIQUE) {
  if (CARDS[u.id]) throw new Error('Duplicate card id ' + u.id);
  const { r, ...c } = u;
  CARDS[u.id] = { ...c, char: c.char || c.id, set: 'firstfall', no: 0, unique: true, stats: { strike: r[0], guard: r[1], scheme: r[2] }, hp: r[3], abilityName: c.kit.name };
  UNIQUE_IDS.add(u.id);
}
setKitNames((id) => CARDS[id]?.name || id);
for (const id of Object.keys(RECKONING)) if (!CARDS[id]) throw new Error('Reckoning data for unknown card ' + id);

// Rules text for a card (generated from its kit, so it can't drift from the rules).
export function cardText(card) {
  return kitText(card.kit);
}

export function validateSet() {
  const errors = [];
  const count = {};
  for (const c of LIST) {
    for (const o of ['strike', 'guard', 'scheme']) if (c.stats[o] < 1 || c.stats[o] > 9) errors.push(`${c.id}: ${o} ${c.stats[o]} outside 1-9`);
    if (c.hp < 2 || c.hp > 12) errors.push(`${c.id}: health ${c.hp} outside 2-12`);
    try {
      compileKit(c.kit || {});
      kitText(c.kit);
    } catch (e) {
      errors.push(`${c.id}: kit: ${e.message}`);
    }
    if (!RARITIES.includes(c.rarity)) errors.push(`${c.id}: bad rarity`);
    const k = c.faction + ':' + c.rarity;
    count[k] = (count[k] || 0) + 1;
  }
  const want = { common: 8, rare: 7, epic: 5, legendary: 3, mythic: 1 };
  for (const f of FACTIONS) for (const r of RARITIES) if ((count[f + ':' + r] || 0) !== want[r]) errors.push(`${f} has ${count[f + ':' + r] || 0} ${r} (want ${want[r]})`);
  return errors;
}
