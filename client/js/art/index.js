// Art delivery. Vector (SVG) for large views; flattened raster thumbnails for
// grids and hands, rendered once and cached, so browsing never re-runs filters.
import { placeholderSVG } from './placeholder.js';

// Final painted art: files listed in client/art/manifest.json are used when
// present, as WebP written by tools/import-art.mjs from the delivered PNGs.
// Layout: cards/<id>.webp, foil/ + foil-s/<id>.webp (foil prints),
// cutouts/<id>.webp, immortal/<id>.webp (+ _cutout), fx/ + fx-s/<id>.webp (rarity
// effect layer), holo/<id>_{foil,ripples,glints,mask}.webp (Mythic holo stack),
// cardback/, packs/, ui/,
// story/, avatars/, boss/, factions/, icon/. Anything missing falls back to
// the placeholder system, so art can arrive in any order.
let manifest = { cards: [], foil: [], oktober: [], immortal: [], cutouts: [], immortalCutouts: [], fx: [], holo: [], cardback: false, packs: [], ui: [], story: [], avatars: [], boss: [], factions: [] };
export const artReady = fetch(new URL('../../art/manifest.json', import.meta.url))
  .then((r) => (r.ok ? r.json() : manifest))
  .then((m) => (manifest = { ...manifest, ...m }))
  .catch(() => manifest);
const ART_BASE = new URL('../../art/', import.meta.url).href;

const layerCache = new Map();
const thumbCache = new Map();

// Returns { flat } (single image) and optionally { cutout } for Mythics.
export function artFor(card, treatment = 'standard') {
  const key = card.id + ':' + treatment;
  let L = layerCache.get(key);
  if (!L) {
    const imm = treatment === 'immortal' && manifest.immortal.includes(card.id);
    if (imm) L = { flat: ART_BASE + 'immortal/' + card.id + '.webp' };
    // the Oktoberfest Set: its own autumn painting (until delivered, the usual one)
    else if (treatment === 'oktober' && manifest.oktober?.includes(card.id)) L = { flat: ART_BASE + 'oktober/' + card.id + '.webp' };
    else if (manifest.cards.includes(card.id) && manifest.foil?.includes(card.id)) {
      // the foil print: the painting with its foil baked in (tools/bake-foil.py),
      // so no effect layers are drawn over it
      L = { flat: ART_BASE + 'foil/' + card.id + '.webp', baked: true };
    } else if (manifest.cards.includes(card.id)) {
      L = { flat: ART_BASE + 'cards/' + card.id + '.webp' };
      // effect layers are painted to sit exactly over this painting
      if (manifest.fx?.includes(card.id)) (L.fx = ART_BASE + 'fx/' + card.id + '.webp'), (L.fxS = ART_BASE + 'fx-s/' + card.id + '.webp');
      if (manifest.holo?.includes(card.id)) {
        const h = (n) => ART_BASE + 'holo/' + card.id + '_' + n + '.webp';
        L.holo = { foil: h('foil'), foilS: h('foil-s'), ripples: h('ripples'), glints: h('glints'), mask: h('mask') };
      }
    }
    else L = { flat: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(placeholderSVG(card)), placeholder: true };
    // a cutout must match the painting it was cut from
    if (imm) {
      if (manifest.immortalCutouts.includes(card.id)) L.cutout = ART_BASE + 'immortal/' + card.id + '_cutout.webp';
    } else if (manifest.cutouts.includes(card.id)) L.cutout = ART_BASE + 'cutouts/' + card.id + '.webp';
    layerCache.set(key, L);
  }
  return L;
}

// Non-card art by slot; null when that file hasn't been delivered yet.
const slot = (list, key, dir) => (manifest[list]?.includes(key) ? ART_BASE + dir + '/' + key + '.webp' : null);
// small: the 720px copy (ui-s/), for backgrounds shown dimmed behind a screen
export const uiArt = (name, small = false) => slot('ui', name, small && manifest.small ? 'ui-s' : 'ui');
export const storyArt = (n) => slot('story', 'ch' + String(n).padStart(2, '0'), 'story');
// small: the 540px copy (packs-s/), plenty for the shelf and the opening (190px wide)
export const packArt = (key, small = true) => slot('packs', key, small && manifest.small ? 'packs-s' : 'packs');
// sized copies (tools/import-art.mjs): 's' for large views, 'xs' for icons
const sized = (dir, size) => (size && manifest.sized ? dir + '-' + size : dir);
export const avatarArt = (id, size = 's') => slot('avatars', id, sized('avatars', size));
export const bossArt = (id) => slot('boss', id, 'boss');
export const factionArt = (f, size = 'xs') => slot('factions', f, sized('factions', size));
export const cardbackArt = (size = 's', name = 'cardback') => (manifest.cardback ? ART_BASE + sized('cardback', size) + `/${name}.webp` : null);
/** Earned card backs (cardback/<name>.webp): the one this player chose, if any. */
export const CARDBACKS = { oktober: 'Oktoberfest Finalist' };
export function chosenBack() {
  try {
    const b = localStorage.getItem('threnyx.cardback');
    return CARDBACKS[b] ? b : 'cardback';
  } catch {
    return 'cardback';
  }
}
export function chooseBack(name) {
  try {
    name && CARDBACKS[name] ? localStorage.setItem('threnyx.cardback', name) : localStorage.removeItem('threnyx.cardback');
  } catch {}
}

function loadImg(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
}

// Flattened thumbnail at `w` px wide (height 1.4w).
export function thumb(card, w = 320, treatment = 'standard') {
  const key = card.id + ':' + treatment + '@' + w;
  let p = thumbCache.get(key);
  if (!p) {
    p = (async () => {
      const L = artFor(card, treatment);
      const h = Math.round(w * 1.4);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      // small thumbnails start from the 360px copy: an iPhone keeps every
      // decoded painting in memory, and the full ones are 8x the size
      const small = w <= 400 && !L.placeholder && manifest.small ? L.flat.replace(/\/(cards|immortal|foil)\//, '/$1-s/') : null;
      const im = await loadImg(small || L.flat).catch(() => loadImg(L.flat));
      // cover-crop to 5:7
      const r = Math.max(w / im.width, h / im.height);
      ctx.drawImage(im, (w - im.width * r) / 2, (h - im.height * r) / 2, im.width * r, im.height * r);
      const blob = await new Promise((r) => c.toBlob(r, 'image/webp', 0.9));
      // hand the memory back now: Safari frees canvases and decoded images late
      c.width = c.height = 0;
      im.src = '';
      return URL.createObjectURL(blob);
    })();
    thumbCache.set(key, p);
  }
  return p;
}
