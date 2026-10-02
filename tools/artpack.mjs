// Generates art/THRENYX_ART_MASTER.md: one self-contained master prompt that
// asks an image agent for EVERY image the game needs (all 120 Champions, their
// Immortals and cutouts, every screen, story, packs, avatars, bosses, icon)
// and to deliver them as one zip that drops straight into game/client/art/.
// Usage: node tools/artpack.mjs
import fs from 'node:fs';
import { LIST, CARDS } from '../engine/cards/index.js';
import { BRIEFS, IMMORTAL } from '../art/briefs.mjs';

const ROOT = 'threnyx-art';
const out = [];
const md = (s = '') => out.push(s);

// ---------------------------------------------------------------------------
// Canon blocks
// ---------------------------------------------------------------------------
const STYLE = `Painterly dark-fantasy illustration with the finish of a hand-painted oil on canvas: museum-grade, visible confident brushwork in the background, tight rendering on faces, hands and hero details. Cinematic chiaroscuro: most of the frame falls into deep shadow; light is rare and precious. A strong rim light separates the subject from the background. The silhouette must read as a clear black shape. Faces are specific, adult (unless a child is described) and characterful, never generic, doll-like or glossy. Tactile materials (burned iron, black glass, lacquer, verdigris brass, candle wax, paper, ink). Fine painted grain over the whole image. World motif: Threnyx is a world made of sound, so somewhere in the image faint concentric ripples move through the air like visible sound waves radiating from the main light source; subtle, never a special effect.`;

const FACTION = {
  crown: ['THE ASHEN CROWN', 'black volcanic glass (obsidian) armour and architecture, bone-white cloth, ember-red linings, grey ash always falling like snow, the burned imperial ruins of Solenne and the black-glass fortress of Cinderhold. Palette: ash grey, bone white, obsidian black, ember orange.'],
  quiet: ['THE QUIET', 'austere black stone and cold silver; clapperless bells worn on cords (bells with no tongue inside); vows of silence (sealed lips, linen over the mouth, wax seals); the silent city of Coda on the still lake called the Stillwater; geometric architecture, moonlight. Palette: black, cold silver, white, moon blue.'],
  hour: ['THE HOURWRIGHTS', 'the canal-city of Carillon: verdigris copper, polished brass, clockwork, gears and escapements, gas-lamps, bell-towers, steam; stolen "tolled hours" stored as glowing amber light in bell-jars and vials. Palette: verdigris green, brass gold, amber, soot black.'],
  margin: ['THE MARGIN', 'the Blank, a fog-field where the world is half-remembered: paper-white fog, ink-black shadows, violet lamps; rickety scaffold-towns (Scrawl) built over the fog; things half-drawn, with unfinished ink lines, and figures partly erased into blank paper. Palette: paper white, ink black, violet.'],
  vigil: ['THE VIGIL', 'Lanternfast, the city of lamps: midnight-indigo nights, candle-gold light, lanterns, censers and choirs, white-and-gold vestments, pilgrims who never sleep (bright, hollow, wakeful eyes). Palette: midnight indigo, candle gold, warm white.'],
};

const RARITY = {
  common: 'COMMON: an intimate, grounded moment; simple staging; one main light source.',
  rare: 'RARE: a confident character portrait with one striking, memorable detail.',
  epic: 'EPIC: dramatic staging, a strong secondary light, a richer environment.',
  legendary: "LEGENDARY: iconic, heroic staging in a grand environment; the character's defining moment; a subtle gold warmth in the light.",
  mythic: 'MYTHIC: the most spectacular image scale in the set; the character dominates the frame; god-rays and visible sound-rings; awe.',
};

const CARD_COMP = `Portrait 1024x1536. The game crops the art to 5:7 (removing about 50px at the top and bottom) and lays its own frame, name and stats over it, so:
- The focal point (the face) sits between 12% and 50% of the image height, horizontally near the centre.
- Keep 90px clear at the very top (no crown or weapon tips touching the edge) and keep the top-left and top-right 160x160px corners free of faces (badges sit there).
- The lower 45% will be covered by the name and stats: keep it darker and simpler (clothing, mist, ground). No important detail, face or hand there.
- Full bleed: the painting fills the whole canvas with no border, vignette frame or letterboxing.`;

const MYTHIC_COMP = `- CUTOUT-READY: the figure must be cleanly separable from the background (a clear rim-lit silhouette with no background element crossing in front of it), because a transparent cutout will be derived from this exact image. The head or crown may rise to within 60px of the top edge (the game lets Mythic figures break out of the frame), never touching it.`;

const BANS = `FORBIDDEN: any text, letters, numbers, runes that look like writing, logos, watermarks, signatures, UI, card frames, borders, stat boxes or panels. No modern objects, no firearms, no photographic or 3D-render look, no anime or cartoon style, no resemblance to existing franchises or real people. No extra fingers or limbs, no distorted anatomy (scars and burns that the subject describes are fine).`;

const UI_BANS = `FORBIDDEN: any text, letters, numbers, logos, watermarks, signatures, buttons or UI drawn into the image, frames, borders. No modern objects, no photographic or 3D-render look, no anime or cartoon style.`;

// ---------------------------------------------------------------------------
// Pull the 30 hand-written briefs from the original prompt pack
// ---------------------------------------------------------------------------
const old = fs.readFileSync(new URL('../art/THRENYX_ART_PROMPTS.md', import.meta.url), 'utf8');
const OLD = {};
for (const sec of old.split('\n### ').slice(1)) {
  const head = sec.split('\n')[0];
  if (/IMMORTAL|Style anchor/.test(head)) continue;
  const card = LIST.find((c) => head.includes(' — ' + c.name + ',') || head.includes(' — ' + c.name + ' ('));
  if (!card) continue;
  const block = sec.split('```')[1] || '';
  const lines = block.split('\n');
  const start = lines.findIndex((l) => l.startsWith('Subject:'));
  const end = lines.findIndex((l) => l.startsWith('No text'));
  if (start < 0) continue;
  OLD[card.id] = lines
    .slice(start, end < 0 ? undefined : end)
    .filter((l) => l.trim() && !l.startsWith('Composition:') && !l.startsWith('Palette:'))
    .join(' ')
    .replace(/^Subject:\s*/, '');
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------
const jobs = [];
let n = 0;
const id = () => 'J' + String(++n).padStart(3, '0');
const job = (o) => jobs.push({ id: id(), ...o });

// 1. style anchor
job({
  group: 'style',
  title: 'Style anchor: Aurelle Vantaine',
  file: '00_style/style_anchor.png',
  size: '1024x1536',
  prompt: `THRENYX style anchor. This image defines the look of the entire set; every later image must match its painting quality, lighting and grain.
STYLE: {STYLE}
FACTION LOOK: {LOOK:crown}
SUBJECT: ${OLD.aurelle || BRIEFS.aurelle}
COMPOSITION: {CARD-COMP}
{BANS}`,
});

// 2. 120 cards (+ cutouts for Mythics)
const ORDER = ['crown', 'quiet', 'hour', 'margin', 'vigil'];
const RO = { mythic: 0, legendary: 1, epic: 2, rare: 3, common: 4 };
const cards = LIST.slice().sort((a, b) => ORDER.indexOf(a.faction) - ORDER.indexOf(b.faction) || RO[a.rarity] - RO[b.rarity] || a.no - b.no);
for (const c of cards) {
  const brief = OLD[c.id] || BRIEFS[c.id];
  if (!brief) throw new Error('no brief for ' + c.id);
  const mythic = c.rarity === 'mythic';
  job({
    group: 'cards',
    card: c,
    title: `${c.name}, ${c.title} (${c.rarity.toUpperCase()}, ${FACTION[c.faction][0]})`,
    file: `cards/${c.id}.png`,
    size: '1024x1536',
    derived: mythic ? [`cutouts/${c.id}.png`] : [],
    prompt: `THRENYX Champion card illustration: ${c.name.toUpperCase()}, "${c.title}".
STYLE: {STYLE}
FACTION LOOK: {LOOK:${c.faction}}
RARITY: ${RARITY[c.rarity]}
SUBJECT: ${brief}
CHARACTER: ${c.cls} · ${c.alignment}${c.traits.length ? ' · ' + c.traits.join(', ') : ''}. ${c.bio.split('. ')[0]}.
MOOD LINE (for tone only; never write it in the image): "${c.flavor || '...'}"
COMPOSITION: {CARD-COMP}${mythic ? ' {MYTHIC-COMP}' : ''}
{BANS}`,
  });
}

// 3. Immortals (Mythic + Legendary)
const immortals = cards.filter((c) => c.rarity === 'mythic' || c.rarity === 'legendary');
for (const c of immortals) {
  const mythic = c.rarity === 'mythic';
  job({
    group: 'immortal',
    card: c,
    title: `IMMORTAL ${c.name}`,
    file: `immortal/${c.id}.png`,
    size: '1024x1536',
    derived: mythic ? [`immortal/${c.id}_cutout.png`] : [],
    prompt: `THRENYX IMMORTAL masterpiece card illustration: ${c.name.toUpperCase()}, "${c.title}". Immortals are the rarest, numbered prestige versions of a card: this must be the most beautiful image of this character, with gold-leaf accents painted into the highlights and luminous golden sound-rings in the air.
STYLE: {STYLE}
FACTION LOOK: {LOOK:${c.faction}}
CHARACTER CONSISTENCY: the same character (face, age, build, signature costume and props) as ${ROOT}/cards/${c.id}.png; use that approved image as the visual reference.
SUBJECT: ${IMMORTAL[c.id]}
COMPOSITION: {CARD-COMP}${mythic ? ' {MYTHIC-COMP}' : ''}
{BANS}`,
  });
}

// 4. Card back
job({
  group: 'cardback',
  title: 'Card back',
  file: 'cardback/cardback.png',
  size: '1024x1536',
  prompt: `THRENYX card back. Portrait 1024x1536, perfectly symmetrical left-right and top-bottom, premium and ornate, like an antique engraved object.
DESIGN: a deep black lacquered surface with fine engraved gold linework. In the exact centre, a circular emblem: a CLAPPERLESS BELL (a bell with no tongue inside) within concentric rings (sound waves), surrounded by eight small evenly spaced gold stars (an Octave). From the emblem, very fine concentric gold rings radiate across the whole back, fading toward the edges. Ornate gold filigree in all four corners and a thin double gold border inset 60px from the edge. The design must survive a 5:7 crop (about 50px removed top and bottom): keep all ornament at least 70px from the top and bottom edges.
STYLE: black lacquer, burnished and worn gold leaf, subtle painted grain, soft reflections.
{UI-BANS}`,
});

// 5. Packs
const PACKS = [
  ['standard', 'Standard Pack', 'deep black and dark-gold foil; on the front, painted art of a hooded figure silhouetted against a huge moon crossed by concentric sound-rings, framed by elegant gold linework; a small clapperless-bell emblem near the top'],
  ['collector', 'Collector Pack', 'iridescent holographic foil (black base with rainbow shimmer) and heavy white-gold seals; on the front, painted art of a golden crown with an empty glowing setting floating over clouds, concentric golden rings behind it, ornate white-gold filigree; a small eight-pointed star emblem'],
  ['firstfall', 'Firstfall Event Pack', 'midnight-indigo foil with gold seals; on the front, painted art of a single blazing star falling diagonally across a night sky into a field of white fog, golden concentric rings bursting from the impact'],
  ['crown', 'Ashen Crown Faction Pack', 'obsidian-black foil veined with ember-orange; on the front, a black-glass crown with a single ember burning in it, ash falling'],
  ['quiet', 'Quiet Faction Pack', 'matte black with cold silver foil; on the front, a silver clapperless bell hanging in perfect stillness over black water'],
  ['hour', 'Hourwright Faction Pack', 'verdigris-green and brass foil; on the front, a brass clock-bell with glowing amber hour-light spilling from it, gears behind'],
  ['margin', 'Margin Faction Pack', 'paper-white foil with ink-black and violet; on the front, a violet lamp on a scaffold above white fog, half the image dissolving into unfinished ink lines'],
  ['vigil', 'Vigil Faction Pack', 'midnight-indigo foil with candle-gold; on the front, a single lantern held up against a night sky full of stars, golden sound-rings rising from it'],
];
for (const [k, name, design] of PACKS)
  job({
    group: 'packs',
    title: name,
    file: `packs/${k}.png`,
    size: '1024x1536',
    prompt: `THRENYX sealed card-pack wrapper: ${name}. Portrait 1024x1536 product shot: the sealed foil pack centred, upright, slightly angled toward the viewer, filling about 70% of the height, on a pure black (#000000) background with a soft spotlight. Crimped foil seals at the top and bottom, realistic foil reflections and creases.
DESIGN: ${design}.
STYLE: premium painted product illustration matching the Threnyx painterly style; painted grain.
{UI-BANS}`,
  });

// 6. Screens
const SCREEN = (title, file, scene, safe) =>
  job({
    group: 'ui',
    title,
    file: `ui/${file}.png`,
    size: '1080x1920',
    prompt: `THRENYX app screen background: ${title}. Portrait 1080x1920 (9:16) environment painting; interface elements are drawn on top of it by the game.
STYLE: {STYLE}
SCENE: ${scene}
INTERFACE SAFE ZONES: ${safe} Nothing in the image should look like a button or a panel.
{UI-BANS}`,
  });
SCREEN('Title / splash key art: FIRSTFALL', 'title',
  'Epic key art. A vast night sky over a continent at the edge of the world. A single star falls across the upper sky, trailing white-gold fire and radiating concentric rings of light like a struck bell. Below, a huge white fog-field (the Blank) where it will land. On a ridge in the foreground stand five tiny silhouetted figures, each holding a different light: an ember torch, a cold silver lamp, an amber gas-lantern, a violet lamp, a gold candle-lantern. They are watching.',
  'the game title is drawn over the upper-middle (25%-40% of the height): keep that band dark sky with the star trail passing above it. The bottom 20% holds a button: keep it dark ground.');
SCREEN('Home', 'home',
  'The Meridian at night seen from a high balcony: five distant cities glowing on the horizon in their colours (ember, silver, amber, violet, gold), the fallen star\'s white fog glowing in the far centre, a quiet sky.',
  'the top 10% holds the header and the whole middle 15%-85% holds buttons and cards: keep that area low-contrast, dark and simple (sky and distant lights only). Put the most detail in the bottom 12% (the balcony railing) and the far horizon.');
const ARENAS = {
  stillhouse: ['Battle arena: the Stillhouse at Coda (neutral)', 'the Stillhouse, a colossal geometric duelling hall of black stone where Champions fight under law; seen from above at a steep angle: a polished black floor inlaid with three long parallel silver lanes running from top to bottom and a thin silver line across the middle; empty galleries of robed silhouettes far above; cold moonlight shafts; dust in the light'],
  crown: ['Battle arena: the Ashfields', 'a battlefield of black glass and grey ash seen from above at a steep angle, three faint parallel lanes of cracked obsidian flagstones running top to bottom, ember light glowing in the cracks, ash drifting'],
  quiet: ['Battle arena: the Stillwater', 'a perfectly flat frozen black lake seen from above, three faint parallel silver lines scored in the ice from top to bottom, moonlight, mist'],
  hour: ['Battle arena: the Clockwork Yard', 'a courtyard floor seen from above made of an enormous inlaid brass clock-face, three faint parallel canal channels crossing it top to bottom, amber gas-light, steam'],
  margin: ['Battle arena: the Scaffold', 'a wide scaffold platform over white fog seen from above, three faint parallel plank walkways running top to bottom, violet lamps at the edges, the fog below showing through gaps'],
  vigil: ['Battle arena: the Lantern Road', 'a stone plaza at night seen from above, three faint parallel rows of candles set into the ground running top to bottom, indigo shadows, warm gold pools of light'],
};
for (const [k, [title, scene]] of Object.entries(ARENAS))
  SCREEN(title, `arena-${k}`, scene + '. No characters.',
    'the whole board (three lanes of cards, 6 cards) sits over the middle 15%-80% of the image and players\' bars sit at the very top and bottom: the image must be DARK and LOW-CONTRAST everywhere (it is a backdrop, never competing with the cards), with the brightest area a soft glow along the horizontal centre line at 47%-50% of the height. No bright spots behind the lanes.');
SCREEN('Packs shelf', 'packs', 'a dark merchant\'s alcove of black stone with a single long shelf where sealed card packs would sit (the shelf is empty), warm gold light from above, a velvet curtain drawn aside.', 'packs are drawn by the game in the middle 30%-75%: keep that area an empty softly lit wall. Header at the top 10%.');
SCREEN('Pack-opening altar', 'opening', 'a dark ritual altar of black stone at the centre of a circular chamber; a single beam of pale light falls onto the empty altar top; faint concentric sound-rings ripple across the floor; darkness all around. The moment before something important is revealed.', 'the altar top at 45%-60% of the height must be empty and the brightest area; everything else near-black.');
SCREEN('The Vault', 'vault', 'an ancient private vault carved from black stone; tall walls lined with glass-fronted niches, each holding a softly glowing framed card (blurred and unreadable), many niches still dark and empty; warm gold lamplight; dust motes.', 'card grids fill the middle 15%-90%: keep the centre calm and dark; niches visible mainly at the edges.');
SCREEN('Octave builder: the War Table', 'octave', 'a war-room table seen from above: a dark wooden table with an old map of the Meridian, eight empty card-shaped slots carved in a row, candles and a dagger at the edges.', 'cards and lists fill the middle 12%-90%: keep the table surface in the middle plain and dark; details only at the edges.');
SCREEN('Story: map of the Meridian', 'story', 'an antique painted map of the Meridian: five regions (ash wastes, a silent lake city, a canal city, a white fog-field, a city of lamps), a star falling into the white fog at the centre, worn parchment, gold-leaf compass rose, drawn in a painterly style with no lettering.', 'a list of chapters covers the middle 20%-95%: keep the map faint and darkened there; richer detail at the top 18%.');
SCREEN('The Daily Read: the Observation Gallery', 'daily', 'a Quiet observation gallery high above a duelling floor, black stone arches, a single silver bell hanging still, moonlight across an empty balcony; below, far away, a board of three lanes.', 'the puzzle board fills the middle 15%-85%: keep it dark and calm.');
SCREEN('Draft: the Choosing Hall', 'draft', 'a long hall where eighteen empty card-shaped pedestals stand in rows, each lit by a thin beam of light, dark banners of the five factions on the walls (no lettering).', 'card grids fill the middle 12%-90%: keep the centre dark; pedestals may fade into the grid area.');
SCREEN('Rivals: the Duelling Gallery', 'rivals', 'a gallery of paired portraits of duelists facing each other across a corridor (the portrait faces are shadowed and unreadable), a single candle between each pair.', 'lists fill the middle 15%-90%: keep the centre dark.');
SCREEN('Trade Hall: the Writ Office', 'trade', 'an old exchange hall at night: long counters of dark wood, hanging brass scales, sealed writs in pigeonholes, wax and ribbons, warm lamplight.', 'trade panels fill the middle 15%-90%: keep the centre dark and simple.');
SCREEN('Codex: the Lower Archive', 'codex', 'the lower archive of the Quiet: black shelves of files vanishing into darkness, a single reading lamp on a desk, a few documents with broken seals.', 'text documents fill the middle 15%-95%: keep the image very dark and quiet there.');
SCREEN('More / Settings: the Meridian Terrace', 'more', 'a quiet terrace at dawn over the sea, a single bench, a bell hanging from a post, soft grey-gold light.', 'settings panels fill the middle 15%-90%: keep the centre calm.');
SCREEN('Victory', 'victory', 'a triumphant moment: golden light breaking through dark clouds over a duelling ground, concentric golden sound-rings rolling outward, dust and embers lifting.', 'the word VICTORY and buttons are drawn over the middle 30%-80%: keep that band clean light-to-dark gradient without detail.');
SCREEN('Defeat', 'defeat', 'silence after a loss: a grey empty duelling ground at dusk, a single fallen banner (no lettering), a snuffed candle smoking, the colour drained.', 'the word DEFEAT and buttons are drawn over the middle 30%-80%: keep that band empty and dark.');
SCREEN('World Boss: SOMETHING HAS ARRIVED', 'worldboss', 'the Rest walks out of the crater: a tall absence shaped like a person, made of the silence between notes (a person-shaped hole in the world through which you see only grey void), standing in the white fog of the Blank; all colour drains toward it; every light nearby bends away.', 'the announcement text sits at 60%-75% of the height: keep that band plain grey fog. The figure stands in the upper half.');

// 7. Story chapters
const CHAPTERS = [
  ['The Fall', 'Cinderhold\'s black-glass rampart at midnight: old Sir Hadric Moor (61, grey beard, dented black armour, shield of melted badges) and the 12-year-old page Tamsin Ashby (soot-streaked, holding a lantern with a single ember) look up as a star MOVES across the sky and begins to fall.', ['hadric', 'tamsin']],
  ['Into the Blank', 'The crater at the heart of the white fog: a humming glow at its centre. Vega Sorn (cartographer) and Nyx (a half-erased assassin) face each other over it; blind Lirae\'s light pulses between them; on the ridge behind, hunters with bells on their crossbow bolts arrive.', ['vega', 'nyx', 'lirae', 'maren']],
  ['The Claims', 'The Stillhouse at Coda: a vast silent hall of black stone; the veiled First Silence rings a bell with no clapper; across the floor Aurelle Vantaine (cracked black-glass crown) and Caska Vell (lantern-knight) see each other for the first time in twenty-one years.', ['firstSilence', 'aurelle', 'caska']],
  ['First Blood of the Accord', 'A Margin scaffold-town burning at night: Corvin Vantaine (pale prince, rapier) rides onto a narrow bridge held by one man, Dask Holloway (a Hollow Guard knight), with the Cinder Widow behind Corvin.', ['corvin', 'dask', 'widow']],
  ["Iver's Choice", 'A rainy courtyard: Iver Hale (a knight in the Quiet\'s black and silver) faces his old master Sir Hadric Moor; both hold their swords lowered; neither wants to raise them.', ['iver', 'hadric']],
  ['The Singing', 'Lirae begins to hum on a hillside: everyone around her stops, remembering things that never happened to them; Sister Morrow takes Caska Vell\'s lantern and, for the first time in twenty years, the flame goes out.', ['lirae', 'morrow', 'caska']],
  ['The Empty Portrait', 'The Vantaine gallery at night: Aurelle stands before a gilded frame holding an EMPTY canvas; for one heartbeat a ghostly face appears in it; behind her, Old Nan Greaves watches from the doorway, refusing an order.', ['aurelle', 'nan']],
  ['The Hush Lengthens', 'Carillon: the Tollmaster Ottavio Brask buys every tolled hour in the city; the young Imre Vask confronts him in a vault full of glowing amber bell-jars.', ['brask', 'imre']],
  ['SOMETHING HAS ARRIVED', 'At midnight the Hush does not end: out of the crater walks the Rest, a tall absence shaped like a person; for the first time since the war, Champions of every faction stand side by side before it.', []],
  ['Firstfall', 'After the Rest falls: dawn over the white fog; Lirae opens her eyes for the first time and walks past Aurelle to the Hollow King; Aurelle and the Hollow King look at each other, both crying, neither knowing why.', ['lirae', 'aurelle', 'hollowKing']],
];
CHAPTERS.forEach(([title, scene, cast], i) =>
  job({
    group: 'story',
    title: `Story chapter ${i + 1}: ${title}`,
    file: `story/ch${String(i + 1).padStart(2, '0')}.png`,
    size: '1080x1920',
    prompt: `THRENYX story illustration, chapter ${i + 1}: "${title}". Portrait 1080x1920 (9:16), cinematic narrative painting.
STYLE: {STYLE}
SCENE: ${scene}
${cast.length ? `CHARACTER CONSISTENCY: every named character must match their approved card art: ${cast.map((c) => `${ROOT}/cards/${c}.png (${CARDS[c].name})`).join(', ')}.` : ''}
COMPOSITION: the story text is drawn over the lower 45% of the screen, so the action and faces sit in the upper 55%; the lower part is darker ground, fog or shadow.
{UI-BANS}`,
  }),
);

// 8. Avatars (ladder personas + story opponents + the default player)
const AVATARS = [
  ['marrow', 'MARROW, "Scaffold-Rat": a scrappy young man of the Margin with a bandaged nose, violet scarf, rope over his shoulder, a sly half-smile; fog and violet lamplight behind'],
  ['kess', 'KESS THE QUICK, "Canal Duelist": a sharp-eyed woman of Carillon with a brass-hilted sabre over her shoulder, verdigris coat, hair tied up; gas-lamp amber light'],
  ['quince', 'SISTER QUINCE, "Hymn-Singer": a round-faced Vigil singer in white and gold, a hymnal clutched to her chest, eyes bright and sleepless; candlelight'],
  ['tallowjack', 'TALLOW-JACK, "Ash-Runner": a wiry grinning Crown messenger covered in ash, goggles, a burning fuse wound around his wrist; ember light'],
  ['vesper', 'VESPER RUEL, "Warden of the Third Gate": a stern Quiet warden in black and silver, a clapperless bell at her throat, linen over her mouth; moonlight'],
  ['hale', 'OREN HALEWRIGHT, "Paragon": a noble Crown champion knight in black-glass armour, calm and confident, a greatsword hilt at his shoulder; ember rim light'],
  ['archivist', 'THE ARCHIVIST, "Threnodist": an ageless hooded figure of the Quiet whose face is lit only by a silver reading lamp, holding a closed ledger; very still, very knowing'],
  ['hush', 'A SHAPE IN THE HUSH: an indistinct grey figure made of silence, a silhouette whose edges dissolve into grey fog, two faint points of pale light for eyes'],
  ['rest', 'THE REST: a tall absence shaped like a person, a head-and-shoulders silhouette that is a hole in the world showing grey void, colour draining toward it'],
  ['player', 'THE CHALLENGER (the player\'s default avatar): a hooded figure seen from the shoulders up, face in shadow, holding up a single card-shaped rectangle of light (blank, no markings) that lights the hood\'s edge'],
];
for (const [k, subject] of AVATARS)
  job({
    group: 'avatars',
    title: `Avatar: ${k}`,
    file: `avatars/${k}.png`,
    size: '1024x1024',
    prompt: `THRENYX character avatar. Square 1024x1024 head-and-shoulders portrait.
STYLE: {STYLE}
SUBJECT: ${subject}.
COMPOSITION: the face centred with eyes at about 42% of the height; the whole head and shoulders fit inside the central circle (diameter 860px), because the game crops avatars to a circle; the background is dark and simple.
{BANS}`,
  });

// 9. World Boss Champions (not collectible)
const BOSSES = [
  ['hushborn', 'HUSHBORN', 'a gaunt grey humanoid made of fog and silence, faceless, edges dissolving, several of them walking in a line out of the white fog'],
  ['quietThing', 'THE QUIET THING', 'a crouching grey creature of silence with a long neck and a head like a closed clapperless bell, fingers pressed to where a mouth would be'],
  ['mouth', 'MOUTH OF THE REST', 'a towering grey figure whose whole torso is a vast open mouth that swallows sound; visible sound-rings bend and vanish into it'],
  ['unsungShade', 'UNSUNG SHADE', 'a knight of the lost twelfth city partly erased into blank paper and grey void, one half of the figure solid, the other half only faint pencil lines'],
  ['echo', 'ECHO OF SOLENNE', 'a burning knight made of the memory of the burned capital, a flickering after-image of fire in grey, repeating its own sword-stroke in faint echoes'],
  ['stoppedChoir', 'THE STOPPED CHOIR', 'a row of choir singers frozen mid-song in grey stone, mouths open, silent, cracks spreading through them'],
  ['heart', 'THE REST (HEART)', 'the heart of the Rest: an immense absence shaped like a crowned figure, a person-shaped void of grey silence, all colour and light bending into it, a faint ring of the eight lights of the Octave dimming around it'],
];
for (const [k, name, subject] of BOSSES)
  job({
    group: 'boss',
    title: `World Boss Champion: ${name}`,
    file: `boss/${k}.png`,
    size: '1024x1536',
    prompt: `THRENYX World Boss Champion card illustration: ${name} (not collectible; the enemies of the Firstfall World Boss).
STYLE: {STYLE} The Rest drains colour: this image is nearly monochrome grey and white with only faint traces of the five faction colours dying at the edges.
SUBJECT: ${subject}. Setting: the white fog of the Blank at midnight during a Hush that will not end.
COMPOSITION: {CARD-COMP}
{BANS}`,
  });

// 10. Faction crests (Firstfall Claims banners)
const CRESTS = {
  crown: 'a crown of black volcanic glass with a single ember-drop burning at its centre, on an ember-and-ash field',
  quiet: 'a silver clapperless bell (no tongue inside) with a thin line beneath it, on a black field with a faint moon',
  hour: 'a brass bell whose face is a clock with two hands, verdigris gears behind it, on an amber field',
  margin: 'a hooded head half-dissolved into blank paper with a violet lamp-flame, on a paper-white and ink field',
  vigil: 'a lantern with an open watchful eye in its flame, on a midnight-indigo field with gold stars',
};
for (const [k, crest] of Object.entries(CRESTS))
  job({
    group: 'factions',
    title: `Faction crest: ${FACTION[k][0]}`,
    file: `factions/${k}.png`,
    size: '1024x1024',
    prompt: `THRENYX faction crest for ${FACTION[k][0]}. Square 1024x1024, a heraldic emblem painted as an antique enamel-and-metal medallion, centred, filling 80% of the frame, on a pure black (#000000) background.
EMBLEM: ${crest}.
FACTION LOOK: {LOOK:${k}}
It must stay recognisable at 64px: one bold central shape, strong contrast.
{UI-BANS}`,
  });

// 11. App icon
job({
  group: 'icon',
  title: 'App icon',
  file: 'icon/app-icon.png',
  size: '1024x1024',
  prompt: `THRENYX app icon. Square 1024x1024, full bleed (the platform masks the corners).
DESIGN: a single bold emblem: a gold clapperless bell inside three concentric gold sound-rings, on deep black lacquer, with a faint white-gold star falling behind it at an angle. Painted and engraved, premium, high contrast; readable at 48px.
{UI-BANS}`,
});

// ---------------------------------------------------------------------------
// Manifest the agent must deliver (the game reads client/art/manifest.json)
// ---------------------------------------------------------------------------
const manifest = {
  version: 1,
  cards: cards.map((c) => c.id),
  cutouts: cards.filter((c) => c.rarity === 'mythic').map((c) => c.id),
  immortal: immortals.map((c) => c.id),
  immortalCutouts: immortals.filter((c) => c.rarity === 'mythic').map((c) => c.id),
  cardback: true,
  packs: PACKS.map((p) => p[0]),
  ui: jobs.filter((j) => j.group === 'ui').map((j) => j.file.slice(3, -4)),
  story: jobs.filter((j) => j.group === 'story').map((j) => j.file.slice(6, -4)),
  avatars: AVATARS.map((a) => a[0]),
  boss: BOSSES.map((b) => b[0]),
  factions: Object.keys(CRESTS),
  icon: true,
};
const generated = jobs.length;
const derived = jobs.reduce((a, j) => a + (j.derived?.length || 0), 0);
const totalFiles = generated + derived;

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------
md(`# THRENYX — MASTER ART BRIEF (Season I: Firstfall)`);
md();
md(`> **How to use:** give this entire file to the image agent as ONE prompt. It contains every image the game needs (${generated} images to generate + ${derived} cutouts derived from them = ${totalFiles} files) and ends with a single zip, \`${ROOT}.zip\`.`);
md(`> Generated by \`game/tools/artpack.mjs\` from the game's card data, so names, factions and rarities match the game exactly. Unzip into \`game/client/art/\` and the game loads it through \`manifest.json\`.`);
md();
md(`---`);
md();
md(`## 0. AGENT CONTRACT — follow exactly`);
md();
md('```');
md(`You are the art department for THRENYX, a premium dark-fantasy digital trading card game. Your job is to produce EVERY image listed in section 4 of this document, then package them into one zip. The quality bar is higher than the best trading card art ever printed: museum-grade painted illustration, never "game ad" art.

WORKFLOW (do not stop, do not ask questions, do not skip):
1. Work through the jobs in section 4 strictly in order, J001 to J${String(generated).padStart(3, '0')}.
2. BUILD THE FULL PROMPT: every job's prompt contains tags in curly braces ({STYLE}, {LOOK:crown}, {CARD-COMP}, {MYTHIC-COMP}, {BANS}, {UI-BANS}). Before sending a prompt to the image model, replace each tag with its full text from section 1, word for word. Never send a prompt with an unexpanded tag, and never shorten a block.
3. For each job, generate exactly ONE image from the expanded prompt, at the exact pixel size given, as a PNG (24-bit colour; 32-bit with alpha only for cutouts).
4. Inspect the result against the QUALITY GATE below. If it fails, regenerate (up to 3 attempts per job). If all 3 fail, keep the best attempt, and record the job ID and the reason in QA_LOG.md. Then continue. Never stop the run.
5. Save the approved image at EXACTLY the path given in "SAVE AS", inside the root folder ${ROOT}/. Paths and filenames are case-sensitive; use them character for character. Never rename, never add suffixes such as "_final" or "_v2".
6. If a job lists DERIVED FILES, create them from the approved image of THAT job (never regenerate): remove the background to full transparency and keep only the named figure (with its crown, weapon, and the glow immediately around it). The derived file keeps the SAME pixel size and the SAME position as the source (it must overlay the source exactly), saved as a PNG with alpha.
7. Character consistency: J001 (style anchor) sets the look for everything. When a later job says CHARACTER CONSISTENCY, use the named approved image(s) as visual reference so the same character keeps the same face, age, build, costume and props.
8. After the last job, do the PACKAGING steps in section 5 and deliver ${ROOT}.zip.

QUALITY GATE (every image):
- Matches the job's subject, faction look and composition rules.
- Painterly oil-painting finish with painted grain, deep shadows and a rim light. NOT glossy, plastic, over-smoothed, airbrushed, photographic, 3D-rendered, anime or cartoon.
- Anatomy is correct: 5 fingers per hand, symmetrical eyes, natural limbs, no melted or duplicated features.
- NO text, letters, numbers, pseudo-writing, logos, watermarks, signatures, frames or borders anywhere in the image, unless the job explicitly asks for one. (No job in this document asks for one.)
- Card art (1024x1536): the face sits between 12% and 50% of the height; the top 90px and the top-left and top-right 160px corners hold no faces; the lower 45% is dark and simple.
- Exact pixel dimensions. Full bleed (no letterboxing).

DO NOT:
- merge jobs, split jobs, or produce variations beyond one approved image per job;
- invent extra characters' names, add lettering, add the game's UI, or add a card frame;
- change any filename or folder name;
- stop to ask for approval. The style anchor is approved by default.`);
md('```');
md();
md(`---`);
md();
md(`## 1. Canonical blocks (expand these tags, word for word, into every prompt)`);
md();
const block = (tag, text) => {
  md(`**{${tag}}**`);
  md('```');
  md(text);
  md('```');
  md();
};
block('STYLE', STYLE);
for (const [k, [name, look]] of Object.entries(FACTION)) block(`LOOK:${k}`, `${name}: ${look}`);
block('CARD-COMP', CARD_COMP);
block('MYTHIC-COMP', MYTHIC_COMP.replace(/^- /, ''));
block('BANS', BANS);
block('UI-BANS', UI_BANS);
md(`## 2. Rarity presence (already written into each card prompt)`);
md();
for (const r of Object.values(RARITY)) md(`- ${r}`);
md();
md(`## 3. Card composition (why the safe zones exist)`);
md();
md('```');
md(`1024 x 1536 card art (game crops to 5:7 and draws its frame, name and stats on top)
┌────────────────────────────────────────┐ 0
│▒▒▒▒ badge │   keep 90px clear   │ badge ▒▒▒▒│ 90px   (corners: no faces)
│                                        │
│            FACE / FOCAL POINT          │ 12% - 50%
│                                        │
├────────────────────────────────────────┤ 55%
│   name + stats + rules text overlay    │
│   (dark, simple: robes, mist, ground)  │ lower 45%
└────────────────────────────────────────┘ 1536`);
md('```');
md();
md(`**Mythic cards** also get a transparent cutout of the figure, which the game lifts in front of the card frame for a 3D "breakout" effect and uses for phone-tilt parallax. Mythic figures therefore need a clean, rim-lit silhouette.`);
md();
md(`## 4. Jobs (${generated} images + ${derived} derived cutouts)`);
md();
md(`| Group | Folder | Count | Size |`);
md(`|---|---|---|---|`);
const groups = {};
for (const j of jobs) (groups[j.group] ||= []).push(j);
const GROUP_NAME = { style: 'Style anchor', cards: 'Champion cards (all 120)', immortal: 'Immortal masterpieces (all Mythic + Legendary)', cardback: 'Card back', packs: 'Pack wrappers', ui: 'Screen backgrounds', story: 'Story chapters', avatars: 'Avatars', boss: 'World Boss Champions', factions: 'Faction crests', icon: 'App icon' };
for (const [g, list] of Object.entries(groups)) md(`| ${GROUP_NAME[g]} | \`${list[0].file.split('/')[0]}/\` | ${list.length}${list.some((j) => j.derived?.length) ? ` (+${list.reduce((a, j) => a + (j.derived?.length || 0), 0)} cutouts)` : ''} | ${list[0].size} |`);
md(`| **Total** | | **${generated} generated + ${derived} derived = ${totalFiles} files** | |`);
md();
let lastGroup = null;
for (const j of jobs) {
  if (j.group !== lastGroup) {
    md(`### ${GROUP_NAME[j.group]}`);
    md();
    lastGroup = j.group;
  }
  md(`#### ${j.id} — ${j.title}`);
  md(`SAVE AS: \`${ROOT}/${j.file}\` · ${j.size} PNG${j.derived?.length ? `  \nDERIVED FILES: ${j.derived.map((d) => `\`${ROOT}/${d}\` (transparent cutout of the figure, same size and position)`).join(', ')}` : ''}`);
  md('```');
  md(j.prompt + `\nSAVE AS: ${ROOT}/${j.file} (${j.size} PNG)` + (j.derived?.length ? `\nTHEN DERIVE: ${j.derived.map((d) => `${ROOT}/${d}`).join(', ')} (background removed, figure only, same size and position, PNG with alpha)` : ''));
  md('```');
  md();
}
md(`---`);
md();
md(`## 5. Packaging (do all of this after the last job)`);
md();
md(`1. Write \`${ROOT}/manifest.json\` with EXACTLY this content, then REMOVE from its lists any entry whose file does not exist (the game only loads what the manifest lists). Keep the key order and formatting.`);
md();
md('```json');
md(JSON.stringify(manifest, null, 2));
md('```');
md();
md(`2. Write \`${ROOT}/CHECKLIST.md\`: one line per job, \`J001 | 00_style/style_anchor.png | done\` (or \`failed: <reason>\`), plus one line per derived file.`);
md(`3. Write \`${ROOT}/QA_LOG.md\` (empty if nothing failed).`);
md(`4. Verify before zipping (fix anything that fails):`);
md(`   - \`cards/\` holds exactly **${manifest.cards.length}** PNGs named by card id (list below), each 1024x1536.`);
md(`   - \`cutouts/\` holds exactly **${manifest.cutouts.length}** transparent PNGs: ${manifest.cutouts.map((x) => `\`${x}.png\``).join(', ')}.`);
md(`   - \`immortal/\` holds **${manifest.immortal.length}** PNGs plus **${manifest.immortalCutouts.length}** \`_cutout\` PNGs.`);
md(`   - \`ui/\` ${manifest.ui.length} · \`story/\` ${manifest.story.length} · \`packs/\` ${manifest.packs.length} · \`avatars/\` ${manifest.avatars.length} · \`boss/\` ${manifest.boss.length} · \`factions/\` ${manifest.factions.length} · \`cardback/\` 1 · \`icon/\` 1 · \`00_style/\` 1.`);
md(`   - Total image files: **${totalFiles}**. No other files except manifest.json, CHECKLIST.md and QA_LOG.md.`);
md(`   - No image contains text or a frame.`);
md(`5. Zip the folder \`${ROOT}/\` (the zip's single top-level folder is \`${ROOT}/\`) as **\`${ROOT}.zip\`**, and deliver it.`);
md();
md(`**Folder layout inside the zip**`);
md();
md('```');
md(`${ROOT}/
  manifest.json  CHECKLIST.md  QA_LOG.md
  00_style/style_anchor.png
  cards/<card-id>.png            ×${manifest.cards.length}
  cutouts/<card-id>.png          ×${manifest.cutouts.length}   (Mythic figures, transparent)
  immortal/<card-id>.png         ×${manifest.immortal.length}
  immortal/<card-id>_cutout.png  ×${manifest.immortalCutouts.length}
  cardback/cardback.png
  packs/<pack>.png               ×${manifest.packs.length}
  ui/<screen>.png                ×${manifest.ui.length}
  story/chNN.png                 ×${manifest.story.length}
  avatars/<id>.png               ×${manifest.avatars.length}
  boss/<id>.png                  ×${manifest.boss.length}
  factions/<faction>.png         ×${manifest.factions.length}
  icon/app-icon.png`);
md('```');
md();
md(`**All 120 card ids (the \`cards/\` filenames)**`);
md();
md(ORDER.map((f) => `- **${FACTION[f][0]}:** ` + cards.filter((c) => c.faction === f).map((c) => `\`${c.id}\``).join(', ')).join('\n'));
md();

fs.writeFileSync(new URL('../art/THRENYX_ART_MASTER.md', import.meta.url), out.join('\n'));
fs.writeFileSync(new URL('../art/expected-manifest.json', import.meta.url), JSON.stringify(manifest, null, 2));
console.log(`wrote art/THRENYX_ART_MASTER.md: ${generated} jobs, ${derived} derived, ${totalFiles} files; ${Object.keys(OLD).length} briefs reused from the original pack`);
