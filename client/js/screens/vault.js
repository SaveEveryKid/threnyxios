// THE VAULT — the collection as a place. Faction pages, silhouettes for what
// is missing, and every copy's Legacy.
import * as store from '../core/store.js';
import { MASTERY, cardStats, masteryLevel, masteryNext } from '../../../engine/goals.js';
import { CARDS, LIST as SET, FACTIONS, UNIQUE_IDS } from '../../../engine/cards/index.js';
// the set, plus any one-of-one this player owns (they're never in the set list)
const ownedUnique = (s) => [...UNIQUE_IDS].filter((id) => owned(s.profile, id) > 0).map((id) => CARDS[id]);
import { owned, BURN, CRAFT, CRAFT_OWN_FIRST, ASCENSION, ascTier, ascendList, ascendSpares } from '../../../engine/collection.js';
import * as vault from '../core/vault.js';
import { legacyHtml } from '../ui/legacy.js';
import { lookFor } from '../ui/look.js';
import { renderCard, esc } from '../ui/card.js';
import { sfx } from '../core/audio.js';

const NAME = { crown: 'Ashen Crown', quiet: 'The Quiet', hour: 'Hourwrights', margin: 'The Margin', vigil: 'The Vigil' };
const RORDER = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4 };
let tab = 'crown';
let view = 'faction'; // 'faction' | 'rarity' | 'ascend'
let back = 'faction'; // where the Ascend view returns to
let rtab = 'legendary';
const RARITIES = ['common', 'rare', 'epic', 'legendary', 'mythic'];
const RNAME = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', mythic: 'Mythic' };

export function render(root, params, ctx) {
  const s = store.get();
  if (params.tab) tab = params.tab;
  if (params.view === 'ascend' && view !== 'ascend') (back = view), (view = 'ascend');
  if (view === 'ascend') return renderAscend(root, params, ctx);
  const ready = ascendList(s.profile).filter((a) => a.ready).length;
  const byR = view === 'rarity';
  const cards = byR
    ? [...ownedUnique(s), ...SET].filter((c) => c.rarity === rtab).sort((a, b) => FACTIONS.indexOf(a.faction) - FACTIONS.indexOf(b.faction) || a.no - b.no)
    : [...ownedUnique(s), ...SET].filter((c) => c.faction === tab).sort((a, b) => RORDER[a.rarity] - RORDER[b.rarity] || a.no - b.no);
  const col = byR ? `var(--r-${rtab}, var(--gold))` : `var(--${tab})`;
  const have = cards.filter((c) => owned(s.profile, c.id) > 0).length;
  const total = SET.filter((c) => owned(s.profile, c.id) > 0).length;
  root.innerHTML = `
    <div class="row"><div class="grow"><div class="kicker">The Vault · ${total} / ${SET.length}</div></div>
      <button class="btn btn--sm btn--dark" data-octave>Octaves</button></div>
    <button class="panel asc-open ${ready ? 'has' : ''}" data-ascview><span class="asc-open__ico">✦</span><span class="grow"><b>Cards ready to Ascend</b><span>${ready ? `${ready} card${ready > 1 ? 's' : ''} can be upgraded now` : 'See which cards are close'}</span></span>${ready ? `<em>${ready}</em>` : ''}<span class="gold">›</span></button>
    <div class="row" style="gap:6px;margin-top:10px"><span class="kicker">Sort by</span>
      <button class="chip ${byR ? '' : 'on'}" data-view="faction">Faction</button><button class="chip ${byR ? 'on' : ''}" data-view="rarity">Rarity</button></div>
    <div class="tabs" style="margin-top:8px">${byR ? RARITIES.map((r) => `<button class="${r === rtab ? 'on' : ''}" data-rtab="${r}">${RNAME[r]}</button>`).join('') : FACTIONS.map((f) => `<button class="${f === tab ? 'on' : ''}" data-tab="${f}">${NAME[f].replace('The ', '')}</button>`).join('')}</div>
    <div class="vault-head"><div class="grow"><div class="h1" style="color:${col}">${byR ? RNAME[rtab] : NAME[tab]}</div></div>
      <div class="vault-count">${have}<span> / ${cards.length}</span></div></div>
    <div class="progress" style="margin-bottom:14px"><i style="width:${(100 * have) / cards.length}%;background:${col}"></i></div>
    <div class="vault-grid" data-grid></div>
    <div class="panel" style="margin-top:16px">
      <div class="row"><div class="grow"><div class="kicker">Embers</div><div class="h-display" style="font-size:24px;margin-top:4px">${s.profile.embers}</div></div>
      <button class="btn btn--sm btn--ghost" data-burnall>Burn spares</button></div>
      <div class="muted" style="font-size:13px;margin-top:6px">Burning keeps your first copy, every Foil / Alt Art / Immortal, and enough copies for your next Ascension.</div>
    </div>`;
  const grid = root.querySelector('[data-grid]');
  for (const c of cards) {
    const n = owned(s.profile, c.id);
    const cell = document.createElement('div');
    cell.className = 'cell';
    if (n) {
      const copy = s.profile.items[s.profile.copies[c.id][0]];
      cell.appendChild(renderCard(c, { width: 84, flat: true, ...lookFor(c.id) }));
      if (n > 1) cell.insertAdjacentHTML('beforeend', `<span class="count-badge">×${n}</span>`);
      cell.onclick = () => (sfx.select(), detail(c, ctx, () => render(root, params, ctx)));
    } else {
      cell.innerHTML = `<div class="silhouette">?<small>${c.rarity}</small></div>`;
      cell.onclick = () => detail(c, ctx, () => render(root, params, ctx));
    }
    grid.appendChild(cell);
  }
  root.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => ((tab = b.dataset.tab), sfx.nav(), render(root, params, ctx))));
  root.querySelectorAll('[data-rtab]').forEach((b) => (b.onclick = () => ((rtab = b.dataset.rtab), sfx.nav(), render(root, params, ctx))));
  root.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => ((view = b.dataset.view), sfx.nav(), render(root, params, ctx))));
  root.querySelector('[data-octave]').onclick = () => ctx.go('octave');
  root.querySelector('[data-ascview]').onclick = () => (sfx.nav(), (back = view), (view = 'ascend'), render(root, params, ctx));
  root.querySelector('[data-burnall]').onclick = async (e) => {
    e.currentTarget.disabled = true;
    let gained = 0;
    try {
      gained = (await vault.act('burnSpares')).embers;
    } catch (err) {
      ctx.toast(err.message);
      return render(root, params, ctx);
    }
    if (gained) sfx.reward();
    ctx.toast(gained ? `+${gained} Embers` : 'No spares to burn');
    render(root, params, ctx);
  };
}

// Ready to Ascend: every card with enough spare copies, upgraded in one tap;
// then the ones that are close, so you know what to hold on to.
function renderAscend(root, params, ctx) {
  const s = store.get();
  const all = ascendList(s.profile);
  const ready = all.filter((a) => a.ready);
  const close = all.filter((a) => !a.ready && a.spare > 0).slice(0, 30);
  const row = (a) => {
    const c = CARDS[a.id];
    const nxt = a.next;
    return `<div class="asc-row" data-id="${a.id}">
      <div class="asc-row__card" data-open></div>
      <div class="grow" style="min-width:0">
        <b class="asc-row__name">${esc(c.name)}</b>
        <div class="asc-row__tier">${a.tier ? ASCENSION[a.tier - 1].name : 'Not yet Ascended'} <span class="gold">→ ${nxt.name}</span></div>
        <div class="asc-row__bar"><i style="width:${Math.min(100, (100 * a.spare) / nxt.copies)}%"></i></div>
        <div class="asc-row__n">${a.ready ? `${a.spare} spare${a.spare > 1 ? 's' : ''} · uses ${nxt.copies}` : `${a.spare} / ${nxt.copies} spare copies`}</div>
      </div>
      ${a.ready ? `<button class="btn btn--sm" data-go>Ascend</button>` : ''}
    </div>`;
  };
  root.innerHTML = `
    <div class="row"><button class="btn btn--sm btn--ghost" data-back>‹ Vault</button><div class="grow"></div></div>
    <div class="kicker" style="margin-top:10px">The Vault</div><div class="h1">Ready to Ascend</div>
    <div class="lore" style="margin:4px 0 12px">Spend spare copies to upgrade a card's look: Tempered, then Radiant, then Ascended. Looks only, never Power. Foil, Alt Art and Immortal copies are never spent.</div>
    ${ready.length ? `${ready.length > 1 ? `<button class="btn btn--big" data-all style="width:100%;margin-bottom:12px">Ascend all ${ready.length}</button>` : ''}<div class="stack asc-list">${ready.map(row).join('')}</div>` : '<div class="panel muted" style="padding:16px;text-align:center">No cards are ready yet. Open packs to collect spare copies.</div>'}
    ${close.length ? `<div class="sheet-label" style="margin-top:18px">Almost there</div><div class="stack asc-list">${close.map(row).join('')}</div>` : ''}`;
  root.querySelectorAll('.asc-row').forEach((el) => {
    const id = el.dataset.id;
    el.querySelector('[data-open]').appendChild(renderCard(CARDS[id], { width: 64, flat: true, ...lookFor(id) }));
    el.querySelector('[data-open]').onclick = () => (sfx.select(), detail(CARDS[id], ctx, () => render(root, params, ctx)));
  });
  const ascendOne = async (id) => {
    try {
      await vault.act('ascend', { cardId: id });
      return true;
    } catch (e) {
      sfx.error();
      ctx.toast(e.message);
      return false;
    }
  };
  root.querySelectorAll('[data-go]').forEach((b) => {
    b.onclick = async () => {
      const id = b.closest('.asc-row').dataset.id;
      b.disabled = true;
      if (await ascendOne(id)) {
        sfx.rarity('legendary');
        ctx.toast(`${CARDS[id].name} is now ${ASCENSION[(store.get().profile.ascension[id] || 1) - 1].name}`);
      }
      render(root, params, ctx);
    };
  });
  root.querySelector('[data-all]')?.addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    let n = 0;
    for (const a of ready) if (await ascendOne(a.id)) n++;
    if (n) (sfx.rarity('legendary'), ctx.toast(`${n} card${n > 1 ? 's' : ''} Ascended`));
    render(root, params, ctx);
  });
  root.querySelector('[data-back]').onclick = () => (sfx.nav(), (view = back === 'ascend' ? 'faction' : back), render(root, { ...params, view: null }, ctx));
}

// Mastery: four steps earned by what this Champion does (engine/goals.js)
function masteryHtml(profile, cardId) {
  const stats = cardStats(profile, cardId);
  const lvl = masteryLevel(stats);
  const nx = masteryNext(stats);
  return `<div class="mastery">
    <div class="kicker">Mastery${lvl ? ` · <span class="gold">${MASTERY[lvl - 1].name}</span>` : ''}</div>
    <div class="mastery__steps">${MASTERY.map((m, i) => `<div class="mastery__step ${i < lvl ? 'on' : i === lvl ? 'next' : ''}"><b>${i < lvl ? '★' : i + 1}</b><span>${m.name}</span></div>`).join('')}</div>
    ${nx ? `<div class="mastery__next">${esc(nx.step.text)} <span class="muted">(${Object.entries(nx.have).map(([k, v]) => `${v}/${nx.step.need[k]}`).join(' · ')})</span><div class="mastery__bar"><i style="width:${Math.round(100 * nx.progress)}%"></i></div></div>` : '<div class="mastery__next gold">Fully mastered</div>'}
  </div>`;
}

function fmtDate(t) {
  return new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function detail(card, ctx, onChange) {
  const s = store.get();
  const n = owned(s.profile, card.id);
  const m = ctx.modal(`<div data-card></div><div data-body class="stack" style="align-items:center;width:100%"></div>`);
  const cw = Math.min(300, innerWidth - 60);
  const ASC_LOOK = { 1: 'faction metalwork on the frame', 2: 'the trim glows, a lit name plate and a light sweep', 3: 'motes rise through the painting and it wears the Ascended crest' };
  let ci = 0;
  const draw = () => {
    const st = store.get();
    const copies = st.profile.copies[card.id] || [];
    const first = copies[0] ? st.profile.items[copies[0]] : null;
    const holder = m.el.querySelector('[data-card]');
    holder.innerHTML = '';
    holder.appendChild(renderCard(card, { size: 'full', width: cw, tilt: true, ...(first ? lookFor(card.id) : {}) }));
    const body = m.el.querySelector('[data-body]');
    const tier = st.profile.ascension[card.id] || 0;
    const next = ascTier(card.id, tier);
    const spare = ascendSpares(st.profile, card.id);
    if (!first) {
      body.innerHTML = `<div class="lore" style="text-align:center;max-width:320px">${esc(card.bio)}</div>
        ${CRAFT_OWN_FIRST.has(card.rarity) ? `<div class="muted" style="text-align:center;font-size:13px;margin-top:10px">${card.rarity === 'mythic' ? 'Mythics' : 'Legendaries'} are found in packs and Spoils, never crafted. Once you pull one, Embers can make more copies of it for Ascension.</div>` : `<div class="vault-actions"><button class="btn" data-craft ${st.profile.embers >= CRAFT[card.rarity] ? '' : 'disabled'}>Craft · ${CRAFT[card.rarity]} Embers</button></div>`}`;
    } else {
      ci = Math.min(ci, copies.length - 1);
      const it = st.profile.items[copies[ci]];
      body.innerHTML = `
        <div class="lore card-bio">${esc(card.bio)}</div>
        ${copies.length > 1 ? `<div class="copy-tabs">${copies.map((c, i) => `<button class="${i === ci ? 'on' : ''}" data-ci="${i}">Copy ${i + 1}<small>${st.profile.items[c].stats.battles} Clashes</small></button>`).join('')}</div>` : ''}
        ${masteryHtml(st.profile, card.id)}
        ${legacyHtml(it, { extra: `<dt>Ascension</dt><dd>${tier ? ASCENSION[tier - 1].name : '—'}</dd>` })}
        ${next ? `<div class="muted" style="font-size:13px;text-align:center;max-width:320px">Next: <b class="gold">${next.name}</b> · ${ASC_LOOK[next.tier]}. Spend ${next.copies} spare cop${next.copies === 1 ? "y" : "ies"}. Looks only, never Power.</div>` : ''}
        <div class="vault-actions">
          <button class="btn btn--dark" data-ascend ${next && spare >= next.copies ? '' : 'disabled'}>${next ? `Ascend · ${spare}/${next.copies}` : 'Ascended'}</button>
          <button class="btn btn--ghost" data-burn ${spare > 0 ? '' : 'disabled'}>Burn 1 · +${BURN[card.rarity]}</button>
        </div>
        ${next && !card.unique ? `<div class="vault-actions"><button class="btn btn--ghost" data-craft ${st.profile.embers >= CRAFT[card.rarity] ? '' : 'disabled'}>Craft a copy for Ascension · ${CRAFT[card.rarity].toLocaleString()} Embers</button></div>` : ''}`;
    }
    body.querySelectorAll('[data-ci]').forEach((b) => (b.onclick = () => ((ci = +b.dataset.ci), draw())));
    // each change is made by the vault (the server, when signed in)
    const run = async (btn, name, args) => {
      btn.disabled = true;
      try {
        return (await vault.act(name, args)) || {};
      } catch (e) {
        sfx.error();
        ctx.toast(e.message);
        draw();
        return null;
      }
    };
    body.querySelector('[data-craft]')?.addEventListener('click', async (e) => {
      if (!(await run(e.currentTarget, 'craft', { cardId: card.id }))) return;
      sfx.rarity(card.rarity);
      ctx.toast(`Crafted ${card.name}`);
      onChange();
      draw();
    });
    body.querySelector('[data-ascend]')?.addEventListener('click', async (e) => {
      if (!(await run(e.currentTarget, 'ascend', { cardId: card.id }))) return;
      sfx.rarity('legendary');
      ctx.toast(`${card.name} Ascended`);
      onChange();
      draw();
    });
    body.querySelector('[data-burn]')?.addEventListener('click', async (e) => {
      const x = store.get();
      const std = x.profile.copies[card.id].slice(1).filter((c) => x.profile.items[c].treatment === 'standard');
      if (!std.length) return;
      if (!(await run(e.currentTarget, 'burn', { copyId: std[std.length - 1] }))) return;
      sfx.select();
      onChange();
      draw();
    });
  };
  if (!n) {
    // Missing card: show the silhouette-card with its lore; craftable.
  }
  draw();
}
