// THE DAILY READ — one frozen position per day, the same for everyone.
// Their orders are already locked. Give yours; see how close to perfect you were.
import * as store from '../core/store.js';
import * as vault from '../core/vault.js';
import { packText } from '../../../engine/goals.js';
import { CARDS, LIST } from '../../../engine/cards/index.js';
import { buildDailyRead, scoreDaily, bestDaily, allCommands, dailyReadShare } from '../../../engine/modes.js';
import { makeExpert, makeNovice } from '../../../engine/battle-ai.js';
import { allowedOrders, publicView, LANES } from '../../../engine/battle.js';
import { ORDERS } from '../../../engine/orders.js';
import { makeRng } from '../../../engine/rng.js';
import { renderCard, esc } from '../ui/card.js';
import { icon } from '../ui/icons.js';
import { sfx } from '../core/audio.js';
import { haptic } from '../core/haptics.js';
import { contribute } from '../core/cloud.js';

const LABEL = { strike: 'Strike', guard: 'Guard', scheme: 'Scheme' };

// "The world": until the live service exists, a simulated field of 1,500
// players of mixed skill answers the same position. Labelled honestly.
function projectedField(dr) {
  const rand = makeRng(dr.seed ^ 0x9e3779b9);
  const expert = makeExpert({ cards: CARDS, rand, exploit: 0 });
  const novice = makeNovice({ cards: CARDS, rand });
  const scores = [];
  const view = publicView(dr.state, 0);
  for (let i = 0; i < 1500; i++) {
    const cmd = (rand() < 0.4 ? expert : novice).command(view, 0);
    scores.push(scoreDaily(dr, CARDS, cmd).score);
  }
  return scores;
}

export async function render(root, params, ctx) {
  root.innerHTML = `<div class="kicker">Daily Read</div><div class="h1">Loading…</div>`;
  await new Promise((r) => setTimeout(r, 30));
  const day = store.dayKey();
  const s = store.get();
  const dr = buildDailyRead({ day, cards: CARDS, list: LIST, makeAgent: (rand) => makeExpert({ cards: CARDS, rand }) });
  if (!dr) {
    root.innerHTML = '<div class="h1">The Hush</div><div class="muted">No Read today.</div>';
    return;
  }
  const st = dr.state;
  const me = st.p[0];
  const op = st.p[1];
  const played = s.dr.played[day]?.cmd?.orders ? s.dr.played[day] : null; // ignores answers saved by the old format
  const cmd = { orders: me.lanes.map(() => null), focus: null, read: null };
  const canFocus = me.focus > 0 && !me.noFocusRound;
  const canRead = me.reads > 0 && !me.noReadRound && [0, 1, 2].some((l) => me.lanes[l] && op.lanes[l]);
  const cw = Math.floor(Math.min(104, (Math.min(innerWidth, 520) - 60) / 3));

  const laneHtml = (side, l) => {
    const u = st.p[side].lanes[l];
    if (!u) return `<div class="lane"><div class="lane__slot"><div class="lane__empty"></div></div></div>`;
    return `<div class="lane" data-s="${side}" data-l="${l}"><div class="lane__slot" data-card></div>
      <div class="lane__hp"><i class="hp__ghost" style="width:${(100 * u.hp) / u.maxHp}%"></i><i class="hp__fill" style="width:${(100 * u.hp) / u.maxHp}%"></i><span>${u.hp}<small>/${u.maxHp}</small></span></div>
      <div class="lane__ward ${u.ward > 0 ? 'on' : ''}">${icon('i-guard')}<b>${u.ward}</b></div></div>`;
  };

  const draw = () => {
    root.innerHTML = `
      <div class="kicker">The Daily Read · #${day % 10000}</div>
      <div class="h1" style="font-size:24px">Round ${st.round} · ${me.voice} vs ${op.voice} Voice</div>
      <div class="muted" style="font-size:14px;margin-bottom:8px">Everyone in the world faces this exact moment today. Their orders are locked. Find the best answer.</div>
      <div class="dr-rk" style="--lw:${cw}px">
        <div class="rk-row rk-row--opp">${[0, 1, 2].map((l) => laneHtml(1, l)).join('')}</div>
        <div class="rk-mid"><span>Round ${st.round}</span></div>
        <div class="rk-row rk-row--me">${[0, 1, 2].map((l) => laneHtml(0, l)).join('')}</div>
      </div>
      <div class="dr-facts" style="margin-top:8px">
        <div><b>${me.focus} · ${op.focus}</b>Focus (you · them)</div>
        <div><b>${me.reads} · ${op.reads}</b>READs</div>
        <div><b>${st.initiative === 0 ? 'You' : 'Them'}</b>Initiative</div>
      </div>
      ${played ? '' : `
      <div class="dr-opts">
        ${canFocus ? `<div class="dr-opt"><span>${icon('i-focus')}Focus</span>${['None', 0, 1, 2].map((l) => (l === 'None' || me.lanes[l] ? `<button class="chip ${cmd.focus === (l === 'None' ? null : l) ? 'on' : ''}" data-f="${l}">${l === 'None' ? 'None' : 'Lane ' + (l + 1)}</button>` : '')).join('')}</div>` : ''}
        ${canRead ? `<div class="dr-opt"><span>${icon('i-read')}READ</span><button class="chip ${!cmd.read ? 'on' : ''}" data-r="none">None</button>${[0, 1, 2].filter((l) => me.lanes[l] && op.lanes[l]).map((l) => ORDERS.map((o) => `<button class="chip o-${o} ${cmd.read?.lane === l && cmd.read.order === o ? 'on' : ''}" data-r="${l}:${o}">L${l + 1} ${icon('i-' + o)}</button>`).join('')).join('')}</div>` : ''}
      </div>
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
    if (!played) {
      for (let l = 0; l < LANES; l++) {
        const u = me.lanes[l];
        if (!u) continue;
        const le = root.querySelector(`.lane[data-s="0"][data-l="${l}"]`);
        const pick = document.createElement('div');
        pick.className = 'lane__pick';
        pick.innerHTML = ORDERS.map((o) => `<button class="op o-${o} ${cmd.orders[l] === o ? 'sel' : ''}" data-o="${o}" ${allowedOrders(st, 0, l).includes(o) ? '' : 'disabled'}>${icon('i-' + o)}<b>${u.stats[o] + u.buff[o] + (cmd.focus === l ? st.rules.focusPower : 0)}</b></button>`).join('');
        pick.querySelectorAll('[data-o]').forEach((b) => (b.onclick = () => ((cmd.orders[l] = b.dataset.o), sfx.order(b.dataset.o), draw())));
        le.appendChild(pick);
      }
      root.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => ((cmd.focus = b.dataset.f === 'None' ? null : +b.dataset.f), sfx.focus(cmd.focus != null), draw())));
      root.querySelectorAll('[data-r]').forEach(
        (b) =>
          (b.onclick = () => {
            if (b.dataset.r === 'none') cmd.read = null;
            else {
              const [l, o] = b.dataset.r.split(':');
              cmd.read = { lane: +l, order: o };
            }
            sfx.readArm();
            draw();
          }),
      );
      root.querySelector('[data-lock]').onclick = () => lock();
    } else showResult(played.cmd);
  };

  const showResult = (c) => {
    const out = scoreDaily(dr, CARDS, c);
    const best = bestDaily(dr, CARDS);
    const field = projectedField(dr);
    const beat = Math.round((100 * field.filter((x) => x < out.score).length) / field.length);
    const perfect = out.score >= best.score;
    const streak = store.get().dr.streak;
    const theirs = dr.oppCmd.orders.map((o, l) => (o ? `<span class="o-${o}">${icon('i-' + o)}</span>` : '<span class="muted">·</span>')).join(' ');
    const bestTxt = best.cmd.orders.map((o) => (o ? `<span class="o-${o}">${icon('i-' + o)}</span>` : '<span class="muted">·</span>')).join(' ');
    const res = root.querySelector('[data-result]');
    res.innerHTML = `
      <div class="panel ${perfect ? 'panel--gold' : ''}" style="margin-top:12px;text-align:center">
        <div class="result__title ${out.score > 0 ? 'win' : 'lose'}" style="font-size:40px">${perfect ? 'PERFECT' : out.score > 0 ? 'READ IT' : 'MISJUDGED'}</div>
        <div style="font-size:30px;font-weight:800;margin:4px 0">${out.score >= 0 ? '+' : ''}${out.score}<span class="muted" style="font-size:15px;font-weight:600"> / best +${best.score}</span></div>
        <div class="muted">Dealt ${out.dealt} · took ${out.taken} · felled ${out.felled} · lost ${out.lost}${out.won ? ' · ended it' : ''}</div>
        <div class="dr-line">They locked: ${theirs}${dr.oppCmd.focus != null ? ` · Focus lane ${dr.oppCmd.focus + 1}` : ''}${dr.oppCmd.read ? ` · READ lane ${dr.oppCmd.read.lane + 1}` : ''}</div>
        <div class="dr-line">Best answer: ${bestTxt}${best.cmd.focus != null ? ` · Focus lane ${best.cmd.focus + 1}` : ''}${best.cmd.read ? ` · READ lane ${best.cmd.read.lane + 1} ${LABEL[best.cmd.read.order]}` : ''}</div>
      </div>
      <div class="panel" style="margin-top:10px">
        <div class="kicker">Against the world <span class="muted">(projected until the live service)</span></div>
        <div class="bar"><span style="width:84px">You beat</span><div class="progress"><i style="width:${beat}%"></i></div><b>${beat}%</b></div>
      </div>
      <div class="row" style="margin-top:10px"><div class="grow muted">Streak ${streak} · a Pack Ticket every 3 days, a Firstfall Pack every 7</div><button class="btn btn--sm" data-share>Share</button></div>`;
    res.querySelector('[data-share]').onclick = async () => {
      const text = dailyReadShare(day % 10000, c, out, best, streak);
      try {
        if (navigator.share) await navigator.share({ text });
        else await navigator.clipboard.writeText(text);
        ctx.toast('Copied');
      } catch {
        /* dismissed */
      }
    };
  };

  const lock = () => {
    const c = { orders: cmd.orders.slice(), focus: cmd.focus, read: cmd.read };
    if (!allCommands(st).some((x) => JSON.stringify(x) === JSON.stringify(c))) return ctx.toast('Give every Champion an Order');
    const out = scoreDaily(dr, CARDS, c);
    sfx.lock();
    haptic.lock();
    setTimeout(() => (out.score > 0 ? sfx.clashWin() : sfx.clashLose()), 450);
    store.update((x) => {
      const yesterday = x.dr.last === day - 1;
      x.dr.streak = yesterday || x.dr.last === null ? x.dr.streak + 1 : 1;
      x.dr.winStreak = out.score > 0 ? x.dr.winStreak + 1 : 0;
      x.dr.last = day;
      x.dr.played[day] = { cmd: c, win: out.score > 0, score: out.score };
      store.bumpObjective('dailyRead');
    });
    // streak rewards (every 3rd day a ticket, every 7th a Firstfall Pack) come from the vault
    vault.act('dailyRead').then((r) => r.reward && Object.keys(r.reward).length && ctx.toast(`Streak ${r.streak}: ${packText(r.reward)}`), () => {});
    contribute('read'); // Alliance chest
    draw();
  };
  draw();
}
