// ONLINE PLAY — the game's side of a live match. The server (supabase/
// functions/pvp) owns the match; this keeps a copy of *your view* of it,
// listens for "something changed" pings (Supabase Realtime, with a slow poll
// as a safety net), and hands the battle screen each result in order.
import * as cloud from './cloud.js';

// ---- the server ----------------------------------------------------------------
export const onlineServer = {
  async call(action, body = {}) {
    const c = await cloud.client();
    if (!c) throw new Error('Online play needs a connection.');
    const { data, error } = await c.functions.invoke('pvp', { body: { action, ...body } });
    if (error) {
      // no answer at all: the function isn't deployed, or the gateway refused the call
      if (error.name === 'FunctionsFetchError' || error.name === 'FunctionsRelayError') throw new Error("The online server isn't answering. Try again in a moment.");
      let msg = error.message;
      try {
        const j = await error.context.json();
        if (j.view) return j; // a refused action still returns the current view
        msg = j.error || msg;
      } catch {}
      throw new Error(msg);
    }
    return data;
  },
  // Realtime: the match's ping row changes on every move
  async listen(matchId, fn) {
    const c = await cloud.client();
    if (!c) return () => {};
    const ch = c.channel('pvp-' + matchId).on('postgres_changes', { event: '*', schema: 'public', table: 'pvp_pings', filter: `match_id=eq.${matchId}` }, () => fn()).subscribe();
    return () => c.removeChannel(ch);
  },
};

/**
 * One live match from your side. `results` come in order; each carries the
 * view's state if it is the newest thing that happened (else the screen
 * resyncs to the latest state without replaying the skipped steps).
 */
export class RemoteMatch {
  constructor(server, id) {
    this.server = server;
    this.id = id;
    this.seen = 0; // results handled
    this.view = null;
    this.waiters = [];
    this.closed = false;
  }
  async start() {
    this.view = await this.server.call('view', { match: this.id });
    this.seen = this.view.results.length ? this.view.results.at(-1).seq : 0;
    this.emoteSeen = this.view.emotes?.at(-1)?.n || 0; // only new ones pop up
    this.unlisten = await this.server.listen(this.id, () => this.refresh());
    // safety net: poll slowly, and wake the server when a clock runs out
    this.poll = setInterval(() => this.refresh(), 5000);
    this.arm();
    return this;
  }
  close() {
    this.closed = true;
    clearInterval(this.poll);
    clearTimeout(this.clock);
    this.unlisten?.();
  }
  // when the shot clock runs out, ask the server (it plays for whoever is late)
  arm() {
    clearTimeout(this.clock);
    const d = this.view?.deadline;
    if (d && !this.view.over) this.clock = setTimeout(() => this.refresh(), Math.max(500, d - Date.now() + 700));
  }
  async refresh() {
    if (this.closed || this.busy) return;
    this.busy = true;
    try {
      this.take(await this.server.call('view', { match: this.id, since: this.seen }));
    } catch (e) {
      console.warn('pvp refresh', e.message);
    } finally {
      this.busy = false;
    }
  }
  take(v) {
    if (!v || (this.view && v.version < this.view.version)) return;
    const fresh = v.results || [];
    this.view = { ...v, results: fresh };
    this.viewAt = Date.now(); // with view.now: how long since the opponent was heard from
    for (const e of v.emotes || []) {
      if (e.n <= (this.emoteSeen || 0)) continue;
      this.emoteSeen = e.n;
      if (!e.mine) this.onEmote?.(e.id);
    }
    this.pending = [...(this.pending || []).filter((r) => r.seq > this.seen), ...fresh.filter((r) => r.seq > this.seen && !(this.pending || []).some((p) => p.seq === r.seq))];
    this.arm();
    this.flush();
  }
  flush() {
    for (const w of this.waiters.slice()) {
      const ok = w.test(this);
      if (ok !== undefined) {
        this.waiters.splice(this.waiters.indexOf(w), 1);
        w.resolve(ok);
      }
    }
  }
  waitFor(test) {
    return new Promise((resolve) => {
      this.waiters.push({ test, resolve });
      this.flush();
    });
  }
  /** The next resolved duel (or the end), in order. Timeouts on the way are skipped. */
  nextResult() {
    return this.waitFor((me) => {
      const q = me.pending || [];
      const i = q.findIndex((r) => r.kind === 'duel' || r.kind === 'end');
      if (i < 0) return undefined;
      const r = q[i];
      me.pending = q.slice(i + 1);
      me.seen = r.seq;
      return r;
    });
  }
  /** A result is waiting to be shown. */
  hasResult() {
    return (this.pending || []).some((r) => r.kind === 'duel' || r.kind === 'end');
  }
  /** Resolves when the match moves on from `version`. */
  changed(version) {
    return this.waitFor((me) => (me.view.version !== version || me.hasResult() ? true : undefined));
  }
  // a refused move comes back with the current view (e.g. the clock ran out first)
  async act(action, body) {
    const r = await this.server.call(action, { match: this.id, since: this.seen, ...body });
    if (r?.error) {
      if (r.view) this.take(r.view);
      return r.error;
    }
    this.take(r);
    return null;
  }
  /** Your turn: { lead } · { answer, answerFocus } · { leadFocus, switchTo }. Returns an error message or null. */
  move(move) {
    return this.act('move', { move }).catch((e) => e.message);
  }
  /** A quick phrase (engine/pvp.js EMOTES). Returns an error message or null. */
  emote(id) {
    return this.act('emote', { id }).catch((e) => e.message);
  }
  async resign() {
    try {
      this.take(await this.server.call('resign', { match: this.id, since: this.seen }));
    } catch {}
  }
  async rematch() {
    this.take(await this.server.call('rematch', { match: this.id, since: this.seen }));
    return this.waitFor((me) => me.view.next || undefined);
  }
}
