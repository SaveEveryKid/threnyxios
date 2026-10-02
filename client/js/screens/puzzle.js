// THE DAILY PUZZLE — you have READ their mind: their Orders are face up.
// Find the Command that takes their Voice to zero this round. Three tries.
// Built and solved exhaustively by engine/modes.js buildPuzzle, so there is
// always an answer, and the obvious one ("beat every lane") never works.
import * as store from '../core/store.js';
import * as vault from '../core/vault.js';
import { CARDS, LIST } from '../../../engine/cards/index.js';
import { buildPuzzle, puzzleResult } from '../../../engine/modes.js';
import { makeExpert } from '../../../engine/battle-ai.js';
import { allowedOrders, powerFor, LANES, TERRAIN, isLegalCommand } from '../../../engine/battle.js';
import { ORDERS } from '../../../engine/orders.js';
import { renderCard, esc } from '../ui/card.js';
import { icon } from '../ui/icons.js';
import { sfx } from '../core/audio.js';
import { haptic } from '../core/haptics.js';

const TRIES = 3;
const LABEL = { strike: 'Strike', guard: 'Guard', scheme: 'Scheme' };
const oicon = (o) => `<span class="o-${o}">${icon('i-' + o)}</span>`;

export async function render(root, params, ctx) {
  root.innerHTML = `<div class="kicker">Daily Puzzle</div><div class="h1">Setting the board…</div>`;
  await new Promise((r) => setTimeout(r, 30));
  const day = store.dayKey();
  const pz = buildPuzzle({ day, cards: CARDS, list: LIST, makeAgent: (rand) => makeExpert({ cards: CARDS, rand }) });
  if (!pz) {
    root.innerHTML = '<div class="h1">The Hush</div><div class="muted">No puzzle today.</div>';
    return;
  }
  const st = pz.state;
  const me = st.p[0], op = st.p[1];
  const cmd = { orders: me.lanes.map(() => null), focus: null, read: null };
  const cw = Math.floor(Math.min(104, (Math.min(innerWidth, 520) - 60) / 3));
  const rec = () => {
    const s = store.get();
    return s.puzzle?.day === day ? s.puzzle : { day, tries: [], solved: false };
  };

  const laneHtml = (side, l) => {
    const u = st.p[side].lanes[l];
    if (!u) return `<div class="lane"><div class="lane__slot"><div class="lane__empty"></div></div></div>`;
    const theirs = side === 1 && pz.oppCmd.orders[l];
    return `<div class="lane" data-s="${side}" data-l="${l}"><div class="lane__slot" data-card></div>
      <div class="lane__hp"><i class="hp__ghost" style="width:${(100 * u.hp) / u.maxHp}%"></i><i class="hp__fill" style="width:${(100 * u.hp) / u.maxHp}%"></i><span>${u.hp}<small>/${u.maxHp}</small></span></div>
      <div class="lane__ward ${u.ward > 0 ? 'on' : ''}">${icon('i-guard')}<b>${u.ward}</b></div>
      ${theirs ? `<div class="pz-order o-${theirs}">${icon('i-' + theirs)}<b>${powerFor(st, CARDS, u, l, theirs, { focus: pz.oppCmd.focus === l })}</b>${pz.oppCmd.focus === l ? '<small>Focus</small>' : ''}</div>` : ''}</div>`;
  };

  const draw = () => {
    const r = rec();
    const done = r.solved || r.tries.length >= TRIES;
    const SHORT = { rampart: 'Rampart', bridge: 'Bridge', gallery: 'Gallery', mire: 'Mire' };
    const terr = (st.terrain || []).map((t) => (t && t !== 'field' ? `<span class="tchip t-${t}" title="${esc(TERRAIN[t].name)}: ${esc(TERRAIN[t].text)}">${SHORT[t]} <b>${t === 'mire' ? '−1 all' : TERRAIN[t].text}</b></span>` : '<span></span>')).join('');
    root.innerHTML = `
      <div class="kicker">Daily Puzzle · #${day % 10000}</div>
      <div class="h1" style="font-size:24px">Finish them: ${pz.voice} Voice</div>
      <div class="muted" style="font-size:14px;margin-bottom:8px">You've read their mind: their Orders are shown. Take their Voice to 0 this round. Beating every lane won't be enough. ${TRIES - r.tries.length > 0 && !r.solved ? `<b class="gold">${TRIES - r.tries.length} ${TRIES - r.tries.length === 1 ? 'try' : 'tries'} left</b>` : ''}</div>
      <div class="dr-rk" style="--lw:${cw}px">
        <div class="rk-row rk-row--opp">${[0, 1, 2].map((l) => laneHtml(1, l)).join('')}</div>
        <div class="rk-mid"><div class="rk-terrain pz-terrain">${terr}</div><span>Round ${st.round}${st.round >= st.rules.rounds ? ' · final' : ''}</span></div>
        <div class="rk-row rk-row--me">${[0, 1, 2].map((l) => laneHtml(0, l)).join('')}</div>
      </div>
      <div class="dr-facts" style="margin-top:8px">
        <div><b>${me.voice} · ${pz.voice}</b>Voice (you · them)</div>
        <div><b>${me.focus}</b>Your Focus</div>
        <div><b>${st.initiative === 0 ? 'You' : 'Them'}</b>Initiative</div>
      </div>
      ${done ? '' : `
      ${me.focus > 0 && !me.noFocusRound ? `<div class="dr-opts"><div class="dr-opt"><span>${icon('i-focus')}Focus</span>${['None', 0, 1, 2].map((l) => (l === 'None' || me.lanes[l] ? `<button class="chip ${cmd.focus === (l === 'None' ? null : l) ? 'on' : ''}" data-f="${l}">${l === 'None' ? 'None' : 'Lane ' + (l + 1)}</button>` : '')).join('')}</div></div>` : ''}
      <button class="btn btn--big" data-lock style="width:100%;margin-top:10px" ${me.lanes.every((u, l) => !u || cmd.orders[l]) ? '' : 'disabled'}>Lock</button>`}
      <div data-result></div>`;
    root.querySelectorAll('[data-card]').forEach((slot) => {
      const le = slot.parentElement;
      const u = st.p[+le.dataset.s].lanes[+le.dataset.l];
      const c = CARDS[u.id];
      const el = renderCard({ ...c, stats: { strike: u.stats.strike + u.buff.strike, guard: u.stats.guard + u.buff.guard, scheme: u.stats.scheme + u.buff.scheme } }, { width: cw, flat: true });
      el.onclick = () => {
        const m = ctx.modal('<div></div>');
        m.el.lastElementChild.replaceWith(renderCard(c, { size: 'full', width: Math.min(320, innerWidth - 40), tilt: true }));
      };
      slot.appendChild(el);
    });
    if (!done) {
      for (let l = 0; l < LANES; l++) {
        const u = me.lanes[l];
        if (!u) continue;
        const le = root.querySelector(`.lane[data-s="0"][data-l="${l}"]`);
        const pick = document.createElement('div');
        pick.className = 'lane__pick';
        pick.innerHTML = ORDERS.map((o) => `<button class="op o-${o} ${cmd.orders[l] === o ? 'sel' : ''}" data-o="${o}" ${allowedOrders(st, 0, l).includes(o) ? '' : 'disabled'}>${icon('i-' + o)}<b>${powerFor(st, CARDS, u, l, o, { focus: cmd.focus === l, oppOrder: pz.oppCmd.orders[l] ?? undefined })}</b></button>`).join('');
        pick.querySelectorAll('[data-o]').forEach((b) => (b.onclick = () => ((cmd.orders[l] = b.dataset.o), sfx.order(b.dataset.o), draw())));
        le.appendChild(pick);
      }
      root.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => ((cmd.focus = b.dataset.f === 'None' ? null : +b.dataset.f), sfx.focus(cmd.focus != null), draw())));
      root.querySelector('[data-lock]').onclick = lock;
    }
    showLog(r, done);
  };

  const line = (c) => c.orders.map((o) => (o ? oicon(o) : '<span class="muted">·</span>')).join(' ') + (c.focus != null ? ` · Focus lane ${c.focus + 1}` : '');

  const showLog = (r, done) => {
    const res = root.querySelector('[data-result]');
    const tries = r.tries.map((t, i) => `<div class="dr-line">Try ${i + 1}: ${line(t.cmd)} → ${t.won ? '<b class="gold">finished them</b>' : `they survive on <b>${t.left}</b>`}</div>`).join('');
    let head = '';
    if (r.solved) {
      const stars = TRIES + 1 - r.tries.length;
      head = `<div class="result__title win" style="font-size:40px">SOLVED</div><div class="pz-stars">${'★'.repeat(stars)}<span>${'★'.repeat(TRIES - stars)}</span></div>`;
    } else if (done) {
      head = `<div class="result__title lose" style="font-size:36px">OUT OF TRIES</div><div class="dr-line">One answer: ${line(pz.solutions[0])}</div>`;
    }
    res.innerHTML = tries || head ? `<div class="panel ${r.solved ? 'panel--gold' : ''}" style="margin-top:12px;text-align:center">${head}${tries}${done ? `<div class="muted" style="margin-top:6px;font-size:13px">${pz.solutions.length} winning line${pz.solutions.length > 1 ? 's' : ''} out of ${pz.total}. A new puzzle tomorrow.</div>` : ''}</div>` : '';
  };

  const lock = () => {
    const c = { orders: cmd.orders.slice(), focus: cmd.focus, read: null };
    if (!isLegalCommand(st, 0, c)) return ctx.toast('Give every Champion an Order');
    const out = puzzleResult(pz, CARDS, c);
    sfx.lock();
    haptic.lock();
    setTimeout(() => (out.won ? sfx.clashWin() : sfx.clashLose()), 400);
    let paid = 0;
    store.update((x) => {
      const r = x.puzzle?.day === day ? x.puzzle : { day, tries: [], solved: false };
      r.tries.push({ cmd: c, won: out.won, left: out.left });
      if (out.won && !r.solved) {
        r.solved = true;
        paid = r.tries.length; // tries it took; the vault pays the Embers
        x.puzzleStreak = (x.puzzleLast === day - 1 ? x.puzzleStreak || 0 : 0) + 1;
        x.puzzleLast = day;
      }
      x.puzzle = r;
    });
    if (paid) vault.act('puzzle', { tries: paid }).then((r) => ctx.toast(`Solved · +${r.embers} Embers`), (e) => ctx.toast(e.message));
    draw();
  };
  draw();
}
