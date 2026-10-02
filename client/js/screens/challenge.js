// A FRIEND'S DUEL INVITATION — threnyxtcg.com/?duel=CODE lands here
// (#/duel?code=CODE). "Byron challenged you to a Duel" → a name → the Duel.
// No account, no code to type, no training forced. A visitor becomes a guest
// only when they accept. docs/18-guest-play.md.
import * as store from '../core/store.js';
import * as cloud from '../core/cloud.js';
import * as vault from '../core/vault.js';
import { esc } from '../ui/card.js';
import { sfx } from '../core/audio.js';
import { track } from '../core/funnel.js';
import { onlineServer } from '../core/pvp.js';
import { enterMatch } from './online.js';
import { deckProblem } from '../../../engine/pvp.js';
import { CARDS } from '../../../engine/cards/index.js';
import { textProblem } from '../../../engine/text-filter.js';
import { markTrainingSkipped } from './tutorial.js';

const NAME_OK = /^[\p{L}\p{N} _.'-]{2,18}$/u;

export async function render(root, params, ctx) {
  const code = String(params.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  root.innerHTML = `<div class="invite-duel"><div class="kicker">A Duel invitation</div><div class="h1">One moment…</div></div>`;
  let peek = { status: 'invalid' };
  try {
    if (code.length === 6) peek = await onlineServer.call('peek', { code });
  } catch {
    peek = { status: 'offline' };
  }
  if (!root.isConnected) return;
  track(peek.status === 'open' ? 'friend_invite_opened' : 'friend_invite_invalid', { status: peek.status }, { oncePerSession: true });
  if (peek.status !== 'open') return gone(root, ctx, peek.status);

  const s = store.get();
  const signedIn = !!cloud.currentUser();
  const named = s.settings.name && s.settings.name !== 'You' ? s.settings.name : '';
  const fresh = s.onboard !== 'done' && !(s.tut?.lesson > 0);
  root.innerHTML = `
    <div class="invite-duel">
      <div class="invite-duel__sigil" aria-hidden="true"></div>
      <div class="kicker">A Duel invitation</div>
      <div class="invite-duel__title"><b>${esc(peek.name || 'A friend')}</b> challenged you to a Duel</div>
      <div class="lore" style="text-align:center;margin:6px 0 16px">Eight Champions each. Read them, outthink them, win.</div>
      <form data-form class="invite-duel__form" novalidate>
        ${signedIn && !cloud.isGuest() ? '' : `<label class="save-pro__label">What should we call you?
          <input data-name value="${esc(named)}" maxlength="18" placeholder="Your player name" autocomplete="nickname" enterkeyhint="go" autocapitalize="words" style="width:100%;min-height:48px;padding:0 12px;background:rgba(255,255,255,.05);border:0;border-radius:8px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.14);color:var(--bone);font:inherit;font-size:16px;box-sizing:border-box">
        </label>`}
        <button class="btn btn--big btn--pulse" data-accept style="width:100%">Accept Duel</button>
      </form>
      <div data-msg class="save-pro__msg" role="alert"></div>
      ${fresh ? `<div class="invite-duel__new"><span class="muted">New to THRENYX?</span> <button class="linkish" data-learn>60-second training</button></div>` : ''}
    </div>`;
  const msg = root.querySelector('[data-msg]');
  const btn = root.querySelector('[data-accept]');
  root.querySelector('[data-learn]')?.addEventListener('click', async () => {
    sfx.select();
    const { quickLesson } = await import('./tutorial.js');
    quickLesson(ctx, { back: `duel?code=${code}` });
  });
  let busy = false;
  root.querySelector('[data-form]').onsubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const input = root.querySelector('[data-name]');
    const name = input ? input.value.trim() : store.get().settings.name;
    if (input) {
      if (!NAME_OK.test(name)) return (msg.textContent = 'Pick a name: 2–18 letters or numbers.');
      const bad = textProblem(name);
      if (bad) return (msg.textContent = bad);
    }
    busy = true;
    btn.disabled = true;
    btn.textContent = 'Entering the Duel…';
    msg.textContent = '';
    sfx.select();
    try {
      // a visitor becomes a guest player now (and only now)
      if (!cloud.currentUser()) {
        const ok = await cloud.startGuest();
        if (!ok) throw new Error('Guest play isn’t available right now. Create a free account to accept.');
        track('guest_created', { from: 'invite' });
      }
      if (input) store.update((x) => (x.settings.name = name));
      // a guest who hasn't trained gets the starter Champions and Octave (the server hands them out)
      const st = store.get();
      if (!st.octaves?.[st.active] || deckProblem(st.octaves[st.active].cards, CARDS)) {
        await vault.act('finishTraining', { skip: true });
        store.update(markTrainingSkipped);
      }
      const s2 = store.get();
      const r = await onlineServer.call('join', { code, deck: s2.octaves[s2.active].cards, name: s2.settings.name });
      track('friend_invite_accepted');
      await enterMatch(ctx, onlineServer, r.matched, { invited: true });
    } catch (err) {
      busy = false;
      btn.disabled = false;
      btn.textContent = 'Accept Duel';
      if (/expired|No open challenge/i.test(err.message)) return gone(root, ctx, 'expired');
      msg.textContent = err.message;
    }
  };
}

// an old, used or mistyped link: never a blank page
function gone(root, ctx, status) {
  const offline = status === 'offline';
  root.innerHTML = `
    <div class="invite-duel">
      <div class="kicker">A Duel invitation</div>
      <div class="invite-duel__title">${offline ? 'We can’t reach THRENYX right now' : 'This Duel invitation has expired'}</div>
      <div class="lore" style="text-align:center;margin:6px 0 18px">${offline ? 'Check your connection and try the link again.' : 'It was already used, or it’s more than a day old. Ask your friend for a new one, or start playing now.'}</div>
      ${offline ? '<button class="btn btn--big" data-retry style="width:100%">Try again</button>' : ''}
      <button class="btn ${offline ? 'btn--ghost' : 'btn--big'}" data-train style="width:100%;margin-top:10px">Start training</button>
      <button class="btn btn--ghost" data-play style="width:100%;margin-top:10px">Play THRENYX</button>
    </div>`;
  root.querySelector('[data-retry]')?.addEventListener('click', () => location.reload());
  root.querySelector('[data-train]').onclick = () => ctx.go(store.get().onboard === 'done' ? 'tutorial' : 'tutorial', store.get().onboard === 'done' ? { replay: 1 } : {});
  root.querySelector('[data-play]').onclick = () => ctx.go('home');
}
