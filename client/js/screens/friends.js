// FRIENDS — add by friend code (or someone you've played), send preset messages,
// challenge, look in a friend's Vault and send trade offers. No typed chat
// anywhere: every message is picked from a fixed list (engine/social.js), so
// nothing a stranger types can reach a child. docs/19-friends-trading.md.
import * as store from '../core/store.js';
import * as vault from '../core/vault.js';
import { esc } from '../ui/card.js';
import { sfx } from '../core/audio.js';
import { copyText } from '../ui/copy.js';
import { onlineServer } from '../core/pvp.js';
import { enterMatch } from './online.js';
import { deckProblem } from '../../../engine/pvp.js';
import { CARDS } from '../../../engine/cards/index.js';
import { PRESETS, PRESET, PRESET_KINDS, presetText } from '../../../engine/social.js';
import { offerBuilder } from '../ui/trade-ui.js';

const ago = (iso) => {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  return s < 60 ? 'now' : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
};
const PENDING = 'threnyx.friendcode';
/** A friend link (?friend=CODE) waits here until the player can use it. */
export function rememberFriendCode(code) {
  try {
    sessionStorage.setItem(PENDING, String(code).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8));
  } catch {}
}

export async function render(root, params, ctx) {
  let timer = null;
  const stop = () => clearInterval(timer);
  root.innerHTML = '<div class="kicker">Friends</div><div class="h1">Friends</div><div class="muted">One moment…</div>';
  // a friend link: add them now
  let add = params.add;
  try {
    add ||= sessionStorage.getItem(PENDING);
    sessionStorage.removeItem(PENDING);
  } catch {}
  if (add) {
    try {
      const r = await vault.social('add', { code: add });
      ctx.toast(r.friends || r.already ? 'You’re friends now' : `Friend request sent${r.name ? ` to ${r.name}` : ''}`);
    } catch (e) {
      ctx.toast(e.message);
    }
    history.replaceState(null, '', '#/friends');
  }
  if (params.id) friendView(root, ctx, params.id, (t) => (timer = t));
  else listView(root, ctx, (t) => (timer = t));
  return stop;
}

// ---- the list ----------------------------------------------------------------------------
async function listView(root, ctx, setTimer) {
  let st;
  try {
    st = await vault.social('status');
  } catch (e) {
    root.innerHTML = `<div class="kicker">Friends</div><div class="h1">Friends</div><div class="panel" style="margin-top:12px">${esc(e.message)}</div>`;
    return;
  }
  if (!root.isConnected) return;
  const link = `${location.origin}${location.pathname}?friend=${st.code}`;
  const person = (p, actions) => `<div class="friend-row"><span class="friend-row__sigil" aria-hidden="true">${esc(p.name.slice(0, 1).toUpperCase())}</span><span class="grow"><b>${esc(p.name)}</b></span>${actions}</div>`;
  root.innerHTML = `
    <div class="kicker">Friends</div><div class="h1">Friends</div>
    <div class="lore" style="margin:4px 0 14px">Duel, trade and send quick messages. Messages come from a set list, so there’s no chat to worry about.</div>
    <div class="panel ${st.incoming.length ? 'panel--gold' : ''}" data-requests>
      <div class="kicker">Friend requests${st.incoming.length ? ` · <span class="gold">${st.incoming.length} new</span>` : ''}</div>
      <div class="req-head">Received</div>
      ${st.incoming.length ? st.incoming.map((p) => person(p, `<button class="btn btn--sm" data-accept="${p.id}">Accept</button><button class="btn btn--sm btn--ghost" data-decline="${p.id}">No</button><button class="btn btn--sm btn--ghost bad" data-blockreq="${p.id}" aria-label="Block ${esc(p.name)}">Block</button>`)).join('') : '<div class="muted req-none">No requests right now.</div>'}
      <div class="req-head">Sent</div>
      ${st.outgoing.length ? st.outgoing.map((p) => person(p, `<span class="muted" style="font-size:12px">Waiting</span><button class="btn btn--sm btn--ghost" data-decline="${p.id}">Cancel</button>`)).join('') : '<div class="muted req-none">None waiting. Add someone with their friend code below.</div>'}
    </div>
    <div class="panel" style="margin-top:12px">
      <div class="kicker">Your friends · ${st.friends.length}</div>
      ${st.friends.length ? st.friends.map((p) => `<button class="friend-row friend-row--btn" data-open="${p.id}"><span class="friend-row__sigil" aria-hidden="true">${esc(p.name.slice(0, 1).toUpperCase())}</span><span class="grow"><b>${esc(p.name)}</b></span>${p.unread ? `<em class="pill">${p.unread}</em>` : ''}<span class="gold">›</span></button>`).join('') : '<div class="muted" style="font-size:14px;margin-top:6px">No friends yet. Send your friend code to someone you know.</div>'}
    </div>
    <div class="panel" style="margin-top:12px">
      <div class="kicker">Your friend code</div>
      <button class="code-copy" data-copy aria-label="Copy your friend link" style="margin-top:8px"><b>${st.code}</b><span>Tap to copy your friend link</span></button>
      ${navigator.share ? '<button class="btn btn--ghost" data-share style="width:100%;margin-top:8px">Send it to a friend</button>' : ''}
      <form data-addform class="row" style="gap:8px;margin-top:12px" novalidate>
        <input data-code maxlength="8" placeholder="Their friend code" autocapitalize="characters" autocomplete="off" spellcheck="false" enterkeyhint="go" class="field grow">
        <button class="btn" data-add>Add</button>
      </form>
    </div>
    <div class="panel" style="margin-top:12px">
      <div class="kicker">Who can send you friend requests</div>
      <div class="friend-allow" role="radiogroup">${[['anyone', 'Anyone with my code'], ['played', 'People I’ve played'], ['none', 'No one']].map(([v, label]) => `<button role="radio" aria-checked="${st.allow === v}" class="${st.allow === v ? 'on' : ''}" data-allow="${v}">${label}</button>`).join('')}</div>
      <div class="muted" style="font-size:12px;margin-top:8px">Your friends stay your friends either way. Gave your code to the wrong person? Get a new one: the old code stops working.</div>
      <button class="btn btn--sm btn--ghost" data-newcode style="width:100%;margin-top:10px">Get a new friend code</button>
    </div>
    ${st.recent.length ? `<div class="panel" style="margin-top:12px"><div class="kicker">People you played</div>${st.recent.map((p) => person(p, `<button class="btn btn--sm btn--ghost" data-addid="${p.id}">Add</button>`)).join('')}</div>` : ''}
    ${st.blocked.length ? `<details class="panel" style="margin-top:12px"><summary class="kicker">Blocked · ${st.blocked.length}</summary>${st.blocked.map((p) => person(p, `<button class="btn btn--sm btn--ghost" data-unblock="${p.id}">Unblock</button>`)).join('')}</details>` : ''}
    <button class="panel install-tile" data-trades style="margin-top:12px"><span class="grow"><b>Trades${st.offers ? ` · <span class="gold">${st.offers} waiting</span>` : ''}</b><span>Offers, the Trade Board and the Trade Hall</span></span><span class="gold">›</span></button>`;
  const redraw = () => listView(root, ctx, setTimer);
  const doing = (sel, op, msg) =>
    root.querySelectorAll(`[data-${sel}]`).forEach(
      (b) =>
        (b.onclick = async () => {
          b.disabled = true;
          try {
            await vault.social(op, { id: b.dataset[sel] });
            if (msg) ctx.toast(msg);
            sfx.select();
          } catch (e) {
            ctx.toast(e.message);
          }
          redraw();
        }),
    );
  doing('accept', 'accept', 'You’re friends now');
  doing('decline', 'decline');
  doing('unblock', 'unblock', 'Unblocked');
  doing('blockreq', 'block', 'Blocked. They can’t ask again.');
  root.querySelectorAll('[data-allow]').forEach(
    (b) =>
      (b.onclick = async () => {
        try {
          await vault.social('settings', { allow: b.dataset.allow });
          sfx.select();
          ctx.toast(b.dataset.allow === 'none' ? 'No new friend requests' : b.dataset.allow === 'played' ? 'Only people you’ve played can ask' : 'Anyone with your code can ask');
        } catch (e) {
          ctx.toast(e.message);
        }
        redraw();
      }),
  );
  root.querySelector('[data-newcode]').onclick = async () => {
    try {
      await vault.social('settings', { newCode: true });
      ctx.toast('New friend code. The old one no longer works.');
    } catch (e) {
      ctx.toast(e.message);
    }
    redraw();
  };
  root.querySelectorAll('[data-addid]').forEach(
    (b) =>
      (b.onclick = async () => {
        b.disabled = true;
        try {
          const r = await vault.social('add', { id: b.dataset.addid });
          ctx.toast(r.friends ? 'You’re friends now' : 'Friend request sent');
        } catch (e) {
          ctx.toast(e.message);
        }
        redraw();
      }),
  );
  root.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => (sfx.tap(), ctx.go('friends', { id: b.dataset.open }))));
  root.querySelector('[data-trades]').onclick = () => ctx.go('trade', { tab: 'offers' });
  const btn = root.querySelector('[data-copy]');
  btn.onclick = () =>
    copyText(link).then((ok) => {
      ctx.toast(ok ? 'Link copied: send it to a friend' : 'Press and hold to copy the code');
      if (ok) btn.querySelector('span').textContent = 'Link copied ✓';
    });
  root.querySelector('[data-share]')?.addEventListener('click', () => navigator.share({ title: 'Be my friend on THRENYX', text: `My THRENYX friend code is ${st.code}.`, url: link }).catch(() => {}));
  root.querySelector('[data-addform]').onsubmit = async (e) => {
    e.preventDefault();
    const code = root.querySelector('[data-code]').value.trim();
    if (!code) return ctx.toast('Enter their friend code');
    try {
      const r = await vault.social('add', { code });
      ctx.toast(r.friends || r.already ? 'You’re friends now' : `Friend request sent${r.name ? ` to ${r.name}` : ''}`);
      sfx.select();
      redraw();
    } catch (err) {
      ctx.toast(err.message);
    }
  };
  // new requests and messages show up while the list is open
  setTimer(
    setInterval(async () => {
      if (!root.isConnected) return;
      try {
        const p = await vault.social('ping');
        if (p.requests !== st.requests || p.unread !== st.unread || p.offers !== st.offers) redraw();
      } catch {}
    }, 20000),
  );
}

// ---- one friend --------------------------------------------------------------------------------
async function friendView(root, ctx, id, setTimer) {
  let kind = 'duel';
  let data;
  const load = async () => {
    data = await vault.social('messages', { id });
  };
  try {
    await load();
  } catch (e) {
    ctx.toast(e.message);
    return ctx.go('friends');
  }
  const name = data.name;
  const draw = () => {
    if (!root.isConnected) return;
    root.innerHTML = `
      <div class="row"><button class="btn btn--sm btn--ghost" data-back>Friends</button><div class="grow"></div></div>
      <div class="friend-head"><span class="friend-row__sigil friend-row__sigil--big" aria-hidden="true">${esc(name.slice(0, 1).toUpperCase())}</span><div class="h1" style="font-size:28px">${esc(name)}</div></div>
      <div class="friend-actions">
        <button class="btn" data-duel>Duel</button>
        <button class="btn btn--ghost" data-trade>Trade</button>
      </div>
      <div class="panel msg-log" data-log>${
        data.messages.length
          ? data.messages
              .map((m) => `<div class="msg ${m.mine ? 'msg--mine' : ''}"><span>${esc(presetText(m.preset))}</span>${m.code && !m.mine ? `<button class="btn btn--sm" data-join="${esc(m.code)}">Accept Duel</button>` : ''}<time>${ago(m.at)}</time></div>`)
              .join('')
          : `<div class="muted" style="font-size:14px;text-align:center">Say hi to ${esc(name)}.</div>`
      }</div>
      <div class="msg-kinds" role="tablist">${PRESET_KINDS.map(([k, label]) => `<button role="tab" class="${k === kind ? 'on' : ''}" data-kind="${k}">${label}</button>`).join('')}</div>
      <div class="msg-chips">${PRESETS.filter((p) => p.kind === kind).map((p) => `<button class="chip" data-say="${p.id}">${esc(p.text)}</button>`).join('')}</div>
      <div class="row" style="justify-content:center;gap:10px;margin-top:22px">
        <button class="btn btn--sm btn--ghost" data-remove>Remove friend</button>
        <button class="btn btn--sm btn--ghost bad" data-block>Block</button>
      </div>`;
    const log = root.querySelector('[data-log]');
    log.scrollTop = log.scrollHeight;
    root.querySelector('[data-back]').onclick = () => ctx.go('friends');
    root.querySelectorAll('[data-kind]').forEach((b) => (b.onclick = () => ((kind = b.dataset.kind), sfx.tap(), draw())));
    root.querySelectorAll('[data-say]').forEach((b) => (b.onclick = () => say(b.dataset.say, b)));
    root.querySelectorAll('[data-join]').forEach((b) => (b.onclick = () => ctx.go('duel', { code: b.dataset.join })));
    root.querySelector('[data-duel]').onclick = (e) => duel(e.currentTarget);
    root.querySelector('[data-trade]').onclick = () => tradeWith();
    root.querySelector('[data-remove]').onclick = () => sure(`Remove ${name} from your friends?`, 'Remove', async () => (await vault.social('remove', { id }), ctx.toast('Removed'), ctx.go('friends')));
    root.querySelector('[data-block]').onclick = () => sure(`Block ${name}? You won’t be friends, and neither of you can message, trade or see each other’s posts.`, 'Block', async () => (await vault.social('block', { id }), ctx.toast('Blocked'), ctx.go('friends')));
  };
  const sure = (text, label, go) => {
    const m = ctx.modal(`<div style="text-align:center"><div class="h-display" style="font-size:20px;margin-bottom:12px">${esc(text)}</div><button class="btn btn--big" data-yes style="width:100%">${esc(label)}</button><button class="btn btn--ghost" data-no style="width:100%;margin-top:8px">Cancel</button></div>`);
    m.el.querySelector('[data-no]').onclick = () => m.close();
    m.el.querySelector('[data-yes]').onclick = async () => {
      m.close();
      try {
        await go();
      } catch (e) {
        ctx.toast(e.message);
      }
    };
  };
  const say = async (preset, btn, extra = {}) => {
    if (PRESET[preset]?.code && !extra.code) return duel(btn);
    btn && (btn.disabled = true);
    try {
      data = { ...(await vault.social('send', { id, preset, ...extra })), name };
      sfx.select();
    } catch (e) {
      ctx.toast(e.message);
    }
    draw();
  };
  // "Wanna Duel?": make a friendly invitation, send it, and wait for them
  const duel = async (btn) => {
    const s = store.get();
    const deck = s.octaves[s.active]?.cards || [];
    const problem = deckProblem(deck, CARDS);
    if (problem) return ctx.toast(`${problem} Fix your Octave first.`);
    btn && (btn.disabled = true);
    try {
      const { id: match, code } = await onlineServer.call('challenge', { deck, name: s.settings.name || 'Player' });
      await say('duel', null, { code });
      const m = ctx.modal(`<div style="text-align:center"><div class="kicker">Duel</div><div class="h-display" style="font-size:22px;margin:6px 0">Waiting for ${esc(name)}…</div><div class="muted" style="font-size:13px">They’ll see “Wanna Duel?” with an Accept button. The invitation works for 24 hours.</div><button class="btn btn--ghost" data-close style="width:100%;margin-top:14px">Stop waiting</button></div>`, { onClose: () => clearInterval(wait) });
      m.el.querySelector('[data-close]').onclick = () => m.close();
      const wait = setInterval(async () => {
        if (!m.el.isConnected) return clearInterval(wait);
        try {
          const st = await onlineServer.call('status', { match });
          if (st.status === 'live') {
            clearInterval(wait);
            m.close();
            enterMatch(ctx, onlineServer, match);
          }
        } catch {}
      }, 3000);
    } catch (e) {
      ctx.toast(e.message);
      btn && (btn.disabled = false);
    }
  };
  // their Vault: pick what to ask for and what to give
  const tradeWith = async () => {
    let theirs;
    try {
      theirs = await vault.social('vault', { id });
    } catch (e) {
      return ctx.toast(e.message);
    }
    clearInterval(poll);
    offerBuilder(root, ctx, {
      title: `Trade with ${name}`,
      who: name,
      theirs: theirs.copies.sort((a, b) => (a.lock ? 1 : 0) - (b.lock ? 1 : 0)),
      onBack: () => friendView(root, ctx, id, setTimer),
      onSend: async (give, get) => {
        await vault.social('offer', { to: id, give, get });
        sfx.rarity?.('rare');
        ctx.toast(`Offer sent to ${name}`);
        await say('tcheck', null).catch(() => {});
        friendView(root, ctx, id, setTimer);
      },
    });
  };
  draw();
  // their replies arrive while you're looking
  const poll = setInterval(async () => {
    if (!root.isConnected || !root.querySelector('[data-log]')) return;
    try {
      const before = data.messages.length && data.messages[data.messages.length - 1].id;
      await load();
      const after = data.messages.length && data.messages[data.messages.length - 1].id;
      if (before !== after) draw();
    } catch {}
  }, 8000);
  setTimer(poll);
}
