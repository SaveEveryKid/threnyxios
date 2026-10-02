// TRADE — three counters under one roof (docs/19-friends-trading.md):
//   the Trade Board: anyone's "Have / Want" posts, taken at once or answered with an offer;
//   Offers: trades waiting on you, yours waiting on others, your posts, recent trades;
//   the Trade Hall: the Meridian's traders, who hold real copies and want real things.
// Every copy carries its history; when it changes hands, the history goes with it.
import * as store from '../core/store.js';
import * as cloud from '../core/cloud.js';
import { CARDS, LIST } from '../../../engine/cards/index.js';
import { tradeSeal, owned } from '../../../engine/collection.js';
import { TRADERS, freshHall, weekOf, tradeValue as value } from '../../../engine/tradehall.js';
import { TRADE } from '../../../engine/social.js';
import * as vault from '../core/vault.js';
import { renderCard, esc } from '../ui/card.js';
import { legacyHtml } from '../ui/legacy.js';
import { sfx } from '../core/audio.js';
import { cardRow, copyGrid, myCopies, offerBuilder, confirmTrade, octaveCards, markOctave, cardName } from '../ui/trade-ui.js';

const TABS = [
  ['board', 'Trade Board'],
  ['offers', 'Offers'],
  ['hall', 'Trade Hall'],
];
const left = (until) => {
  const h = Math.max(0, (until - Date.now()) / 3600000);
  return h >= 48 ? `${Math.floor(h / 24)} days left` : h >= 1 ? `${Math.floor(h)}h left` : 'closing soon';
};

export function render(root, params, ctx) {
  const online = cloud.enabled && !!cloud.currentUser() && !cloud.isGuest();
  let tab = TABS.some(([t]) => t === params.tab) ? params.tab : online ? 'board' : 'hall';
  const shell = () => {
    root.innerHTML = `<div class="kicker">Trade</div><div class="h1">Trade</div>
      <div class="tabs tabs--big" role="tablist">${TABS.map(([t, label]) => `<button role="tab" class="${t === tab ? 'on' : ''}" data-tab="${t}">${label}<i data-dot="${t}"></i></button>`).join('')}</div>
      <div data-body style="margin-top:12px"></div>`;
    root.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => ((tab = b.dataset.tab), sfx.tap(), history.replaceState(null, '', `#/trade?tab=${tab}`), shell())));
    const body = root.querySelector('[data-body]');
    if (tab === 'hall') return hall(body, params, ctx);
    if (!online) return needProfile(body, ctx);
    if (tab === 'board') board(body, ctx);
    else offers(body, ctx);
    // offers waiting: a dot on the tab
    vault
      .social('ping')
      .then((p) => p.offers && root.querySelector('[data-dot="offers"]')?.classList.add('dot'))
      .catch(() => {});
  };
  shell();
}

function needProfile(body, ctx) {
  const guest = cloud.isGuest();
  body.innerHTML = `<div class="panel" style="text-align:center">
    <div class="h-display" style="font-size:20px">Trade with real players</div>
    <div class="muted" style="font-size:14px;margin:6px 0 12px">${guest ? 'Save your profile to post on the Trade Board and trade with friends.' : 'Sign in to post on the Trade Board and trade with friends.'}</div>
    <button class="btn btn--big" data-save style="width:100%">${guest ? 'Save your profile' : 'Sign in'}</button></div>`;
  body.querySelector('[data-save]').onclick = () => ctx.go(guest ? 'save' : 'more', guest ? { why: 'trade' } : {});
}

// what's still needed before trading (account age, Duels, the daily limit)
const blockNote = (st) => (st.block ? `<div class="panel trade-note">${esc(st.block)}</div>` : st.daily ? `<div class="muted" style="font-size:12px;margin-bottom:8px">Trades today: ${st.today} of ${st.daily}</div>` : '');

// ---- the Trade Board -----------------------------------------------------------------------------
async function board(body, ctx, card = '') {
  body.innerHTML = '<div class="muted">One moment…</div>';
  let st;
  try {
    st = await vault.social('board', card ? { card } : {});
  } catch (e) {
    body.innerHTML = `<div class="panel">${esc(e.message)}</div>`;
    return;
  }
  if (!body.isConnected) return;
  body.innerHTML = `
    ${blockNote(st)}
    <div class="row" style="gap:8px">
      <input class="field grow" data-search list="trade-cards" placeholder="Search a card" value="${esc(card ? cardName(card) : '')}" autocomplete="off" enterkeyhint="search">
      <datalist id="trade-cards">${LIST.map((c) => `<option value="${esc(c.name)}"></option>`).join('')}</datalist>
      <button class="btn" data-post ${st.block ? 'disabled' : ''}>Post</button>
    </div>
    ${st.mine.length ? `<div class="muted" style="font-size:13px;margin-top:10px">You have ${st.mine.length} post${st.mine.length === 1 ? '' : 's'} up (see Offers).</div>` : ''}
    <div class="stack" data-list style="margin-top:12px"></div>`;
  const list = body.querySelector('[data-list]');
  if (!st.posts.length) list.innerHTML = `<div class="panel muted" style="text-align:center;font-size:14px">${card ? `No posts with ${esc(cardName(card))} right now.` : 'No posts yet. Be the first: tap Post.'}</div>`;
  for (const p of st.posts) {
    const el = document.createElement('button');
    el.className = 'panel trade-post';
    el.innerHTML = `<div class="row"><b class="grow">${esc(p.name)}</b><span class="muted" style="font-size:12px">${left(p.until)}</span></div>
      <div class="kicker" style="margin-top:6px">Has</div><div data-have></div>
      <div class="kicker" style="margin-top:6px">Wants</div><div class="trade-wants">${p.want.length ? p.want.map((id) => `<span class="chip chip--static">${esc(cardName(id))}</span>`).join('') : '<span class="muted" style="font-size:13px">Make an offer</span>'}</div>`;
    el.querySelector('[data-have]').appendChild(cardRow(p.have, { width: 60 }));
    el.onclick = () => (sfx.tap(), postView(body, ctx, p.id, st, () => board(body, ctx, card)));
    list.appendChild(el);
  }
  const search = body.querySelector('[data-search]');
  search.onchange = () => {
    const v = search.value.trim().toLowerCase();
    const hit = LIST.find((c) => c.name.toLowerCase() === v) || (v ? LIST.find((c) => c.name.toLowerCase().includes(v)) : null);
    board(body, ctx, hit ? hit.id : '');
  };
  body.querySelector('[data-post]').onclick = () => postBuilder(body, ctx, () => board(body, ctx, card));
}

// one post: its cards' histories, and the two ways to answer it
async function postView(body, ctx, id, st, back) {
  let r;
  try {
    r = await vault.social('postView', { id });
  } catch (e) {
    ctx.toast(e.message);
    return back();
  }
  const p = r.post;
  const views = Object.fromEntries(r.copies.map((c) => [c.copyId, c]));
  // the copies you'd give for "Trade now": your least-used tradeable copy of each
  // wanted card, never the last one in an Octave
  const pickFor = () => {
    const ready = myCopies().filter((it) => !it.lock);
    const out = [];
    for (const w of p.want) {
      const it = ready.filter((x) => x.cardId === w && !out.includes(x)).sort((a, b) => (a.stats?.battles || 0) - (b.stats?.battles || 0))[0];
      if (!it) return null;
      out.push(it);
    }
    return octaveCards(out.map((it) => it.copyId)).length ? null : out; // the active Octave's cards stay
  };
  const mineFor = p.want.length ? pickFor() : null;
  body.innerHTML = `
    <div class="row"><button class="btn btn--sm btn--ghost" data-back>Back</button><div class="grow"></div><span class="muted" style="font-size:12px">${left(p.until)}</span></div>
    <div class="h1" style="font-size:24px;margin-top:8px">${esc(p.name)}’s post</div>
    <div class="kicker" style="margin-top:12px">Has · tap a card for its history</div><div data-have></div>
    <div class="kicker" style="margin-top:12px">Wants</div>
    <div class="trade-wants">${p.want.length ? p.want.map((w) => `<span class="chip chip--static">${esc(cardName(w))} <small class="muted">you have ${owned(store.get().profile, w)}</small></span>`).join('') : '<span class="muted" style="font-size:14px">Open to offers</span>'}</div>
    ${st.block ? `<div class="panel trade-note" style="margin-top:12px">${esc(st.block)}</div>` : ''}
    <div class="stack" style="margin-top:16px">
      ${p.want.length ? `<button class="btn btn--big" data-take ${mineFor && !st.block ? '' : 'disabled'}>${mineFor ? 'Trade now' : 'You don’t have what they want (outside your active Octave)'}</button>` : ''}
      <button class="btn ${p.want.length ? 'btn--ghost' : 'btn--big'}" data-offer ${st.block ? 'disabled' : ''}>Make an offer</button>
    </div>`;
  body.querySelector('[data-have]').appendChild(cardRow(p.have, { ctx, views, width: 84 }));
  body.querySelector('[data-back]').onclick = back;
  body.querySelector('[data-take]')?.addEventListener('click', async () => {
    const give = mineFor.map((it) => ({ copyId: it.copyId, cardId: it.cardId, treatment: it.treatment }));
    const seal = tradeSeal([...mineFor, ...r.copies], (cid) => CARDS[cid].rarity);
    if (!(await confirmTrade(ctx, { give, get: p.have, seal, views, who: p.name }))) return;
    try {
      const res = await vault.social('take', { id: p.id, give: give.map((t) => t.copyId) });
      sfx.rarity?.('epic');
      ctx.toast(`Traded with ${res.with}`);
      back();
    } catch (e) {
      ctx.toast(e.message);
      back();
    }
  });
  body.querySelector('[data-offer]').onclick = () =>
    offerBuilder(body, ctx, {
      title: `Offer to ${p.name}`,
      who: p.name,
      theirs: r.copies,
      fixedGet: p.have,
      onBack: () => postView(body, ctx, id, st, back),
      onSend: async (give) => {
        await vault.social('offer', { listing: p.id, give, get: p.have.map((t) => t.copyId) });
        sfx.rarity?.('rare');
        ctx.toast(`Offer sent to ${p.name}`);
        back();
      },
    });
}

// a new post: up to 3 of your cards, and up to 3 cards you want (or none: offers)
function postBuilder(body, ctx, back) {
  const have = new Set();
  const want = [];
  const draw = () => {
    body.innerHTML = `
      <div class="row"><button class="btn btn--sm btn--ghost" data-back>Back</button></div>
      <div class="h1" style="font-size:24px;margin-top:8px">New post</div>
      <div class="muted" style="font-size:13px">Up for ${TRADE.listingDays} days. Anyone who can trade sees it.</div>
      <div class="kicker" style="margin-top:14px">You have · pick up to ${TRADE.maxHave}</div>
      <div class="pick-grid" data-have style="margin-top:6px"></div>
      <div class="kicker" style="margin-top:14px">You want · up to ${TRADE.maxWant}, or none for offers</div>
      <div class="trade-wants" data-wants></div>
      <div class="row" style="gap:8px;margin-top:6px">
        <input class="field grow" data-want list="trade-cards2" placeholder="Add a card you want" autocomplete="off" enterkeyhint="done">
        <datalist id="trade-cards2">${LIST.map((c) => `<option value="${esc(c.name)}"></option>`).join('')}</datalist>
      </div>
      <div class="trade-bar"><div class="grow muted" data-count style="font-size:13px"></div><button class="btn" data-go>Post it</button></div>`;
    const wants = body.querySelector('[data-wants]');
    const drawWants = () => {
      wants.innerHTML = want.length ? want.map((w, i) => `<button class="chip" data-x="${i}">${esc(cardName(w))} ✕</button>`).join('') : '<span class="muted" style="font-size:13px">Open to offers</span>';
      wants.querySelectorAll('[data-x]').forEach((b) => (b.onclick = () => (want.splice(+b.dataset.x, 1), drawWants())));
    };
    const count = () => {
      body.querySelector('[data-count]').textContent = `${have.size} card${have.size === 1 ? '' : 's'} up · ${want.length ? `wants ${want.length}` : 'open to offers'}`;
      body.querySelector('[data-go]').disabled = !have.size;
    };
    copyGrid(body.querySelector('[data-have]'), myCopies(), have, { ctx, max: TRADE.maxHave, onChange: count, canPick: (it) => (octaveCards([...have, it.copyId]).length ? `${cardName(it.cardId)} is in your active Octave. Swap it out first.` : null) });
    markOctave(body.querySelector('[data-have]'), have);
    drawWants();
    count();
    const input = body.querySelector('[data-want]');
    input.onchange = () => {
      const v = input.value.trim().toLowerCase();
      const hit = LIST.find((c) => c.name.toLowerCase() === v) || LIST.find((c) => c.name.toLowerCase().includes(v));
      input.value = '';
      if (!hit) return ctx.toast('No card by that name');
      if (want.length >= TRADE.maxWant) return ctx.toast(`Up to ${TRADE.maxWant} cards`);
      want.push(hit.id);
      drawWants();
      count();
    };
    body.querySelector('[data-back]').onclick = back;
    body.querySelector('[data-go]').onclick = async (e) => {
      e.currentTarget.disabled = true;
      try {
        await vault.social('post', { have: [...have], want });
        sfx.rarity?.('rare');
        ctx.toast('Posted on the Trade Board');
        back();
      } catch (err) {
        ctx.toast(err.message);
        e.currentTarget.disabled = false;
      }
    };
  };
  draw();
}

// ---- Offers --------------------------------------------------------------------------------------
async function offers(body, ctx) {
  body.innerHTML = '<div class="muted">One moment…</div>';
  let st;
  try {
    st = await vault.social('trades');
  } catch (e) {
    body.innerHTML = `<div class="panel">${esc(e.message)}</div>`;
    return;
  }
  if (!body.isConnected) return;
  const redraw = () => offers(body, ctx);
  body.innerHTML = `${blockNote(st)}
    <div class="kicker">Waiting on you</div><div class="stack" data-in style="margin-top:6px"></div>
    <div class="kicker" style="margin-top:16px">Waiting on them</div><div class="stack" data-out style="margin-top:6px"></div>
    <div class="kicker" style="margin-top:16px">Your Trade Board posts</div><div class="stack" data-posts style="margin-top:6px"></div>
    ${st.closed.length ? '<div class="kicker" style="margin-top:16px">Closed</div><div class="stack" data-closed style="margin-top:6px"></div>' : ''}
    <div class="kicker" style="margin-top:16px">Recent trades</div><div class="stack" data-hist style="margin-top:6px"></div>`;
  const none = (box, text) => (box.innerHTML = `<div class="muted" style="font-size:13px">${text}</div>`);
  const card = (o, { you, them, actions, note }) => {
    const el = document.createElement('div');
    el.className = 'panel trade-offer';
    el.innerHTML = `<div class="row"><b class="grow">${esc(o.with)}${o.counter ? ' <span class="tag tag--new">Counter-offer</span>' : o.listing ? ' <span class="muted" style="font-weight:400;font-size:12px">· Trade Board</span>' : ''}</b><span class="muted" style="font-size:12px">${note || ''}</span></div>
      <div class="kicker" style="margin-top:6px">You get</div><div data-get></div>
      <div class="kicker" style="margin-top:6px">You give</div><div data-give></div>
      ${o.seal ? `<div class="muted" style="font-size:12px;margin-top:6px">Trade Seal: ${o.seal} Embers each</div>` : ''}
      <div class="row" style="gap:8px;margin-top:10px">${actions}</div>`;
    el.querySelector('[data-get]').appendChild(cardRow(you.get, { ctx, views: st.views, width: 60 }));
    el.querySelector('[data-give]').appendChild(cardRow(you.give, { ctx, views: st.views, width: 60, empty: 'Nothing: a gift' }));
    return el;
  };
  const inBox = body.querySelector('[data-in]');
  if (!st.incoming.length) none(inBox, 'No offers right now.');
  for (const o of st.incoming) {
    const el = card(o, { you: { get: o.give, give: o.get }, note: left(o.until), actions: '<button class="btn btn--sm grow" data-yes>Accept…</button><button class="btn btn--sm btn--ghost grow" data-counter>Counter</button><button class="btn btn--sm btn--ghost grow" data-no>Decline</button>' });
    // a counter-offer: their Vault, starting from this offer turned around
    el.querySelector('[data-counter]').onclick = async () => {
      let them;
      try {
        them = await vault.social('counterView', { id: o.id });
      } catch (e) {
        ctx.toast(e.message);
        return redraw();
      }
      offerBuilder(body, ctx, {
        title: `Counter-offer`,
        who: o.with,
        theirs: them.copies.sort((a, b) => (a.lock ? 1 : 0) - (b.lock ? 1 : 0)),
        pickedGet: o.give.map((t) => t.copyId),
        pickedGive: o.get.map((t) => t.copyId),
        sendLabel: 'Send counter',
        onBack: redraw,
        onSend: async (give, get) => {
          await vault.social('offer', { counter: o.id, give, get });
          sfx.rarity?.('rare');
          ctx.toast(`Counter-offer sent to ${o.with}`);
          redraw();
        },
      });
    };
    el.querySelector('[data-yes]').onclick = async () => {
      if (!(await confirmTrade(ctx, { give: o.get, get: o.give, seal: o.seal, views: st.views, who: o.with }))) return;
      try {
        const r = await vault.social('respond', { id: o.id, accept: true });
        sfx.rarity?.('epic');
        ctx.toast(`Traded with ${r.with}`);
      } catch (e) {
        ctx.toast(e.message);
      }
      redraw();
    };
    el.querySelector('[data-no]').onclick = async () => {
      try {
        await vault.social('respond', { id: o.id, accept: false });
      } catch (e) {
        ctx.toast(e.message);
      }
      redraw();
    };
    inBox.appendChild(el);
  }
  const outBox = body.querySelector('[data-out]');
  if (!st.outgoing.length) none(outBox, 'Nothing waiting.');
  for (const o of st.outgoing) {
    const el = card(o, { you: { get: o.get, give: o.give }, note: left(o.until), actions: '<button class="btn btn--sm btn--ghost" data-cancel>Cancel offer</button>' });
    el.querySelector('[data-cancel]').onclick = async () => {
      await vault.social('cancel', { id: o.id }).catch((e) => ctx.toast(e.message));
      redraw();
    };
    outBox.appendChild(el);
  }
  const postBox = body.querySelector('[data-posts]');
  if (!st.posts.length) none(postBox, 'No posts up. Post on the Trade Board.');
  for (const p of st.posts) {
    const el = document.createElement('div');
    el.className = 'panel';
    el.innerHTML = `<div class="row"><span class="grow muted" style="font-size:12px">${left(p.until)} · wants ${p.want.length ? p.want.map((w) => esc(cardName(w))).join(', ') : 'offers'}</span><button class="btn btn--sm btn--ghost" data-down>Take down</button></div><div data-have style="margin-top:6px"></div>`;
    el.querySelector('[data-have]').appendChild(cardRow(p.have, { ctx, width: 60 }));
    el.querySelector('[data-down]').onclick = async () => {
      await vault.social('unpost', { id: p.id }).catch((e) => ctx.toast(e.message));
      redraw();
    };
    postBox.appendChild(el);
  }
  const closed = body.querySelector('[data-closed]');
  const WHY = { declined: 'Declined', countered: 'Countered', cancelled: 'Cancelled', expired: 'Expired', failed: 'Couldn’t happen' };
  for (const o of st.closed) {
    const el = document.createElement('div');
    el.className = 'row muted';
    el.style.fontSize = '13px';
    el.innerHTML = `<span class="grow">${o.mine ? 'To' : 'From'} ${esc(o.with)}: ${[...o.give, ...o.get].map((t) => esc(cardName(t.cardId))).join(', ')}</span><span>${WHY[o.status] || o.status}</span>`;
    closed.appendChild(el);
  }
  const hist = body.querySelector('[data-hist]');
  if (!st.history.length) none(hist, 'No trades yet.');
  for (const t of st.history) {
    const el = document.createElement('div');
    el.className = 'row';
    el.style.fontSize = '13px';
    el.innerHTML = `<span class="grow">With <b>${esc(t.with)}</b>: got ${t.got.map((x) => esc(cardName(x.cardId))).join(', ') || 'nothing'} · gave ${t.gave.map((x) => esc(cardName(x.cardId))).join(', ') || 'nothing'}</span><time class="muted">${new Date(t.at).toLocaleDateString()}</time>`;
    hist.appendChild(el);
  }
}

// ---- the Trade Hall (the Meridian's traders; works offline too) -------------------------------------
function hall(root, params, ctx) {
  const week = weekOf();
  const s = store.get();
  // this week's tables (the same on this device and the server; deals change them there)
  if (s.trade?.week !== week) {
    s.trade = freshHall(week);
    store.save();
  }
  let sel = params.t && TRADERS.find((t) => t.id === params.t) ? params.t : null;
  const mine = new Set();
  const theirs = new Set();

  const list = () => {
    root.innerHTML = `<div class="lore" style="margin:0 0 14px">The Meridian’s traders hold real copies with real histories, and want real things.</div>
      <div class="stack">${TRADERS.map((t) => {
        const st = s.trade.traders[t.id];
        return `<button class="panel" data-t="${t.id}" style="border:0;color:inherit;text-align:left;cursor:pointer">
          <div class="h-display" style="font-size:20px">${esc(t.name)}</div><div class="muted" style="font-size:13px">${esc(t.title)}</div>
          <div style="font-size:13px;margin-top:8px">Has: ${st.items.map((i) => esc(CARDS[i.cardId].name.split(' ').slice(-1)[0])).join(', ')}</div>
          <div style="font-size:13px;margin-top:4px;color:var(--gold)">Wants: ${st.wants.map((w) => esc(CARDS[w].name)).join(', ')}</div></button>`;
      }).join('')}</div>`;
    root.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => ((sel = b.dataset.t), sfx.select(), desk())));
  };

  const desk = () => {
    const t = TRADERS.find((x) => x.id === sel);
    const st = s.trade.traders[sel];
    const myItems = Object.values(s.profile.items).filter((it) => it.treatment !== 'immortal');
    const give = [...mine].map((c) => s.profile.items[c]);
    const get = [...theirs].map((c) => st.items.find((i) => i.copyId === c));
    const seal = tradeSeal([...give, ...get], (id) => CARDS[id].rarity);
    const vGive = give.reduce((a, it) => a + value(it, st.wants), 0);
    const vGet = get.reduce((a, it) => a + value(it, []), 0) * t.temper;
    root.innerHTML = `
      <div class="row"><button class="btn btn--sm btn--ghost" data-back>Back</button><div class="grow"></div><div class="muted">Seal: ${seal} Embers · you have ${s.profile.embers}</div></div>
      <div class="h1" style="font-size:24px;margin-top:8px">${esc(t.name)}</div>
      <div class="muted" style="font-size:13px">Wants: <span class="gold">${st.wants.map((w) => esc(CARDS[w].name)).join(', ')}</span></div>
      <div class="kicker" style="margin-top:14px">Their table · tap to request</div>
      <div class="pick-grid" data-theirs style="margin-top:6px"></div>
      <div class="kicker" style="margin-top:14px">Your offer · tap to add</div>
      <div class="pick-grid" data-mine style="margin-top:6px"></div>
      <div class="trade-bar">
        <div class="grow muted" style="font-size:13px">${give.length} for ${get.length}</div>
        <button class="btn" data-propose ${get.length && give.length && s.profile.embers >= seal ? '' : 'disabled'}>Propose</button>
      </div>`;
    const put = (box, items, set) => {
      for (const it of items) {
        const cell = document.createElement('div');
        cell.className = 'cell' + (set.has(it.copyId) ? ' in' : '');
        cell.appendChild(renderCard(CARDS[it.cardId], { width: 84, flat: true, treatment: it.treatment === 'standard' ? null : it.treatment }));
        if (it.stats?.battles) cell.insertAdjacentHTML('beforeend', `<span class="badge-sm">${it.stats.battles} battles</span>`);
        let tm = null;
        cell.addEventListener('pointerdown', () => (tm = setTimeout(() => ((tm = 'long'), legacyModal(it)), 420)));
        cell.addEventListener('pointerup', () => {
          if (tm === 'long') return;
          clearTimeout(tm);
          if (set === mine && !set.has(it.copyId)) {
            const inOctave = s.octaves.some((o) => o.cards.includes(it.cardId));
            const left = owned(s.profile, it.cardId) - [...mine].filter((c) => s.profile.items[c].cardId === it.cardId).length;
            if (inOctave && left <= 1) {
              sfx.error();
              ctx.toast('In your Octave. Swap it out first');
              return;
            }
          }
          set.has(it.copyId) ? set.delete(it.copyId) : set.add(it.copyId);
          sfx.select();
          desk();
        });
        box.appendChild(cell);
      }
    };
    const legacyModal = (it) => {
      const m = ctx.modal(`<div data-c></div><div class="lore card-bio">${esc(CARDS[it.cardId].bio)}</div>${legacyHtml(it)}`);
      m.el.querySelector('[data-c]').appendChild(renderCard(CARDS[it.cardId], { size: 'full', width: Math.min(300, innerWidth - 60), tilt: true }));
    };
    put(root.querySelector('[data-theirs]'), st.items, theirs);
    put(root.querySelector('[data-mine]'), myItems.sort((a, b) => owned(s.profile, b.cardId) - owned(s.profile, a.cardId)), mine);
    root.querySelector('[data-back]').onclick = () => ((sel = null), mine.clear(), theirs.clear(), list());
    root.querySelector('[data-propose]').onclick = async (e) => {
      if (vGive >= vGet * 0.95) {
        // Deal: made by the vault (the server, when signed in), which checks it again
        e.currentTarget.disabled = true;
        try {
          await vault.act('trade', { trader: sel, give: [...mine], get: [...theirs] });
        } catch (err) {
          sfx.error?.();
          ctx.toast(err.message);
          return desk();
        }
        sfx.rarity('epic');
        ctx.toast('Deal');
        mine.clear();
        theirs.clear();
        Object.assign(s, store.get());
        desk();
      } else {
        sfx.error();
        const gap = vGet * 0.95 - vGive;
        ctx.toast(gap > 20 ? 'Not even close' : gap > 5 ? 'Add something' : 'Almost. A little more');
      }
    };
  };
  sel ? desk() : list();
}
