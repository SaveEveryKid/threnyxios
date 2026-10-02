// Imports delivered art into the game: node tools/import-art.mjs <zip|folder> [...]
// Accepts the master-brief layout (threnyx-art/cards/..., ui/..., ...) or a flat
// folder of card images named <card-id>.png. Converts to WebP (alpha kept for
// cutouts), writes client/art/<slot>/<name>.webp and merges manifest.json.
// Options: --cardback <image> (the shared card back; dark margins cropped).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import zlib from 'node:zlib';
import { CARDS } from '../engine/cards/index.js';

const FF = process.env.FFMPEG || '/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2';
const ART = new URL('../client/art/', import.meta.url).pathname;
const args = process.argv.slice(2);
const mf = path.join(ART, 'manifest.json');
const manifest = { small: true, sized: true, cards: [], oktober: [], cutouts: [], immortal: [], immortalCutouts: [], cardback: false, packs: [], ui: [], story: [], avatars: [], boss: [], factions: [], icon: false, fx: [], holo: [], ...JSON.parse(fs.readFileSync(mf, 'utf8')) };
const add = (k, v) => manifest[k].includes(v) || manifest[k].push(v);
const report = [];

// Generated PNGs can carry big metadata chunks (C2PA 'caBX', prompts) and put
// all pixels in one giant IDAT, and ffmpeg's decoder refuses both ("chunk too
// big"). Rewrite them: pixel chunks only, IDAT re-split into 64 KB pieces.
const KEEP = new Set(['IHDR', 'PLTE', 'tRNS', 'gAMA', 'sRGB', 'cHRM', 'iCCP', 'sBIT']);
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}
function cleanPng(src) {
  if (!/\.png$/i.test(src)) return src;
  const b = fs.readFileSync(src);
  const keep = [];
  const idat = [];
  let big = false;
  for (let i = 8; i < b.length; ) {
    const len = b.readUInt32BE(i);
    const type = b.toString('latin1', i + 4, i + 8);
    const data = b.subarray(i + 8, i + 8 + len);
    if (type === 'IDAT') idat.push(data), (big ||= len > 65536);
    else if (KEEP.has(type)) keep.push(b.subarray(i, i + 12 + len));
    else big = true;
    i += 12 + len;
    if (type === 'IEND') break;
  }
  if (!big) return src;
  const all = Buffer.concat(idat);
  const parts = [];
  for (let o = 0; o < all.length; o += 65536) parts.push(chunk('IDAT', all.subarray(o, o + 65536)));
  const tmp = path.join(os.tmpdir(), 'clean-' + process.pid + '-' + path.basename(src));
  fs.writeFileSync(tmp, Buffer.concat([b.subarray(0, 8), ...keep, ...parts, chunk('IEND', Buffer.alloc(0))]));
  return tmp;
}

function webp(src, dst, { width, alpha = false, crop = null } = {}) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  src = cleanPng(src);
  const vf = [crop, width ? `scale='min(${width},iw)':-2` : null].filter(Boolean).join(',');
  execFileSync(FF, ['-loglevel', 'error', '-y', '-i', src, ...(vf ? ['-vf', vf] : []), '-c:v', 'libwebp', '-quality', alpha ? '88' : '82', ...(alpha ? ['-pix_fmt', 'yuva420p'] : []), dst]);
}

// A grayscale mask becomes white-with-alpha, so CSS mask-image can use it.
function maskWebp(src, dst, width) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  src = cleanPng(src);
  execFileSync(FF, ['-loglevel', 'error', '-y', '-i', src, '-filter_complex', `[0]format=gray,scale='min(${width},iw)':-2,split[a][b];[b]lutyuv=y=255[w];[w][a]alphamerge,format=yuva420p`, '-c:v', 'libwebp', '-quality', '80', dst]);
}

// Effect layers painted to sit exactly over a card's art (1024x1536, alpha):
//   rarity_effect_layers/<id>/<id>_<rarity>_effect.png  -> fx/<id>.webp  (+ fx-s small, for board/grid cards)
//   mythic_holo_layers/<id>/<id>_<layer>.png            -> holo/<id>_<layer>.webp (foil, ripples, glints, mask)
const HOLO = { foil_rainbow: 'foil', sound_ripples: 'ripples', specular_glints: 'glints', holo_mask: 'mask' };
function importLayer(file, rel, base) {
  const parts = rel.split('/');
  const id = parts[parts.length - 2];
  if (!CARDS[id]) return false;
  if (parts.includes('rarity_effect_layers') && /_effect$/.test(base)) {
    webp(file, path.join(ART, 'fx', id + '.webp'), { width: 1024, alpha: true });
    webp(file, path.join(ART, 'fx-s', id + '.webp'), { width: 360, alpha: true });
    add('fx', id);
    report.push(`fx/${id}`);
    return true;
  }
  if (parts.includes('mythic_holo_layers')) {
    const layer = Object.entries(HOLO).find(([k]) => base === id + '_' + k)?.[1];
    if (!layer) return false;
    if (layer === 'mask') maskWebp(file, path.join(ART, 'holo', `${id}_mask.webp`), 512);
    else webp(file, path.join(ART, 'holo', `${id}_${layer}.webp`), { width: 1024, alpha: true });
    if (layer === 'foil') webp(file, path.join(ART, 'holo', `${id}_foil-s.webp`), { width: 360, alpha: true });
    add('holo', id);
    report.push(`holo/${id}_${layer}`);
    return true;
  }
  return false;
}

function importFile(file) {
  const rel = file.replace(/\\/g, '/');
  const base = path.basename(rel).replace(/\.(png|jpe?g|webp)$/i, '');
  const dir = rel.split('/').slice(-2, -1)[0] || '';
  if (/(rarity_effect_layers|mythic_holo_layers)\//.test(rel)) {
    if (!importLayer(file, rel, base)) report.push(`SKIPPED ${rel} (unknown layer)`);
    return;
  }
  const put = (slot, name, opts) => {
    webp(file, path.join(ART, slot, name + '.webp'), opts);
    report.push(`${slot}/${name}`);
  };
  if (dir === 'immortal') {
    if (base.endsWith('_cutout')) return put('immortal', base, { width: 1024, alpha: true }), add('immortalCutouts', base.replace(/_cutout$/, ''));
    return put('immortal', base, { width: 1024 }), put('immortal-s', base, { width: 360 }), add('immortal', base);
  }
  // the Oktoberfest Set: autumn versions of five Champions (art/oktober/<card id>)
  if (dir === 'oktober' && CARDS[base]) return put('oktober', base, { width: 1024 }), add('oktober', base);
  if (dir === 'cutouts') return put('cutouts', base, { width: 1024, alpha: true }), add('cutouts', base);
  if (dir === 'cardback') return put('cardback', 'cardback', { width: 1024 }), put('cardback-s', 'cardback', { width: 540 }), (manifest.cardback = true);
  if (dir === 'icon') return put('icon', 'app-icon', { width: 1024 }), (manifest.icon = true);
  for (const k of ['packs', 'ui', 'story', 'avatars', 'boss', 'factions'])
    if (dir === k) {
      put(k, base, { width: k === 'ui' || k === 'story' ? 1080 : 1024, alpha: k === 'factions' });
      // small copies for phones: pack shelf art and dimmed screen backgrounds (client/js/art/index.js)
      if (k === 'packs') put('packs-s', base, { width: 540 });
      if (k === 'ui') put('ui-s', base, { width: 720 });
      if (k === 'factions') put('factions-s', base, { width: 512, alpha: true }), put('factions-xs', base, { width: 128, alpha: true });
      if (k === 'avatars') put('avatars-s', base, { width: 640 }), put('avatars-xs', base, { width: 128 });
      return add(k, base);
    }
  // plus a 360px copy for thumbnails (client/js/art/index.js thumb)
  if (CARDS[base]) return put('cards', base, { width: 1024 }), put('cards-s', base, { width: 360 }), add('cards', base);
  report.push(`SKIPPED ${rel} (no card or slot named "${base}")`);
}

function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(png|jpe?g|webp)$/i.test(e.name) && !e.name.startsWith('._')) out.push(p);
  }
  return out;
}

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--cardback') {
    const src = args[++i];
    const log = execFileSync(FF, ['-loop', '1', '-t', '0.2', '-i', src, '-vf', 'cropdetect=limit=0.12:round=2:reset=0', '-f', 'null', '-'], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] });
    const m = [...String(log).matchAll(/crop=(\d+:\d+:\d+:\d+)/g)].pop();
    webp(src, path.join(ART, 'cardback', 'cardback.webp'), { width: 1024, crop: m ? 'crop=' + m[1] : null });
    webp(path.join(ART, 'cardback', 'cardback.webp'), path.join(ART, 'cardback-s', 'cardback.webp'), { width: 540 });
    manifest.cardback = true;
    report.push(`cardback/cardback${m ? ' (cropped ' + m[1] + ')' : ''}`);
    continue;
  }
  let dir = a;
  if (/\.zip$/i.test(a)) {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'art-'));
    execFileSync('unzip', ['-q', '-o', a, '-d', dir]);
  }
  for (const f of walk(dir).sort()) {
    try {
      importFile(f);
    } catch (e) {
      // one broken file never sinks the batch
      const why = String(e.stderr || e.message).split('\n').find((l) => l.trim()) || 'unreadable';
      report.push(`FAILED ${path.relative(dir, f)} (${why.trim()})`);
      for (const d of ['fx', 'fx-s', 'holo', 'cards']) {
        const base = path.basename(f).replace(/\.(png|jpe?g|webp)$/i, '').replace(/_(legendary|epic|rare)_effect$/, '');
        const out = path.join(ART, d, base + '.webp');
        if (fs.existsSync(out) && fs.statSync(out).mtimeMs > Date.now() - 60000 && fs.statSync(out).size < 1024) fs.rmSync(out);
      }
    }
  }
}
// keep manifest lists in set order
const order = Object.keys(CARDS);
for (const k of ['cards', 'cutouts', 'immortal', 'immortalCutouts', 'fx', 'holo']) manifest[k].sort((x, y) => order.indexOf(x) - order.indexOf(y));
fs.writeFileSync(mf, JSON.stringify(manifest, null, 1));
console.log(report.join('\n'));
console.log(`manifest: ${manifest.cards.length}/120 cards, ${manifest.fx.length} effect layers, ${manifest.holo.length} mythic holo stacks, cardback ${manifest.cardback}, ${manifest.immortal.length} immortal, ${manifest.ui.length} ui`);
