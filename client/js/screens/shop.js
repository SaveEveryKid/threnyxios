// THE SHOP — packs for Chimes, Chimes for real money (Stripe). Nothing here
// changes a Champion's Power; free play completes the same collection.
import * as store from '../core/store.js';
import * as cloud from '../core/cloud.js';
import { OFFERS, PRODUCTS, PASSES, price, offerPrice, weeklyLeft, passDaysLeft } from '../../../engine/shop.js';
import * as vault from '../core/vault.js';
import { LEGAL, legalLinks } from '../ui/legal.js';
import { packArt } from '../art/index.js';
import { openSignIn } from '../ui/account.js';
import { esc } from '../ui/card.js';
import { sfx } from '../core/audio.js';

const passEnd = (id) => new Date(PASSES[id].ends).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const ART = { standard: 'standard', collector: 'collector', faction: 'crown', event: 'firstfall', mythic: 'collector' };

export function render(root, params, ctx) {
  const draw = () => {
    const s = store.get();
    const chimes = s.profile.chimes || 0;
    const pay = cloud.paymentsOn();
    const signed = !!cloud.currentUser();
    const bought = new Set(s.purchased || []);
    root.innerHTML = `
      <div class="row"><div class="grow"><div class="kicker">The Exchange</div><div class="h1">Shop</div></div>
        <div class="shop-bal"><i></i><b>${chimes}</b><span>Chimes</span></div></div>
      <div class="muted" style="font-size:13px;margin:4px 0 12px">Packs only speed up your collection; free play earns every card. Nothing here makes a Champion stronger.</div>
      <div class="kicker">Packs</div>
      <div class="shop-grid">${OFFERS.map((o) => {
        const k = Object.keys(o.packs)[0];
        const art = packArt(ART[k]);
        const cost = offerPrice(o, s.econ);
        const left = weeklyLeft(o, s.econ);
        return `<button class="shop-item panel ${k === 'mythic' ? 'shop-item--mythic' : ''}" data-offer="${o.id}" ${chimes >= cost ? '' : 'data-short'} ${left ? '' : 'disabled'}>
          <div class="shop-item__art" ${art ? `style="background-image:url('${art}')"` : ''}></div>
          <b>${esc(o.name)}</b>${o.tag ? `<em>${esc(o.tag)}</em>` : ''}
          ${o.weekly ? `<small class="shop-left">${left ? `${left} of ${o.weekly} left this week` : 'More on Monday'}</small>` : ''}
          <span class="shop-price"><i></i>${cost < o.chimes ? `<s>${o.chimes}</s> ` : ''}${cost}</span></button>`;
      }).join('')}</div>
      ${pay && chimes < Math.min(...OFFERS.map((o) => offerPrice(o, s.econ))) && (s.econ?.shared || (s.purchased || []).length || s.profile.packsOpened) ? `<button class="shop-more" data-more>Out of Chimes? More from <b>${price(Math.min(...PRODUCTS.filter((p) => !p.hidden && !(p.once && bought.has(p.id))).map((p) => p.cents)))}</b> <span class="gold">↓</span></button>` : ''}
      <div class="kicker" style="margin-top:16px" data-chimes-list>Starter deals · Chimes</div>
      ${!pay ? `<div class="panel muted" style="font-size:13px;margin-top:6px">Buying Chimes opens soon.</div>` : !signed ? `<div class="panel" style="margin-top:6px"><div class="muted" style="font-size:13px;margin-bottom:8px">Sign in so your purchases are saved to your account and follow you to every device.</div><button class="btn btn--sm" data-signin>Sign in</button></div>` : ''}
      <div class="shop-list">${PRODUCTS.filter((p) => !p.hidden && !(p.once && bought.has(p.id)) && !(p.pass && Date.now() >= Date.parse(PASSES[p.pass].ends))).map((p) => `
        <button class="shop-row panel ${p.once ? 'shop-row--hero' : ''}" data-product="${p.id}" ${pay && signed ? '' : 'disabled'}>
          <div class="grow"><b>${esc(p.name)}</b>${p.tag ? ` <em>${esc(p.tag)}</em>` : ''}${p.blurb ? `<span>${esc(p.blurb)}${p.pass ? ` · ends ${passEnd(p.pass)} (${passDaysLeft(p.pass)} days left)` : p.once ? ' · one per account' : ''}</span>` : ''}</div>
          <span class="shop-cash">${price(p.cents)}</span></button>`).join('')}</div>
      <div class="muted" style="font-size:11px;margin-top:12px">Payments are handled by Stripe. Prices include tax. ${legalLinks()}</div>
      <div data-msg class="muted" style="font-size:13px;margin-top:8px"></div>`;
    const msg = root.querySelector('[data-msg]');
    root.querySelectorAll('[data-offer]').forEach(
      (b) =>
        (b.onclick = async () => {
          const o = OFFERS.find((x) => x.id === b.dataset.offer);
          const cost = offerPrice(o, store.get().econ);
          if ((store.get().profile.chimes || 0) < cost) {
            sfx.error();
            return ctx.toast(`You need ${cost - (store.get().profile.chimes || 0)} more Chimes`);
          }
          b.disabled = true;
          try {
            await vault.act('buyOffer', { offer: o.id });
          } catch (e) {
            b.disabled = false;
            sfx.error();
            return ctx.toast(e.message);
          }
          sfx.reward();
          ctx.toast(`${o.name} added · open it in Packs`);
          ctx.refreshChrome?.();
          draw();
        }),
    );
    root.querySelector('[data-signin]')?.addEventListener('click', () => openSignIn(ctx));
    root.querySelector('[data-more]')?.addEventListener('click', () => root.querySelector('[data-chimes-list]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    root.querySelectorAll('[data-product]').forEach(
      (b) =>
        (b.onclick = () => {
          // a guest saves their profile first (purchases belong to a saved profile), then comes back here
          if (cloud.isGuest()) {
            import('../ui/save-profile.js').then((sp) => sp.rememberIntent('shop', { buy: b.dataset.product }));
            return ctx.go('save', { why: 'shop' });
          }
          // consent before paying: the Terms, and immediate delivery of digital content
          const p = PRODUCTS.find((x) => x.id === b.dataset.product);
          const m = ctx.modal(`<div class="kicker">Before you pay</div><div class="h-display" style="font-size:22px;margin:4px 0 10px">${esc(p.name)} · ${price(p.cents)}</div>
            <div class="lore" style="font-size:14px;line-height:1.5;max-width:340px">It's added to your account as soon as the payment goes through. You agree to the <a href="${LEGAL.terms}" target="_blank" rel="noopener">Terms</a> and ask for immediate delivery, so the right to cancel ends once it's delivered. Unspent Chimes and unused bundles can still be refunded within 14 days (<a href="${LEGAL.refunds}" target="_blank" rel="noopener">Refund Policy</a>).</div>
            ${p.pass ? `<div class="pass-warn">This pass <b>ends when the season ends, on ${passEnd(p.pass)}</b>: ${passDaysLeft(p.pass)} days from today. It ends then no matter when you buy it, so buying later in the season means less time with it. The packs are yours to keep.</div>` : ''}
            <div class="muted" style="font-size:12px;margin-top:8px;max-width:340px">Under 18? Ask a parent or guardian first.</div>
            <div class="row" style="gap:10px;margin-top:16px;width:100%;max-width:340px"><button class="btn btn--ghost grow" data-no>Cancel</button><button class="btn grow" data-yes>Agree and pay</button></div>`);
          m.el.querySelector('[data-no]').onclick = () => m.close();
          m.el.querySelector('[data-yes]').onclick = async (e) => {
            e.currentTarget.disabled = true;
            m.close();
            b.disabled = true;
            msg.textContent = 'Opening secure checkout…';
            try {
              await cloud.checkout(b.dataset.product);
            } catch (err) {
              msg.textContent = err.message;
              b.disabled = false;
            }
          };
        }),
    );
  };
  draw();
  // back from saving the profile: carry on with the purchase they wanted
  if (params.buy && !cloud.isGuest()) root.querySelector(`[data-product="${CSS.escape(params.buy)}"]`)?.click();
  // Collect anything paid for and not yet added: every time the Shop opens,
  // and, back from Stripe, keep asking for half a minute (Stripe's "they paid"
  // message can reach the server a few seconds after the player returns).
  let alive = true;
  // collected at startup instead (the game shows its own thank-you): just redraw
  const off = cloud.onClaimed((got, by) => {
    if (!alive || by === 'shop') return;
    alive = false;
    ctx.refreshChrome?.();
    draw();
  });
  (async () => {
    await cloud.ready; // the sign-in has to be restored first
    const tries = params.paid ? 15 : 1;
    for (let i = 0; i < tries && alive; i++) {
      if (i) await new Promise((r) => setTimeout(r, 2000));
      const got = await cloud.claimPurchases('shop');
      if (!alive) return; // collected elsewhere meanwhile
      if (got.length) {
        sfx.reward();
        ctx.toast(`Thank you! ${got.map((p) => p.name).join(', ')} added.`);
        ctx.refreshChrome?.();
        if (alive) draw();
        return;
      }
      if (params.paid && i === 0) ctx.toast('Payment received. Adding it to your account…');
    }
    if (params.paid && alive) ctx.toast('Still waiting for the payment to arrive. It will be added the next time you open the Shop.');
  })();
  return () => ((alive = false), off());
}
