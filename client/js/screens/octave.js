// OCTAVE BUILDER — eight different Champions, at most one Mythic. Shows the
// Bonds the Octave makes (engine/archetypes.js) and how close the next one is,
// and offers several ready-made builds from what you own (engine/deckbuild.js).
import * as store from '../core/store.js';
import { CARDS, LIST as SET, FACTIONS, UNIQUE_IDS } from '../../../engine/cards/index.js';
// the set plus one-of-ones (never in the set list), for building an Octave
const LIST = [...SET, ...[...UNIQUE_IDS].map((id) => CARDS[id])];
import { owned } from '../../../engine/collection.js';
import { lookFor } from '../ui/look.js';
import { renderCard, esc } from '../ui/card.js';
import { icon } from '../ui/icons.js';
import { sfx } from '../core/audio.js';
import { score, buildFor, buildMany, swaps, testOctave, MYTHIC_MAX } from '../../../engine/deckbuild.js';
import { ARCHETYPES, ARCH, archetypesOf, BOND_AT } from '../../../engine/archetypes.js';
import { duelStats } from '../../../engine/duel.js';
import { personaOctave } from '../core/opponents.js';

let lastTest = null; // { key, wins, n }
const NAME = { crown: 'Crown', quiet: 'Quiet', hour: 'Hourwrights', margin: 'Margin', vigil: 'Vigil' };
let filter = 'all';
let style = null; // an archetype to filter the grid by

/** Every style in the Octave with its count, Bonds first. */
function styleCounts(ids) {
  const n = {};
  for (const id of ids) for (const a of archetypesOf(CARDS[id])) n[a] = (n[a] || 0) + 1;
  return Object.entries(n).sort((a, b) => b[1] - a[1]);
}
const mythics = (ids) => ids.filter((id) => CARDS[id].rarity === 'mythic').length;

export async function render(root, params, ctx) {
  const s = store.get();
  const oct = s.octaves[s.active];
  let cur = oct.cards.slice();
  const pool = LIST.filter((c) => owned(s.profile, c.id) > 0).map((c) => c.id);
  // the best this collection can do is the yardstick for "strength"
  const best = buildFor(pool, CARDS) || [];
  const bestScore = best.length === 8 ? score(best, CARDS).total : 1;
  // and a typical deck from it (the average of 30 random eights) as zero
  let x = 12345;
  const rnd = () => ((x = (x * 1103515245 + 12345) >>> 0) / 4294967296);
  const randomDeck = () => {
    const d = [];
    for (const id of pool.slice().sort(() => rnd() - 0.5)) if (d.length < 8 && !d.some((y) => CARDS[y].char === CARDS[id].char) && !(CARDS[id].rarity === 'mythic' && mythics(d) >= MYTHIC_MAX)) d.push(id);
    return d;
  };
  const baseScore = pool.length > 8 ? Array.from({ length: 30 }, () => score(randomDeck(), CARDS).total).reduce((a, b) => a + b, 0) / 30 : bestScore - 1;
  let testing = false;
  const advisor = () => {
    if (cur.length < 8) return `<div class="advisor panel"><div class="kicker">Octave advisor</div><div class="muted" style="font-size:13px;margin-top:6px">Pick 8 Champions, or tap <b>Pick for me</b> for a few ready-made builds.</div><div class="row" style="margin-top:10px"><button class="btn btn--sm" data-pickme>Pick for me</button></div></div>`;
    const sc = score(cur, CARDS);
    const pct = Math.max(0, Math.min(100, Math.round((100 * (sc.total - baseScore)) / Math.max(0.1, bestScore - baseScore))));
    const sw = swaps(cur, pool, CARDS);
    const key = cur.slice().sort().join();
    const t = lastTest?.key === key ? lastTest : null;
    const first = (id) => esc(CARDS[id].name);
    const top = (k) => Math.max(...cur.map((id) => duelStats(id)[k]));
    return `<div class="advisor panel">
      <div class="row"><div class="grow"><div class="kicker">Octave advisor</div>
        <div class="advisor__score"><b>${pct}</b><span>/ 100 · 0 is a random deck from your collection, 100 your best</span></div></div>
        <button class="btn btn--sm" data-pickme>Pick for me</button></div>
      <div class="advisor__bar"><i style="width:${Math.min(100, pct)}%"></i></div>
      <div class="advisor__cover"><span class="o-strike">${icon('i-strike')}Best Lead <b>${top('strike')}</b></span><span class="o-guard">${icon('i-guard')}Best Answer <b>${top('guard')}</b></span><span class="o-scheme">${icon('i-scheme')}Best Wound <b>${top('scheme')}</b></span></div>
      ${sw.length ? `<div class="kicker" style="margin-top:10px">Suggested swaps</div>${sw.map((x, i) => `<button class="advisor__swap" data-swap="${i}"><span>${first(x.out)} → <b>${first(x.in)}</b></span><em>+${x.gain.toFixed(1)}</em></button>`).join('')}` : ''}
      <div class="row" style="margin-top:10px;gap:8px"><button class="btn btn--sm btn--ghost" data-test ${testing ? 'disabled' : ''}>${testing ? 'Testing…' : 'Test it: 60 Duels'}</button>
        <span class="muted grow" style="font-size:12px" data-testout>${t ? `Won <b class="gold">${t.wins}</b> of ${t.n} simulated Duels against the ladder (${Math.round((100 * t.wins) / t.n)}%)` : 'Plays it against the ladder’s opponents, good play on both sides.'}</span></div>
    </div>`;
  };
  // the Bonds strip: live Bonds, then styles one or two short
  const bondsHtml = () => {
    const rows = styleCounts(cur).filter(([, n]) => n >= 2);
    if (!rows.length) return `<div class="muted" style="font-size:13px">Put ${BOND_AT} Champions of one style together to <b>Bond</b> them: each fights with +1 (Legendaries and Mythics more).</div>`;
    return rows.map(([a, n]) => `<button class="bond-chip ${n >= BOND_AT ? 'on' : ''}" data-style="${a}"><b>${esc(ARCH[a].name)}</b> ${n >= BOND_AT ? `Bonded ×${n}` : `${n}/${BOND_AT}`}</button>`).join('');
  };
  // "Pick for me": several real choices
  const pickForMe = () => {
    const builds = buildMany(pool, CARDS, { max: 4 });
    if (!builds.length) return ctx.toast('You need at least 8 different Champions first.');
    const m = ctx.modal(`<div class="h-display" style="font-size:22px">Pick for me</div>
      <div class="muted" style="margin:4px 0 12px">The strongest Octaves you can build right now, each around a different style. Tap one to use it.</div>
      <div class="pickme" data-builds></div>`);
    const box = m.el.querySelector('[data-builds]');
    builds.forEach((b) => {
      const el = document.createElement('button');
      el.className = 'pickme__build panel';
      el.innerHTML = `<div class="row"><b class="grow">${esc(b.name)}</b><span class="gold">${b.bonds.map((x) => `${esc(ARCH[x.id].name)} ×${x.n}`).join(' · ') || 'No Bond'}</span></div><div class="muted" style="font-size:12px">${esc(b.text)}</div><div class="pickme__cards"></div>`;
      const row = el.querySelector('.pickme__cards');
      for (const id of b.ids) row.appendChild(renderCard(CARDS[id], { width: 36, flat: true, ...lookFor(id) }));
      el.onclick = () => {
        cur = b.ids.slice();
        m.close();
        sfx.reward();
        ctx.toast(`${b.name}: tap Save to keep it.`);
        draw();
      };
      box.appendChild(el);
    });
  };
  const slotCache = new Map(), cellCache = new Map();
  const slotCard = (id) => {
    let c = slotCache.get(id);
    if (!c) {
      c = renderCard(CARDS[id], { width: 84, flat: true, ...lookFor(id) });
      c.onclick = () => ((cur = cur.filter((x) => x !== id)), sfx.tap(), draw());
      slotCache.set(id, c);
    }
    return c;
  };
  const gridCell = (c) => {
    let cell = cellCache.get(c.id);
    if (cell) return cell;
    cell = document.createElement('div');
    cell.className = 'cell';
    cell.appendChild(renderCard(c, { width: 84, flat: true, ...lookFor(c.id) }));
    let t = null;
    cell.addEventListener('pointerdown', () => (t = setTimeout(() => ((t = 'long'), ctx.modal('<div></div>').el.lastElementChild.replaceWith(renderCard(c, { size: 'full', width: Math.min(320, innerWidth - 40), tilt: true, ...lookFor(c.id) }))), 420)));
    cell.addEventListener('pointerup', () => {
      if (t === 'long') return;
      clearTimeout(t);
      if (cur.includes(c.id)) cur = cur.filter((x) => x !== c.id);
      else if (c.rarity === 'mythic' && mythics(cur) >= MYTHIC_MAX) return sfx.error(), ctx.toast('One Mythic per Octave.');
      else if (cur.length < 8 && !cur.some((x) => CARDS[x].char === c.char)) cur.push(c.id);
      else return sfx.error();
      sfx.select();
      draw();
    });
    cell.addEventListener('pointerleave', () => t !== 'long' && clearTimeout(t));
    cellCache.set(c.id, cell);
    return cell;
  };
  const draw = () => {
    const ownedCards = LIST.filter((c) => owned(s.profile, c.id) > 0 && (filter === 'all' || c.faction === filter) && (!style || archetypesOf(c).includes(style)));
    root.innerHTML = `
      <div class="row"><div class="grow"><div class="kicker">Octave · ${cur.length}/8</div><div class="h1" style="font-size:24px">${esc(oct.name)}</div></div>
      <button class="btn btn--sm" data-save ${cur.length === 8 ? '' : 'disabled'}>Save</button></div>
      <div class="oct-slots" style="margin-top:10px" data-slots></div>
      <div class="oct-bonds" style="margin-top:12px">${bondsHtml()}</div>
      <div data-adv style="margin-top:12px">${advisor()}</div>
      <div class="tabs" style="margin-top:14px">${['all', ...FACTIONS].map((f) => `<button class="${f === filter ? 'on' : ''}" data-f="${f}">${f === 'all' ? 'All' : NAME[f]}</button>`).join('')}</div>
      <div class="style-row"><select data-stylepick aria-label="Show a style"><option value="">Every style</option>${ARCHETYPES.map((a) => `<option value="${a.id}" ${a.id === style ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>${style ? `<span class="muted">${esc(ARCH[style].text)}</span>` : ''}</div>
      <div class="pick-grid" style="margin-top:10px" data-pick></div>`;
    // cards are built once and reused across redraws: rebuilding dozens of
    // card pictures on every tap is what an iPhone can't keep up with
    const slots = root.querySelector('[data-slots]');
    for (let i = 0; i < 8; i++) {
      const id = cur[i];
      if (id) slots.appendChild(slotCard(id));
      else slots.insertAdjacentHTML('beforeend', '<div class="oct-slot-empty">+</div>');
    }
    const pick = root.querySelector('[data-pick]');
    for (const c of ownedCards) {
      const cell = gridCell(c);
      cell.classList.toggle('in', cur.includes(c.id));
      pick.appendChild(cell);
    }
    root.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => ((filter = b.dataset.f), draw())));
    root.querySelector('[data-stylepick]').onchange = (e) => ((style = e.target.value || null), draw());
    root.querySelectorAll('[data-style]').forEach((b) => (b.onclick = () => ((style = style === b.dataset.style ? null : b.dataset.style), sfx.tap(), draw())));
    root.querySelectorAll('[data-pickme]').forEach((b) => (b.onclick = () => (sfx.select(), pickForMe())));
    const sw = cur.length === 8 ? swaps(cur, pool, CARDS) : [];
    root.querySelectorAll('[data-swap]').forEach((b) => (b.onclick = () => {
      const x = sw[+b.dataset.swap];
      cur = cur.map((id) => (id === x.out ? x.in : id));
      sfx.select();
      draw();
    }));
    root.querySelector('[data-test]')?.addEventListener('click', async () => {
      testing = true;
      const deck = cur.slice();
      const key = deck.slice().sort().join();
      const gauntlet = store.PERSONAS.map((p) => personaOctave(p));
      const out = () => root.querySelector('[data-testout]');
      root.querySelector('[data-test]').disabled = true;
      root.querySelector('[data-test]').textContent = 'Testing…';
      // in a worker, so the page stays light; falls back to the page if workers fail
      const onProgress = (d, n, w) => out() && (out().innerHTML = `Playing… ${d}/${n} · won ${w}`);
      const r = await new Promise((resolve) => {
        let w;
        try {
          w = new Worker(new URL('../core/sim-worker.js', import.meta.url), { type: 'module' });
        } catch {
          return testOctave(deck, gauntlet, { n: 60, seed: 7, onProgress }).then(resolve);
        }
        w.onmessage = (e) => {
          if (e.data.progress) onProgress(...e.data.progress);
          if (e.data.result) (w.terminate(), resolve(e.data.result));
        };
        w.onerror = () => (w.terminate(), testOctave(deck, gauntlet, { n: 60, seed: 7, onProgress }).then(resolve));
        w.postMessage({ ids: deck, gauntlet, n: 60, seed: 7 });
      });
      testing = false;
      lastTest = { key, wins: r.wins, n: r.n };
      if (root.isConnected) draw();
    });
    root.querySelector('[data-save]').onclick = () => {
      if (mythics(cur) > MYTHIC_MAX) return ctx.toast('One Mythic per Octave.');
      store.update((st) => (st.octaves[st.active].cards = cur.slice()));
      sfx.reward();
      ctx.toast('Octave saved');
    };
  };
  draw();
}
