// DRAFT — 18 Champions face up, one ban each, snake draft to 8. Collection
// doesn't matter; the only thing that matters is judgment.
import * as store from '../core/store.js';
import { CARDS, LIST } from '../../../engine/cards/index.js';
import { createDraft, draftBan, draftPick, draftPicker, draftValue } from '../../../engine/modes.js';
import { renderCard, esc } from '../ui/card.js';
import { setBattle } from '../core/session.js';
import { sfx } from '../core/audio.js';

let rating = {};
fetch(new URL('../../../engine/data/ratings.json', import.meta.url))
  .then((r) => (r.ok ? r.json() : {}))
  .then((j) => (rating = j))
  .catch(() => {});

const OPP = { id: 'drafter', name: 'Quill', title: 'The Rewriter · Drafter', skill: 0.8, bias: null };

export function render(root, params, ctx) {
  const s = store.get();
  let d = s.draft?.phase && s.draft.phase !== 'done' ? s.draft : null;
  const start = () => {
    d = createDraft(LIST, (Math.random() * 2 ** 31) | 0);
    store.update((x) => (x.draft = d));
    draw();
  };
  const aiPick = () => {
    const opts = d.pool.map((id) => [id, draftValue(CARDS, rating, d.picks[1], d.picks[0], id) + Math.random() * 0.3]);
    opts.sort((a, b) => b[1] - a[1]);
    return opts[0][0];
  };
  const advanceAI = () => {
    while (d.phase === 'pick' && draftPicker(d.turn) === 1) d = draftPick(d, 1, aiPick());
    store.update((x) => (x.draft = d));
  };
  const draw = () => {
    if (!d) {
      root.innerHTML = `<div class="kicker">Draft</div><div class="h1">Pure Skill</div>
        <div class="lore" style="margin:6px 0 14px">Eighteen Champions, face up. You and your opponent each ban one, then draft in turns (A · B B · A A…) until you each hold eight. Your collection doesn't matter here.</div>
        <button class="btn btn--big" data-start>Begin Draft</button>`;
      root.querySelector('[data-start]').onclick = () => (sfx.select(), start());
      return;
    }
    const mine = d.picks[0];
    const theirs = d.picks[1];
    const myTurn = d.phase === 'ban' || (d.phase === 'pick' && draftPicker(d.turn) === 0);
    root.innerHTML = `
      <div class="row"><div class="grow"><div class="kicker">Draft · ${d.phase === 'ban' ? 'Ban one' : d.phase === 'done' ? 'Complete' : myTurn ? 'Your pick' : 'Opponent picking'}</div>
      <div class="h1" style="font-size:22px">${mine.length}/8 · Opponent ${theirs.length}/8</div></div></div>
      ${d.phase === 'done' ? '<button class="btn btn--big" data-fight style="margin:10px 0">Fight</button>' : ''}
      <div class="kicker" style="margin-top:6px">Pool</div>
      <div class="pick-grid" data-pool style="margin-top:6px"></div>
      <div class="kicker" style="margin-top:14px">Your picks</div>
      <div class="pick-grid" data-mine style="margin-top:6px"></div>
      <div class="kicker" style="margin-top:14px">Opponent's picks</div>
      <div class="pick-grid" data-theirs style="margin-top:6px"></div>`;
    const put = (sel, ids, click) => {
      const box = root.querySelector(sel);
      for (const id of ids) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        const c = renderCard(CARDS[id], { width: 84, flat: true });
        cell.appendChild(c);
        let t = null;
        cell.addEventListener('pointerdown', () => (t = setTimeout(() => ((t = 'long'), ctx.modal('<div></div>').el.lastElementChild.replaceWith(renderCard(CARDS[id], { size: 'full', width: Math.min(320, innerWidth - 40), tilt: true }))), 420)));
        cell.addEventListener('pointerup', () => {
          if (t === 'long') return;
          clearTimeout(t);
          click?.(id);
        });
        box.appendChild(cell);
      }
    };
    put('[data-pool]', d.pool, myTurn ? (id) => {
      sfx.select();
      if (d.phase === 'ban') {
        const pool = d.pool.filter((x) => x !== id);
        const aiBan = pool.map((x) => [x, draftValue(CARDS, rating, [], [], x)]).sort((a, b) => b[1] - a[1])[0][0];
        d = draftBan(d, [id, aiBan]);
        ctx.toast(`You banned ${CARDS[id].name.split(' ')[0]} · they banned ${CARDS[aiBan].name.split(' ')[0]}`);
      } else d = draftPick(d, 0, id);
      store.update((x) => (x.draft = d));
      draw();
      if (d.phase === 'pick' && draftPicker(d.turn) === 1) setTimeout(() => (advanceAI(), draw()), 650);
    } : null);
    put('[data-mine]', mine);
    put('[data-theirs]', theirs);
    root.querySelector('[data-fight]')?.addEventListener('click', () => {
      setBattle({
        mode: 'draft', mine: mine.slice(), theirs: theirs.slice(), persona: OPP, title: OPP.name, sub: 'Draft', resultKicker: 'Draft', rematch: false,
        // the Draft reward comes with the match result
        onEnd: () => {
          store.update((x) => (x.draft = null));
          return [];
        },
        onContinue: (c) => c.go('draft'),
      });
      ctx.go('battle', { t: Date.now() });
    });
  };
  draw();
}
