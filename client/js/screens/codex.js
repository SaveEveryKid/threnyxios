// CODEX — lore unlocks. Documents that disagree with each other, on purpose.
import * as store from '../core/store.js';
import { esc } from '../ui/card.js';
import { LIST } from '../../../engine/cards/index.js';

// unlock: a Story chapter number, or { faction, n }: own n of that faction's Champions.
export const ENTRIES = [
  { id: 'seats', title: 'The Five Seats', unlock: 0, text: 'Five powers signed the Accord and five powers still Clash under it. The Ashen Crown mourns in Cinderhold. The Quiet judge in the Stillhouse at Coda. The Hourwrights sell time in Carillon. The Margin lives on scaffolds at the edge of the Blank. The Vigil sings through every Hush in Lanternfast. Every one of them wants the star.' },
  { id: 'f-crown', title: 'The Ashen Crown', unlock: { faction: 'crown', n: 4 }, text: '“Duty outlives the realm.” Cinderhold is a fortress of black glass, fused from the burning of Solenne. For twenty-one years the court has mourned: every night the Ashen Choir reads the Roll of the Fallen aloud, and every morning the courtiers wear fresh ash across the mouth. Half the court wants the empire back, by Clash if possible and by the Fork if not. The other half wants it left to rest.' },
  { id: 'f-quiet', title: 'The Quiet', unlock: { faction: 'quiet', n: 4 }, text: '“Judgment is silent.” The Stillhouse at Coda is a hall of black stone where no footstep makes a sound. Its judges take vows of silence in stages: a year, a decade, a life. They wear bells with the clappers removed. Only the Arbiter-Primus may speak, and only one word per Clash of record: the verdict. They are supposed to be neutral. Everyone says so.' },
  { id: 'f-hour', title: 'The Hourwrights', unlock: { faction: 'hour', n: 4 }, text: '“Everything has a price. Especially time.” Carillon is a canal city of ten thousand bells, each tuned to an hour sold out of someone’s life. The Guildmasters say time is property. The Unwound, freed hour-debtors, smash the tolling bells at night and give the years back to whoever they belonged to.' },
  { id: 'f-margin', title: 'The Margin', unlock: { faction: 'margin', n: 4 }, text: '“What is forgotten is free.” Scrawl, Rulings, Last Legible: scaffold-towns hung over the white fog at the edge of the Blank, lit by violet lamps, the only light that works there. Nobody in the Margin has a family name, because names can be stolen. Maps are sacred, and illegal. The half-erased are treated as holy, or as warnings.' },
  { id: 'f-vigil', title: 'The Vigil', unlock: { faction: 'vigil', n: 4 }, text: '“Sing, so the Voice is not alone.” Lanternfast is a lighthouse-spiral city that has not been dark for a hundred and twenty years. Its faithful paint eyes on their eyelids and sing through every Hush. Since the Unended Night, when the prophesied end did not come, the Cantors have ruled, and the Cantors would burn the Margin to end the Hush.' },
  { id: 'accord', title: 'The Accord of the Octave', unlock: 0, text: 'No army shall be raised in the Meridian, nor siege laid, nor city put to the torch. Every dispute — of land, of debt, of blood, of succession — shall be settled by Clash of Octaves, eight Champions to a side, until one side’s Voice falls silent. No Clash shall be fought in the Hush. A thing that falls from the sky belongs to the Meridian, until claimed by Clash. Sealed by eight hands. Seven signatories are recorded.' },
  { id: 'hush', title: 'The Hush', unlock: 0, text: 'Every night at midnight the world falls silent. One second, a hundred and twenty years ago. Thirty minutes on the Unended Night. Forty-one minutes the year the star fell. It grows faster after a note is removed from the song.' },
  { id: 'proclamation', title: 'Proclamation of the Regent', unlock: 1, text: 'Let it be known that the city of the North, whose name is struck from the rolls, did build in secret an engine to unsing Solenne; that the Crown, in defence of all peoples, did strike first; and that the fire which took our capital was the act of saboteurs within the Vigil.' },
  { id: 'ledger', title: 'The Ledger Page', unlock: 3, text: 'Account 11-A. Commission: the Stilling Engine. Client: the Choir-Throne. Order to strike signed by H.I.M. Maelis Vantaine. Dated the 9th of Last Frost. (Solenne burned on the 8th. The Empress vanished on the 8th.)' },
  { id: 'sermon', title: 'The Sermon of the Wrong Note', unlock: 5, text: 'The twelfth city sang a false note. We know this because the Voice removed it. The Fork was not a weapon; it was a tuning. The fire was the Voice\'s grief at having to do it. — High Cantor Absolom Reyne' },
  { id: 'smudge', title: 'Testimony of Sister Smudge', unlock: 6, text: 'They weren\'t taken. They left. The city sang its own name backwards and walked out of the song so the Empress could never have it. Only the King stayed, to remember. And then he forgot too, a little. That\'s what staying costs.' },
  { id: 'grael', title: 'A Prophecy of Grael', unlock: 7, text: '"The ——— will fall and the ——— will remember. The ——— who struck it wears a ——— crown. Ask the ——— in the portrait."' },
  { id: 'castor', title: 'Measurements of Castor Vey', unlock: 8, text: 'Tines I and II resonate at 211.7 and 317.6. Their interval implies a third at 423.4. Something within two hundred miles of Solenne is still humming at 423.4.' },
  { id: 'iris', title: 'A Forger\'s Practice Draft', unlock: 9, text: 'To the Commander of the Northern Lines, in the Crown cipher: the city will strike at dawn. Do not wait for Her Majesty. — (in the margin, in Iris Vellum\'s hand:) Carillon paper. Client paid in bells.' },
  { id: 'roll', title: 'The Roll of the Fallen, page 1,412', unlock: 10, text: 'Eleven names in Lady Seraphine\'s handwriting that she does not remember writing, all sharing a family name nobody recognises. The page is water-stained, as if someone cried on it the night it was written.' },
];

const FNAME = { crown: 'Ashen Crown', quiet: 'Quiet', hour: 'Hourwrights', margin: 'Margin', vigil: 'Vigil' };

export function isOpen(e, s = store.get()) {
  if (typeof e.unlock === 'number') return e.unlock <= s.story.chapter;
  const have = LIST.filter((c) => c.faction === e.unlock.faction && (s.profile.copies[c.id] || []).length).length;
  return have >= e.unlock.n;
}
export const openEntries = (s = store.get()) => ENTRIES.filter((e) => isOpen(e, s));
const how = (e) => (typeof e.unlock === 'number' ? `Unlocked by Story Chapter ${e.unlock}.` : `Own ${e.unlock.n} ${FNAME[e.unlock.faction]} Champions to unseal.`);

export function render(root) {
  const s = store.get();
  const seen = new Set(s.codexSeen || []);
  root.innerHTML = `<div class="kicker">Codex · ${openEntries(s).length} / ${ENTRIES.length}</div><div class="h1">What Happened?</div>
    <div class="lore" style="margin:4px 0 14px">The documents of Threnyx. They do not agree.</div>
    <div class="stack">${ENTRIES.map((e) => (isOpen(e, s) ? `<div class="codex-entry panel"><h3>${esc(e.title)}${seen.has(e.id) ? '' : ' <span class="tag tag--new">New</span>'}</h3><p>${esc(e.text)}</p></div>` : `<div class="codex-entry panel" style="opacity:.45"><h3>Sealed</h3><p>${how(e)}</p></div>`)).join('')}</div>`;
  store.update((st) => (st.codexSeen = openEntries(st).map((e) => e.id)));
}
