// A tiny in-memory stand-in for supabase-js, and a loader that runs a
// bundled Edge Function (supabase/functions/<name>/index.ts) against it.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
export const db = { pvp_profiles: [], pvp_queue: [], pvp_matches: [], pvp_pings: [], vaults: [], purchases: [], alliance_claims: [], event_entries: [], ref_codes: [], referrals: [], voice_accounts: [], player_blocks: [], player_reports: [], voice_sessions: [], voice_pings: [], voice_events: [], app_flags: [], funnel_events: [], friend_codes: [], friends: [], friend_messages: [], trade_offers: [], trade_listings: [], trade_log: [] };
// when each test account was made (auth.users.created_at); default: just now
export const userCreated = {};
// auth users by id; a token starting with "guest" is an anonymous (guest) player
export const users = {};
const userFor = (id) => users[id] || (users[id] = { id, created_at: userCreated[id] ?? new Date().toISOString(), is_anonymous: id.startsWith('guest'), app_metadata: {}, user_metadata: {}, email: id.startsWith('guest') ? null : id + '@test' });
const clone = (x) => JSON.parse(JSON.stringify(x));
class Q {
  constructor(t) { Object.assign(this, { t, op: 'select', f: [], ord: null, lim: null, one: null, ret: false, vals: null, opts: {} }); }
  select(c, o = {}) { if (this.op !== 'select') this.ret = true; this.opts = o; this.cols = c; return this; }
  insert(v) { this.op = 'insert'; this.vals = v; return this; }
  upsert(v, o = {}) { this.op = 'upsert'; this.vals = v; this.opts = o; return this; }
  update(v) { this.op = 'update'; this.vals = v; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(k, v) { this.f.push((r) => r[k] === v); return this; }
  neq(k, v) { this.f.push((r) => r[k] !== v); return this; }
  gt(k, v) { this.f.push((r) => r[k] != null && r[k] > v); return this; }
  gte(k, v) { this.f.push((r) => r[k] != null && r[k] >= v); return this; }
  lt(k, v) { this.f.push((r) => r[k] != null && r[k] < v); return this; }
  ilike(k, v) { const re = new RegExp('^' + v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$', 'i'); this.f.push((r) => re.test(String(r[k] ?? ''))); return this; }
  is(k, v) { this.f.push((r) => (r[k] ?? null) === v); return this; }
  not(k, op, v) { this.f.push((r) => !((r[k] ?? null) === v)); return this; }
  in(k, v) { this.f.push((r) => v.includes(r[k])); return this; }
  or(s) { const ps = s.split(',').map((p) => p.split('.')); this.f.push((r) => ps.some(([k, , v]) => r[k] === v)); return this; }
  order(k, o) { this.ord = [k, o?.ascending !== false]; return this; }
  limit(n) { this.lim = n; return this; }
  maybeSingle() { this.one = 'maybe'; return this; }
  single() { this.one = 'single'; return this; }
  run() {
    const T = db[this.t], m = (r) => this.f.every((f) => f(r));
    const pk = { pvp_matches: 'id', purchases: 'id', player_reports: 'id', voice_sessions: 'id', voice_events: 'id', pvp_pings: 'match_id', voice_pings: 'match_id', app_flags: 'key', friend_messages: 'id', trade_offers: 'id', trade_listings: 'id', trade_log: 'id' }[this.t] ?? 'user_id';
    let out = [];
    if (this.op === 'select') out = T.filter(m);
    if (this.op === 'insert') for (const v of [].concat(this.vals)) { if ((v.code && T.some((r) => r.code === v.code)) || (this.t === 'vaults' && T.some((r) => r.user_id === v.user_id))) return { error: { message: 'duplicate key' } }; const at = new Date().toISOString(); const r = { id: v.id ?? crypto.randomUUID(), version: 0, status: 'live', created_at: at, updated_at: at, ...clone(v) }; T.push(r); out.push(r); }
    const same = this.t === 'event_entries' ? (r, v) => r.event === v.event && r.user_id === v.user_id : this.t === 'player_blocks' ? (r, v) => r.blocker === v.blocker && r.blocked === v.blocked : (r, v) => r[pk] === v[pk];
    if (this.op === 'upsert') for (const v of [].concat(this.vals)) { const i = T.findIndex((r) => same(r, v)); if (i >= 0 && this.opts?.ignoreDuplicates) continue; if (i >= 0) Object.assign(T[i], clone(v)), out.push(T[i]); else { const r = { rating: 1000, wins: 0, losses: 0, ...clone(v) }; T.push(r); out.push(r); } }
    if (this.op === 'update') for (const r of T.filter(m)) Object.assign(r, clone(this.vals)), out.push(r);
    if (this.op === 'delete') { out = T.filter(m); db[this.t] = T.filter((r) => !m(r)); }
    if (this.ord) out.sort((a, b) => { const [x, y] = [a[this.ord[0]], b[this.ord[0]]]; return (x < y ? -1 : x > y ? 1 : 0) * (this.ord[1] ? 1 : -1); });
    if (this.lim) out = out.slice(0, this.lim);
    out = clone(out);
    // "alias:data->key" columns pick values out of JSON, like PostgREST
    if (this.cols && this.cols.includes('->')) out = out.map((r) => Object.fromEntries(this.cols.split(',').map((c) => { const [al, ex] = c.includes(':') ? c.split(':') : [c, c]; const [col, key] = ex.split('->'); return [al.trim(), key ? r[col.trim()]?.[key.trim()] ?? null : r[col.trim()]]; })));
    if (this.opts.head) return { data: null, count: out.length };
    if (this.one) return { data: out[0] ?? null, error: this.one === 'single' && !out[0] ? { message: 'none' } : null };
    return { data: this.op === 'select' || this.ret ? out : null, error: null, count: out.length };
  }
  then(res, rej) { try { res(this.run()); } catch (e) { rej(e); } }
}
export const fake = {
  from: (t) => new Q(t),
  auth: {
    getUser: async (tok) => ({ data: { user: tok && tok !== 'anon-key' ? clone(userFor(tok)) : null } }),
    admin: {
      getUserById: async (id) => ({ data: { user: users[id] || id ? clone(userFor(id)) : null } }),
      // like GoTrue: an email can belong to one user only
      updateUserById: async (id, attrs) => {
        if (attrs.email && Object.values(users).some((u) => u.id !== id && u.email === attrs.email)) return { data: null, error: { message: 'A user with this email address has already been registered' } };
        const u = userFor(id);
        Object.assign(u, { email: attrs.email ?? u.email, user_metadata: attrs.user_metadata ?? u.user_metadata, app_metadata: attrs.app_metadata ?? u.app_metadata, password: attrs.password ?? u.password });
        return { data: { user: clone(u) }, error: null };
      },
    },
  },
  rpc: async (fn, a) => {
    if (fn === 'trade_swap') return tradeSwap(a);
    const w = db.pvp_queue.filter((r) => r.user_id !== a.p_user && !r.match_id && (r.pool ?? 'ranked') === (a.p_pool ?? 'ranked')).sort((x, y) => Math.abs(x.rating - a.p_rating) - Math.abs(y.rating - a.p_rating));
    if (!w.length) return { data: [] };
    w[0].match_id = a.p_match;
    return { data: [clone(w[0])] };
  },
};
// supabase/trading.sql's trade_swap: both vaults or neither, each only at the version read
export function tradeSwap(a) {
  const ra = db.vaults.find((r) => r.user_id === a.p_a), rb = db.vaults.find((r) => r.user_id === a.p_b);
  if (!ra || ra.version !== a.p_a_ver) return { data: false, error: null };
  if (!rb || rb.version !== a.p_b_ver) return { data: null, error: { message: 'trade_swap: vault changed' } };
  Object.assign(ra, { data: clone(a.p_a_data), version: ra.version + 1 });
  Object.assign(rb, { data: clone(a.p_b_data), version: rb.version + 1 });
  return { data: true, error: null };
}
globalThis.__fake = fake;

/** Load a bundled function; returns call(uid, body) -> JSON. */
export async function loadFunction(name) {
  let handler;
  globalThis.Deno = { env: { get: () => 'x' }, serve: (h) => (handler = h) };
  let src = fs.readFileSync(path.join(root, `supabase/functions/${name}/index.ts`), 'utf8');
  src = src.replace(/import\s*\{\s*createClient\s*\}\s*from\s*['"][^'"]+['"];?/, 'const createClient = () => globalThis.__fake;');
  const tmp = path.join(root, `sim/.${name}-fn.mts`);
  fs.writeFileSync(tmp, src);
  await import(tmp + '?' + Date.now());
  fs.unlinkSync(tmp);
  return async (uid, body) => (await handler(new Request('http://x', { method: 'POST', headers: { Authorization: 'Bearer ' + (uid || '') }, body: JSON.stringify(body) }))).json();
}
