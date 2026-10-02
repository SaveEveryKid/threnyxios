// THRENODY NOIR — the Threnyx art kit.
// Every portrait = three layers on a 400x560 canvas so high rarities can
// parallax: BG (atmosphere + faction scene + resonance rings), FIG (rim-lit
// silhouette + one lit signature detail), FG (particles, fog, vignette).
// Rule of the style: the figure is always a shape first. Light is precious.

export const W = 400;
export const H = 560;

export const PALETTE = {
  crown: { sky: ['#140a08', '#3b1810', '#7a2a12'], glow: '#ff8a4c', hot: '#ffd2a0', ink: '#0b0605', mist: '#5a3a30', accent: '#ff5a2a', particle: '#c9bfb3' },
  quiet: { sky: ['#05060a', '#121722', '#2a3244'], glow: '#d7e2f2', hot: '#ffffff', ink: '#040508', mist: '#3a4456', accent: '#b9c6dc', particle: '#e8eef8' },
  hour: { sky: ['#06110e', '#10302a', '#1f5a4a'], glow: '#ffb54a', hot: '#ffe6b0', ink: '#050b09', mist: '#2f5a4e', accent: '#57d4ac', particle: '#ffcf7a' },
  margin: { sky: ['#e9e3d6', '#cfc6b4', '#a69c88'], glow: '#8b5cf6', hot: '#f4efff', ink: '#0d0b12', mist: '#f6f2ea', accent: '#7c3aed', particle: '#1a1622' },
  // Immortal treatment palette: night gold-leaf.
  gilt: { sky: ['#040306', '#110c1a', '#281a3a'], glow: '#ffd98a', hot: '#fff6dc', ink: '#050407', mist: '#3b2a55', accent: '#ffd98a', particle: '#ffe7a8' },
  vigil: { sky: ['#04061a', '#10174a', '#27307a'], glow: '#ffd27a', hot: '#fff3cf', ink: '#03040f', mist: '#2a3170', accent: '#ffc24a', particle: '#ffe4a3' },
};

let uid = 0;
export const nid = (p) => `${p}${++uid}`;

// ---------------------------------------------------------------------------
// Deterministic pseudo-random for art (same card -> same art forever).
// ---------------------------------------------------------------------------
export function artRng(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) h = Math.imul(h ^ seedStr.charCodeAt(i), 16777619);
  let s = h >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function svg(inner, { defs = '', w = W, h = H } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs>${defs}</defs>${inner}</svg>`;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

// Rim light: a lit edge on the side facing the light, plus bloom.
export function rimFilter(id, color, lx, ly, { width = 3.2, bloom = 7, strength = 1 } = {}) {
  const len = Math.hypot(lx, ly) || 1;
  const dx = (-lx / len) * width;
  const dy = (-ly / len) * width;
  return `<filter id="${id}" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">
    <feOffset in="SourceAlpha" dx="${dx.toFixed(2)}" dy="${dy.toFixed(2)}" result="off"/>
    <feComposite in="SourceAlpha" in2="off" operator="out" result="edge"/>
    <feGaussianBlur in="edge" stdDeviation="0.7" result="edgeb"/>
    <feFlood flood-color="${color}" flood-opacity="${strength}" result="c"/>
    <feComposite in="c" in2="edgeb" operator="in" result="rim"/>
    <feGaussianBlur in="rim" stdDeviation="${bloom}" result="glow"/>
    <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/><feMergeNode in="rim"/><feMergeNode in="rim"/></feMerge>
  </filter>`;
}

export function glowFilter(id, sd = 6) {
  return `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${sd}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
}

export function blurFilter(id, sd) {
  return `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${sd}"/></filter>`;
}

export function grainFilter(id, freq = 0.85, seed = 3) {
  return `<filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="2" seed="${seed}" stitchTiles="stitch"/><feColorMatrix type="matrix" values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 1.4 -0.45"/></filter>`;
}

// ---------------------------------------------------------------------------
// Atmosphere
// ---------------------------------------------------------------------------

export function sky(pal, { lx = 290, ly = 150, r = 230, intensity = 1 } = {}) {
  const g = nid('sky');
  const l = nid('src');
  const defs = `
    <linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${pal.sky[0]}"/><stop offset="0.55" stop-color="${pal.sky[1]}"/><stop offset="1" stop-color="${pal.sky[2]}"/>
    </linearGradient>
    <radialGradient id="${l}" cx="${lx}" cy="${ly}" r="${r}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${pal.hot}" stop-opacity="${0.95 * intensity}"/>
      <stop offset="0.12" stop-color="${pal.glow}" stop-opacity="${0.75 * intensity}"/>
      <stop offset="0.45" stop-color="${pal.glow}" stop-opacity="${0.18 * intensity}"/>
      <stop offset="1" stop-color="${pal.glow}" stop-opacity="0"/>
    </radialGradient>`;
  return { defs, body: `<rect width="${W}" height="${H}" fill="url(#${g})"/><rect width="${W}" height="${H}" fill="url(#${l})"/>` };
}

// The Threnyx signature: resonance rings radiating from the light source.
export function rings(cx, cy, color, { n = 7, r0 = 40, step = 34, op = 0.22, width = 1.2, dash = null } = {}) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const r = r0 + i * step * (1 + i * 0.08);
    const o = op * (1 - i / (n + 1));
    s += `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="none" stroke="${color}" stroke-opacity="${o.toFixed(3)}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
  }
  return s;
}

export function fogBand(y, color, op, { h = 60, blurId }) {
  return `<ellipse cx="${W / 2}" cy="${y}" rx="${W * 0.9}" ry="${h}" fill="${color}" opacity="${op}" filter="url(#${blurId})"/>`;
}

export function vignette(id, strength = 0.85, color = '#000') {
  return {
    defs: `<radialGradient id="${id}" cx="0.5" cy="0.45" r="0.75"><stop offset="0.55" stop-color="${color}" stop-opacity="0"/><stop offset="1" stop-color="${color}" stop-opacity="${strength}"/></radialGradient>`,
    body: `<rect width="${W}" height="${H}" fill="url(#${id})"/>`,
  };
}

// Particles: ash flakes, sparks, motes, paper scraps, rain.
export function particles(rand, kind, color, count, { y0 = 0, y1 = H, op = 0.7, size = 1 } = {}) {
  let s = '';
  for (let i = 0; i < count; i++) {
    const x = rand() * W;
    const y = y0 + rand() * (y1 - y0);
    const k = (0.4 + rand()) * size;
    const o = (op * (0.3 + rand() * 0.7)).toFixed(2);
    if (kind === 'ash') {
      const r = rand() * 360;
      s += `<path d="M${x},${y} l${2.6 * k},${-0.8 * k} l${1.2 * k},${2 * k} l${-2.8 * k},${0.6 * k}z" fill="${color}" opacity="${o}" transform="rotate(${r.toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
    } else if (kind === 'spark') {
      s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(0.9 * k).toFixed(2)}" fill="${color}" opacity="${o}"/>`;
    } else if (kind === 'streak') {
      s += `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x - 3 * k).toFixed(1)}" y2="${(y + 22 * k).toFixed(1)}" stroke="${color}" stroke-width="${(0.7 * k).toFixed(2)}" opacity="${(o * 0.6).toFixed(2)}"/>`;
    } else if (kind === 'scrap') {
      const r = rand() * 360;
      s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(7 * k).toFixed(1)}" height="${(4.5 * k).toFixed(1)}" fill="${color}" opacity="${o}" transform="rotate(${r.toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
    } else if (kind === 'note') {
      // tiny ring motes (sound made visible)
      s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(2.2 * k).toFixed(2)}" fill="none" stroke="${color}" stroke-width="0.8" opacity="${o}"/>`;
    }
  }
  return s;
}

// ---------------------------------------------------------------------------
// Figure primitives (all return path "d" strings in canvas space)
// ---------------------------------------------------------------------------

// Standing cloaked torso from neck to below the frame.
export function torso({ cx = 200, neckY = 222, neckW = 15, sh = 98, shY = 262, hem = 150, flare = 0, lean = 0 }) {
  const L = cx - sh;
  const R = cx + sh;
  return `M${cx - neckW},${neckY}
    C${cx - neckW - 2},${neckY + 14} ${cx - 34},${shY - 22} ${cx - 62},${shY - 16}
    C${L + 14},${shY - 10} ${L},${shY + 6} ${L - 2},${shY + 32}
    C${L - 6},${shY + 110} ${cx - hem + 10 - flare},${H - 60} ${cx - hem - flare + lean},${H + 40}
    L${cx + hem + flare + lean},${H + 40}
    C${cx + hem - 10 + flare},${H - 60} ${R + 6},${shY + 110} ${R + 2},${shY + 32}
    C${R},${shY + 6} ${R - 14},${shY - 10} ${cx + 62},${shY - 16}
    C${cx + 34},${shY - 22} ${cx + neckW + 2},${neckY + 14} ${cx + neckW},${neckY} Z`;
}

export function head({ cx = 200, cy = 186, rx = 27, ry = 33, jaw = 0.82, tilt = 0 }) {
  // Egg-shaped head with a narrower jaw.
  const top = cy - ry;
  const bot = cy + ry;
  const j = rx * jaw;
  return `M${cx},${top}
    C${cx + rx * 0.9},${top} ${cx + rx},${cy - ry * 0.35} ${cx + rx},${cy}
    C${cx + rx},${cy + ry * 0.45} ${cx + j},${bot - 6} ${cx},${bot}
    C${cx - j},${bot - 6} ${cx - rx},${cy + ry * 0.45} ${cx - rx},${cy}
    C${cx - rx},${cy - ry * 0.35} ${cx - rx * 0.9},${top} ${cx},${top} Z`;
}

export function hood({ cx = 200, cy = 180, w = 46, h = 70, peak = 18 }) {
  return `M${cx},${cy - h * 0.62 - peak}
    C${cx + w * 0.55},${cy - h * 0.6} ${cx + w},${cy - h * 0.1} ${cx + w * 0.95},${cy + h * 0.55}
    L${cx + w * 1.2},${cy + h * 0.95}
    L${cx - w * 1.2},${cy + h * 0.95}
    L${cx - w * 0.95},${cy + h * 0.55}
    C${cx - w},${cy - h * 0.1} ${cx - w * 0.55},${cy - h * 0.6} ${cx},${cy - h * 0.62 - peak} Z`;
}

// A crown band with spikes; `broken` removes one spike (the Crown sigil).
export function crown({ cx = 200, y = 150, w = 64, h = 34, spikes = 7, broken = -1, flare = 1.15 }) {
  const n = spikes;
  let d = `M${cx - w / 2},${y}`;
  for (let i = 0; i < n; i++) {
    const x0 = cx - (w / 2) * flare + (i * w * flare) / (n - 1);
    const hh = (i === broken ? 0.25 : 1) * h * (i % 2 === 0 ? 1 : 0.62);
    d += ` L${(x0 - 3).toFixed(1)},${(y - hh * 0.2).toFixed(1)} L${x0.toFixed(1)},${(y - hh).toFixed(1)} L${(x0 + 3).toFixed(1)},${(y - hh * 0.2).toFixed(1)}`;
  }
  d += ` L${cx + w / 2},${y} L${cx + w / 2 - 2},${y + 9} L${cx - w / 2 + 2},${y + 9} Z`;
  return d;
}

export function blade({ x1, y1, x2, y2, w = 7, guard = 26, grip = 26 }) {
  // Straight blade from hilt (x1,y1) to tip (x2,y2), with crossguard + grip.
  const a = Math.atan2(y2 - y1, x2 - x1);
  const nx = -Math.sin(a);
  const ny = Math.cos(a);
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const p = (x, y) => `${x.toFixed(1)},${y.toFixed(1)}`;
  const bl = [x1 + nx * w, y1 + ny * w];
  const br = [x1 - nx * w, y1 - ny * w];
  const tip = [x2, y2];
  const nearTipL = [x2 - ux * 22 + nx * w * 0.9, y2 - uy * 22 + ny * w * 0.9];
  const nearTipR = [x2 - ux * 22 - nx * w * 0.9, y2 - uy * 22 - ny * w * 0.9];
  const g1 = [x1 + nx * guard, y1 + ny * guard];
  const g2 = [x1 - nx * guard, y1 - ny * guard];
  const g1b = [g1[0] - ux * 6, g1[1] - uy * 6];
  const g2b = [g2[0] - ux * 6, g2[1] - uy * 6];
  const gr1 = [x1 - ux * 6 + nx * 4, y1 - uy * 6 + ny * 4];
  const gr2 = [x1 - ux * grip + nx * 4, y1 - uy * grip + ny * 4];
  const gr3 = [x1 - ux * grip - nx * 4, y1 - uy * grip - ny * 4];
  const gr4 = [x1 - ux * 6 - nx * 4, y1 - uy * 6 - ny * 4];
  const pom = [x1 - ux * (grip + 7), y1 - uy * (grip + 7)];
  return `M${p(...bl)} L${p(...nearTipL)} L${p(...tip)} L${p(...nearTipR)} L${p(...br)} Z
    M${p(...g1)} L${p(...g2)} L${p(...g2b)} L${p(...g1b)} Z
    M${p(...gr1)} L${p(...gr2)} L${p(...gr3)} L${p(...gr4)} Z
    M${p(pom[0] + 6, pom[1])} A6,6 0 1,0 ${p(pom[0] - 6, pom[1])} A6,6 0 1,0 ${p(pom[0] + 6, pom[1])} Z`;
}

export function pole({ x1, y1, x2, y2, w = 3.5 }) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const nx = -Math.sin(a) * w;
  const ny = Math.cos(a) * w;
  return `M${x1 + nx},${y1 + ny} L${x2 + nx},${y2 + ny} L${x2 - nx},${y2 - ny} L${x1 - nx},${y1 - ny} Z`;
}

export function circlePath(cx, cy, r) {
  return `M${cx + r},${cy} A${r},${r} 0 1,0 ${cx - r},${cy} A${r},${r} 0 1,0 ${cx + r},${cy} Z`;
}

export function ellipsePath(cx, cy, rx, ry) {
  return `M${cx + rx},${cy} A${rx},${ry} 0 1,0 ${cx - rx},${cy} A${rx},${ry} 0 1,0 ${cx + rx},${cy} Z`;
}

// Arm raised/lowered as a tapered limb between points (for gesture).
export function limb(points, w0 = 16, w1 = 11) {
  // points: [[x,y],...] centerline; builds a tapered ribbon.
  const n = points.length;
  const left = [];
  const right = [];
  for (let i = 0; i < n; i++) {
    const [x, y] = points[i];
    const [xa, ya] = points[Math.max(0, i - 1)];
    const [xb, yb] = points[Math.min(n - 1, i + 1)];
    const a = Math.atan2(yb - ya, xb - xa);
    const w = w0 + ((w1 - w0) * i) / (n - 1);
    left.push([x - Math.sin(a) * w, y + Math.cos(a) * w]);
    right.push([x + Math.sin(a) * w, y - Math.cos(a) * w]);
  }
  const pts = [...left, ...right.reverse()];
  return 'M' + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L') + ' Z';
}

// Figure group: all silhouette parts share one fill so overlaps merge, and one
// rim filter so the rim follows the union outline.
export function figure(paths, { fill, rimId, bodyGradId }) {
  return `<g filter="url(#${rimId})"><g fill="${bodyGradId ? `url(#${bodyGradId})` : fill}">${paths
    .map((d) => (typeof d === 'string' ? `<path d="${d}"/>` : `<path d="${d.d}"${d.t ? ` transform="${d.t}"` : ''}/>`))
    .join('')}</g></g>`;
}

// ---------------------------------------------------------------------------
// Portrait-bust primitives. A human head in profile, facing +x, origin at the
// skull's centre, ~100 units from crown to chin. Transform with place().
// Variants shape the face: brow, nose, lips, chin, jaw.
// ---------------------------------------------------------------------------
const FACES = {
  // [browOut, noseLen, noseDrop, lipOut, chinOut, jawDepth]
  noble: [0, 0, 0, 0, 0, 0],
  hard: [2, 1, 1, -1, 3, 4],
  young: [-2, -3, -1, 1, -2, -2],
  old: [3, 3, 3, -3, -1, 3],
  sharp: [1, 3, -1, -1, 2, 1],
};

export function profileHead(face = 'noble') {
  const [b, n, nd, l, c, j] = FACES[face] || FACES.noble;
  return `M-30,52
    C-44,30 -52,-4 -44,-30
    C-36,-54 -10,-64 14,-58
    C30,-54 38,-40 40,-24
    C40,-18 ${41 + b},-12 ${42 + b},-7
    C${43 + n * 0.3},-2 ${47 + n},${6 + nd} ${51 + n},${13 + nd}
    C${52 + n},${16 + nd} ${49 + n},${18 + nd} ${44},${19 + nd}
    C44,22 ${45 + l},24 ${45 + l},26
    C${46 + l},28 ${44 + l},30 ${43 + l},31
    C${44 + l},33 ${45 + l},35 ${43 + l},36
    C${44 + c},40 ${45 + c},45 ${40 + c},${49 + c * 0.3}
    C${34},${52 + j * 0.3} ${22 - j},${54} ${14 - j},${56}
    L10,78 L-30,78 Z`;
}

// Eye position for profileHead (for lit details).
export const EYE = { x: 30, y: -10 };

// Returns a transform string placing a +x-facing part at (x,y), scaled,
// optionally mirrored to face left, and rotated.
export function place(x, y, s = 1, { flip = false, rot = 0 } = {}) {
  return `translate(${x} ${y}) rotate(${rot}) scale(${flip ? -s : s} ${s})`;
}

// Map a local point through place() - for positioning lit details.
export function at(x, y, s, { flip = false, rot = 0 } = {}, px, py) {
  const lx = (flip ? -px : px) * s;
  const ly = py * s;
  const a = (rot * Math.PI) / 180;
  return [x + lx * Math.cos(a) - ly * Math.sin(a), y + lx * Math.sin(a) + ly * Math.cos(a)];
}

// Shoulders/cloak mass for a bust, from neck base (nx, ny) to frame bottom.
export function bust({ nx = 200, ny = 330, left = 150, right = 150, drop = 40, slopeL = 0, slopeR = 0 }) {
  return `M${nx - 34},${ny - 10}
    C${nx - 60},${ny + 6} ${nx - left * 0.7},${ny + 12 + slopeL} ${nx - left},${ny + drop + slopeL}
    C${nx - left - 30},${ny + drop + 40 + slopeL} ${nx - left - 40},${H - 40} ${nx - left - 50},${H + 20}
    L${nx + right + 50},${H + 20}
    C${nx + right + 40},${H - 40} ${nx + right + 30},${ny + drop + 40 + slopeR} ${nx + right},${ny + drop + slopeR}
    C${nx + right * 0.7},${ny + 12 + slopeR} ${nx + 60},${ny + 6} ${nx + 34},${ny - 10} Z`;
}

export function bodyGradient(id, pal, lx) {
  // Barely-there form light on the lit side of the silhouette.
  const lit = lx > 200;
  return `<linearGradient id="${id}" x1="${lit ? 0 : 1}" y1="0" x2="${lit ? 1 : 0}" y2="0.4">
    <stop offset="0" stop-color="${pal.ink}"/><stop offset="0.7" stop-color="${pal.ink}"/><stop offset="1" stop-color="${mix(pal.ink, pal.glow, 0.16)}"/>
  </linearGradient>`;
}

export function mix(a, b, t) {
  const pa = hex(a);
  const pb = hex(b);
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
function hex(c) {
  const s = c.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
}
