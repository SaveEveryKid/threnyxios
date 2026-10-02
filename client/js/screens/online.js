// ONLINE — real people. Find a match by rating, challenge a friend with a
// code, see the leaderboard. Matches run on the server (supabase/functions/
// pvp); the battle screen plays them through core/pvp.js. #/online?local=1
// plays the same flow against an in-page test server.
import { copyText } from '../ui/copy.js';
import * as store from '../core/store.js';
import * as cloud from '../core/cloud.js';
import { onlineServer, RemoteMatch } from '../core/pvp.js';
import { setBattle } from '../core/session.js';
import { openSignIn } from '../ui/account.js';
import { esc } from '../ui/card.js';
import { CARDS } from '../../../engine/cards/index.js';
import { deckProblem } from '../../../engine/pvp.js';
import { winRewardsPanel } from '../ui/win-rewards.js';
import { phase as oktoberPhase } from '../../../engine/oktober.js';
import { oktoberLine } from './oktober.js';
import { sfx } from '../core/audio.js';
import { recordRival } from './play.js';
import { track } from '../core/funnel.js';

let search = null; // an ongoing queue search, kept across screen visits
const ECHO_OFFER_S = 8; // seconds searching before an Echo is offered
const ECHO_AUTO_S = 30; // ...and started for you

// Online ranks, by rating (the same names as the Ladder)
const RANKS = [[0, 'Initiate'], [900, 'Chorister'], [1050, 'Cantor'], [1200, 'Arbiter'], [1350, 'Warden'], [1500, 'Paragon'], [1700, 'Threnodist']];
export function onlineRank(rating) {
  let i = RANKS.length - 1;
  while (i > 0 && rating < RANKS[i][0]) i--;
  const next = RANKS[i + 1];
  return { name: RANKS[i][1], next: next?.[1] ?? null, toNext: next ? next[0] - rating : 0, pct: next ? Math.round((100 * (rating - RANKS[i][0])) / (next[0] - RANKS[i][0])) : 100 };
}
const ago = (iso) => {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
};
export function pulseLine(p) {
  if (!p || typeof p.active !== 'number') return '';
  return `<span class="live-dot"></span>${p.active} ${p.active === 1 ? 'duelist' : 'duelists'} active · ${p.today} ${p.today === 1 ? 'match' : 'matches'} today`;
}

async function serverFor(params) {
  if (params.local) {
    const { localServer } = await import('../core/pvp-local.js');
    const { personaOctave } = await import('../core/opponents.js');
    return localServer({ botDeck: personaOctave(store.PERSONAS[2]), botName: 'Test Opponent' });
  }
  return onlineServer;
}

/** Start the battle screen on a live match. */
export async function enterMatch(ctx, server, id, { invited = false } = {}) {
  const remote = await new RemoteMatch(server, id).start();
  const v = remote.view;
  const oppId = 'pvp:' + v.names[1];
  const spec = {
    mode: 'pvp',
    remote,
    mine: v.state.sides[0].deck,
    theirs: v.state.sides[1].deck,
    persona: { id: oppId, name: v.names[1], title: v.echo ? `Echo · rating ${v.ratings[1]}` : `Online · rating ${v.ratings[1]}`, skill: 0.5, faction: null },
    title: v.names[1],
    sub: v.echo ? `Echo · ${v.echo.real ? 'a real player’s Octave' : 'a house duelist'} · half rating` : `Online · rating ${v.ratings[1]}`,
    noLeans: true,
    resultKicker: v.finals ? 'Oktoberfest finals' : 'Online match',
    arena: v.finals ? 'arena-oktober' : undefined, // the finals floor
    friendly: !!invited || undefined,
    invited,
    continueLabel: cloud.isGuest() ? 'Continue' : 'Back to Online',
    onEnd: ({ won, finalWin, readsHit }) => {
      const d = remote.view?.ratingDelta;
      store.update((s) => recordRival(s, spec.persona, { won, finalWin, readsHit }));
      return [['Rating', d == null ? 'updating…' : `${d >= 0 ? '+' : ''}${d}`]];
    },
    onRematch: async (c, btn) => {
      btn.disabled = true;
      btn.textContent = 'Waiting for them…';
      try {
        const next = await remote.rematch();
        enterMatch(c, server, next, { invited });
      } catch (e) {
        c.toast(e.message);
      }
    },
    onContinue: (c) => c.go(cloud.isGuest() ? 'home' : 'online'),
  };
  setBattle(spec);
  ctx.go('battle', { t: Date.now() });
}


export async function render(root, params, ctx) {
  const local = !!params.local;
  const finals = !!params.finals && oktoberPhase() === 'finals'; // Oktoberfest finals: finalists only
  const s = store.get();
  const deck = s.octaves[s.active].cards;
  const problem = deckProblem(deck, CARDS);
  const name = s.settings.name || 'Player';
  if (!local && !cloud.enabled) {
    root.innerHTML = `<div class="kicker">Online</div><div class="h1">Coming soon</div><div class="muted">Online play needs the game's server, which isn't switched on yet.</div>`;
    return;
  }
  if (!local && !cloud.currentUser()) {
    root.innerHTML = `<div class="kicker">Online</div><div class="h1">Play real people</div>
      <div class="lore" style="margin:6px 0 14px">Ranked matches against players near your rating, and friendly challenges by code. Sign in so your rating and record follow you.</div>
      <button class="btn btn--big" data-signin>Sign in to play online</button>`;
    root.querySelector('[data-signin]').onclick = () => openSignIn(ctx);
    return;
  }
  const server = await serverFor(params);
  let me = null, top = [];
  if (!local) {
    try {
      ({ me, top } = await server.call('leaderboard'));
    } catch (e) {
      root.innerHTML = `<div class="kicker">Online</div><div class="h1">Can’t connect</div><div class="muted">${esc(e.message)}</div><button class="btn" data-retry style="margin-top:14px">Try again</button>`;
      root.querySelector('[data-retry]').onclick = () => render(root, params, ctx);
      return;
    }
  }
  let pulse = null;
  let hosted = false;
  const econ = () => store.get().econ || {};
  const draw = () => {
    const rank = me ? onlineRank(me.rating) : null;
    const e = econ();
    root.innerHTML = `
      <div class="row"><div class="grow"><div class="kicker">Online</div><div class="h1">The Reckoning, live</div></div><a class="btn btn--sm btn--ghost" href="#/rules?s=ranked">Rules</a></div>
      <div class="live-line" data-pulse>${pulseLine(pulse)}</div>
      ${oktoberPhase() === 'qualifying' || oktoberPhase() === 'finals' ? `<button class="panel panel--gold okt-banner" data-oktober style="margin-top:10px"><div class="okt-bell" aria-hidden="true"></div><div class="grow"><div class="kicker">Oktoberfest</div><b>${oktoberPhase() === 'finals' ? 'Finals weekend' : 'Ranked wins score points'}</b><span>${esc(oktoberLine())}</span></div></button>` : ''}
      ${me ? `<div class="panel" style="margin-top:10px"><div class="row"><div class="grow"><div class="kicker">${esc(me.name)} · ${rank.name}</div><div class="h-display" style="font-size:26px;margin-top:2px">${me.rating}</div><div class="muted" style="font-size:12px">rating · ${me.wins} ${me.wins === 1 ? 'win' : 'wins'} · ${me.losses} ${me.losses === 1 ? 'loss' : 'losses'}</div></div></div>
        ${rank.next ? `<div class="bar" style="margin-top:8px"><span style="width:84px">${rank.next}</span><div class="progress"><i style="width:${rank.pct}%"></i></div><b>${rank.toNext}</b></div>` : ''}</div>` : ''}
      ${winRewardsPanel(e)}
      <div class="panel panel--gold" style="margin-top:12px">
        <div class="kicker">${finals ? 'Oktoberfest finals' : 'Ranked'}</div>
        <div class="muted" style="font-size:13px;margin:4px 0 10px">${finals ? 'Only the other finalists. If nobody is free yet, you’ll be paired the moment one searches.' : 'A real opponent near your rating, with your active Octave. Each turn has a 30-second clock.'}</div>
        ${search ? `<div class="waiting" style="margin-bottom:10px">Searching<i></i><i></i><i></i> <span data-secs></span></div><div data-echo-offer></div><button class="btn btn--ghost" data-cancel>Cancel</button>` : `<button class="btn btn--big" data-find ${problem ? 'disabled' : ''}>${local ? 'Test match (local)' : finals ? 'Find a finals match' : 'Find a match'}</button>${problem ? `<div class="muted" style="font-size:12px;margin-top:6px">${esc(problem)} <a href="#/octave">Edit your Octave</a></div>` : ''}`}
        ${search || deck.length !== 8 || finals ? '' : `<button class="btn btn--dark" data-echo style="width:100%;margin-top:8px">Duel an Echo now</button>
        <div class="muted" style="font-size:12px;margin-top:6px">An Echo is the Octave a real player last took online, played by the Archive's AI. No waiting; half rating, and its rewards count toward today's AI limit.</div>`}
      </div>
      <div class="panel" style="margin-top:12px">
        <div class="kicker">Challenge a friend</div>
        <div class="muted" style="font-size:13px;margin-top:4px">Send a link: they tap it and play you, no account needed.</div>
        <div class="row" style="gap:8px;margin-top:8px"><button class="btn btn--sm" data-host>Make a link</button>
        <input data-code maxlength="6" placeholder="ENTER CODE" autocapitalize="characters" style="flex:1;min-width:0;min-height:40px;padding:0 10px;background:rgba(255,255,255,.05);border:0;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);color:var(--bone);font:inherit;font-size:16px;letter-spacing:.2em;text-transform:uppercase">
        <button class="btn btn--sm btn--ghost" data-join>Join</button></div>
        <div data-hosted class="muted" style="font-size:13px;margin-top:8px"></div>
      </div>
      <div class="panel" style="margin-top:12px">
        <div class="kicker">Just now</div>
        <div data-feed>${feedHtml()}</div>
      </div>
      ${local ? '' : `<div class="panel" style="margin-top:12px">
        <div class="kicker">Leaderboard</div>
        ${top.map((p, i) => `<div class="objective ${p.user_id === me?.user_id ? 'gold' : ''}"><span style="width:26px" class="muted">${i + 1}</span><span class="grow">${esc(p.name)} <span class="muted" style="font-size:11px">${onlineRank(p.rating).name}</span></span><span class="muted" style="font-size:12px">${p.wins}–${p.losses}</span><b style="width:50px;text-align:right">${p.rating}</b></div>`).join('') || '<div class="muted" style="font-size:13px;margin-top:6px">No ranked matches yet. Be the first.</div>'}
      </div>`}`;
    root.querySelector('[data-find]')?.addEventListener('click', find);
    root.querySelector('[data-oktober]')?.addEventListener('click', () => ctx.go('oktober'));
    root.querySelector('[data-echo]')?.addEventListener('click', echo);
    root.querySelector('[data-cancel]')?.addEventListener('click', cancel);
    root.querySelector('[data-host]')?.addEventListener('click', host);
    root.querySelector('[data-join]')?.addEventListener('click', join);
    if (search) tick();
    // "Challenge a friend" from a result screen: make the link straight away
    if (params.host && !hosted) (hosted = true), host();
  };
  const feedHtml = () => {
    const rows = pulse?.recent || [];
    if (!rows.length) return `<div class="muted" style="font-size:13px;margin-top:6px">${pulse ? 'No finished matches yet today. Yours could be the first on the board.' : 'Listening…'}</div>`;
    return rows
      .map((r) => `<div class="feed-row"><span class="grow"><b>${esc(r.winner)}</b> <span class="muted">beat</span> ${esc(r.loser)}${r.friendly ? ' <span class="muted">· friendly</span>' : ''}</span>${r.delta != null && !r.friendly ? `<span class="gold">+${r.delta}</span>` : ''}<span class="muted feed-at">${ago(r.at)}</span></div>`)
      .join('');
  };
  // the pulse: real activity, refreshed while this screen is open
  const refreshPulse = async () => {
    try {
      pulse = await server.call('pulse');
    } catch {
      const fd = root.querySelector('[data-feed]');
      if (fd && !pulse) fd.innerHTML = '<div class="muted" style="font-size:13px;margin-top:6px">Recent results will show here.</div>';
      return;
    }
    if (!root.isConnected) return;
    const pl = root.querySelector('[data-pulse]');
    if (pl) pl.innerHTML = pulseLine(pulse);
    const fd = root.querySelector('[data-feed]');
    if (fd) fd.innerHTML = feedHtml();
  };
  refreshPulse();
  const pulseTimer = setInterval(() => (root.isConnected ? refreshPulse() : clearInterval(pulseTimer)), 20000);
  const tick = () => {
    if (!search) return;
    const secs = Math.round((Date.now() - search.t0) / 1000);
    const el = root.querySelector('[data-secs]');
    if (el) el.textContent = secs + 's';
    const off = root.querySelector('[data-echo-offer]');
    if (search.finals) return; // finals: no Echoes
    if (off && secs >= ECHO_OFFER_S && !off.firstChild) {
      off.innerHTML = `<div class="muted" style="font-size:13px;margin-bottom:8px">No one else is searching right now. You'll be paired the moment someone does, or duel an Echo while you wait (starts by itself at ${ECHO_AUTO_S}s).</div><button class="btn btn--dark" data-echo style="width:100%;margin-bottom:8px">Duel an Echo now</button>`;
      off.querySelector('[data-echo]').onclick = echo;
    }
    if (secs >= ECHO_AUTO_S && !search.echoing && !search.noEcho && root.isConnected) echo();
  };
  // an Echo: no waiting (supabase/functions/pvp: echo)
  const echo = async () => {
    if (search) search.echoing = true;
    sfx.select();
    try {
      const r = await server.call('echo', { deck, name });
      matched(r.matched);
    } catch (e) {
      // one try only: keep searching for a real opponent, and say so plainly
      if (search) Object.assign(search, { echoing: false, noEcho: true });
      const off = root.querySelector('[data-echo-offer]');
      if (off) off.innerHTML = `<div class="muted" style="font-size:13px;margin-bottom:8px">Echoes aren't available right now${/unknown action/i.test(e.message) ? ' (the game server needs its latest update)' : ''}. Still searching for a real opponent.</div>`;
      else ctx.toast(/unknown action/i.test(e.message) ? 'Echoes aren’t available right now' : e.message);
    }
  };
  const matched = (id) => {
    stopSearch();
    sfx.select();
    enterMatch(ctx, server, id);
  };
  const stopSearch = () => {
    if (!search) return;
    clearInterval(search.timer);
    search.unlisten?.();
    search = null;
  };
  // Ranked: join the queue; the server pairs us now or when the next player searches
  const find = async () => {
    sfx.select();
    if (local) {
      const { matched: id } = await server.call('start', { deck, name });
      return matched(id);
    }
    try {
      const q = finals ? { deck, name, finals: true } : { deck, name };
      const r = await server.call('queue', q);
      if (r.matched) return matched(r.matched);
      search = { t0: Date.now(), finals };
      // hear about being paired (our queue row changes), and retry pairing now and then
      const c = await cloud.client();
      const ch = c.channel('queue-' + cloud.currentUser().id).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pvp_queue', filter: `user_id=eq.${cloud.currentUser().id}` }, (p) => p.new?.match_id && matched(p.new.match_id)).subscribe();
      search.unlisten = () => c.removeChannel(ch);
      let n = 0;
      search.timer = setInterval(async () => {
        tick();
        if (++n % 6) return;
        try {
          const again = await server.call('queue', q);
          if (again.matched) matched(again.matched);
        } catch {}
      }, 1000);
      draw();
    } catch (e) {
      ctx.toast(e.message);
    }
  };
  const cancel = async () => {
    stopSearch();
    try {
      await server.call('cancel');
    } catch {}
    draw();
  };
  // Friendly: make a code and wait for a friend to join it
  const host = async () => {
    try {
      const { id, code } = await server.call('challenge', { deck, name });
      const box = root.querySelector('[data-hosted]');
      // the link opens the invitation directly (screens/challenge.js); the code still works by hand
      const link = `${location.origin}${location.pathname}?duel=${code}`;
      // the link goes in `url` only: put it in the text too and Messages shows it twice
      const msg = `I bet you can't beat me at THRENYX.`;
      box.innerHTML = `${navigator.share ? '<button class="btn" data-share style="width:100%">Send the challenge</button>' : ''}
        <button class="code-copy" data-copy aria-label="Copy the challenge link" style="margin-top:8px"><b>${code}</b><span>Tap to copy the link</span></button>
        <div class="muted" style="font-size:13px;margin-top:6px">Waiting for them to join… The link works for 24 hours.</div>`;
      const btn = box.querySelector('[data-copy]');
      // copy (or share) inside the tap itself: iPhones refuse clipboard writes that aren't
      btn.onclick = () =>
        copyText(link).then((ok) => {
          ctx.toast(ok ? 'Link copied: paste it to a friend' : 'Press and hold to copy the code');
          if (ok) (btn.querySelector('span').textContent = 'Link copied ✓'), track('challenge_link_shared', { via: 'copy' });
        });
      box.querySelector('[data-share]')?.addEventListener('click', () =>
        navigator.share({ title: 'A THRENYX Duel', text: msg, url: link }).then(() => track('challenge_link_shared', { via: 'share' })).catch(() => {}));
      const wait = setInterval(async () => {
        if (!root.isConnected) return clearInterval(wait);
        try {
          const st = await server.call('status', { match: id });
          if (st.status === 'live') {
            clearInterval(wait);
            enterMatch(ctx, server, id);
          }
        } catch {}
      }, 3000);
    } catch (e) {
      ctx.toast(e.message);
    }
  };
  const join = async () => {
    const code = root.querySelector('[data-code]').value.trim().toUpperCase();
    if (code.length !== 6) return ctx.toast('Codes are 6 letters');
    try {
      const r = await server.call('join', { code, deck, name });
      enterMatch(ctx, server, r.matched);
    } catch (e) {
      ctx.toast(e.message);
    }
  };
  draw();
  return () => {
    // leaving the lobby keeps a search running (it resumes on return)
  };
}
