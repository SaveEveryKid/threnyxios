// Faction scene backdrops. Each is recognisable in a thumbnail by shape alone:
// Crown = broken cathedral spires in ash; Quiet = monoliths + a giant silent
// bell; Hourwrights = clock face + bell towers in rain; Margin = unfinished
// ink line-drawing on paper; Vigil = the lantern spiral under stars.
import { W, H, nid, mix, circlePath } from './kit.js';

export function crownScene(pal, rand) {
  const far = mix(pal.sky[1], pal.ink, 0.35);
  const near = mix(pal.sky[1], pal.ink, 0.7);
  let s = '';
  // Distant ruined spires on the horizon.
  const spires = [
    [30, 360, 20, 150], [70, 380, 14, 90], [110, 350, 26, 190], [150, 390, 12, 70],
    [260, 370, 16, 110], [300, 340, 30, 210], [345, 375, 18, 120], [380, 360, 22, 140],
  ];
  for (const [x, y, w, h] of spires) {
    const broken = rand() < 0.6;
    const top = y - h;
    s += `<path d="M${x - w},${H} L${x - w},${y} L${x - w * 0.6},${y - h * 0.55} L${x},${top} ${broken ? `L${x + w * 0.25},${top + 18} L${x + w * 0.45},${top + 8}` : ''} L${x + w * 0.6},${y - h * 0.55} L${x + w},${y} L${x + w},${H} Z" fill="${far}" opacity="0.9"/>`;
    // gothic window glow
    if (rand() < 0.5) s += `<path d="M${x - 4},${y - 10} L${x - 4},${y - 26} Q${x},${y - 34} ${x + 4},${y - 26} L${x + 4},${y - 10} Z" fill="${pal.glow}" opacity="0.5"/>`;
  }
  // Ember horizon line.
  const hz = nid('hz');
  s += `<defs><linearGradient id="${hz}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${pal.accent}" stop-opacity="0"/><stop offset="0.5" stop-color="${pal.accent}" stop-opacity="0.55"/><stop offset="1" stop-color="${pal.accent}" stop-opacity="0"/></linearGradient></defs>`;
  s += `<rect x="0" y="400" width="${W}" height="70" fill="url(#${hz})"/>`;
  // Near rubble ridge.
  s += `<path d="M0,${H} L0,470 Q60,455 110,478 T220,470 T320,482 T${W},468 L${W},${H} Z" fill="${near}"/>`;
  return s;
}

export function quietScene(pal, rand) {
  const far = mix(pal.sky[1], pal.ink, 0.25);
  const near = mix(pal.sky[0], pal.ink, 0.5);
  let s = '';
  // The great silent bell hanging behind everything.
  s += `<path d="M200,40 L206,58 C262,66 286,120 290,190 C292,232 318,258 338,268 L62,268 C82,258 108,232 110,190 C114,120 138,66 194,58 Z" fill="${far}" opacity="0.8"/>`;
  s += `<rect x="190" y="0" width="20" height="44" fill="${far}" opacity="0.8"/>`;
  // Bell mouth: empty (no clapper) - a void.
  s += `<ellipse cx="200" cy="268" rx="138" ry="10" fill="${pal.ink}" opacity="0.6"/>`;
  // Monolith pillars, perfectly geometric.
  const cols = [[0, 60], [52, 36], [312, 36], [352, 48]];
  for (const [x, w] of cols) {
    s += `<rect x="${x}" y="150" width="${w}" height="${H}" fill="${near}"/>`;
    s += `<rect x="${x + w - 3}" y="150" width="2" height="${H}" fill="${pal.glow}" opacity="0.18"/>`;
  }
  // Floor of Coda: reflective black stone with a silver seam.
  s += `<rect x="0" y="470" width="${W}" height="${H - 470}" fill="${pal.ink}"/>`;
  s += `<rect x="0" y="470" width="${W}" height="1.5" fill="${pal.glow}" opacity="0.35"/>`;
  return s;
}

export function hourScene(pal, rand) {
  const far = mix(pal.sky[1], pal.ink, 0.3);
  const near = mix(pal.sky[1], pal.ink, 0.65);
  let s = '';
  // Great clock face behind the figure.
  const cx = 200;
  const cy = 170;
  const R = 150;
  s += `<path d="${circlePath(cx, cy, R)}" fill="none" stroke="${pal.glow}" stroke-opacity="0.35" stroke-width="3"/>`;
  s += `<path d="${circlePath(cx, cy, R - 12)}" fill="none" stroke="${pal.glow}" stroke-opacity="0.15" stroke-width="1"/>`;
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const r1 = R - (i % 5 === 0 ? 20 : 8);
    s += `<line x1="${(cx + Math.cos(a) * r1).toFixed(1)}" y1="${(cy + Math.sin(a) * r1).toFixed(1)}" x2="${(cx + Math.cos(a) * (R - 2)).toFixed(1)}" y2="${(cy + Math.sin(a) * (R - 2)).toFixed(1)}" stroke="${pal.glow}" stroke-opacity="${i % 5 === 0 ? 0.55 : 0.25}" stroke-width="${i % 5 === 0 ? 2.5 : 1}"/>`;
  }
  // Bell towers.
  const towers = [[26, 250, 30], [78, 300, 22], [322, 280, 24], [372, 240, 32]];
  for (const [x, y, w] of towers) {
    s += `<path d="M${x - w},${H} L${x - w},${y} L${x - w * 0.8},${y - 30} L${x},${y - 64} L${x + w * 0.8},${y - 30} L${x + w},${y} L${x + w},${H} Z" fill="${far}"/>`;
    s += `<path d="M${x - 9},${y - 4} Q${x - 9},${y - 22} ${x},${y - 22} Q${x + 9},${y - 22} ${x + 9},${y - 4} Z" fill="${pal.glow}" opacity="0.6"/>`;
  }
  // Canal with reflected light.
  s += `<rect x="0" y="480" width="${W}" height="${H - 480}" fill="${near}"/>`;
  for (let i = 0; i < 14; i++) {
    const y = 488 + rand() * 66;
    const x = rand() * W;
    s += `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${(20 + rand() * 50).toFixed(0)}" height="1.4" fill="${pal.glow}" opacity="${(0.15 + rand() * 0.3).toFixed(2)}"/>`;
  }
  return s;
}

export function marginScene(pal, rand) {
  // Ink line-drawing of a city that is still being drawn - strokes only,
  // fading out as if the pen stopped.
  const ink = pal.ink;
  let s = '';
  const g = nid('fade');
  s += `<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${ink}" stop-opacity="0"/><stop offset="0.45" stop-color="${ink}" stop-opacity="0.55"/><stop offset="1" stop-color="${ink}" stop-opacity="0.2"/></linearGradient></defs>`;
  const buildings = [[10, 300, 60, 180], [70, 340, 44, 120], [118, 280, 50, 200], [250, 300, 56, 170], [306, 260, 40, 230], [346, 330, 50, 140]];
  for (const [x, y, w, h] of buildings) {
    const top = y - h * 0.3;
    s += `<path d="M${x},${H} L${x},${top} L${x + w / 2},${top - 30} L${x + w},${top} L${x + w},${H}" fill="none" stroke="url(#${g})" stroke-width="1.3"/>`;
    for (let r = 0; r < 5; r++) {
      const wy = top + 20 + r * 34;
      if (rand() < 0.7) s += `<rect x="${x + 8}" y="${wy}" width="${w / 2 - 12}" height="16" fill="none" stroke="url(#${g})" stroke-width="0.9"/>`;
      if (rand() < 0.5) s += `<rect x="${x + w / 2 + 4}" y="${wy}" width="${w / 2 - 12}" height="16" fill="none" stroke="url(#${g})" stroke-width="0.9"/>`;
    }
    // unfinished construction lines
    s += `<line x1="${x - 20}" y1="${top}" x2="${x + w + 30}" y2="${top}" stroke="${ink}" stroke-opacity="0.12" stroke-width="0.8"/>`;
    s += `<line x1="${x + w / 2}" y1="${top - 70}" x2="${x + w / 2}" y2="${top - 30}" stroke="${ink}" stroke-opacity="0.18" stroke-width="0.8" stroke-dasharray="3 4"/>`;
  }
  // Ink drips from the top edge.
  for (let i = 0; i < 9; i++) {
    const x = rand() * W;
    const len = 20 + rand() * 90;
    s += `<path d="M${x - 2},0 L${x - 1.2},${len} Q${x},${len + 7} ${x + 1.2},${len} L${x + 2},0 Z" fill="${ink}" opacity="${(0.25 + rand() * 0.4).toFixed(2)}"/>`;
  }
  // Paper floor.
  s += `<rect x="0" y="480" width="${W}" height="${H - 480}" fill="${pal.mist}" opacity="0.55"/>`;
  return s;
}

export function vigilScene(pal, rand) {
  let s = '';
  // Stars
  for (let i = 0; i < 70; i++) {
    const x = rand() * W;
    const y = rand() * 300;
    s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(0.4 + rand() * 1.1).toFixed(2)}" fill="#fff" opacity="${(0.2 + rand() * 0.6).toFixed(2)}"/>`;
  }
  // The lantern spiral of Lanternfast in the distance (left).
  const far = mix(pal.sky[1], pal.ink, 0.4);
  s += `<path d="M40,${H} L52,170 L60,150 L68,170 L80,${H} Z" fill="${far}"/>`;
  for (let i = 0; i < 26; i++) {
    const t = i / 26;
    const y = 180 + t * 300;
    const x = 60 + Math.sin(t * 18) * (6 + t * 14);
    s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(1.2 + t * 1.5).toFixed(1)}" fill="${pal.glow}" opacity="${(0.9 - t * 0.4).toFixed(2)}"/>`;
  }
  // Hills with procession lanterns
  s += `<path d="M0,${H} L0,440 Q90,410 180,440 T360,430 L${W},436 L${W},${H} Z" fill="${mix(pal.sky[0], pal.ink, 0.6)}"/>`;
  for (let i = 0; i < 12; i++) {
    const x = 20 + i * 32 + rand() * 10;
    const y = 440 - Math.sin(i / 2) * 8 + rand() * 6;
    s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.8" fill="${pal.glow}" opacity="0.8"/>`;
  }
  return s;
}

// Immortal-only: the twelfth city, remembered. Solid gold architecture where
// the Margin scene has only unfinished ink lines.
export function rememberedScene(pal, rand) {
  let s = '';
  const gold = pal.glow;
  const g = nid('rg');
  s += `<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${gold}" stop-opacity="0.95"/><stop offset="1" stop-color="${mix(gold, pal.ink, 0.75)}" stop-opacity="1"/></linearGradient></defs>`;
  const towers = [[0, 330, 44, 150], [40, 300, 30, 210], [70, 350, 40, 110], [108, 270, 26, 260], [270, 280, 28, 250], [300, 320, 40, 170], [338, 290, 30, 230], [366, 340, 40, 140]];
  for (const [x, y, w, h] of towers) {
    const top = y - h * 0.25;
    s += `<path d="M${x},${H} L${x},${top} L${x + w * 0.15},${top} L${x + w * 0.15},${top - 18} L${x + w / 2},${top - 60} L${x + w * 0.85},${top - 18} L${x + w * 0.85},${top} L${x + w},${top} L${x + w},${H} Z" fill="url(#${g})" opacity="0.55"/>`;
    for (let r = 0; r < 8; r++) {
      if (rand() < 0.55) s += `<rect x="${x + w / 2 - 3}" y="${top + 16 + r * 26}" width="6" height="11" rx="3" fill="${pal.hot}" opacity="${(0.5 + rand() * 0.5).toFixed(2)}"/>`;
    }
  }
  // domes
  s += `<path d="M150,${H} L150,420 C150,380 180,360 200,352 C220,360 250,380 250,420 L250,${H} Z" fill="url(#${g})" opacity="0.35"/>`;
  s += `<rect x="0" y="470" width="${W}" height="${H - 470}" fill="${pal.ink}" opacity="0.7"/>`;
  for (let i = 0; i < 40; i++) s += `<rect x="${(rand() * W).toFixed(0)}" y="${(474 + rand() * 80).toFixed(0)}" width="${(10 + rand() * 40).toFixed(0)}" height="1.2" fill="${gold}" opacity="${(0.2 + rand() * 0.5).toFixed(2)}"/>`;
  return s;
}

export const SCENES = { crown: crownScene, quiet: quietScene, hour: hourScene, margin: marginScene, vigil: vigilScene, remembered: rememberedScene };
