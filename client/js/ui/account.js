// The sign-in window and the Account panel (More, and the training screen).
import * as cloud from '../core/cloud.js';
import * as store from '../core/store.js';
import { esc } from './card.js';
import { CLOUD } from '../config.js';
import { legalLinks } from './legal.js';
import { track } from '../core/funnel.js';

const FIELD = 'width:100%;min-height:44px;padding:0 12px;background:rgba(255,255,255,.05);border:0;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);color:var(--bone);font:inherit;font-size:16px';

export function openSignIn(ctx, tab = 'in') {
  // a guest making an account saves the guest profile instead (keeps everything they earned)
  if (tab === 'up' && cloud.isGuest()) return import('./save-profile.js').then((s) => s.openSaveProfile(ctx));
  const m = ctx.modal('<div data-box style="width:100%;max-width:340px"></div>');
  const box = m.el.querySelector('[data-box]');
  const draw = () => {
    const signin = tab === 'in';
    box.innerHTML = `<div class="kicker">Account</div><div class="h-display" style="font-size:22px;margin:4px 0 6px">${signin ? 'Sign in' : 'Create your account'}</div>
      <div class="muted" style="margin-bottom:12px;font-size:13px">${signin ? 'Your heroes, packs and rank follow you to any device.' : 'Pick a username and a password. That’s all you need.'}</div>
      ${signin && cloud.isGuest() ? '<div class="muted" style="margin:-4px 0 12px;font-size:12px">This switches to your account. What you earned as a guest stays on the guest profile; to keep it instead, close this and tap <b>Save my profile</b>.</div>' : ''}
      <form data-form class="stack" style="gap:8px">
        ${signin
          ? `<input data-login required placeholder="Username or email" autocomplete="username" autocapitalize="none" spellcheck="false" style="${FIELD}">
             <input data-pass type="password" required placeholder="Password" autocomplete="current-password" style="${FIELD}">`
          : `<input data-user required placeholder="Username (3–18 letters, numbers or _)" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="18" style="${FIELD}">
             <input data-pass type="password" required placeholder="Password (8+ characters)" autocomplete="new-password" minlength="8" style="${FIELD}">
             <input data-email type="email" placeholder="Email (optional, for account recovery)" autocomplete="email" style="${FIELD}">`}
        <button class="btn" style="width:100%">${signin ? 'Sign in' : 'Create account'}</button>
      </form>
      <div class="muted" data-msg style="margin-top:10px;font-size:13px;min-height:1em"></div>
      ${CLOUD.google ? `<div class="muted" style="text-align:center;margin:8px 0;font-size:12px;letter-spacing:.2em">OR</div><button class="btn btn--ghost" data-google style="width:100%">Continue with Google</button>` : ''}
      <div class="row" style="justify-content:space-between;margin-top:12px;font-size:13px">
        <button class="linkish" data-switch>${signin ? 'New here? Create an account' : 'Have an account? Sign in'}</button>
        ${signin ? '<button class="linkish" data-forgot>Forgot password?</button>' : ''}
      </div>
      <div class="muted" style="margin-top:12px;font-size:11px">By ${signin ? 'signing in' : 'creating an account'} you agree to the ${legalLinks(', ')}.</div>`;
    const msg = box.querySelector('[data-msg]');
    const val = (k) => box.querySelector(`[data-${k}]`)?.value || '';
    box.querySelector('[data-switch]').onclick = () => {
      tab = signin ? 'up' : 'in';
      if (tab === 'up' && cloud.isGuest()) return m.close(), openSignIn(ctx, 'up');
      draw();
    };
    box.querySelector('[data-google]')?.addEventListener('click', () => cloud.signInGoogle().catch((e) => (msg.textContent = e.message)));
    box.querySelector('[data-forgot]')?.addEventListener('click', async () => {
      const login = val('login').trim();
      if (!login.includes('@')) return (msg.textContent = 'Type the email on your account above and tap this again. For a username account, contact us (Privacy Policy) and we’ll help you back in.');
      try {
        await cloud.resetPassword(login);
        msg.textContent = `If ${login} has an account, a reset link is on its way.`;
      } catch (e) {
        msg.textContent = e.message;
      }
    });
    box.querySelector('[data-form]').onsubmit = async (e) => {
      e.preventDefault();
      const btn = e.currentTarget.querySelector('button');
      btn.disabled = true;
      msg.textContent = signin ? 'Signing in…' : 'Creating your account…';
      try {
        if (signin) await cloud.signInPassword(val('login'), val('pass')), track('account_signed_in');
        else {
          await cloud.signUp(val('user'), val('pass'), val('email'));
          store.update((x) => (x.settings.name = val('user').trim())); // your name in the game
        }
        m.close();
        ctx.toast(signin ? 'Signed in' : `Welcome, ${val('user').trim()}`);
      } catch (err) {
        msg.textContent = err.message;
        btn.disabled = false;
      }
    };
    box.querySelector(signin ? '[data-login]' : '[data-user]').focus();
  };
  draw();
}

/** Set or change the password (also how accounts made with an email link get one). */
export function openSetPassword(ctx, { recovery = false } = {}) {
  const m = ctx.modal(`<div style="width:100%;max-width:340px"><div class="kicker">Account</div><div class="h-display" style="font-size:22px;margin:4px 0 10px">${recovery ? 'Choose a new password' : 'Set a password'}</div>
    <form data-form class="stack" style="gap:8px"><input data-pass type="password" required minlength="8" placeholder="New password (8+ characters)" autocomplete="new-password" style="${FIELD}"><button class="btn" style="width:100%">Save password</button></form>
    <div class="muted" data-msg style="margin-top:10px;font-size:13px"></div></div>`);
  const msg = m.el.querySelector('[data-msg]');
  m.el.querySelector('[data-form]').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await cloud.setPassword(m.el.querySelector('[data-pass]').value);
      m.close();
      ctx.toast('Password saved');
    } catch (err) {
      msg.textContent = err.message;
    }
  };
}

export function accountHtml() {
  if (!cloud.enabled) return `<div class="muted" style="font-size:13px">Progress is saved on this device.</div>`;
  const u = cloud.currentUser();
  if (cloud.isGuest(u))
    return `<div class="row"><span class="grow" style="font-size:14px">Playing as a guest<br><span class="muted" style="font-size:12px">Save your profile to keep your Champions on any device.</span></span><button class="btn btn--sm" data-saveprofile>Save profile</button><button class="btn btn--sm btn--ghost" data-signin>Sign in</button></div>`;
  return u
    ? `<div class="row"><span class="grow" style="font-size:14px">Signed in as <b>${esc(cloud.displayName(u))}</b><br><span class="muted" style="font-size:12px">Your progress is saved to your account.</span></span><button class="btn btn--sm btn--ghost" data-setpass>Password</button><button class="btn btn--sm btn--ghost" data-signout>Sign out</button></div>`
    : `<div class="row"><span class="grow muted" style="font-size:13px">Sign in to keep your progress on every device.</span><button class="btn btn--sm" data-signin>Sign in</button></div>`;
}

export function bindAccount(root, ctx, redraw) {
  root.querySelector('[data-signin]')?.addEventListener('click', () => openSignIn(ctx));
  root.querySelector('[data-saveprofile]')?.addEventListener('click', () => import('./save-profile.js').then((s) => s.openSaveProfile(ctx, { why: 'more', onSaved: redraw })));
  root.querySelector('[data-setpass]')?.addEventListener('click', () => openSetPassword(ctx));
  root.querySelector('[data-signout]')?.addEventListener('click', async () => {
    await cloud.signOut();
    ctx.toast('Signed out');
    redraw();
  });
}
