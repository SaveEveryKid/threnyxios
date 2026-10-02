// RULES — every mode and the tournament in plain words (engine/rules-text.js).
// #/rules opens the list; #/rules?s=<id> opens straight to one topic.
import { RULES, RULE_GROUPS } from '../../../engine/rules-text.js';
import { LEGAL } from '../ui/legal.js';

export function render(root, params) {
  const open = params.s || null;
  root.innerHTML = `
    <div class="kicker">Help</div><div class="h1">Rules</div>
    <div class="lore" style="margin:4px 0 12px">Everything in plain words. Tap a topic to open it.</div>
    ${RULE_GROUPS.map((g) => `
      <div class="sheet-label" style="margin-top:14px">${g.title}</div>
      ${RULES.filter((r) => r.group === g.id).map((r) => `
        <details class="panel rule ${r.group === 'events' ? 'panel--gold' : ''}" id="rule-${r.id}" ${r.id === open ? 'open' : ''}>
          <summary><b>${r.title}</b><span>${r.summary}</span></summary>
          <ul>${r.rules.map((x) => `<li>${x}</li>`).join('')}</ul>
          ${r.tip ? `<div class="rule__tip">Tip: ${r.tip}</div>` : ''}
          ${r.id === 'oktober' ? `<div class="muted" style="font-size:12px;margin:-4px 16px 14px"><a href="${LEGAL.oktober}" target="_blank" rel="noopener">Official rules (the full legal version)</a></div>` : ''}
        </details>`).join('')}`).join('')}`;
  if (open) requestAnimationFrame(() => root.querySelector(`#rule-${CSS.escape(open)}`)?.scrollIntoView({ block: 'start' }));
}
