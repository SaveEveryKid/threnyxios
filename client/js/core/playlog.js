// PLAYTEST LOG — every match (and every quit) as one compact record, kept on
// this device only, apart from the save so it can be cleared or exported
// alone. More → Playtest report summarises it and copies/downloads the JSON.
const KEY = 'threnyx.playlog.v1';
const MAX = 200;
const ORDER_CODE = { strike: 's', guard: 'g', scheme: 'c' };

export function entries() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

function save(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch {
    /* storage full or blocked: the log is best-effort */
  }
}

export const clear = () => save([]);

/** One record from a finished (or abandoned) battle. */
export function logMatch({ spec, state, started, quit = false, peeks = 0, fast = false }) {
  const st = state;
  const hist = st.history || [];
  const cmdOf = (h, side) => h.command?.[side] || null;
  const e = {
    at: Date.now(),
    mode: spec.mode || 'ladder',
    opp: spec.persona?.id || null,
    skill: spec.persona?.skill ?? null,
    won: st.phase === 'over' ? st.winner === 0 : null,
    quit,
    rounds: hist.filter((h) => h.command).length,
    secs: Math.round((Date.now() - started) / 1000),
    voice: hist.filter((h) => h.voice).map((h) => h.voice),
    end: [st.p[0].voice, st.p[1].voice],
    // one letter per lane: s = Strike, g = Guard, c = sCheme, - = empty
    orders: hist.filter((h) => h.command).map((h) => [0, 1].map((s) => (cmdOf(h, s)?.orders || []).map((o) => ORDER_CODE[o] || '-').join(''))),
    v: 2,
    focus: hist.filter((h) => cmdOf(h, 0)?.focus != null).length,
    ults: hist.filter((h) => cmdOf(h, 0)?.ult != null).length,
    reads: [st.p[0].stats.readsHit, st.p[0].stats.readsUsed],
    felled: [st.p[1].fallen.length, st.p[0].fallen.length],
    terrain: (st.terrain || []).join(','),
    deck: spec.mine?.slice() || [],
    peeks,
    fast,
  };
  const list = entries();
  list.push(e);
  save(list);
  return e;
}

const pct = (a, b) => (b ? Math.round((100 * a) / b) + '%' : '—');
const avg = (xs) => (xs.length ? Math.round((10 * xs.reduce((a, b) => a + b, 0)) / xs.length) / 10 : 0);

/** The numbers a designer wants from a playtest, as label/value rows. */
export function report(list = entries()) {
  const done = list.filter((e) => !e.quit);
  const rows = [];
  rows.push(['Matches logged', `${list.length} (${list.length - done.length} quit)`]);
  rows.push(['Win rate', pct(done.filter((e) => e.won).length, done.length)]);
  rows.push(['Avg rounds / length', `${avg(done.map((e) => e.rounds))} rounds · ${avg(done.map((e) => e.secs / 60))} min`]);
  // a comeback: behind by 8+ Voice at some point, and still won
  const comeback = done.filter((e) => e.won && e.voice.some(([a, b]) => b - a >= 8)).length;
  rows.push(['Comeback wins', pct(comeback, done.filter((e) => e.won).length)]);
  rows.push(['Quit rate', pct(list.length - done.length, list.length)]);
  const mix = { s: 0, g: 0, c: 0 };
  // matches logged before v2 wrote Scheme as 's' too, so they can't be split
  for (const e of done) if (e.v >= 2) for (const r of e.orders) for (const o of r[0]) if (mix[o] != null) mix[o]++;
  const tot = mix.s + mix.g + mix.c;
  rows.push(['Your Orders', `Strike ${pct(mix.s, tot)} · Guard ${pct(mix.g, tot)} · Scheme ${pct(mix.c, tot)}`]);
  const rh = done.reduce((a, e) => a + e.reads[0], 0), ru = done.reduce((a, e) => a + e.reads[1], 0);
  rows.push(['READs hit', `${rh}/${ru} (${pct(rh, ru)})`]);
  rows.push(['Focus / Ults per match', `${avg(done.map((e) => e.focus))} / ${avg(done.map((e) => e.ults))}`]);
  rows.push(['Previews held per match', String(avg(done.map((e) => e.peeks || 0)))]);
  const by = (key) => {
    const m = {};
    for (const e of done) {
      const k = e[key] || '—';
      (m[k] ||= [0, 0])[1]++;
      if (e.won) m[k][0]++;
    }
    return Object.entries(m).map(([k, [w, n]]) => `${k} ${w}/${n}`).join(' · ');
  };
  rows.push(['By mode', by('mode')]);
  rows.push(['By opponent', by('opp')]);
  return rows;
}
