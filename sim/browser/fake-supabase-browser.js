// Browser stand-in for Supabase that runs the REAL bundled economy + pvp
// functions in the page, with auth (anonymous guests, passwords) and a db kept
// in localStorage so reloads and returning visitors behave like production.
const LS = 'fake.db', LU = 'fake.users', LA = 'fake.session';
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const db = Object.assign({ pvp_profiles: [], pvp_queue: [], pvp_matches: [], pvp_pings: [], vaults: [], purchases: [], alliance_claims: [], event_entries: [], ref_codes: [], referrals: [], saves: [], funnel_events: [], voice_accounts: [], player_blocks: [], app_flags: [], friend_codes: [], friends: [], friend_messages: [], trade_offers: [], trade_listings: [], trade_log: [] }, load(LS, {}));
const users = load(LU, {});
const persist = () => { localStorage.setItem(LS, JSON.stringify(db)); localStorage.setItem(LU, JSON.stringify(users)); };
window.__fake = { db, users, persist, cfg: { anonymous: true } };
const clone = (x) => JSON.parse(JSON.stringify(x));
class Q {
  constructor(t) { Object.assign(this, { t, op: 'select', f: [], ord: null, lim: null, one: null, ret: false, vals: null, opts: {} }); db[t] ||= []; }
  select(c, o = {}) { if (this.op !== 'select') this.ret = true; this.opts = { ...this.opts, ...o }; this.cols = c; return this; }
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
    const pk = { pvp_matches: 'id', purchases: 'id', pvp_pings: 'match_id', funnel_events: 'id', friend_messages: 'id', trade_offers: 'id', trade_listings: 'id', trade_log: 'id' }[this.t] ?? 'user_id';
    const same = this.t === 'player_blocks' ? (r, v) => r.blocker === v.blocker && r.blocked === v.blocked : (r, v) => r[pk] === v[pk];
    let out = [];
    if (this.op === 'select') out = T.filter(m);
    if (this.op === 'insert') for (const v of [].concat(this.vals)) { if ((v.code && T.some((r) => r.code === v.code)) || (this.t === 'vaults' && T.some((r) => r.user_id === v.user_id))) return { error: { message: 'duplicate key' } }; const at = new Date().toISOString(); const r = { id: v.id ?? crypto.randomUUID(), version: 0, status: 'live', created_at: at, updated_at: at, ...clone(v) }; T.push(r); out.push(r); }
    if (this.op === 'upsert') for (const v of [].concat(this.vals)) { const i = T.findIndex((r) => same(r, v)); if (i >= 0 && this.opts?.ignoreDuplicates) continue; if (i >= 0) Object.assign(T[i], clone(v)), out.push(T[i]); else { const r = { rating: 1000, wins: 0, losses: 0, ...clone(v) }; T.push(r); out.push(r); } }
    if (this.op === 'update') for (const r of T.filter(m)) Object.assign(r, clone(this.vals)), out.push(r);
    if (this.op === 'delete') { out = T.filter(m); db[this.t] = T.filter((r) => !m(r)); }
    if (this.op !== 'select') persist();
    if (this.ord) out.sort((a, b) => { const [x, y] = [a[this.ord[0]], b[this.ord[0]]]; return (x < y ? -1 : x > y ? 1 : 0) * (this.ord[1] ? 1 : -1); });
    if (this.lim) out = out.slice(0, this.lim);
    out = clone(out);
    if (this.cols && this.cols.includes('->')) out = out.map((r) => Object.fromEntries(this.cols.split(',').map((c) => { const [al, ex] = c.includes(':') ? c.split(':') : [c, c]; const [col, key] = ex.split('->'); return [al.trim(), key ? r[col.trim()]?.[key.trim()] ?? null : r[col.trim()]]; })));
    if (this.opts.head) return { data: null, count: out.length, error: null };
    if (this.one) return { data: out[0] ?? null, error: this.one === 'single' && !out[0] ? { message: 'none' } : null };
    return { data: this.op === 'select' || this.ret ? out : null, error: null, count: out.length };
  }
  then(res, rej) { try { res(this.run()); } catch (e) { rej(e); } }
}
const pub = (u) => u && clone({ id: u.id, email: u.email ?? null, is_anonymous: !!u.is_anonymous, app_metadata: u.app_metadata || {}, user_metadata: u.user_metadata || {}, created_at: u.created_at });
const admin = {
  from: (t) => new Q(t),
  rpc: async (fn, a) => {
    if (fn !== 'trade_swap') return { data: [] };
    const ra = db.vaults.find((r) => r.user_id === a.p_a), rb = db.vaults.find((r) => r.user_id === a.p_b);
    if (!ra || ra.version !== a.p_a_ver) return { data: false, error: null };
    if (!rb || rb.version !== a.p_b_ver) return { data: null, error: { message: 'trade_swap: vault changed' } };
    Object.assign(ra, { data: clone(a.p_a_data), version: ra.version + 1 });
    Object.assign(rb, { data: clone(a.p_b_data), version: rb.version + 1 });
    persist();
    return { data: true, error: null };
  },
  auth: {
    getUser: async (tok) => ({ data: { user: users[tok] ? pub(users[tok]) : null } }),
    admin: {
      getUserById: async (id) => ({ data: { user: pub(users[id]) } }),
      updateUserById: async (id, a) => {
        if (window.__fake.cfg.failConvert) return { data: null, error: { message: 'network down' } };
        if (a.email && Object.values(users).some((u) => u.id !== id && u.email === a.email)) return { data: null, error: { message: 'A user with this email address has already been registered' } };
        Object.assign(users[id], { email: a.email ?? users[id].email, password: a.password ?? users[id].password, app_metadata: a.app_metadata ?? users[id].app_metadata, user_metadata: a.user_metadata ?? users[id].user_metadata });
        persist();
        return { data: { user: pub(users[id]) }, error: null };
      },
    },
  },
};
// the real server functions, loaded from the bundles
const handlers = {};
// one load per function, even when two requests arrive together (each load sets window.Deno)
let loading = Promise.resolve();
function fn(name) {
  return (handlers[name] ||= (loading = loading.then(async () => {
    let src = await (await fetch('/__fn/' + name + '.ts')).text();
    src = src.replace(/import\s*\{\s*createClient\s*\}\s*from\s*['"][^'"]+['"];?/, 'const createClient = () => window.__fakeAdmin;');
    window.__fakeAdmin = admin;
    let h;
    window.Deno = { env: { get: (k) => (k === 'USER_DOMAIN' ? 'players.test' : 'x') }, serve: (x) => (h = x) };
    await import(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    return h;
  })));
}
let session = load(LA, null);
const subs = new Set();
const setSession = (s, ev) => { session = s; localStorage.setItem(LA, JSON.stringify(s)); for (const f of subs) setTimeout(() => f(ev, s), 0); };
const sess = (u) => ({ access_token: u.id, user: pub(u) });
export function createClient() {
  return {
    from: (t) => new Q(t),
    rpc: async () => ({ data: null, error: { message: 'no rpc' } }),
    channel: () => { const c = { on() { return c; }, subscribe() { return c; } }; return c; },
    removeChannel() {},
    auth: {
      getSession: async () => ({ data: { session: session && users[session.user.id] ? sess(users[session.user.id]) : null } }),
      onAuthStateChange(f) { subs.add(f); return { data: { subscription: { unsubscribe: () => subs.delete(f) } } }; },
      signInAnonymously: async () => {
        if (!window.__fake.cfg.anonymous) return { data: {}, error: { message: 'Anonymous sign-ins are disabled' } };
        const id = 'guest-' + crypto.randomUUID().slice(0, 8);
        users[id] = { id, is_anonymous: true, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
        persist();
        const s = sess(users[id]);
        setSession(s, 'SIGNED_IN');
        return { data: { session: s, user: s.user }, error: null };
      },
      signInWithPassword: async ({ email, password }) => {
        const u = Object.values(users).find((x) => x.email === email && x.password === password);
        if (!u) return { data: {}, error: { message: 'Invalid login credentials' } };
        const s = sess(u);
        setSession(s, 'SIGNED_IN');
        return { data: { session: s }, error: null };
      },
      signUp: async ({ email, password, options }) => {
        if (Object.values(users).some((u) => u.email === email)) return { data: {}, error: { message: 'User already registered' } };
        const id = 'user-' + crypto.randomUUID().slice(0, 8);
        users[id] = { id, email, password, is_anonymous: false, app_metadata: {}, user_metadata: options?.data || {}, created_at: new Date().toISOString() };
        persist();
        const s = sess(users[id]);
        setSession(s, 'SIGNED_IN');
        return { data: { session: s }, error: null };
      },
      signOut: async () => setSession(null, 'SIGNED_OUT'),
      updateUser: async () => ({ error: null }),
    },
    functions: {
      invoke: async (name, { body }) => {
        if (!['economy', 'pvp'].includes(name)) return { data: {}, error: null };
        const h = await fn(name);
        const res = await h(new Request('http://x', { method: 'POST', headers: { Authorization: 'Bearer ' + (session?.access_token || 'anon-key') }, body: JSON.stringify(body) }));
        const j = await res.json();
        if (res.status >= 400) return { data: null, error: { name: 'FunctionsHttpError', message: j.error, context: { status: res.status, json: async () => j } } };
        return { data: j, error: null };
      },
    },
  };
}
