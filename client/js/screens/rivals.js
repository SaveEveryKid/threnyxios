// RIVALS — the people (here: personas) you keep meeting: your record, their
// habit once you've met them, and how honest their leans have been.
import * as store from '../core/store.js';
import { esc } from '../ui/card.js';
import { startLadder } from './play.js';

export function render(root, params, ctx) {
  const s = store.get();
  const rows = Object.entries(s.rivals).sort((a, b) => b[1].w + b[1].l - (a[1].w + a[1].l));
  root.innerHTML = `<div class="kicker">Rivals</div><div class="h1">Old Enemies</div>
    <div class="lore" style="margin:4px 0 14px">Play someone three times and they become your Rival. The Accord records every match between you.</div>
    <div class="stack" data-list>${rows.length ? '' : '<div class="muted">No Rivals yet. Find opponents on the Ladder.</div>'}</div>`;
  const list = root.querySelector('[data-list]');
  for (const [id, r] of rows) {
    const p = store.PERSONAS.find((x) => x.id === id);
    if (!p) continue;
    const rival = r.w + r.l >= 3;
    const el = document.createElement('div');
    el.className = 'panel' + (rival ? ' panel--gold' : '');
    el.innerHTML = `<div class="row"><div class="grow"><div class="h-display" style="font-size:20px">${esc(p.name)}</div><div class="muted" style="font-size:13px">${esc(p.title)}${rival ? ' · RIVAL' : ` · ${3 - r.w - r.l} more to rivalry`}</div></div>
      <div class="vault-count">${r.w}<span>–${r.l}</span></div></div>
      <div class="dr-facts" style="margin:10px 0">
        <div><b>${r.streak > 0 ? 'W' + r.streak : r.streak < 0 ? 'L' + -r.streak : '—'}</b>Streak</div>
        <div><b>${r.reads}</b>Your READs on them</div>
        <div><b>${r.deciders}</b>Deciders</div>
      </div>
      ${p.habit ? `<div class="muted" style="font-size:13px;margin-bottom:10px"><b class="gold">Habit</b> ${esc(p.habit.text)}${r.tells?.total ? ` · their leans were honest <b>${Math.round((100 * r.tells.honest) / r.tells.total)}%</b> of the time (${r.tells.total} seen)` : ''}</div>` : ''}
      <button class="btn btn--sm" style="width:100%">Rematch</button>`;
    el.querySelector('button').onclick = () => startLadder(p, ctx.go);
    list.appendChild(el);
  }
}
