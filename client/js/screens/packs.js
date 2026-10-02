// PACKS — the shelf and the opening ceremony.
import * as store from '../core/store.js';
import { isGuest } from '../core/cloud.js';
import { track } from '../core/funnel.js';
import { CARDS, LIST } from '../../../engine/cards/index.js';
import { ODDS, PITY, owned, OKTOBER_SET_CHANCE } from '../../../engine/collection.js';
import * as vault from '../core/vault.js';
import { renderCard, esc } from '../ui/card.js';
import { sfx } from '../core/audio.js';
import { haptic } from '../core/haptics.js';
import { packArt, uiArt } from '../art/index.js';
import * as music from '../core/music.js';
import { SHARE_CHIMES, REFERRAL } from '../../../engine/referral.js';
import { OFFERS, offerPrice, weeklyLeft, weekEnds } from '../../../engine/shop.js';
// pack css class -> packs/ art file
const PACK_ART = { 'pack--collector': 'collector', 'pack--faction': 'crown', 'pack--event': 'firstfall', 'pack--oktober': 'oktober', 'pack--mythic': 'collector' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PACK_INFO = {
  standard: { label: 'Standard', css: '', size: 3 },
  collector: { label: 'Collector', css: 'pack--collector', size: 5 },
  faction: { label: 'Faction', css: 'pack--faction', size: 3 },
  event: { label: 'Firstfall', css: 'pack--event', size: 3 },
  oktober: { label: 'Oktoberfest', css: 'pack--oktober', size: 5, limited: true },
  mythic: { label: 'Mythic', css: 'pack--mythic', size: 1, limited: true },
};
const pct = (x) => (x * 100).toFixed(x < 0.01 ? 1 : 0) + '%';

// shelf packs are still (a looping blended sheen per pack costs a full layer each on iPhone)
function packEl(type, { sheen = true } = {}) {
  const i = PACK_INFO[type];
  const art = packArt(PACK_ART[i.css] || 'standard');
  const sh = sheen ? '<div class="pack__sheen"></div>' : '';
  if (art) return `<div class="pack pack--art ${i.css}" style="background:center / contain no-repeat url('${art}')">${sh}</div>`;
  return `<div class="pack ${i.css}">${sh}<div class="pack__emblem">${type === 'oktober' ? 'VIII' : 'T'}</div><div class="pack__name">${i.label.toUpperCase()}</div></div>`;
}

export function render(root, params, ctx) {
  const s = store.get();
  music.preload('reveal');
  const tutorial = params.tutorial && s.onboard === 'pack';
  if (tutorial) {
    openCeremony(root, 'standard', ctx, { tutorial: true });
    return;
  }
  const avail = {
    standard: s.free.charges + s.profile.tickets.standard,
    collector: s.profile.tickets.collector,
    faction: s.profile.tickets.faction,
    event: s.profile.tickets.event,
    oktober: s.profile.tickets.oktober || 0,
    mythic: s.profile.tickets.mythic || 0,
  };
  // the Mythic Pack: how many are left to buy this week
  const MP = OFFERS.find((o) => o.id === 'mythic1');
  const mpLeft = weeklyLeft(MP, s.econ, Date.now());
  const mpDays = Math.max(1, Math.ceil((weekEnds() - Date.now()) / 86400000));
  root.innerHTML = `
    <div class="row"><div class="grow"><div class="kicker">Packs</div>
    <div class="h1">The Altar</div></div><a class="btn btn--sm btn--dark" href="#/shop">Shop</a></div>
    <div class="muted" style="font-size:14px">${s.free.charges} free · next free pack ${s.free.charges >= 2 ? 'when you open one' : 'in ' + Math.ceil(store.nextFreeIn() / 3600000) + 'h'}</div>
    ${inviteBanner(s, Object.values(avail).every((n) => !n))}
    <a class="panel mythic-call" href="#/shop" data-mythic>
      <span class="mythic-call__gem" aria-hidden="true"></span>
      <span class="grow"><b>Mythic Pack${offerPrice(MP, s.econ) < MP.chimes ? ` · <em>first one ${offerPrice(MP, s.econ)} Chimes</em>` : ''}</b>
      <span>${mpLeft ? `One guaranteed Mythic · <i class="mythic-call__left">${mpLeft} of ${MP.weekly} left this week</i>` : `This week's ${MP.weekly} are taken · more in ${mpDays} day${mpDays > 1 ? 's' : ''}`}</span></span>
      <span class="gold">›</span></a>
    <div class="shelf">${Object.keys(PACK_INFO)
      .filter((t) => !PACK_INFO[t].limited || avail[t] > 0) // limited packs show once you have one
      .sort((a, b) => !!PACK_INFO[b].limited - !!PACK_INFO[a].limited) // ...and come first
      .map(
        (t) => `<div class="shelf__item panel ${avail[t] ? '' : 'muted'}">
        ${packEl(t, { sheen: false })}
        <div class="shelf__count">${PACK_INFO[t].label} · ${avail[t]}</div>
        <button class="btn btn--sm" data-open="${t}" ${avail[t] ? '' : 'disabled'}>Open</button></div>`,
      )
      .join('')}</div>
    <div class="panel" style="margin-top:14px">
      <div class="kicker">Published odds · Standard Pack</div>
      <div class="odds" style="margin-top:6px">
        Slots 1–2: Common <b>${pct(ODDS.open.common)}</b> · Rare <b>${pct(ODDS.open.rare)}</b> · Epic <b>${pct(ODDS.open.epic)}</b> · Legendary <b>${pct(ODDS.open.legendary)}</b> · Mythic <b>${pct(ODDS.open.mythic)}</b><br>
        Slot 3 (Rare or better): Rare <b>${pct(ODDS.rarePlus.rare)}</b> · Epic <b>${pct(ODDS.rarePlus.epic)}</b> · Legendary <b>${pct(ODDS.rarePlus.legendary)}</b> · Mythic <b>${pct(ODDS.rarePlus.mythic)}</b><br>
        Legendary+ guaranteed within <b>${PITY.legendary.hard}</b> packs (yours: <b>${s.profile.pity.legendary}</b>/${PITY.legendary.hard}) · Mythic within <b>${PITY.mythic.hard}</b> (yours: <b>${s.profile.pity.mythic}</b>/${PITY.mythic.hard})<br>
        No duplicate Legendary or Mythic until you own them all. Free and paid packs are the same pack.
      </div>
      <div class="kicker" style="margin-top:12px">Mythic Pack (${MP.chimes} Chimes, ${MP.weekly} a week)</div>
      <div class="odds" style="margin-top:6px">1 card, <b>always a Mythic</b>. One you don't own yet first; once you own all five, a copy of one that still needs copies to fully Ascend (each equally likely).</div>
      <div class="kicker" style="margin-top:12px">Oktoberfest 2026 Pack (earned only)</div>
      <div class="odds" style="margin-top:6px">5 cards, <b>all foil</b>. Slots 1–4 use the Rare-or-better odds above; slot 5: Epic <b>${pct(ODDS.epicPlus.epic)}</b> · Legendary <b>${pct(ODDS.epicPlus.legendary)}</b> · Mythic <b>${pct(ODDS.epicPlus.mythic)}</b>. Earned from Oktoberfest points; never sold. <b>${Math.round(OKTOBER_SET_CHANCE * 100)}%</b> of packs also hold a bonus sixth card: one of the five Oktoberfest Set Champions in its autumn version (one you don't have yet first).</div>
    </div>`;
  root.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => (sfx.select(), openCeremony(root, b.dataset.open, ctx))));
  root.querySelector('[data-invite]')?.addEventListener('click', () => (sfx.select(), track('referral_cta_clicked', { from: 'packs' }), ctx.go('invite')));
}

// Invite friends: the best moment to ask is at the pack shelf, loudest when it's empty.
// The first share pays Chimes once; every friend who sticks around pays a pack.
function inviteBanner(s, empty) {
  const first = !s.econ?.shared;
  const title = first ? `Get ${SHARE_CHIMES} free Chimes` : 'Invite friends, earn packs';
  const line = first
    ? `Send THRENYX to a friend: ${SHARE_CHIMES} Chimes (a Standard Pack) right away, plus a pack for every friend who sticks around.`
    : `A Standard Pack for every friend who plays, and Collector Packs at ${REFERRAL.milestones.map((m) => m.at).join(', ').replace(/, (\d+)$/, ' and $1')} friends.`;
  return `<button class="panel invite-pack ${empty ? 'invite-pack--hot' : ''}" data-invite>
      <span class="invite-pack__ico" aria-hidden="true"></span>
      <span class="grow">${empty ? '<em>Out of packs?</em>' : ''}<b>${title}</b><span>${line}</span></span>
      <span class="gold">›</span></button>`;
}

async function openCeremony(root, type, ctx, { tutorial = false } = {}) {
  const app = root.parentElement;
  const ov = document.createElement('div');
  ov.className = 'opening';
  const altar = uiArt('opening', true);
  if (altar) ov.style.background = `linear-gradient(rgba(4,4,7,0.45), rgba(4,4,7,0.7)), center / cover url("${altar}")`;
  ov.innerHTML = `<div class="opening__hint">Hold to open</div><div style="position:relative">${packEl(type)}<svg class="charge" viewBox="0 0 250 250"><circle cx="125" cy="125" r="118" stroke-dasharray="741" stroke-dashoffset="741"/></svg></div><div class="dealt"></div>`;
  app.appendChild(ov);
  // the pack is opened (and rolled) by the server while the player holds
  const opening = vault.act('openPack', { type }).then((r) => (isGuest() && track('guest_pack_opened', { type }), r.cards), (e) => ({ error: e.message }));
  const pack = ov.querySelector('.pack');
  const ring = ov.querySelector('.charge circle');

  // ---- hold to open
  await new Promise((resolve) => {
    let t0 = 0;
    let raf = 0;
    let done = false;
    const HOLD = 850;
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / HOLD);
      ring.style.strokeDashoffset = String(741 * (1 - k));
      if (k >= 1 && !done) {
        done = true;
        pack.classList.remove('charging');
        resolve();
        return;
      }
      if (Math.random() < 0.18) haptic.tick();
      raf = requestAnimationFrame(tick);
    };
    const down = (e) => {
      e.preventDefault();
      if (done) return;
      t0 = performance.now();
      pack.classList.add('charging');
      sfx.packHold();
      raf = requestAnimationFrame(tick);
    };
    const up = () => {
      if (done) return;
      cancelAnimationFrame(raf);
      pack.classList.remove('charging');
      ring.style.strokeDashoffset = '741';
    };
    pack.addEventListener('pointerdown', down);
    pack.addEventListener('contextmenu', (e) => e.preventDefault()); // no long-press menu mid-charge
    window.addEventListener('pointerup', up);
    pack.addEventListener('pointercancel', up);
  });

  // ---- the pack's contents
  ov.querySelector('.opening__hint').textContent = '';
  const pulls = await opening;
  if (pulls.error) {
    ov.remove();
    ctx.toast(pulls.error);
    ctx.refreshChrome?.();
    return render(root, {}, ctx);
  }

  // ---- tear
  sfx.packTear();
  haptic.tear();
  const burst = document.createElement('div');
  burst.className = 'burst';
  ov.appendChild(burst);
  pack.parentElement.style.transition = 'transform .45s var(--ease-out), opacity .45s';
  pack.parentElement.style.transform = 'scale(1.3) translateY(40px)';
  pack.parentElement.style.opacity = '0';
  await sleep(480);
  pack.parentElement.remove();
  const hint = ov.querySelector('.opening__hint');
  const dealt = ov.querySelector('.dealt');

  // ---- reveal one by one (lowest rarity first, best last)
  for (let i = 0; i < pulls.length; i++) {
    const p = pulls[i];
    const card = CARDS[p.cardId];
    const treat = p.treatment === 'immortal' ? 'immortal' : p.treatment;
    const r = treat === 'immortal' ? 'immortal' : p.rarity;
    hint.textContent = i === pulls.length - 1 ? 'Tap to reveal' : `${i + 1} of ${pulls.length} · tap to reveal`;
    const stage = document.createElement('div');
    stage.className = 'reveal-stage';
    stage.innerHTML = `<div class="clue clue--${r}"></div><div class="flip"><div class="flip__face flip__back"></div><div class="flip__face flip__front"></div></div>`;
    stage.querySelector('.flip__back').appendChild(renderCard(null, { back: true, width: 240 }));
    const front = renderCard(card, { width: 240, tilt: true, treatment: treat === 'standard' ? null : treat, serial: p.serial ? String(p.serial).padStart(5, '0') + ' / 10000' : null });
    stage.querySelector('.flip__front').appendChild(front);
    hint.after(stage);
    stage.animate([{ transform: 'translateY(40px) scale(.9)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 350, easing: 'cubic-bezier(.16,1,.3,1)' });
    // rarity clue before the flip
    await sleep(300);
    if (r !== 'common') {
      stage.querySelector('.clue').classList.add('on');
      sfx.clue(r);
      if (r === 'legendary') haptic.rare();
    }
    // the best cards strain against the back before they're turned
    const big = ['legendary', 'mythic', 'immortal'].includes(r);
    if (big) stage.classList.add('straining', 'straining--' + (r === 'legendary' ? 'gold' : 'prism'));
    await new Promise((res) => stage.querySelector('.flip').addEventListener('click', res, { once: true }));
    stage.classList.remove('straining');
    if (r === 'legendary') {
      // a breath of dark before the gold
      ov.classList.add('is-dim');
      await sleep(420);
      ov.classList.remove('is-dim');
    }
    if (r === 'mythic' || r === 'immortal') {
      // THE HUSH.
      hint.textContent = '';
      ov.classList.add('is-hush');
      sfx.hush(950);
      await sleep(950);
      haptic[r]();
      ov.classList.remove('is-hush');
      for (let k = 0; k < 3; k++) {
        const rb = document.createElement('div');
        rb.className = 'rings-burst';
        rb.style.animationDelay = k * 0.15 + 's';
        ov.appendChild(rb);
        setTimeout(() => rb.remove(), 1800);
      }
    }
    sfx.cardFlip();
    stage.querySelector('.flip').classList.add('flipped');
    // Epic and up: their colour floods in behind the card, and one stroke of
    // light crosses it as it lands (both play once)
    if (['epic', 'legendary', 'mythic', 'immortal'].includes(r)) {
      stage.insertAdjacentHTML('afterbegin', `<div class="reveal-glow reveal-glow--${r}"></div>`);
      setTimeout(() => stage.querySelector('.flip__front')?.insertAdjacentHTML('beforeend', '<div class="reveal-shine"></div>'), 420);
    }
    await sleep(380);
    if (!(['legendary', 'mythic', 'immortal'].includes(r) && music.sting('reveal'))) sfx.rarity(r);
    if (r === 'legendary') haptic.legendary();
    else if (r === 'rare' || r === 'epic') haptic.rare();
    if (['legendary', 'mythic', 'immortal'].includes(r)) {
      const w = document.createElement('div');
      w.className = `rarity-word rarity-word--${r}`;
      w.textContent = r.toUpperCase();
      ov.appendChild(w);
      setTimeout(() => w.remove(), 1700);
    }
    if (p.isNew) {
      const tag = document.createElement('span');
      tag.className = 'tag tag--new';
      tag.style.cssText = 'position:absolute;top:-10px;left:50%;transform:translateX(-50%);z-index:9';
      tag.textContent = 'New';
      stage.appendChild(tag);
    }
    hint.textContent = 'Tap to continue';
    await new Promise((res) => stage.addEventListener('click', res, { once: true }));
    stage.remove();
    const mini = renderCard(card, { width: 48, flat: true });
    dealt.appendChild(mini);
  }

  // ---- summary
  hint.textContent = '';
  dealt.remove();
  const s = store.get();
  const left = type === 'standard' ? s.free.charges + s.profile.tickets.standard : s.profile.tickets[type];
  const sum = document.createElement('div');
  sum.className = 'stack';
  sum.style.cssText = 'align-items:center;width:100%;padding:0 16px';
  sum.innerHTML = `<div class="kicker">${tutorial ? 'Your first Champions' : 'Added to your Vault'}</div>
    <div class="summary ${pulls.length > 3 ? 'summary--5' : ''}"></div>
    <div class="row" style="width:100%;max-width:360px;gap:10px">
      ${!tutorial && left > 0 ? `<button class="btn btn--ghost grow" data-again>Open another (${left})</button>` : ''}
      <button class="btn grow" data-done>${tutorial ? 'To battle' : 'Done'}</button>
    </div>`;
  ov.appendChild(sum);
  const grid = sum.querySelector('.summary');
  for (const p of pulls) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    const c = renderCard(CARDS[p.cardId], { width: 104, flat: true, treatment: p.treatment === 'standard' ? null : p.treatment });
    c.onclick = () => ctx.modal('<div></div>').el.lastElementChild.replaceWith(renderCard(CARDS[p.cardId], { size: 'full', width: Math.min(320, innerWidth - 40), tilt: true, treatment: p.treatment === 'standard' ? null : p.treatment }));
    cell.appendChild(c);
    cell.insertAdjacentHTML('beforeend', p.isNew ? '<span class="tag tag--new">New</span>' : `<span class="muted" style="font-size:11px;letter-spacing:.14em">DUPLICATE · ${owned(s.profile, p.cardId)} OWNED</span>`);
    grid.appendChild(cell);
  }
  ctx.refreshChrome();
  sum.querySelector('[data-again]')?.addEventListener('click', () => {
    ov.remove();
    openCeremony(root, type, ctx);
  });
  sum.querySelector('[data-done]').onclick = () => {
    ov.remove();
    if (tutorial) ctx.go('story');
    else render(root, {}, ctx);
  };
}
