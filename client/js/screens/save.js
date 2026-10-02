// SAVE YOUR THRENYX PROFILE — where a guest lands when the free Duels are used
// up, or when they reach for something that needs a saved profile (Ranked,
// Alliances, purchases). It's about keeping what they've built, not a sign-up
// wall: nothing they have is touched while they're here. docs/18-guest-play.md.
import * as store from '../core/store.js';
import * as cloud from '../core/cloud.js';
import { esc } from '../ui/card.js';
import { openSignIn } from '../ui/account.js';
import { openSaveProfile, takeIntent } from '../ui/save-profile.js';
import { track } from '../core/funnel.js';
import { LIST } from '../../../engine/cards/index.js';
import { owned } from '../../../engine/collection.js';

const WHY = {
  limit: ['You’ve played your guest Duels', 'Your Champions are waiting. Create a free account to keep playing, and to keep:'],
  online: ['Ranked needs a saved profile', 'Ranked matches, ratings and challenge links follow your profile. Save it to keep:'],
  alliance: ['Alliances need a saved profile', 'Alliances are for saved profiles. Save yours to keep:'],
  invite: ['Invites need a saved profile', 'Invite rewards go to a saved profile. Save yours to keep:'],
  friends: ['Friends need a saved profile', 'Friends, messages and challenges follow your profile. Save it to keep:'],
  trade: ['Trading needs a saved profile', 'Trades move real cards between real players, so they need a saved profile. Save yours to keep:'],
  shop: ['Save your profile to make purchases', 'Everything you buy is kept on your profile, on every device. Save it to keep:'],
  save: ['Save your THRENYX profile', 'Create a free account to keep:'],
};
// where to go once saved, for each reason
const AFTER = { limit: 'play', online: 'online', alliance: 'alliance', invite: 'invite', shop: 'shop', friends: 'friends', trade: 'trade', save: 'home' };

export function render(root, params, ctx) {
  const why = WHY[params.why] ? params.why : 'save';
  // a saved profile has nothing to do here
  if (!cloud.isGuest()) return void ctx.go(AFTER[why] || 'home');
  track('account_prompt_shown', { why });
  const s = store.get();
  const champs = LIST.filter((c) => owned(s.profile, c.id) > 0).length;
  const packs = Object.values(s.profile.tickets || {}).reduce((a, b) => a + b, 0) + (s.free?.charges || 0);
  const [title, lead] = WHY[why];
  root.innerHTML = `
    <div class="save-gate">
      <div class="save-gate__crest" aria-hidden="true"></div>
      <div class="kicker">${esc(title)}</div>
      <div class="h1">Save your THRENYX profile</div>
      <div class="lore" style="margin:6px 0 12px">${esc(lead)}</div>
      <ul class="save-gate__keep">
        <li><b>${champs}</b> Champions in your collection</li>
        <li><b>${packs}</b> unopened ${packs === 1 ? 'pack' : 'packs'} and your rewards</li>
        <li><b>${s.stats?.matches || 0}</b> ${s.stats?.matches === 1 ? 'Duel' : 'Duels'} in your history</li>
        <li>Your player name${s.settings.name && s.settings.name !== 'You' ? `: <b>${esc(s.settings.name)}</b>` : ''}</li>
        <li>Your progress, on any device</li>
      </ul>
      <button class="btn btn--big btn--pulse" data-save style="width:100%">Save my profile</button>
      <div class="row" style="justify-content:center;gap:6px;margin-top:14px;font-size:14px"><span class="muted">Existing player?</span><button class="linkish" data-signin>Sign in</button></div>
      <button class="btn btn--sm btn--ghost" data-back style="margin:18px auto 0;display:block">${why === 'limit' ? 'Look at my collection' : 'Not now'}</button>
    </div>`;
  const saved = () => {
    const intent = takeIntent();
    ctx.go(intent?.to || AFTER[why] || 'home', intent?.params || {});
  };
  root.querySelector('[data-save]').onclick = () => openSaveProfile(ctx, { why, onSaved: saved });
  root.querySelector('[data-signin]').onclick = () => openSignIn(ctx, 'in');
  root.querySelector('[data-back]').onclick = () => ctx.go(why === 'limit' ? 'vault' : 'home');
}
