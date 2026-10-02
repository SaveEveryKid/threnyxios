// Card component. renderCard(def, opts) -> HTMLElement.
import { duelStats } from '../../../engine/duel.js';
import { CARDS } from '../../../engine/cards/index.js';
import TUNE from '../../../engine/data/duel-tune.js';
const TUNE_IDS = new Set(Object.keys(TUNE));
import { archetypesOf, ARCH } from '../../../engine/archetypes.js';
import { icon } from './icons.js';
import { artFor, thumb, cardbackArt, chosenBack } from '../art/index.js';
import { duelText } from './duel-text.js';
import { onFrame, sensorTilt, requestSensors, autoStart, motionReduced, motionState } from '../core/motion.js';
import { attachFx } from './fx.js';

const FACTION_LABEL = { crown: 'Ashen Crown', quiet: 'The Quiet', hour: 'Hourwrights', margin: 'The Margin', vigil: 'The Vigil' };
const ORDERS = ['strike', 'guard', 'scheme'];

// Grid and hand cards (flat) draw their picture only when they come near the
// screen: a 120-card grid drawing every painting at once is what kills iPhones.
let nearScreen = null;
function whenNear(el, fn) {
  if (typeof IntersectionObserver === 'undefined') return fn();
  nearScreen ||= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        nearScreen.unobserve(e.target);
        watched.delete(e.target);
        e.target.__near?.();
        delete e.target.__near;
      }
    },
    { rootMargin: '400px 0px' },
  );
  el.__near = fn;
  watched.add(el);
  nearScreen.observe(el);
}
const watched = new Set();
// Called by the router when a screen goes: stop watching its cards, or the
// observer keeps every card of every visited screen alive.
export function forgetOffscreen() {
  for (const el of watched) {
    if (el.isConnected) continue;
    nearScreen?.unobserve(el);
    delete el.__near;
    watched.delete(el);
  }
}
const lite = () => !!document.getElementById('app')?.classList.contains('lite');

export function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

// Emphasise rules keywords inside ability text.
function richText(t) {
  return esc(t).replace(/\b(STRIKE|GUARD|WOUND|Strike|Guard|Wound|Leading|Answering|READ|MISREAD|Focus|Initiative|On Reveal|On Hit|Last Words|End of round|When an ally falls|When an enemy falls|When it hits the Voice|Shield|Voice|Power)\b/g, '<em>$1</em>');
}

/**
 * @param def   card definition (engine card + presentation fields)
 * @param opts  { size: 'compact' | 'full', width: px, flat: bool (raster thumb),
 *                treatment: 'foil' | 'altart' | 'immortal', serial: '00824 / 10000',
 *                ascension: 0..3 (Tempered, Radiant, Ascended), back: bool,
 *                tilt: bool (interactive showcase: tilt, and for premium cards
 *                      phone motion + atmosphere), ask: bool (a tap on the card
 *                      may ask for motion permission; default for 'full') }
 */
// Alt Art is a re-grade of the same painting, not a new one: each card has one
// fixed grade (chosen from its id) with its own frame.
export const ALT_GRADES = ['ink', 'moon', 'ember'];
export const altGrade = (id) => ALT_GRADES[[...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % ALT_GRADES.length];
export const ASC_NAMES = ['', 'Tempered', 'Radiant', 'Ascended'];

export function renderCard(def, opts = {}) {
  const el = document.createElement('div');
  if (opts.back) {
    el.className = 'card card--back';
    el.style.setProperty('--cw', (opts.width || 220) + 'px');
    const art = cardbackArt('s', opts.backName || chosenBack());
    el.innerHTML = art
      ? `<div class="card__frame" style="background:center / cover no-repeat url('${art}')"></div>`
      : `<div class="card__frame"></div><div class="card__mono">T</div><div class="card__word">THRENYX</div>`;
    return el;
  }
  const rarity = opts.treatment === 'immortal' ? 'immortal' : def.rarity;
  const full = opts.size === 'full';
  const mini = !full && (opts.width || 220) < 140;
  el.className = `card r-${rarity} f-${def.faction}${full ? ' card--full' : ''}${mini ? ' card--mini' : ''}${opts.flat ? ' card--flat' : ''}`;
  el.style.setProperty('--cw', (opts.width || 220) + 'px');
  el.dataset.id = def.id;

  // the numbers the Duel plays (printed card + the Duel tuning), unless the
  // caller already shows match numbers (def.duelView: wounds, buffs, Bonds)
  const base = CARDS[def.id];
  if (!def.duelView && base?.stats && TUNE_IDS.has(def.id)) {
    const ds = duelStats(def.id);
    def = { ...def, stats: Object.fromEntries(ORDERS.map((o) => [o, def.stats[o] + ds[o] - base.stats[o]])), hp: def.hp ? Math.max(1, def.hp + ds.hp - base.hp) : def.hp };
  }
  const max = Math.max(...ORDERS.map((o) => def.stats[o]));
  const min = Math.min(...ORDERS.map((o) => def.stats[o]));
  const stats =
    ORDERS.map(
      (o) =>
        `<div class="stat stat--${o}${def.stats[o] === max ? ' is-best' : ''}${def.stats[o] === min && min !== max ? ' is-low' : ''}">${icon('i-' + o)}<b>${def.stats[o]}</b></div>`,
    ).join('') + (def.hp ? `<div class="stat stat--hp">${icon('i-health')}<b>${def.hp}</b></div>` : '');

  const hi = rarity === 'legendary' || rarity === 'mythic' || rarity === 'immortal';
  const artT = opts.treatment === 'immortal' || opts.treatment === 'oktober' ? opts.treatment : 'standard';
  const L = artFor(def, artT);
  const art = opts.flat
    ? `<img class="card__layer card__layer--art" alt="" data-thumb="1">`
    : `<img class="card__layer card__layer--art" src="${L.flat}" alt="" decoding="async">`;
  const breakout = rarity === 'mythic' && L.cutout && !opts.flat;
  const ab = def.kit ? duelText(def) : ''; // the ability in Duel words
  // Premium presentation (see docs/10-client.md, "Premium motion").
  const asc = Math.max(0, Math.min(3, opts.ascension || 0));
  const tier = Math.max(premiumTier(rarity, opts.treatment), asc >= 2 ? 1 : 0);
  const alt = opts.treatment === 'altart' ? altGrade(def.id) : null;
  const live = !opts.flat && tier > 0;
  const holo = live && (rarity === 'immortal' || rarity === 'mythic' || opts.treatment === 'foil' || opts.treatment === 'oktober');
  const holoMask = holo && L.holo ? ` style="--hm:url('${L.holo.mask}')"` : holo && L.cutout ? ` style="--cut:url('${L.cutout}')"` : '';
  // Painted effect layers over the art: a rarity layer (Rare, Epic, Legendary)
  // or the Mythic holo stack. Board and grid cards get one small layer only.
  let fx = '';
  if (opts.flat && lite()) fx = ''; // lighter effects hide these anyway: don't even download them
  else if (L.holo) fx = opts.flat ? `<img class="card__layer card__hf" src="${L.holo.foilS}" alt="">` : `<img class="card__layer card__hf" src="${L.holo.foil}" alt=""><img class="card__layer card__hr" src="${L.holo.ripples}" alt=""><img class="card__layer card__hg" src="${L.holo.glints}" alt="">`;
  else if (L.fx) fx = `<img class="card__layer card__rfx" src="${opts.flat ? L.fxS : L.fx}" alt=""${opts.flat ? ' loading="lazy"' : ''}>`;
  el.innerHTML = `
    <div class="card__frame"></div>
    ${live ? '<div class="card__rim"></div>' : ''}
    <div class="card__window">${art}${fx}${alt ? '<div class="card__grade"></div>' : ''}${asc >= 3 ? '<div class="card__motes"><i></i><i></i></div>' : ''}${holo ? `<div class="card__holo${L.holo ? ' has-mask' : L.cutout ? ' has-cut' : ''}"${holoMask}><div class="card__holo-l"><i></i></div></div>` : ''}${live && tier > 1 ? '<div class="card__env"></div>' : ''}${rarity === 'mythic' ? '<div class="card__pulse"></div>' : ''}<div class="card__shade"></div></div>
    ${breakout ? `<div class="card__breakout"><img class="card__layer card__layer--fig" src="${L.cutout}" alt=""></div><div class="card__shade--over"></div>` : ''}
    ${rarity === 'legendary' ? '<div class="card__corners"></div>' : ''}
    ${rarity === 'immortal' ? '<div class="card__foil"></div>' : ''}
    ${hi || asc >= 2 ? '<div class="card__sweep"></div>' : ''}
    ${asc ? '<div class="card__trim"></div>' : ''}
    ${asc >= 3 ? `<div class="card__asc">${full ? '✦ Ascended ✦' : '✦'}</div>` : ''}
    <div class="card__sheen"></div>
    <div class="card__sigil">${icon('s-' + def.faction)}</div>
    <div class="card__gem">${icon('g-' + rarity)}</div>
    ${rarity === 'immortal' && opts.serial ? `<div class="card__serial">${esc(opts.serial)}</div>` : ''}
    ${opts.treatment === 'oktober' ? `<div class="card__okt">${full ? 'Oktoberfest 2026 · 1 of 5' : 'VIII'}</div>` : ''}
    ${full ? `<div class="card__tags">${esc(FACTION_LABEL[def.faction])} · ${esc(def.cls)}<br>${esc(def.alignment)}${def.traits?.length ? ' · ' + esc(def.traits.join(' · ')) : ''}${archetypesOf(def).length ? `<br><span class="card__styles">Style: ${esc(archetypesOf(def).map((a) => ARCH[a].name).join(' · '))}</span>` : ''}<span class="card__set">${esc(collectorLine(def, rarity, opts.treatment))}</span></div>` : ''}
    <div class="card__name"><b>${esc(def.name)}</b>${def.title ? `<i>${esc(def.title)}</i>` : ''}</div>
    ${full ? `<div class="card__ability">${def.abilityName ? `<div class="abn">${esc(def.abilityName)}</div>` : ''}<div>${richText(ab)}</div>${def.flavor ? `<div class="flav">“${esc(def.flavor)}”</div>` : ''}</div>` : ''}
    <div class="card__stats">${stats}</div>
    ${live ? '<div class="card__glare"></div>' : ''}`;

  if (opts.flat) {
    const img = el.querySelector('[data-thumb]');
    whenNear(el, () => thumb(def, Math.round((opts.width || 220) * Math.min(2, window.devicePixelRatio || 1)), artT).then((u) => u && (img.src = u)));
  }
  if (opts.treatment && opts.treatment !== 'standard') el.classList.add('t-' + opts.treatment);
  if (alt) el.classList.add('alt-' + alt);
  if (asc) el.classList.add('a-' + asc);
  if (opts.tilt) {
    const t = attachTilt(el, { gyro: rarity === 'common' && !opts.treatment && !asc ? 0 : Math.max(0.8, GYRO[tier]), ask: opts.ask ?? full });
    if (tier > 1) attachFx(el, def.faction, { immortal: rarity === 'immortal', density: full ? 1 : 0.75, tilt: t.tilt });
  }
  return el;
}

// The collector line on a full card: set, number and rarity, like a printed card.
const SET_NAME = { firstfall: 'Firstfall' };
const RARITY_MARK = { common: 'C', rare: 'R', epic: 'E', legendary: 'L', mythic: 'M', immortal: 'Immortal' };
const FINISH = { foil: 'Foil', altart: 'Alt Art', oktober: 'Oktoberfest Set' };
export const SET_SIZE = 120;
function collectorLine(def, rarity, treatment) {
  if (def.unique) return 'One of one · never reprinted';
  const parts = [SET_NAME[def.set] || 'Season I', `${String(def.no).padStart(3, '0')} / ${SET_SIZE}`, RARITY_MARK[rarity] || ''];
  if (FINISH[treatment]) parts.push(FINISH[treatment]);
  return parts.filter(Boolean).join(' · ');
}

// 0 = pointer tilt only · 1 = light (Legendary, Foil, Alt Art) · 2 = full (Mythic, Immortal)
function premiumTier(rarity, treatment) {
  if (rarity === 'mythic' || rarity === 'immortal') return 2;
  if (treatment === 'oktober') return 2;
  if (rarity === 'legendary' || treatment === 'foil' || treatment === 'altart') return 1;
  return 0;
}
// How much of the phone's movement reaches the card, per tier.
const GYRO = [0, 0.6, 1];

// Tilt controller. One spring per card, fed by (in priority order) a finger or
// pointer on the card, the phone's motion (premium cards only), or rest.
// Everything it drives is CSS custom properties consumed by transforms and
// opacity, so a frame costs one style pass on one small subtree.
//   --tx/--ty  -1..1 light and parallax direction
//   --rx/--ry  3D rotation (pointer: up to `max`; phone: a few degrees, since
//              a real card moves with the hand, not against it)
//   --mx/--my  sheen position · --tm tilt magnitude 0..1
export function attachTilt(el, { max = 14, gyro = 0, ask = false } = {}) {
  const reduce = motionReduced();
  const st = { x: 0, y: 0, px: 0, py: 0, pointer: false, rot: 0, w: '' };
  el.dataset.motion = gyro ? 'premium' : 'pointer';
  const move = (e) => {
    const r = el.getBoundingClientRect();
    st.px = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
    st.py = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
    st.pointer = true;
  };
  const leave = () => (st.pointer = false);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerdown', move);
  el.addEventListener('pointerleave', leave);
  el.addEventListener('pointerup', leave);
  el.addEventListener('pointercancel', leave);
  if (gyro) {
    autoStart(); // Android / desktop: no permission needed
    // iOS asks once, from a tap on a showcase card
    if (ask) el.addEventListener('click', () => motionState().status !== 'live' && requestSensors());
  }

  let seen = false, age = 0;
  const stop = onFrame((dt) => {
    if (!el.isConnected) return !seen && (age += dt) < 5; // not mounted yet / removed
    seen = true;
    let tx = 0, ty = 0, rot = 0, tau = 0.22;
    if (st.pointer) {
      tx = st.px;
      ty = st.py;
      rot = max;
      tau = 0.07;
    } else if (gyro) {
      const s = sensorTilt();
      if (s.live) {
        tx = s.x * gyro;
        ty = s.y * gyro;
        rot = 4;
        tau = 0.1;
      }
    }
    const k = 1 - Math.exp(-dt / tau);
    st.x += (tx - st.x) * k;
    st.y += (ty - st.y) * k;
    st.rot += ((reduce ? 0 : rot) - st.rot) * k;
    const x = st.x, y = st.y;
    const m = Math.min(1, Math.hypot(x, y));
    const key = x.toFixed(3) + y.toFixed(3) + st.rot.toFixed(2);
    if (key === st.w) return true; // settled: no style work this frame
    st.w = key;
    const s = el.style;
    s.setProperty('--rx', (-y * st.rot).toFixed(2) + 'deg');
    s.setProperty('--ry', (x * st.rot).toFixed(2) + 'deg');
    s.setProperty('--tx', x.toFixed(3));
    s.setProperty('--ty', y.toFixed(3));
    s.setProperty('--tm', m.toFixed(3));
    s.setProperty('--mx', ((x + 1) * 50).toFixed(1) + '%');
    s.setProperty('--my', ((y + 1) * 50).toFixed(1) + '%');
    el.classList.toggle('is-tilting', st.pointer || m > 0.02);
    return true;
  });
  return {
    tilt: () => st,
    stop() {
      stop();
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerdown', move);
      el.removeEventListener('pointerleave', leave);
    },
  };
}
