// MODES — Anomaly rule sets, Draft, and the Daily Read.
import { agentDeploys, createBattle, deploy, command, publicView, cloneState, allowedOrders, isLegalCommand, LANES } from './battle.js';
import { ORDERS } from './orders.js';
import { makeRng } from './rng.js';

// ---------------------------------------------------------------------------
// ANOMALY — the rotating playground. Ranked never changes; Anomaly always does.
// Each entry is a pure config override (plus a short rules line for the UI).
// ---------------------------------------------------------------------------
// `config` is a Duel rules override (engine/duel.js DUEL_RULES).
export const ANOMALIES = [
  { id: 'deepFocus', name: 'Deep Breath', rules: 'Each player has 4 Focus.', config: { focus: 4 } },
  { id: 'twinReads', name: 'Two Minds', rules: 'Each player has 2 READs.', config: { reads: 2 } },
  { id: 'heldNote', name: 'The Held Note', rules: 'Focus is worth +3 instead of +2.', config: { focusPower: 3 } },
  { id: 'bloodMoon', name: 'Blood Moon', rules: 'Voices start at 12. Every duel is lethal.', config: { voice: 12 } },
  { id: 'longNight', name: 'The Long Night', rules: 'Voices start at 30. Ten duels.', config: { voice: 30, duels: 10 } },
  { id: 'warband', name: 'Warband', rules: 'Hold 4 Champions in hand, not 3.', config: { hand: 4 } },
  { id: 'hush', name: 'The Hush', rules: 'No Focus exists. Each player has 2 READs.', config: { focus: 0, reads: 2 } },
  { id: 'cleanCuts', name: 'Clean Cuts', rules: 'The winner of a duel Leads the next one.', config: { winnerLeads: true } },
  { id: 'richHands', name: 'Holding Ground', rules: 'Every Answer gets +1 power.', config: { answerBonus: 1 } },
];

export function anomalyOfWeek(weekNumber) {
  return ANOMALIES[((weekNumber % ANOMALIES.length) + ANOMALIES.length) % ANOMALIES.length];
}

// ---------------------------------------------------------------------------
// DRAFT — collection does not matter. A shared face-up pool of 18 Champions:
// each player bans 1 (simultaneously), then a snake draft A B B A A B B A...
// until both hold 8. Then a normal Match.
// ---------------------------------------------------------------------------
export const DRAFT_POOL = 18;

export function createDraft(allCards, seed) {
  const rand = makeRng(seed);
  const ids = allCards.map((c) => c.id);
  // one Champion per character, no rarity weighting: every card equally likely
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const seen = new Set();
  const pool = [];
  for (const id of ids) {
    const ch = allCards.find((c) => c.id === id).char || id;
    if (seen.has(ch)) continue;
    seen.add(ch);
    pool.push(id);
    if (pool.length === DRAFT_POOL) break;
  }
  return { pool, bans: [null, null], picks: [[], []], turn: 0, phase: 'ban', seed };
}

// Snake order after bans: 0,1,1,0,0,1,1,0,...
export function draftPicker(n) {
  const r = n % 4;
  return r === 0 || r === 3 ? 0 : 1;
}

export function draftBan(d0, bans) {
  const d = structuredClone(d0);
  d.bans = bans.slice();
  d.pool = d.pool.filter((id) => !bans.includes(id));
  d.phase = 'pick';
  d.turn = 0;
  return d;
}

export function draftPick(d0, side, id) {
  const d = structuredClone(d0);
  if (d.phase !== 'pick') throw new Error('Not picking');
  if (draftPicker(d.turn) !== side) throw new Error('Not your pick');
  if (!d.pool.includes(id)) throw new Error('Not in pool');
  d.pool = d.pool.filter((x) => x !== id);
  d.picks[side].push(id);
  d.turn++;
  if (d.picks[0].length === 8 && d.picks[1].length === 8) d.phase = 'done';
  return d;
}

// Draft AI: card value = balance rating + synergy with what it already has
// + denial value (how much the opponent would want it).
export function draftValue(cards, rating, mine, theirs, id) {
  const c = cards[id];
  let v = (rating[id] ?? 0.5) * 10;
  const syn = (list) => {
    let s = 0;
    for (const x of list) {
      const o = cards[x];
      if (o.faction === c.faction) s += 0.15;
      for (const t of c.traits || []) if ((o.traits || []).includes(t)) s += 0.2;
      const ab = JSON.stringify(c.kit || {});
      const ob = JSON.stringify(o.kit || {});
      if (ab.includes(`'${o.char}'`) || ab.includes(`"bond:${o.char}"`) || ab.includes(`bond:${o.char}`)) s += 1.2;
      if (ob.includes(`bond:${c.char}`)) s += 1.2;
    }
    return s;
  };
  v += syn(mine);
  v += 0.5 * syn(theirs); // hate-draft: deny what completes their plan
  return v;
}

// ---------------------------------------------------------------------------
// DAILY READ — one position per day, identical for every player.
// Built by playing a seeded expert match to a tense Command phase (round 3+,
// at least two Champions a side, a Voice under pressure), then freezing it.
// The opponent's Command is committed (sampled once from the day's seed), so
// every player faces the same hidden orders. Score = Voice dealt - Voice taken
// + 3 per enemy felled - 3 per ally lost (+/-50 if it ends the match).
// ---------------------------------------------------------------------------
export function buildDailyRead({ day, cards, list, makeAgent }) {
  const count = (P) => P.lanes.filter(Boolean).length;
  for (let attempt = 0; attempt < 40; attempt++) {
    const seed = (day * 7919 + attempt * 104729) >>> 0;
    const rand = makeRng(seed);
    const pick = () => {
      const ids = list.map((c) => c.id);
      for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
      }
      const out = [];
      const seen = new Set();
      for (const id of ids) {
        const ch = cards[id].char;
        if (seen.has(ch)) continue;
        seen.add(ch);
        out.push(id);
        if (out.length === 8) break;
      }
      return out;
    };
    const agents = [makeAgent(rand), makeAgent(rand)];
    const s = createBattle([pick(), pick()], cards, { seed });
    let guard = 0;
    while (s.phase !== 'over' && guard++ < 30) {
      deploy(s, agentDeploys(s, agents), cards);
      if (s.phase === 'over') break;
      const tense = s.round >= 3 && count(s.p[0]) >= 2 && count(s.p[1]) >= 2 && Math.min(s.p[0].voice, s.p[1].voice) <= 22;
      if (tense) {
        const oppCmd = agents[1].command(publicView(s, 1), 1);
        return { day, seed, state: s, oppCmd };
      }
      command(s, [0, 1].map((k) => agents[k].command(publicView(s, k), k)), cards);
    }
  }
  return null;
}

export function scoreDaily(dr, cards, cmd) {
  const s = cloneState(dr.state);
  command(s, [cmd, dr.oppCmd], cards);
  const a = dr.state.p, b = s.p;
  const dealt = a[1].voice - b[1].voice;
  const taken = a[0].voice - b[0].voice;
  const felled = b[1].fallen.length - a[1].fallen.length;
  const lost = b[0].fallen.length - a[0].fallen.length;
  const end = s.phase === 'over' ? (s.winner === 0 ? 50 : -50) : 0;
  return { score: dealt - taken + 3 * (felled - lost) + end, dealt, taken, felled, lost, won: end > 0, state: s };
}

// Every legal command the player could lock (orders x Focus x READ).
export function allCommands(state) {
  const P = state.p[0];
  const lanes = [];
  for (let l = 0; l < LANES; l++) lanes.push(P.lanes[l] ? allowedOrders(state, 0, l) : [null]);
  const combos = [[]];
  for (const opts of lanes) {
    const next = [];
    for (const c of combos) for (const o of opts) next.push([...c, o]);
    combos.splice(0, combos.length, ...next);
  }
  const focusOpts = [null, ...[0, 1, 2].filter((l) => P.lanes[l])];
  const readOpts = [null];
  for (let l = 0; l < LANES; l++) if (P.lanes[l] && state.p[1].lanes[l]) for (const o of ORDERS) readOpts.push({ lane: l, order: o });
  const out = [];
  for (const orders of combos)
    for (const focus of focusOpts)
      for (const read of readOpts) {
        const cmd = { orders, focus, read };
        if (isLegalCommand(state, 0, cmd)) out.push(cmd);
      }
  return out;
}

export function bestDaily(dr, cards) {
  let best = null;
  for (const cmd of allCommands(dr.state)) {
    const r = scoreDaily(dr, cards, cmd);
    if (!best || r.score > best.score) best = { ...r, cmd };
  }
  return best;
}

// ---------------------------------------------------------------------------
// THE DAILY PUZZLE — "finish them this round". A tense position where you
// have READ their mind: their Command is shown face up. Their Voice is set to
// the most any Command of yours can finish, and the obvious answer (beat
// every lane's Order) must fall short, so the win hides in spill, riposte,
// Focus placement, ground and abilities. Solved exhaustively: always fair.
// ---------------------------------------------------------------------------
export function puzzleResult(pz, cards, cmd) {
  const s = cloneState(pz.state);
  command(s, [cmd, pz.oppCmd], cards);
  return { won: s.winner === 0 && s.p[1].voice <= 0, dealt: pz.state.p[1].voice - Math.max(0, s.p[1].voice), left: Math.max(0, s.p[1].voice), state: s };
}

// the "obvious" answer: beat each Order you can see, Focus the biggest hit
function naiveAnswers(state, oppCmd) {
  const beat = { strike: 'guard', guard: 'scheme', scheme: 'strike' };
  const orders = state.p[0].lanes.map((u, l) => (!u ? null : oppCmd.orders[l] ? beat[oppCmd.orders[l]] : 'strike'));
  const out = [{ orders, focus: null, read: null }];
  for (let l = 0; l < LANES; l++) if (state.p[0].lanes[l] && state.p[0].focus > 0) out.push({ orders, focus: l, read: null });
  return out;
}

export function buildPuzzle({ day, cards, list, makeAgent, maxSolutions = 4 }) {
  for (let k = 0; k < 30; k++) {
    const dr = buildDailyRead({ day: day * 13 + 500000 + k * 7, cards, list, makeAgent });
    if (!dr) continue;
    const base = cloneState(dr.state);
    const [me, op] = base.p;
    op.ults = me.ults = me.reads = 0;
    me.focus = Math.min(me.focus, 1);
    me.voice = Math.max(me.voice, 8);
    const oppCmd = { orders: dr.oppCmd.orders.slice(), focus: op.focus > 0 ? dr.oppCmd.focus : null, read: null, ult: null };
    const pz = { state: base, oppCmd };
    const cmds = allCommands(base);
    const naive = naiveAnswers(base, oppCmd).filter((c) => isLegalCommand(base, 0, c));
    // the most Voice any Command finishes this round
    for (let v = 30; v >= 5; v--) {
      op.voice = v;
      const wins = cmds.filter((c) => puzzleResult(pz, cards, c).won);
      if (!wins.length) continue;
      if (wins.length > maxSolutions || naive.some((c) => puzzleResult(pz, cards, c).won)) break;
      return { day, seed: dr.seed, attempt: k, state: base, oppCmd, voice: v, solutions: wins, total: cmds.length };
    }
  }
  return null;
}

// Share text: spoiler-free, like a crossword grid.
export function dailyReadShare(day, cmd, out, best, streak) {
  const icon = { strike: '▲', guard: '⛊', scheme: '◉' };
  const lanes = cmd.orders.map((o) => (o ? icon[o] : '·')).join('');
  const perfect = out.score >= best.score;
  return `THRENYX · Daily Read #${day}\n${lanes}${cmd.focus != null ? ' +Focus' : ''}${cmd.read ? ' READ' : ''}\n${out.score >= 0 ? '+' : ''}${out.score}${perfect ? ' ★ perfect' : ` (best +${best.score})`}\nStreak ${streak}`;
}

export { ORDERS };
