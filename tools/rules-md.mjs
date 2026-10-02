// Writes docs/RULES.md from engine/rules-text.js (the same text as the in-game
// Rules screen). Usage: node tools/rules-md.mjs
import fs from 'node:fs';
import { RULES, RULE_GROUPS } from '../engine/rules-text.js';
const md = (h) => h.replace(/<b>(.*?)<\/b>/g, '**$1**').replace(/<i>(.*?)<\/i>/g, '*$1*').replace(/<[^>]+>/g, '');
let out = '# THRENYX: the rules\n\nThe same text as the in-game Rules screen (More → Rules). Made from `engine/rules-text.js` by `node tools/rules-md.mjs`; edit that file, not this one.\n';
for (const g of RULE_GROUPS) {
  out += `\n## ${g.title}\n`;
  for (const r of RULES.filter((x) => x.group === g.id)) {
    out += `\n### ${r.title}\n*${md(r.summary)}*\n\n${r.rules.map((x) => `- ${md(x)}`).join('\n')}\n`;
    if (r.tip) out += `\n> Tip: ${md(r.tip)}\n`;
  }
}
fs.writeFileSync(new URL('../docs/RULES.md', import.meta.url), out);
console.log('wrote docs/RULES.md');
