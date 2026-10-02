// A stand-in for the online server, in the page: the same match engine
// (engine/pvp.js) with the Duel AI on the other side and a little network
// delay. For testing the online flow (#/online?local=1) without Supabase.
import { CARDS } from '../../../engine/cards/index.js';
import { createMatch, submitMove, expire, resign, viewFor, waitingOn, addEmote, EMOTES } from '../../../engine/pvp.js';
import { makeDuelAI } from '../../../engine/duel-ai.js';
import { makeRng } from '../../../engine/rng.js';

export function localServer({ botDeck, botName = 'Test Opponent', delay = 250 } = {}) {
  const matches = new Map();
  const listeners = new Map();
  const bot = makeDuelAI({ skill: 0.7, rand: makeRng(99) });
  const ping = (id) => (listeners.get(id) || []).forEach((f) => f());
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // the AI (side 1) moves shortly after it becomes its turn
  async function botTurn(id) {
    const m = matches.get(id);
    for (let i = 0; i < 4 && !m.over && waitingOn(m).includes(1); i++) {
      await wait(delay * 2);
      const st = m.state, t = m.turn;
      submitMove(m, 1, t.phase === 'lead' ? { lead: bot.lead(st) } : t.phase === 'answer' ? bot.answer(st, t.lead) : bot.finish(st, t.lead, t.answer.answer, t.answer.answerFocus));
      ping(id);
    }
  }
  return {
    async call(action, body = {}) {
      await wait(delay);
      if (action === 'start') {
        const id = 'local-' + Date.now();
        const m = createMatch({ seed: (Math.random() * 2 ** 31) | 0, decks: [body.deck, botDeck], names: [body.name || 'You', botName], ratings: [1000, 1000] });
        matches.set(id, m);
        botTurn(id);
        return { matched: id };
      }
      // friendly code: the AI "friend" joins a few seconds later
      if (action === 'challenge') {
        const { matched } = await this.call('start', body);
        matches.get(matched).joinAt = Date.now() + 4000;
        return { id: matched, code: 'TESTME' };
      }
      if (action === 'join' || action === 'echo') return this.call('start', body);
      if (action === 'pulse') return { active: 1, searching: 0, today: matches.size, recent: [] };
      if (action === 'status') return { status: Date.now() >= (matches.get(body.match)?.joinAt || 0) ? 'live' : 'waiting' };
      const m = matches.get(body.match);
      if (!m) throw new Error('No such match.');
      expire(m, CARDS);
      let error = null;
      if (action === 'move') error = submitMove(m, 0, body.move).error;
      if (action === 'resign') resign(m, 0);
      if (action === 'emote') {
        error = addEmote(m, 0, body.id).error;
        // the test opponent answers now and then
        if (!error && Math.random() < 0.5) setTimeout(() => (addEmote(m, 1, EMOTES[(Math.random() * EMOTES.length) | 0].id), ping(body.match)), 1200);
      }
      if (action === 'rematch') return { ...viewFor(m, 0, body.since), next: null };
      botTurn(body.match);
      const v = { ...viewFor(m, 0, body.since || 0), next: null, ratingDelta: m.over ? (m.winner === 0 ? 16 : -16) : null };
      return error ? { error, view: v } : v;
    },
    async listen(id, fn) {
      listeners.set(id, [...(listeners.get(id) || []), fn]);
      return () => listeners.set(id, (listeners.get(id) || []).filter((f) => f !== fn));
    },
  };
}
