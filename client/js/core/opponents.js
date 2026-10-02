// The game's duelists' Octaves. Each one plays a style (engine/archetypes.js)
// from its own faction, built by the same deck builder players use
// (engine/deckbuild.js), with the rarest cards it may use set by how good it is:
// the first rungs of the Ladder bring commons, the Archivist brings everything.
import * as store from './store.js';
import { CARDS } from '../../../engine/cards/index.js';
import { buildFor } from '../../../engine/deckbuild.js';
import { archetypesOf } from '../../../engine/archetypes.js';

// each Ladder duelist's style
const STYLE = { marrow: 'unsung', kess: 'momentum', quince: 'sleepless', tallowjack: 'court', vesper: 'silencers', hale: 'knights', archivist: 'readers' };
const CAP = (skill) => (skill < 0.4 ? ['common'] : skill < 0.6 ? ['common', 'rare'] : skill < 0.8 ? ['common', 'rare', 'epic'] : null);

const cache = new Map();
export function personaOctave(p) {
  const key = p.id + ':' + (p.skill ?? '');
  if (cache.has(key)) return cache.get(key).slice();
  const cap = CAP(p.skill ?? 0.6);
  const style = p.style || STYLE[p.id] || null;
  const all = Object.values(CARDS).filter((c) => !c.unique && (!cap || cap.includes(c.rarity)));
  // their faction, plus their style from anywhere
  const pool = all.filter((c) => c.faction === p.faction || (style && archetypesOf(c).includes(style))).map((c) => c.id);
  let deck = (style && buildFor(pool, CARDS, style)) || buildFor(pool, CARDS) || buildFor(all.map((c) => c.id), CARDS);
  if (!deck) {
    // a tiny pool: the old way, five from their faction and three more
    const seed = [...p.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
    let x = seed || 1;
    const rnd = () => (x = (x * 1103515245 + 12345) >>> 0) / 4294967296;
    const fac = all.filter((c) => c.faction === p.faction).sort(() => rnd() - 0.5);
    const rest = all.filter((c) => c.faction !== p.faction).sort(() => rnd() - 0.5);
    deck = [...fac.slice(0, 5), ...rest.slice(0, 3)].map((c) => c.id);
  }
  cache.set(key, deck);
  return deck.slice();
}

export function ladderSpec(persona) {
  const s = store.get();
  const mine = s.octaves[s.active].cards;
  return { mode: 'ladder', mine, theirs: personaOctave(persona), persona, title: persona.name, sub: persona.title };
}
