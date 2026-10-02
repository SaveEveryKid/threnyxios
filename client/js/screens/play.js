import * as store from '../core/store.js';
import { setBattle } from '../core/session.js';
import * as cloud from '../core/cloud.js';
import { onlineServer } from '../core/pvp.js';
import { pulseLine } from './online.js';
import { aiRewardsLine } from '../ui/win-rewards.js';
import { ladderSpec, personaOctave } from '../core/opponents.js';
import { lookFor } from '../ui/look.js';
import { renderCard, esc } from '../ui/card.js';
import { icon } from '../ui/icons.js';
import { sfx } from '../core/audio.js';
import { CARDS } from '../../../engine/cards/index.js';
import { anomalyOfWeek } from '../../../engine/modes.js';
import { deckProblem } from '../../../engine/pvp.js';
import { bondsOf, ARCH } from '../../../engine/archetypes.js';
import { SEASON, weekKey, weekEnds, rankRewards, anomalyWin, packText, givePacks } from '../../../engine/goals.js';

const WEEK = 7 * 86400000;

// Rival bookkeeping shared by every mode that faces a persona.
export function recordRival(s, persona, { won, finalWin, readsHit }) {
  const r = (s.rivals[persona.id] ||= { w: 0, l: 0, reads: 0, finals: 0, streak: 0, best: 0, deciders: 0, last: 0 });
  const wasTied = r.w === r.l && r.w + r.l > 0;
  if (won) {
    r.w++;
    r.streak = Math.max(1, r.streak + 1);
  } else {
    r.l++;
    r.streak = Math.min(-1, r.streak - 1);
  }
  r.best = Math.max(r.best, r.streak);
  r.reads += readsHit;
  if (finalWin) r.finals++;
  if (wasTied) r.deciders++;
  r.last = Date.now();
  return r;
}

// the Octave's Bonds, or what's wrong with it, under the Octave strip
function bondLine(ids) {
  const problem = deckProblem(ids, CARDS);
  if (problem) return `<div style="font-size:13px;margin-top:8px;color:#ff8a7a">${esc(problem)} Online play needs a legal Octave.</div>`;
  const b = bondsOf(ids, CARDS);
  return `<div class="muted" style="font-size:13px;margin-top:8px">${b.length ? `Bonded: <b class="gold">${b.map((x) => `${esc(ARCH[x.id].name)} ×${x.n}`).join(' · ')}</b>` : 'No Bond yet: 4 Champions of one style fight harder together.'}</div>`;
}

export function startLadder(persona, go) {
  const spec = ladderSpec(persona);
  // rank, rank rewards and Notes come with the match result (engine/economy.js)
  spec.onEnd = ({ won, finalWin, readsHit }) => {
    const out = [];
    store.update((s) => {
      const r = recordRival(s, persona, { won, finalWin, readsHit });
      if (r.w + r.l === 3) out.push(['Rivalry', `${persona.name} is now your Rival`]);
    });
    return out;
  };
  spec.resultKicker = 'Ladder';
  setBattle(spec);
  go('battle', { t: Date.now() });
}

// Wins this week fill a four-step track (engine/goals.js); rewards pay out
// at the end of the match that reaches them.
function seasonPanel(s) {
  const wins = s.season?.week === weekKey() ? s.season.wins : 0;
  const max = SEASON[SEASON.length - 1].wins;
  const days = Math.max(1, Math.ceil((weekEnds() - Date.now()) / 86400000));
  return `<div class="panel" style="margin-top:12px">
      <div class="row"><div class="kicker grow">This week's season</div><span class="muted" style="font-size:12px">${days} day${days > 1 ? 's' : ''} left</span></div>
      <div class="season"><div class="season__bar"><i style="width:${Math.min(100, (100 * wins) / max)}%"></i></div>
        ${SEASON.map((st) => `<div class="season__step ${wins >= st.wins ? 'on' : ''}" style="left:${(100 * st.wins) / max}%"><b>${st.wins}</b><span>${esc(st.text)}</span></div>`).join('')}</div>
      <div class="muted" style="font-size:13px;margin-top:34px">${wins} win${wins === 1 ? '' : 's'} this week · any mode counts</div>
    </div>`;
}

export function render(root, params, { go, toast }) {
  const s = store.get();
  const oct = s.octaves[s.active];
  const anomaly = anomalyOfWeek(Math.floor(Date.now() / WEEK));
  const tierIdx = Math.min(store.PERSONAS.length - 1, s.ladder.tier);
  // only opponents still in the game (an older save can name one that has since left)
  const rivals = Object.entries(s.rivals || {}).filter(([id, r]) => r && r.w + r.l >= 3 && store.PERSONAS.some((p) => p.id === id));
  root.innerHTML = `
    <div class="row"><div class="grow"><div class="kicker">Battle</div><div class="h1">The Reckoning</div></div><a class="btn btn--sm btn--ghost" href="#/rules">Rules</a></div>
    <button class="panel panel--gold road-tile road-tile--online" data-online style="margin-top:10px">
      <div class="kicker">Real people · live</div><b>Online</b>
      <span>${s.econ?.pvpDay === store.dayKey() ? 'Ranked wins always pay · Echo duels · challenge a friend' : 'Your first ranked win today earns a Collector Pack Ticket'}</span>
      <div class="live-line" data-online-pulse></div>
    </button>
    <div class="panel panel--gold" style="margin-top:10px">
      <div class="row"><div class="grow"><div class="kicker">Ladder</div><div class="h-display" style="font-size:24px;margin-top:4px">${store.tierName()}</div></div>
      <div class="pips">${[0, 1, 2, 3].map((i) => `<i class="pip ${i < s.ladder.notes ? 'on' : ''}"></i>`).join('')}</div></div>
      <div class="muted" style="margin:8px 0 12px;font-size:14px">${s.ladder.wins} wins · ${s.ladder.losses} losses · wins with 10 Voice or less earn a bonus Note<br><span class="gold" style="font-size:13px">${aiRewardsLine(s.econ)}</span></div>
      <button class="btn btn--big" data-ladder>Find opponent</button>
    </div>
    ${seasonPanel(s)}
    <div class="panel" style="margin-top:12px">
      <div class="row"><div class="kicker grow">Your Octave</div><button class="btn btn--sm btn--ghost" data-edit>Edit</button></div>
      <div class="lore" style="margin:4px 0 8px">${esc(oct.name)}</div>
      <div class="row" style="gap:5px;flex-wrap:nowrap;overflow:hidden" data-oct></div>
      ${bondLine(oct.cards)}
    </div>
    <div class="panel" style="margin-top:12px">
      <div class="kicker">Anomaly · this week</div>
      <div class="h-display" style="font-size:22px;margin:6px 0 2px">${esc(anomaly.name)}</div>
      <div class="muted" style="font-size:14px;margin-bottom:10px">${esc(anomaly.rules)}<br><span class="gold">${s.anomalyWeek?.week === weekKey() ? Math.min(s.anomalyWeek.wins, 3) : 0} / 3 wins this week → a Faction Pack</span></div>
      <button class="btn btn--dark" data-anomaly>Play Anomaly</button>
    </div>
    <div class="panel" style="margin-top:12px">
      <div class="row"><div class="kicker grow">Rivals</div><button class="btn btn--sm btn--ghost" data-rivals>All</button></div>
      ${rivals.length ? rivals.map(([id, r]) => { const p = store.PERSONAS.find((x) => x.id === id); return `<div class="objective"><span class="grow"><b>${esc(p.name)}</b> <span class="muted">${esc(p.title)}</span></span><span>${r.w}–${r.l}</span><button class="btn btn--sm" data-rival="${id}">Rematch</button></div>`; }).join('') : '<div class="muted" style="font-size:14px;margin-top:6px">Play the same opponent 3 times to form a rivalry.</div>'}
    </div>
    <button class="panel panel--gold road-tile" data-road style="margin-top:12px">
      <div class="kicker">Single player</div><b>The Long Road</b>
      <span>${s.road && !s.road.done ? `Run in progress · stop ${s.road.floor + 1} of 9 · ${'♥'.repeat(s.road.lives)}` : 'Nine stops, relics and rewards, the Archivist at the end'}</span>
    </button>
    <div class="tiles" style="margin-top:12px">
      <button class="tile panel" data-draft>${icon('i-focus')}<b>Draft</b><span>Shared pool · pure skill</span></button>
      <button class="tile panel" data-story>${icon('s-vigil')}<b>Story</b><span>Firstfall chapters</span></button>
    </div>`;
  const octBox = root.querySelector('[data-oct]');
  for (const id of oct.cards) octBox.appendChild(renderCard(CARDS[id], { width: 44, flat: true, ...lookFor(id) }));
  root.querySelector('[data-ladder]').onclick = () => {
    sfx.select();
    // Face someone near your tier; occasionally someone a step above.
    const pool = store.PERSONAS.slice(Math.max(0, tierIdx - 1), tierIdx + 2);
    startLadder(pool[Math.floor(Math.random() * pool.length)], go);
  };
  root.querySelector('[data-edit]').onclick = () => go('octave');
  root.querySelector('[data-rivals]').onclick = () => go('rivals');
  root.querySelector('[data-draft]').onclick = () => go('draft');
  root.querySelector('[data-road]').onclick = () => go('road');
  root.querySelector('[data-online]').onclick = () => go('online');
  // how alive it is right now (real numbers from the server)
  if (cloud.enabled && cloud.currentUser())
    onlineServer
      .call('pulse')
      .then((p) => {
        const el = root.querySelector('[data-online-pulse]');
        if (el) el.innerHTML = pulseLine(p);
      })
      .catch(() => {});
  root.querySelector('[data-story]').onclick = () => go('story');
  root.querySelectorAll('[data-rival]').forEach((b) => (b.onclick = () => startLadder(store.PERSONAS.find((p) => p.id === b.dataset.rival), go)));
  root.querySelector('[data-anomaly]').onclick = () => {
    const persona = store.PERSONAS[Math.min(tierIdx + 1, store.PERSONAS.length - 1)];
    setBattle({
      mode: 'anomaly', mine: oct.cards, theirs: personaOctave(persona), persona, title: persona.name, sub: 'Anomaly · ' + anomaly.name,
      duelRules: anomaly.config, resultKicker: 'Anomaly · ' + anomaly.name,
      // the weekly Anomaly reward comes with the match result
    });
    go('battle', { t: Date.now() });
  };
}
