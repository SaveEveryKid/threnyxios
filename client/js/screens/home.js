import * as store from '../core/store.js';
import { FEATURES } from '../core/features.js';
import { oktoberLine } from './oktober.js';
import { phase as oktoberPhase } from '../../../engine/oktober.js';
import * as vault from '../core/vault.js';
import { icon } from '../ui/icons.js';
import { sfx } from '../core/audio.js';
import { LIST } from '../../../engine/cards/index.js';
import { owned } from '../../../engine/collection.js';
import { openEntries } from './codex.js';
import { esc } from '../ui/card.js';
import { factionArt, uiArt } from '../art/index.js';
import { SHARE_CHIMES } from '../../../engine/referral.js';
import { install, installed } from '../ui/install.js';
import { WORLD_VERSION } from './world.js';
import * as cloud from '../core/cloud.js';
const { isGuest } = cloud;

const FACTION_NAME = { crown: 'Ashen Crown', quiet: 'The Quiet', hour: 'Hourwrights', margin: 'The Margin', vigil: 'The Vigil' };

function fmt(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function render(root, params, { go, toast, modal }) {
  const s = store.get();
  const today = store.dayKey();
  const tickets = Object.values(s.profile.tickets).reduce((a, b) => a + b, 0) + s.free.charges;
  const have = LIST.filter((c) => owned(s.profile, c.id) > 0).length;

  // The single most important thing to do right now.
  let primary;
  if (s.free.charges > 0) primary = { label: `Open your packs (${s.free.charges})`, sub: 'Free packs are ready', to: ['packs'] };
  else primary = { label: 'Battle', sub: store.tierName(), to: ['play'] };

  // From the Codex: the newest unread entry, else a random open one.
  const open = openEntries(s);
  const unread = open.filter((e) => !(s.codexSeen || []).includes(e.id));
  const lore = unread[unread.length - 1] || open[today % open.length];
  const obj = s.daily.objectives;
  const objDone = store.objectivesDone();
  const claimsTotal = Object.values(s.claims).reduce((a, b) => a + b, 0) || 1;

  const bannerArt = uiArt('oktober-banner', true);
  root.innerHTML = `
    <div class="hero"><div class="star"></div>
      <div class="logo">THRENYX</div>
      <div class="season">SEASON I · FIRSTFALL</div>
    </div>
    <button class="panel world-tile ${(s.worldSeen || 0) < WORLD_VERSION ? 'is-new' : ''}" data-to="world">${uiArt('world-tile') ? `<span class="world-tile__ico world-tile__ico--art" aria-hidden="true" style="background-image:url('${uiArt('world-tile')}')"></span>` : '<span class="world-tile__ico" aria-hidden="true">?</span>'}<span class="grow"><b>What is Threnyx?</b><span>The story of the world: the song, the fire and the star that fell</span></span>${(s.worldSeen || 0) < WORLD_VERSION ? '<em>New</em>' : '<span class="gold">›</span>'}</button>
    <div class="now">
      <button class="btn btn--big btn--pulse" data-go="primary">${primary.label}</button>
      <div class="muted" style="text-align:center;font-size:13px;letter-spacing:.2em;text-transform:uppercase">${primary.sub}</div>
    </div>
    ${isGuest() ? `<button class="panel guest-save" data-saveprofile><span class="grow"><b>Save your profile</b><span>Keep your ${have} Champions and your rewards, on any device. Free.</span></span><span class="gold">›</span></button>` : ''}
    ${oktoberPhase() !== 'over' ? `<button class="panel panel--gold okt-banner" data-to="oktober" style="margin-top:18px${bannerArt ? `;background-image:linear-gradient(90deg,rgba(20,6,8,.94) 35%,rgba(20,6,8,.25)),url('${bannerArt}')` : ''}">
      <div class="okt-bell" aria-hidden="true"></div>
      <div class="grow"><div class="kicker">Tournament</div><b>Oktoberfest</b><span>Win the one-of-one Eighth Bell · ${esc(oktoberLine())}</span></div>
    </button>` : ''}
    <button class="panel install-tile" data-to="invite" style="margin-top:12px"><span class="install-tile__ico install-tile__ico--invite" aria-hidden="true"></span><span class="grow"><b>Invite friends</b><span>${store.get().econ?.shared ? 'Packs for you both when they play' : `Share THRENYX for ${SHARE_CHIMES} free Chimes`}</span></span><span class="gold">›</span></button>
    ${installed() ? '' : `<button class="panel install-tile" data-install style="margin-top:12px"><span class="install-tile__ico" aria-hidden="true"></span><span class="grow"><b>Add THRENYX to your home screen</b><span>One tap to play, full screen, like an app</span></span><span class="gold">›</span></button>`}
    <div class="tiles" style="margin-top:18px">
      <button class="tile panel" data-to="play">${icon('u-battle')}<b>Battle</b><span>${store.tierName()} · ${s.ladder.wins}W ${s.ladder.losses}L</span></button>
      <button class="tile panel" data-to="road">${icon('i-read')}<b>The Long Road</b><span>${s.road && !s.road.done ? `Stop ${s.road.floor + 1} of 9` : 'Nine stops, one run'}</span></button>
      <button class="tile panel" data-to="packs">${icon('u-pack')}<b>Packs</b><span>${tickets} to open${s.free.charges < 2 ? ` · next free ${fmt(store.nextFreeIn())}` : ''}</span></button>
      <button class="tile panel" data-to="vault">${icon('u-vault')}<b>Vault</b><span>${have} / ${LIST.length} Champions</span></button>
      <button class="tile panel" data-to="story">${icon('s-vigil')}<b>Story</b><span>Chapter ${Math.min(10, s.story.chapter + 1)} of 10</span></button>
      <button class="tile panel" data-to="draft">${icon('i-focus')}<b>Draft</b><span>Pure skill · no collection</span></button>
      <button class="tile panel" data-to="trade">${icon('u-pack')}<b>Trade</b><span data-trade-sub>Trade Board · the Hall</span></button>
      <button class="tile panel" data-to="friends">${icon('u-battle')}<b>Friends</b><span data-friends-sub>Duel and trade together</span></button>
    </div>
    ${lore ? `<button class="panel codex-teaser" data-to="codex" style="margin-top:14px">
      <div class="row"><div class="kicker grow">From the Codex${unread.length ? ` · <span class="gold">${unread.length} new</span>` : ''}</div><span class="muted" style="font-size:12px">${open.length} unsealed</span></div>
      <div class="h-display" style="font-size:18px;margin-top:6px">${esc(lore.title)}</div>
      <div class="lore codex-teaser__text">${esc(lore.text)}</div></button>` : ''}
    <div class="panel" style="margin-top:14px">
      <div class="row"><div class="kicker grow">Today</div>${objDone && !s.daily.claimed ? '<button class="btn btn--sm" data-claim>Claim ticket</button>' : s.daily.claimed ? '<span class="tag">Claimed</span>' : ''}</div>
      ${obj.map((o) => `<div class="objective ${o.have >= o.goal ? 'done' : ''}"><span class="chk">${o.have >= o.goal ? '✓' : ''}</span><span class="grow">${o.text}</span><span class="muted">${o.have}/${o.goal}</span></div>`).join('')}
    </div>
    ${FEATURES.claims ? `<div class="panel" style="margin-top:14px">
      <div class="kicker">The Firstfall Claims</div>
      ${s.pledge ? `<div class="muted" style="margin:6px 0 10px">You are pledged to <b class="gold">${FACTION_NAME[s.pledge]}</b>. Win with 4+ of their Champions to add Claim points.</div>` : `<div class="lore" style="margin:6px 0 10px">A star has fallen into the Blank. By the Accord, it belongs to whoever wins it. Pledge to a faction.</div>`}
      ${Object.keys(FACTION_NAME).map((f) => `<div class="row" style="margin:6px 0">${factionArt(f) ? `<img src="${factionArt(f)}" alt="" style="width:26px;height:26px;object-fit:contain">` : ''}<span style="width:96px;font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:var(--${f})">${FACTION_NAME[f].replace('The ', '')}</span><div class="progress grow"><i style="width:${(100 * s.claims[f]) / claimsTotal}%;background:var(--${f})"></i></div>${!s.pledge ? `<button class="btn btn--sm btn--ghost" data-pledge="${f}" style="min-height:32px;padding:0 10px;font-size:11px">Pledge</button>` : ''}</div>`).join('')}
    </div>` : ''}`;

  // players from before the Duel: a one-time welcome to the new combat
  if (s.onboard === 'done' && !s.seenDuel) import('./tutorial.js').then((t) => t.needsDuelWelcome() && t.duelWelcome({ go, toast, modal }));
  root.querySelector('[data-go="primary"]').onclick = () => {
    sfx.select();
    go(...primary.to);
  };
  root.querySelectorAll('[data-to]').forEach((b) => (b.onclick = () => (sfx.tap(), go(b.dataset.to))));
  // friend requests, messages and trade offers waiting (a saved profile only)
  if (cloud.enabled && cloud.currentUser() && !isGuest())
    vault
      .social('ping')
      .then((p) => {
        const sub = root.querySelector('[data-friends-sub]');
        const n = p.requests + p.unread;
        if (sub && n) sub.innerHTML = `<i class="tile-alert">${p.requests ? `${p.requests} request${p.requests > 1 ? 's' : ''}` : `${p.unread} new message${p.unread > 1 ? 's' : ''}`}</i>`;
        const t = root.querySelector('[data-trade-sub]');
        if (t && p.offers) t.innerHTML = `<i class="tile-alert">${p.offers} offer${p.offers > 1 ? 's' : ''} waiting</i>`;
      })
      .catch(() => {});
  root.querySelector('[data-saveprofile]')?.addEventListener('click', () => import('../ui/save-profile.js').then((m) => m.openSaveProfile({ go, toast, modal }, { why: 'home', onSaved: () => go('home', { t: Date.now() }) })));
  root.querySelector('[data-install]')?.addEventListener('click', () => install({ toast, modal }));
  root.querySelector('[data-claim]')?.addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    try {
      await vault.act('claimObjectives');
    } catch (err) {
      if (!/Already/.test(err.message)) return (toast(err.message), render(root, params, { go, toast }));
    }
    store.update((st) => (st.daily.claimed = true));
    sfx.reward();
    toast('+1 Pack Ticket');
    render(root, params, { go, toast });
  });
  root.querySelectorAll('[data-pledge]').forEach(
    (b) =>
      (b.onclick = () => {
        store.update((st) => (st.pledge = b.dataset.pledge));
        sfx.reward();
        toast(`Pledged: ${FACTION_NAME[b.dataset.pledge]}`);
        render(root, params, { go, toast });
      }),
  );
}
