// Pieces the Friends and Trade screens share: a grid of copies to pick from,
// a row of cards in an offer, a copy's Legacy, and the offer builder
// (docs/19-friends-trading.md). The server checks everything again.
import * as store from '../core/store.js';
import { CARDS } from '../../../engine/cards/index.js';
import { owned } from '../../../engine/collection.js';
import { TRADE, sealOf, copyLock, copyView } from '../../../engine/social.js';
import { renderCard, esc } from './card.js';
import { legacyHtml } from './legacy.js';
import { sfx } from '../core/audio.js';

const RANK = { mythic: 5, legendary: 4, epic: 3, rare: 2, common: 1 };
const finish = (t) => (t && t !== 'standard' ? t : null);
export const cardName = (id) => CARDS[id]?.name ?? 'A card';

/** A copy's Legacy, full size, in a modal. `it` is a copy view (or a local copy). */
export function legacyModal(ctx, it) {
  if (!it || !CARDS[it.cardId]) return;
  const m = ctx.modal(`<div data-c></div><div class="lore card-bio">${esc(CARDS[it.cardId].bio)}</div>${it.owners ? legacyHtml({ stats: {}, owners: [], ...it, stats: { battles: 0, clashWins: 0, readsHit: 0, finalsWon: 0, ...(it.stats || {}) } }) : ''}`);
  m.el.querySelector('[data-c]').appendChild(renderCard(CARDS[it.cardId], { size: 'full', width: Math.min(300, innerWidth - 60), tilt: true, treatment: finish(it.treatment) }));
}

/** A small row of cards (an offer's side), long-press or tap for the Legacy when `views` has it. */
export function cardRow(tags, { ctx, views = {}, width = 64, empty = 'Nothing' } = {}) {
  const row = document.createElement('div');
  row.className = 'trade-row';
  if (!tags?.length) {
    row.innerHTML = `<span class="muted" style="font-size:13px">${esc(empty)}</span>`;
    return row;
  }
  for (const t of tags) {
    if (!CARDS[t.cardId]) continue;
    const b = document.createElement('button');
    b.className = 'trade-row__card';
    b.setAttribute('aria-label', cardName(t.cardId));
    b.appendChild(renderCard(CARDS[t.cardId], { width, flat: true, treatment: finish(t.treatment) }));
    b.onclick = () => ctx && legacyModal(ctx, views[t.copyId] || t);
    row.appendChild(b);
  }
  return row;
}

/**
 * A grid of copies to pick from. `copies` are views or local items; `set` holds
 * the picked copy ids. Tap picks, long-press shows the Legacy. `canPick(it)`
 * returns null or why not.
 */
export function copyGrid(box, copies, set, { ctx, max = TRADE.maxSide, canPick = () => null, onChange } = {}) {
  box.innerHTML = '';
  if (!copies.length) {
    box.innerHTML = '<div class="muted" style="grid-column:1/-1;font-size:13px;padding:8px 0">No cards here yet.</div>';
    return;
  }
  for (const it of copies) {
    const cell = document.createElement('div');
    const locked = it.lock || null;
    cell.className = 'cell' + (set.has(it.copyId) ? ' in' : '') + (locked ? ' is-locked' : '');
    cell.dataset.copy = it.copyId;
    cell.appendChild(renderCard(CARDS[it.cardId], { width: 84, flat: true, treatment: finish(it.treatment) }));
    if (locked) cell.insertAdjacentHTML('beforeend', '<span class="badge-sm">New</span>');
    else if (it.stats?.battles) cell.insertAdjacentHTML('beforeend', `<span class="badge-sm">${it.stats.battles} battles</span>`);
    let tm = null;
    cell.addEventListener('pointerdown', () => (tm = setTimeout(() => ((tm = 'long'), legacyModal(ctx, it)), 420)));
    cell.addEventListener('pointerleave', () => tm !== 'long' && clearTimeout(tm));
    cell.addEventListener('pointerup', () => {
      if (tm === 'long') return (tm = null);
      clearTimeout(tm);
      if (!set.has(it.copyId)) {
        const why = locked ? 'That card can’t be traded yet' : canPick(it) || (set.size >= max ? `Up to ${max} cards` : null);
        if (why) return sfx.error?.(), ctx.toast(why);
        set.add(it.copyId);
      } else set.delete(it.copyId);
      sfx.select();
      cell.classList.toggle('in', set.has(it.copyId));
      onChange?.();
    });
    box.appendChild(cell);
  }
}

/** This player's own copies, as views, best first, with locks marked. */
export function myCopies() {
  const s = store.get();
  const now = Date.now();
  return Object.values(s.profile.items)
    .filter((it) => CARDS[it.cardId])
    .map((it) => ({ ...copyView(it), lock: copyLock(it, now) ? 'new' : null }))
    .sort((a, b) => (RANK[CARDS[b.cardId].rarity] || 0) - (RANK[CARDS[a.cardId].rarity] || 0) || (b.stats?.battles || 0) - (a.stats?.battles || 0));
}

/** The Trade Seal line for a set of copies (both sides pay it). */
export function sealLine(items) {
  const seal = sealOf(items);
  const have = store.get().profile.embers;
  return { seal, html: seal ? `Trade Seal: <b class="${have >= seal ? 'gold' : 'bad'}">${seal} Embers</b> each · you have ${have}` : 'Free to trade' };
}

/**
 * Cards in the active Octave stay: these copies would take one out of it (its last
 * copy). Spare copies, and cards that are only in other Octaves or none, trade freely.
 * Returns the card names, or [].
 */
export function octaveCards(copyIds) {
  const s = store.get();
  const active = new Set(s.octaves?.[s.active]?.cards || []);
  const leaving = {};
  for (const c of copyIds) {
    const id = s.profile.items[c]?.cardId;
    if (id) leaving[id] = (leaving[id] || 0) + 1;
  }
  return Object.entries(leaving)
    .filter(([id, n]) => active.has(id) && owned(s.profile, id) - n < 1)
    .map(([id]) => cardName(id));
}
const octaveNote = (names) => (names.length ? `<div class="trade-warn">${names.map(esc).join(', ')} ${names.length > 1 ? 'are' : 'is'} in your active Octave. Swap ${names.length > 1 ? 'them' : 'it'} out in the Vault to trade ${names.length > 1 ? 'them' : 'it'}.</div>` : '');
/** Why this copy can't be picked to give away (the active Octave), or null. */
const keepFor = (picked) => (it) => (octaveCards([...picked, it.copyId]).length ? `${cardName(it.cardId)} is in your active Octave. Swap it out first.` : null);
/** Mark the copies in a grid that the active Octave keeps. */
export function markOctave(box, picked = new Set()) {
  box.querySelectorAll('.cell[data-copy]').forEach((cell) => {
    if (octaveCards([...picked, cell.dataset.copy]).length && !picked.has(cell.dataset.copy)) {
      cell.classList.add('is-kept');
      if (!cell.querySelector('.badge-sm--top')) cell.insertAdjacentHTML('beforeend', '<span class="badge-sm badge-sm--top">🔒 In Octave</span>');
    }
  });
}

/**
 * The offer builder, in steps, drawn into `root`:
 *   1. pick what you want from them → Confirm selection
 *   2. pick what you'll give → Confirm selection
 *   3. check the whole trade → Confirm trade
 * A Trade Board post fixes step 1 (you ask for the whole post), so it starts at 2.
 * `onSend(give, get)` resolves when the server has the offer.
 */
export function offerBuilder(root, ctx, { title, who = 'them', theirs = [], fixedGet = null, pickedGet = [], pickedGive = [], onSend, onBack, sendLabel = 'Confirm trade' }) {
  const mine = myCopies();
  // a counter-offer starts from the offer it answers (only cards still there)
  const get = new Set(fixedGet ? fixedGet.map((t) => t.copyId) : pickedGet.filter((c) => theirs.some((t) => t.copyId === c)));
  const give = new Set(pickedGive.filter((c) => mine.some((t) => t.copyId === c)));
  // what's already picked comes first
  const first = (set) => (a, b) => (set.has(b.copyId) ? 1 : 0) - (set.has(a.copyId) ? 1 : 0);
  mine.sort(first(give));
  theirs = [...theirs].sort(first(get));
  const steps = fixedGet ? ['mine', 'review'] : ['theirs', 'mine', 'review'];
  let step = steps[0];
  const theirTag = (c) => (fixedGet || theirs).find((t) => t.copyId === c);

  const draw = () => {
    const n = steps.indexOf(step) + 1;
    const head = (h, sub) => `
      <div class="row"><button class="btn btn--sm btn--ghost" data-back>Back</button><div class="grow"></div><span class="muted" style="font-size:12px">${esc(title)}</span></div>
      <div class="kicker" style="margin-top:10px">Step ${n} of ${steps.length}</div>
      <div class="h1" style="font-size:24px;margin-top:2px">${h}</div>
      ${sub ? `<div class="muted" style="font-size:13px">${sub}</div>` : ''}`;
    if (step === 'theirs') {
      root.innerHTML = `${head(`Pick what you want from ${esc(who)}`, 'Tap to pick · press and hold to see a card’s history')}
        <div class="pick-grid" data-theirs style="margin-top:12px"></div>
        <div class="trade-bar"><div class="grow" data-count style="font-size:14px"></div><button class="btn" data-next>Confirm selection</button></div>`;
      const bar = () => {
        root.querySelector('[data-count]').textContent = get.size ? `${get.size} picked` : 'Nothing picked: a gift to them';
        root.querySelector('[data-next]').textContent = get.size ? 'Confirm selection' : 'Ask for nothing';
      };
      copyGrid(root.querySelector('[data-theirs]'), theirs, get, { ctx, onChange: bar });
      bar();
    } else if (step === 'mine') {
      root.innerHTML = `${head('Pick what you’ll give', fixedGet ? `For ${esc(who)}’s post · tap to pick` : 'Tap to pick · press and hold to see a card’s history')}
        <div class="pick-grid" data-mine style="margin-top:12px"></div>
        <div class="trade-bar"><div class="grow" data-count style="font-size:14px"></div><button class="btn" data-next>Confirm selection</button></div>`;
      const bar = () => {
        root.querySelector('[data-count]').textContent = give.size ? `${give.size} picked` : 'Pick at least one';
        root.querySelector('[data-next]').disabled = !give.size;
      };
      copyGrid(root.querySelector('[data-mine]'), mine, give, { ctx, onChange: bar, canPick: keepFor(give) });
      markOctave(root.querySelector('[data-mine]'), give); // the active Octave's cards stay
      bar();
    } else {
      const items = [...[...give].map((c) => store.get().profile.items[c]), ...[...get].map(theirTag)].filter(Boolean);
      const { seal, html } = sealLine(items);
      root.innerHTML = `${head('Check the trade', `With ${esc(who)}. Once they accept, it’s final.`)}
        <div class="panel trade-review" style="margin-top:12px">
          <div class="row"><div class="kicker grow">You get</div>${fixedGet ? '' : '<button class="btn btn--sm btn--ghost" data-edit="theirs">Change</button>'}</div><div data-get></div>
          <div class="row" style="margin-top:12px"><div class="kicker grow">You give</div><button class="btn btn--sm btn--ghost" data-edit="mine">Change</button></div><div data-give></div>
          <div class="muted" style="font-size:12px;margin-top:10px">${html}</div>
          ${octaveNote(octaveCards([...give]))}
        </div>
        <div class="trade-bar"><div class="grow"></div><button class="btn btn--big" data-send>${esc(sendLabel)}</button></div>`;
      const views = Object.fromEntries([...theirs, ...mine].map((t) => [t.copyId, t]));
      root.querySelector('[data-get]').appendChild(cardRow([...get].map(theirTag).filter(Boolean), { ctx, views, width: 72, empty: 'Nothing: a gift to them' }));
      root.querySelector('[data-give]').appendChild(cardRow([...give].map((c) => mine.find((t) => t.copyId === c)).filter(Boolean), { ctx, views, width: 72 }));
      root.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => ((step = b.dataset.edit), draw())));
      const send = root.querySelector('[data-send]');
      send.disabled = !give.size || store.get().profile.embers < seal;
      send.onclick = async () => {
        send.disabled = true;
        try {
          await onSend([...give], [...get]);
        } catch (err) {
          sfx.error?.();
          ctx.toast(err.message);
          send.disabled = false;
        }
      };
    }
    window.scrollTo?.(0, 0);
    root.querySelector('[data-back]').onclick = () => {
      const i = steps.indexOf(step);
      if (i === 0) return onBack?.();
      step = steps[i - 1];
      draw();
    };
    root.querySelector('[data-next]')?.addEventListener('click', () => {
      sfx.select();
      step = steps[steps.indexOf(step) + 1];
      draw();
    });
  };
  draw();
}

/**
 * Accepting a trade: what changes hands, the seal, and a short pause before the
 * button works (no accepting by accident). Resolves true when they accept.
 */
export function confirmTrade(ctx, { give, get, seal, views = {}, who }) {
  return new Promise((resolve) => {
    const giving = give.map((t) => t.copyId);
    const inOctave = octaveCards(giving);
    let done = false;
    const m = ctx.modal(
      `<div class="trade-confirm">
        <div class="kicker">Trade with ${esc(who)}</div>
        <div class="h-display" style="font-size:22px;margin:4px 0 10px">Check it, then accept</div>
        <div class="kicker">You get</div><div data-get></div>
        <div class="kicker" style="margin-top:10px">You give</div><div data-give></div>
        <div class="muted" style="font-size:13px;margin-top:10px">${seal ? `Trade Seal: <b class="gold">${seal} Embers</b> (you have ${store.get().profile.embers}) · ` : ''}Trades are final.</div>
        ${octaveNote(inOctave)}
        <button class="btn btn--big" data-yes style="width:100%;margin-top:14px" disabled>Wait…</button>
        <button class="btn btn--ghost" data-no style="width:100%;margin-top:8px">Not now</button>
      </div>`,
      { onClose: () => !done && resolve(false) },
    );
    m.el.querySelector('[data-get]').appendChild(cardRow(get, { ctx, views, width: 72 }));
    m.el.querySelector('[data-give]').appendChild(cardRow(give, { ctx, views, width: 72, empty: 'Nothing: a gift' }));
    const yes = m.el.querySelector('[data-yes]');
    if (!inOctave.length)
      setTimeout(() => {
        yes.disabled = false;
        yes.textContent = 'Accept trade';
      }, 1500);
    else yes.textContent = 'Can’t accept yet';
    yes.onclick = () => ((done = true), m.close(), resolve(true));
    m.el.querySelector('[data-no]').onclick = () => m.close();
  });
}
