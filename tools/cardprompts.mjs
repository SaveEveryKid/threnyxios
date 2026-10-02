// Generates art/THRENYX_CARD_PROMPTS.md: one text-free art prompt per Champion
// (the game draws frame, name, stats and rules text), from the live card data.
import fs from 'node:fs';
import { LIST, cardText } from '../engine/cards/index.js';
import { BRIEFS } from '../art/briefs.mjs';

const old = fs.readFileSync(new URL('../art/THRENYX_ART_PROMPTS.md', import.meta.url), 'utf8');
const OLD = {};
for (const sec of old.split('\n### ').slice(1)) {
  const head = sec.split('\n')[0];
  if (/IMMORTAL|Style anchor/.test(head)) continue;
  const c = LIST.find((x) => head.includes(' — ' + x.name + ',') || head.includes(' — ' + x.name + ' ('));
  if (!c) continue;
  const lines = (sec.split('```')[1] || '').split('\n');
  const a = lines.findIndex((l) => l.startsWith('Subject:'));
  const b = lines.findIndex((l) => l.startsWith('Mood:'));
  if (a >= 0) OLD[c.id] = lines.slice(a, b < 0 ? undefined : b).join(' ').replace(/^Subject:\s*/, '');
}
const F = {
  crown: ['THE ASHEN CROWN', 'obsidian black glass, bone white, ember red and orange, falling ash', 'a black-glass crown with an ember'],
  quiet: ['THE QUIET', 'black stone, cold silver, white, moonlight', 'a silver bell with no clapper'],
  hour: ['THE HOURWRIGHTS', 'verdigris green, polished brass, glowing amber, clockwork', 'a brass clock-bell'],
  margin: ['THE MARGIN', 'paper white, ink black, violet lamps, white fog', 'a hooded head fading into blank paper'],
  vigil: ['THE VIGIL', 'midnight indigo, candle gold, warm white', 'a lantern with an eye in its flame'],
};
const FRAME = {
  common: 'dark forged iron frame, matte, simple rivets',
  rare: 'engraved polished silver frame',
  epic: 'black enamel frame with glowing faction-colour inlay',
  legendary: 'ornate engraved gold frame with baroque filigree',
  mythic: 'dark metal frame inlaid with prismatic crystal and golden thorned filigree, glowing cracks',
};
const R = { common: 'C', rare: 'R', epic: 'E', legendary: 'L', mythic: 'M' };
const o = [];
o.push(`# THRENYX — Card Art Prompts (all 120, text-free)\n`);
o.push(`One prompt per card. Each makes the **painting only**: no frame, no name, no stats, no text. The game draws the frame, name, stats and rules text on top, so they always match the current balance.\n`);
o.push(`Portrait 1024x1536 PNG. Save each as \`cards/<id>.png\` (the exact filename in each prompt), then zip the \`cards/\` folder as \`threnyx-cards.zip\`. Unzip into \`game/client/art/\` and list the ids in \`manifest.json\`.\n`);
o.push(`**Reject and regenerate any image that contains text, letters, numbers, a frame or a border.**\n\n---\n`);
let n = 0;
for (const f of Object.keys(F)) {
  o.push(`\n## ${F[f][0]}\n`);
  for (const c of LIST.filter((x) => x.faction === f)) {
    n++;
    const mythic = c.rarity === 'mythic';
    o.push(`### ${n}. ${c.name}, ${c.title} (${c.rarity})\nFile: \`cards/${c.id}.png\``);
    o.push('```');
    o.push(`Dark-fantasy trading card illustration for THRENYX, portrait 1024x1536, full bleed. Painterly oil painting, museum-grade, cinematic chiaroscuro, deep shadows, strong rim light, painted grain, faint concentric sound-ripples in the air radiating from the main light.

SUBJECT: ${OLD[c.id] || BRIEFS[c.id]}
PALETTE (${F[f][0]}): ${F[f][1]}.
${c.rarity === 'mythic' ? 'SCALE: the most spectacular image in the set; the character dominates the frame; god-rays and awe.' : c.rarity === 'legendary' ? 'SCALE: iconic, heroic staging in a grand environment.' : c.rarity === 'epic' ? 'SCALE: dramatic staging, rich environment.' : 'SCALE: an intimate, grounded character moment.'}

COMPOSITION: face and focal point in the upper half (between 12% and 50% of the height), centred; keep the top 90px clear and no faces in the top-left and top-right corners; the lower 45% darker and simple (clothing, mist, ground) because the game covers it with the name and stats.${mythic ? ' Clean, rim-lit silhouette that can be cut out from the background.' : ''}

NO text, letters, numbers, logos, watermark, signature, frame, border or UI of any kind. Correct anatomy, five fingers. Not glossy, not 3D-render, not anime.
Save as cards/${c.id}.png`);
    o.push('```\n');
  }
}
fs.writeFileSync(new URL('../art/THRENYX_CARD_PROMPTS.md', import.meta.url), o.join('\n'));
console.log('wrote', n, 'prompts');
