// Placeholder art (until the painted set lands): faction atmosphere + the
// faction scene + resonance rings + a large monogram. Consistent across all
// 120 cards so the set reads as one system while art is in production.
import { W, H, PALETTE, svg, nid, artRng, sky, rings, vignette, particles, grainFilter, blurFilter, glowFilter, mix } from './kit.js';
import { SCENES } from './scenes.js';

const PARTICLE = { crown: 'ash', quiet: 'note', hour: 'spark', margin: 'scrap', vigil: 'spark' };

export function placeholderSVG(card) {
  const pal = PALETTE[card.faction];
  const rand = artRng(card.id);
  const lx = 120 + rand() * 160;
  const ly = 110 + rand() * 60;
  const sk = sky(pal, { lx, ly, r: 280 });
  const fb = nid('fb');
  const gl = nid('gl');
  const vg = vignette(nid('vg'), card.faction === 'margin' ? 0.45 : 0.85, card.faction === 'margin' ? '#3a3226' : '#000');
  const gr = nid('gr');
  const word = card.name.replace(/^(The|Sir|Dame|Lady|Captain|Brother|Sister|Old|Arbiter|Novice|Foreman|Countess|Cantor|Zealot|Saint|High Cantor|Ser)\s+/i, '');
  const letter = word[0].toUpperCase();
  const ink = card.faction === 'margin' ? pal.ink : pal.glow;
  let body = sk.body;
  body += rings(lx, ly, pal.glow, { n: 9, r0: 26, step: 30, op: 0.3 });
  body += SCENES[card.faction](pal, rand);
  body += `<ellipse cx="200" cy="520" rx="380" ry="70" fill="${pal.mist}" opacity="${card.faction === 'margin' ? 0.7 : 0.35}" filter="url(#${fb})"/>`;
  body += `<text x="200" y="300" text-anchor="middle" font-family="Cormorant, Georgia, serif" font-weight="700" font-size="250" fill="${mix(pal.ink, ink, 0.1)}" stroke="${ink}" stroke-width="2" stroke-opacity="0.8" filter="url(#${gl})" opacity="0.9">${letter}</text>`;
  body += particles(rand, PARTICLE[card.faction], card.faction === 'margin' ? '#1a1622' : pal.particle, 70, { size: 1.1 });
  body += vg.body;
  body += `<rect width="${W}" height="${H}" filter="url(#${gr})" opacity="0.14"/>`;
  return svg(body, { defs: sk.defs + blurFilter(fb, 18) + glowFilter(gl, 6) + vg.defs + grainFilter(gr, 0.9, 5) });
}
