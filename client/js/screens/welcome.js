// WELCOME — THRENYX needs a free account: your collection lives on the
// server, so it can't be lost or faked and follows you to any device.
// Every screen but the Rules waits behind this one until you sign in.
import * as cloud from '../core/cloud.js';
import { openSignIn } from '../ui/account.js';
import { legalLinks } from '../ui/legal.js';
import { install, installed } from '../ui/install.js';

export function render(root, params, ctx) {
  const online = cloud.enabled;
  root.innerHTML = `
    <div class="welcome">
      <div class="hero"><div class="star"></div><div class="logo">THRENYX</div><div class="season">SEASON I · FIRSTFALL</div></div>
      <div class="lore welcome__pitch">A dark-fantasy card game of reading your opponent. Free to play.</div>
      ${online
        ? `<button class="btn btn--big btn--pulse" data-up>Create free account</button>
           <button class="btn btn--ghost" data-in style="width:100%;margin-top:10px">I have an account · Sign in</button>
           <div class="muted welcome__why">Just a username and a password. Your cards, packs and rank are saved to your account, follow you to any device, and can never be lost.</div>`
        : `<div class="panel" style="margin-top:14px">Can’t reach the game server. Check your connection and reload.</div><button class="btn" data-reload style="width:100%;margin-top:10px">Reload</button>`}
      ${installed() ? '' : `<button class="linkish welcome__install" data-install>Add THRENYX to your home screen</button>`}
      <div class="row welcome__links"><a href="#/world">What is Threnyx?</a><a href="#/rules">How to play</a><span>${legalLinks()}</span></div>
    </div>`;
  root.querySelector('[data-up]')?.addEventListener('click', () => openSignIn(ctx, 'up'));
  root.querySelector('[data-in]')?.addEventListener('click', () => openSignIn(ctx, 'in'));
  root.querySelector('[data-reload]')?.addEventListener('click', () => location.reload());
  root.querySelector('[data-install]')?.addEventListener('click', () => install(ctx));
}
