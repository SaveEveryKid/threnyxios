// OKTOBERFEST — the October tournament (engine/oktober.js; scored by the pvp
// server). Qualifying all month on the ranked ladder, then the top 8 play
// their own ladder over Halloween weekend for a one-of-one card.
import * as cloud from '../core/cloud.js';
import { onlineServer } from '../core/pvp.js';
import { openSignIn } from '../ui/account.js';
import { esc, renderCard } from '../ui/card.js';
import { CARDS } from '../../../engine/cards/index.js';
import { OKTOBER_SET, OKTOBER_SET_CHANCE, hasOktober } from '../../../engine/collection.js';
import * as store from '../core/store.js';
import { OKTOBER, phase as phaseAt } from '../../../engine/oktober.js';
import { LEGAL } from '../ui/legal.js';
import { uiArt, cardbackArt, chosenBack, chooseBack } from '../art/index.js';

const ART_OKT = new URL('../../art/oktober/', import.meta.url).href; // badges
const CT = { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric' };
const when = (t) => new Date(t).toLocaleDateString('en-US', CT);
export function countdown(ms) {
  if (ms <= 0) return 'now';
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${s}s`;
}
/** One line for banners: what's on, and how long is left. */
export function oktoberLine(now = Date.now()) {
  const ph = phaseAt(now);
  if (ph === 'soon') return `Starts in ${countdown(OKTOBER.start - now)}`;
  if (ph === 'qualifying') return `Qualifying · ${countdown(OKTOBER.qualEnd - now)} left · top 8 reach the finals`;
  if (ph === 'finals') return `Finals this weekend · ${countdown(OKTOBER.finalsEnd - now)} left`;
  return 'Finished · see the champion';
}

// the prize, small in its panel; tap for the full card
function mountPrize(root, ctx) {
  const slot = root.querySelector('[data-prize-card]');
  if (!slot || slot.firstChild) return;
  slot.appendChild(renderCard(CARDS.eighthBell, { width: 72, flat: true }));
  root.querySelector('[data-prize]').onclick = () => {
    const m = ctx.modal('<div></div>');
    m.el.lastElementChild.replaceWith(renderCard(CARDS.eighthBell, { size: 'full', width: Math.min(320, innerWidth - 40), tilt: true }));
  };
}

export async function render(root, params, ctx) {
  const art = uiArt('oktober-banner', true);
  const head = () => `
    <div class="okt-hero" ${art ? `style="background-image:linear-gradient(90deg,rgba(6,3,4,.92) 30%,rgba(6,3,4,.35)),url('${art}')"` : ''}>
      <div class="kicker">Tournament · October</div>
      <div class="h1 okt-title">Oktoberfest</div>
      <div class="okt-clock" data-clock>${esc(oktoberLine())}</div>
    </div>
    <div class="panel panel--gold okt-prize" data-prize>
      <div class="okt-card" data-prize-card></div>
      <div class="grow"><div class="kicker">The prize · Mythic · 1 of 1</div><b>The Eighth Bell</b><span>One copy, ever. Never reprinted. The winner's name is written into its history for good. Tap to see it.</span></div>
    </div>
    <div class="panel okt-prize okt-back">
      <img src="${cardbackArt('s', 'oktober')}" alt="The Oktoberfest Finalist card back" loading="lazy">
      <div class="grow"><div class="kicker">Every finalist</div><b>The Finalist card back</b><span>All ${OKTOBER.finalists} finalists earn this card back for good, to show on every card they play.</span><div data-back></div></div>
    </div>`;
  const how = `
    <div class="panel" style="margin-top:12px">
      <div class="kicker">How it works</div>
      <ol class="okt-steps">
        <li><b>Qualify all month</b> (until ${when(OKTOBER.qualEnd - 1)}): every ranked online match scores. <span class="gold">Win +${OKTOBER.points.win}</span>, loss +${OKTOBER.points.loss}. Echo wins +${OKTOBER.points.echoWin} (up to ${OKTOBER.echoPointsPerDay} a day). One opponent scores ${OKTOBER.sameOpponentPerDay} times a day.</li>
        <li><b>The top ${OKTOBER.finalists} reach the finals</b>, ${when(OKTOBER.qualEnd)} – ${when(OKTOBER.finalsEnd - 1)}. No set match times: finalists play each other on their own ladder whenever they're free that weekend.</li>
        <li><b>Highest finals rating wins.</b> Everyone starts at ${OKTOBER.finals.start}; you need ${OKTOBER.finals.minMatches} finals matches to be eligible, and each pair counts ${OKTOBER.finals.perPair} times.</li>
      </ol>
      <div class="muted" style="font-size:12px;margin-top:6px">Free to enter. Times are US Central. <a href="#/rules?s=oktober">Easy rules</a> · <a href="${LEGAL.oktober}" target="_blank" rel="noopener">Official rules</a></div>
    </div>`;

  if (!cloud.enabled || !cloud.currentUser()) {
    root.innerHTML = `${head()}${how}<button class="btn btn--big" data-signin style="margin-top:12px">Sign in to compete</button>`;
  mountPrize(root, ctx);
    root.querySelector('[data-signin]').onclick = () => openSignIn(ctx);
    return;
  }
  root.innerHTML = `${head()}<div class="panel" style="margin-top:12px"><div class="muted">Loading the standings…</div></div>${how}`;
  mountPrize(root, ctx);
  let o;
  try {
    o = await onlineServer.call('oktober');
    if (!o || !Array.isArray(o.top)) throw new Error('The tournament server isn’t set up yet.');
  } catch (e) {
    root.innerHTML = `${head()}<div class="panel" style="margin-top:12px"><div class="muted">Couldn't load the standings: ${esc(e.message)}</div><button class="btn btn--sm" data-retry style="margin-top:10px">Try again</button></div>${how}`;
  mountPrize(root, ctx);
    root.querySelector('[data-retry]').onclick = () => render(root, params, ctx);
    return;
  }
  if (!root.isConnected) return;
  const me = o.me;
  const you = (id) => (id === cloud.currentUser().id ? 'okt-you' : '');
  const action =
    o.phase === 'finals' && o.finalist
      ? `<button class="btn btn--big btn--pulse" data-finals>Find a finals match</button><div class="muted" style="font-size:12px;margin-top:6px">You only meet the other finalists. Play whenever you're free this weekend.</div>`
      : o.phase === 'qualifying' || o.phase === 'soon'
        ? `<button class="btn btn--big" data-ranked>Play ranked</button>`
        : '';
  const standing =
    o.phase === 'over' && o.champion
      ? `<div class="panel panel--gold" style="margin-top:12px;text-align:center"><div class="kicker">Champion</div><div class="h-display" style="font-size:28px;margin:4px 0">${esc(o.champion.name)}</div><div class="muted">${o.champion.rating} finals rating · ${o.champion.wins}–${o.champion.losses}. The Eighth Bell rings once, for them.</div></div>`
      : `<div class="panel" style="margin-top:12px">
          <div class="kicker">${o.finalist ? 'You are a finalist' : 'Your standing'}</div>
          ${me ? `<div class="row" style="margin:6px 0 10px"><div class="grow"><div class="h-display" style="font-size:30px">#${me.rank}</div><div class="muted" style="font-size:12px">of ${o.players} · ${me.wins}–${me.losses}</div></div><div style="text-align:right"><div class="h-display gold" style="font-size:30px">${me.points}</div><div class="muted" style="font-size:12px">points</div></div></div>` : `<div class="muted" style="font-size:14px;margin:6px 0 10px">${o.phase === 'qualifying' ? 'Play a ranked online match to get on the board.' : o.phase === 'soon' ? 'Qualifying opens soon.' : 'You didn’t qualify this time.'}</div>`}
          ${action}
        </div>`;
  // everyone: points milestones pay Oktoberfest Packs (the economy function delivers them)
  const pts = me?.points || 0;
  const nextM = OKTOBER.packs.find((m) => pts < m.at);
  const packsPanel = `<div class="panel" style="margin-top:12px">
      <div class="kicker">Oktoberfest Packs · for everyone</div>
      <div class="muted" style="font-size:13px;margin:4px 0 8px">5 cards, all foil, 4 Rare-or-better and 1 Epic-or-better. Only earned this month: ranked points unlock them.</div>
      ${OKTOBER.packs.map((m) => `<div class="objective ${pts >= m.at ? 'done' : ''}"><i class="chk"></i><span class="grow">${m.at} points</span><b class="gold">${m.n} Oktoberfest Pack${m.n > 1 ? 's' : ''}</b></div>`).join('')}
      <div class="muted" style="font-size:12px;margin-top:6px">${nextM ? `${nextM.at - pts} more point${nextM.at - pts === 1 ? '' : 's'} to the next pack. A loss still scores 1.` : 'All earned. Open them in Packs.'} Earned packs arrive the next time you open the game.</div>
    </div>`;
  // the Oktoberfest Set: five to collect, only in Oktoberfest Packs
  const prof = store.get().profile;
  const setOwned = OKTOBER_SET.filter((id) => hasOktober(prof, id)).length;
  const setPanel = `<div class="panel" style="margin-top:12px">
      <div class="row"><div class="kicker grow">The Oktoberfest Set · 5 to collect</div><b class="gold">${setOwned} / 5</b></div>
      <div class="muted" style="font-size:13px;margin:4px 0 8px">Five Champions in their autumn versions. Only found in Oktoberfest Packs, as a bonus card in ${Math.round(OKTOBER_SET_CHANCE * 100)} in 100 packs. Never sold, never again after October.</div>
      <div class="okt-set" data-set></div>
    </div>`;
  const finalsTable = o.finalists.length
    ? `<div class="panel" style="margin-top:12px">
        <div class="kicker">${o.phase === 'over' ? 'Final standings' : 'The finals'}</div>
        ${o.finalists.map((f, i) => `<div class="objective ${you(f.user_id)}"><span style="width:24px" class="muted">${i + 1}</span><img class="okt-badge" src="${ART_OKT}badge-${o.champion?.user_id === f.user_id ? 'champion' : 'finalist'}.webp" alt=""><span class="grow"><b>${esc(f.name)}</b> <span class="muted" style="font-size:11px">seed ${f.seed ?? '–'}</span></span><span class="muted" style="font-size:12px">${f.wins}–${f.losses}${f.matches < OKTOBER.finals.minMatches ? ` · ${OKTOBER.finals.minMatches - f.matches} to go` : ''}</span><b style="width:50px;text-align:right">${f.rating}</b></div>`).join('')}
      </div>`
    : '';
  const board = `
    <div class="panel" style="margin-top:12px">
      <div class="kicker">Qualifying${o.phase === 'qualifying' ? ' · live' : ''}</div>
      ${o.top.length ? o.top.map((r) => `<div class="objective ${you(r.user_id)} ${r.rank === OKTOBER.finalists ? 'okt-cut' : ''}"><span style="width:24px" class="muted">${r.rank}</span><span class="grow">${esc(r.name)}</span><span class="muted" style="font-size:12px">${r.wins}–${r.losses}</span><b style="width:44px;text-align:right">${r.points}</b></div>`).join('') : '<div class="muted" style="font-size:13px;margin-top:6px">Nobody has scored yet. The first ranked win puts you on top.</div>'}
      ${o.top.length >= OKTOBER.finalists ? `<div class="muted" style="font-size:11px;margin-top:6px">The gold line marks the finals cut: top ${OKTOBER.finalists}.</div>` : ''}
    </div>`;
  root.innerHTML = `${head()}${standing}${o.phase === 'qualifying' ? packsPanel : ''}${setPanel}${o.phase === 'finals' || o.phase === 'over' ? finalsTable + board : board}${how}`;
  mountPrize(root, ctx);
  // finalists: wear the Finalist card back (a look on this device; the title is the server's)
  if (o.finalist) {
    const slot = root.querySelector('[data-back]');
    const drawBack = () => {
      const on = chosenBack() === 'oktober';
      slot.innerHTML = `<button class="btn btn--sm ${on ? 'btn--ghost' : ''}" style="margin-top:8px">${on ? 'Using it ✓ · switch back' : 'Use this card back'}</button>`;
      slot.firstChild.onclick = () => (chooseBack(on ? null : 'oktober'), drawBack());
    };
    drawBack();
  }
  const setEl = root.querySelector('[data-set]');
  for (const id of OKTOBER_SET) {
    const have = hasOktober(prof, id);
    const c = renderCard(CARDS[id], { width: 62, flat: true, treatment: 'oktober' });
    if (!have) c.classList.add('okt-missing');
    const cell = document.createElement('div');
    cell.appendChild(c);
    cell.onclick = () => {
      const m = ctx.modal('<div></div>');
      m.el.lastElementChild.replaceWith(renderCard(CARDS[id], { size: 'full', width: Math.min(320, innerWidth - 40), tilt: true, treatment: 'oktober' }));
    };
    setEl.appendChild(cell);
  }
  root.querySelector('[data-ranked]')?.addEventListener('click', () => ctx.go('online'));
  root.querySelector('[data-finals]')?.addEventListener('click', () => ctx.go('online', { finals: 1 }));
  const tick = setInterval(() => {
    const c = root.querySelector('[data-clock]');
    if (!c) return clearInterval(tick);
    c.textContent = oktoberLine();
  }, 1000);
}
