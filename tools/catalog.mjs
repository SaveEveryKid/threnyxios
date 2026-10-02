// Generates docs/05-card-catalog.md from the engine data (never hand-edited).
import fs from 'node:fs';
import { LIST, FACTIONS, cardText } from '../engine/cards/index.js';
const NAME = { crown: 'The Ashen Crown', quiet: 'The Quiet', hour: 'The Hourwrights', margin: 'The Margin', vigil: 'The Vigil' };
const R = { common: 'C', rare: 'R', epic: 'E', legendary: 'L', mythic: 'M' };
const RO = { mythic: 0, legendary: 1, epic: 2, rare: 3, common: 4 };
let md = `# THE FIRSTFALL SET — 120 CHAMPIONS\n\n> Generated from \`engine/cards/\` by \`tools/catalog.mjs\`. Rules text is generated from the same data the engine executes.\n> Stats are **Strike / Guard / Scheme / Health**. Rarity: C Common · R Rare · E Epic · L Legendary · M Mythic.\n\n`;
const count = {};
for (const c of LIST) count[c.rarity] = (count[c.rarity] || 0) + 1;
md += `**Set:** ${LIST.length} Champions · ${Object.entries(count).map(([k, v]) => `${v} ${k}`).join(' · ')}\n\n`;
for (const f of FACTIONS) {
  md += `## ${NAME[f]}\n\n| # | Champion | R | S/G/Sc/HP | Class · Alignment · Traits | Ability |\n|---|---|---|---|---|---|\n`;
  for (const c of LIST.filter((x) => x.faction === f).sort((a, b) => RO[a.rarity] - RO[b.rarity] || a.no - b.no)) {
    md += `| ${c.no} | **${c.name}**<br>*${c.title}* | ${R[c.rarity]} | ${c.stats.strike}/${c.stats.guard}/${c.stats.scheme}/${c.hp} | ${c.cls} · ${c.alignment}${c.traits.length ? ' · ' + c.traits.join(', ') : ''} | **${c.kit.name}.** ${cardText(c).replace(/\|/g, '/')} |\n`;
  }
  md += '\n';
}
fs.writeFileSync(new URL('../docs/05-card-catalog.md', import.meta.url), md);
console.log('wrote', md.length, 'chars');
