// SAVE YOUR PROFILE — a guest becomes a saved player in one step: their name,
// a password, done (docs/18-guest-play.md). It's the same player on the server,
// so every Champion, pack and Duel they have stays exactly where it is.
import * as cloud from '../core/cloud.js';
import * as store from '../core/store.js';
import { esc } from './card.js';
import { legalLinks } from './legal.js';
import { openSignIn } from './account.js';
import { track } from '../core/funnel.js';
import { profileProblem, USERNAME_RULE } from '../../../engine/guest.js';
import { textProblem } from '../../../engine/text-filter.js';

const FIELD = 'width:100%;min-height:48px;padding:0 12px;background:rgba(255,255,255,.05);border:0;border-radius:8px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.14);color:var(--bone);font:inherit;font-size:16px;box-sizing:border-box';
const INTENT = 'threnyx.intent';

/** Remember where a guest was going (a purchase, Ranked) so saving takes them back there. */
export function rememberIntent(to, params = {}) {
  try {
    sessionStorage.setItem(INTENT, JSON.stringify({ to, params }));
  } catch {}
}
export function takeIntent() {
  try {
    const v = JSON.parse(sessionStorage.getItem(INTENT) || 'null');
    sessionStorage.removeItem(INTENT);
    return v;
  } catch {
    return null;
  }
}

/** The one-step save. `onSaved()` runs after the profile is saved and signed in. */
export function openSaveProfile(ctx, { why = 'save', onSaved } = {}) {
  track('account_creation_started', { why });
  const s = store.get();
  const name = USERNAME_RULE.test(s.settings.name || '') && s.settings.name !== 'You' ? s.settings.name : '';
  const m = ctx.modal(`<div class="save-pro" data-box>
      <div class="kicker">Your profile</div>
      <div class="h-display" style="font-size:24px;margin:4px 0 6px">Save your profile</div>
      <div class="muted" style="font-size:14px;margin-bottom:12px">Keep your Champions, packs and Duels, on any device. Free.</div>
      <form data-form class="stack" style="gap:10px" novalidate>
        <label class="save-pro__label">Your player name
          <input data-user required value="${esc(name)}" placeholder="3–18 letters, numbers or _" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="18" enterkeyhint="next" style="${FIELD}">
        </label>
        <label class="save-pro__label">A password
          <input data-pass type="password" required minlength="8" placeholder="8 or more characters" autocomplete="new-password" enterkeyhint="next" style="${FIELD}">
        </label>
        <label class="save-pro__label">Email <span class="muted">(optional, to recover it)</span>
          <input data-email type="email" placeholder="you@example.com" autocomplete="email" enterkeyhint="done" style="${FIELD}">
        </label>
        <button class="btn btn--big" data-go style="width:100%;margin-top:4px">Save my profile</button>
      </form>
      <div data-msg class="save-pro__msg" role="alert"></div>
      <div class="row" style="justify-content:center;gap:6px;margin-top:12px;font-size:14px"><span class="muted">Existing player?</span><button class="linkish" data-signin>Sign in</button></div>
      <div class="muted" style="margin-top:10px;font-size:11px;text-align:center">By saving you agree to the ${legalLinks(', ')}.</div>
    </div>`);
  const box = m.el.querySelector('[data-box]');
  const msg = box.querySelector('[data-msg]');
  const val = (k) => box.querySelector(`[data-${k}]`).value;
  const btn = box.querySelector('[data-go]');
  box.querySelector('[data-signin]').onclick = () => {
    m.close();
    openSignIn(ctx, 'in', { fromGuest: true });
  };
  const fail = (text, retry) => {
    msg.innerHTML = retry
      ? `<b>We couldn’t save your profile yet.</b><br>${esc(text)}<div class="row" style="gap:8px;margin-top:8px;justify-content:center"><button class="btn btn--sm" data-retry>Try again</button><button class="btn btn--sm btn--ghost" data-later>Continue playing</button></div>`
      : esc(text);
    box.querySelector('[data-retry]')?.addEventListener('click', submit);
    box.querySelector('[data-later]')?.addEventListener('click', () => m.close());
  };
  let busy = false;
  const submit = async (e) => {
    e?.preventDefault?.();
    if (busy) return; // one save at a time, however many taps
    const username = val('user').trim(), password = val('pass'), email = val('email');
    const why = profileProblem({ username, password }) || textProblem(username);
    if (why) return fail(why);
    busy = true;
    btn.disabled = true;
    btn.textContent = 'Saving…';
    msg.textContent = '';
    try {
      await cloud.convertGuest(username, password, email);
      store.update((x) => {
        x.settings.name = username;
        x.profile.name = username;
      });
      m.close();
      ctx.toast(`Profile saved. Welcome, ${username}.`);
      onSaved?.();
    } catch (err) {
      track('account_conversion_failed', { code: err.retry ? 'network' : err.saved ? 'signin' : 'refused' });
      if (err.saved) {
        // saved, but this device couldn't sign in with it: sign in by hand
        m.close();
        ctx.toast(err.message);
        openSignIn(ctx, 'in');
      } else fail(err.message, !!err.retry);
    } finally {
      busy = false;
      btn.disabled = false;
      btn.textContent = 'Save my profile';
    }
  };
  box.querySelector('[data-form]').onsubmit = submit;
  return m;
}
