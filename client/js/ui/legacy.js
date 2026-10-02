// A copy's Legacy: its numbers and its history, oldest first. Shared by the
// Vault and the Trade screen, because the history travels with the copy.
import { esc } from './card.js';

const fmt = (t) => new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

export function historyOf(it) {
  return it.history?.length ? it.history : [{ at: it.acquired, text: `${it.source}.` }];
}

export function legacyHtml(it, { extra = '' } = {}) {
  const S = it.stats;
  const h = historyOf(it);
  return `
    <div class="legacy panel">
      <h3>Legacy</h3>
      <dl>
        <dt>Owners</dt><dd>${it.owners.map((o) => esc(o.name)).join(' → ')}</dd>
        <dt>Acquired</dt><dd>${fmt(it.acquired)}</dd>
        <dt>Clashes</dt><dd>${S.battles}</dd>
        <dt>Champions felled</dt><dd>${S.kills || 0}</dd>
        <dt>Stood to the end</dt><dd>${S.clashWins}</dd>
        <dt>READs behind it</dt><dd>${S.readsHit}</dd>
        <dt>Clutch wins</dt><dd>${S.finalsWon}</dd>
        ${it.honors?.length ? `<dt>Honors</dt><dd>${it.honors.map(esc).join(', ')}</dd>` : ''}
        ${extra}
      </dl>
      <h3 style="margin-top:14px">History</h3>
      <ol class="history">${h
        .slice()
        .reverse()
        .map((e, i) => `<li class="${i === h.length - 1 ? 'origin' : ''}"><time>${fmt(e.at)}</time><span>${esc(e.text)}</span></li>`)
        .join('')}</ol>
    </div>`;
}
