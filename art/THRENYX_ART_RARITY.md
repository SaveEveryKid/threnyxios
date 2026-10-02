# THRENYX — rarity art (optional upgrades)

The game already makes rare cards look premium without new art: foil prints baked
from the delivered effect layers (`tools/bake-foil.py`), coded frames (gold
filigree for Legendary, a prismatic full-art rim for Mythic), collector lines and a
rarity-escalating pack reveal. The pieces below replace coded parts with painted
ones. Each is optional and can arrive in any order.

**Rules for every image**
- Flat, front-on, no perspective, no mock-up, no hands, no table, no shadow outside the image.
- No text, letters, numbers or logos unless the prompt asks for them.
- Transparent background where the prompt says PNG with transparency.
- Deliver as PNG, named exactly as listed.

---

## 1. Legendary frame overlay — `frame_legendary.png`

PNG with transparency, 1000×1400 px (5:7 portrait).

> An ornate engraved gold trading-card frame, front-on and perfectly flat, on a fully transparent background. Dark-fantasy gothic style: antique gold with deep engraved lines, worn edges and a subtle warm sheen. The border is thin along the sides (about 4% of the width) and swells into rich filigree in all four corners: curling thorned scrollwork and small cathedral-arch motifs, mirrored left and right. The entire centre is empty and fully transparent, a clean rounded-rectangle window, so a painting shows through. No gems, no text, no creatures, no figures. Even studio lighting from the upper left. Crisp detail that still reads at a small size.

## 2. Mythic frame rim — `frame_mythic.png`

PNG with transparency, 1000×1400 px (5:7 portrait).

> A very thin prismatic holographic trading-card rim, front-on and perfectly flat, on a fully transparent background. The rim is only about 1.5% of the card width: a fine band of iridescent foil whose colours run through rose, gold, mint, sky blue and violet, with tiny sparkles. At the top centre and bottom centre, a small, elegant prismatic crystal clasp. The whole centre is empty and fully transparent, a rounded rectangle, so a full-bleed painting shows edge to edge. No text, no figures. Clean, luxurious, minimal.

## 3. Legendary card back (reveal) — `cardback_legendary.png`

PNG, 1000×1400 px (5:7 portrait). Shown before a Legendary is flipped in a pack.

> The THRENYX card back reimagined in gold: a dark obsidian card back with an intricate gold filigree border and a central eight-pointed gilded star emblem, now glowing from within as if molten gold were seeping through hairline cracks in the obsidian. Warm golden light leaks from the cracks and the emblem. Front-on, perfectly flat, edge to edge, no perspective, no text. Dark-fantasy, premium, ominous.

## 4. Mythic card back (reveal) — `cardback_mythic.png`

PNG, 1000×1400 px (5:7 portrait). Shown before a Mythic is flipped.

> The THRENYX card back cracking open with prismatic light: a dark obsidian card back with an ornate border and a central eight-pointed star emblem, split by bright fractures through which pure iridescent light pours out, white at the core and rainbow-edged (rose, gold, mint, cyan, violet). Small shards lift slightly from the surface. Front-on, perfectly flat, edge to edge, no perspective, no text. Breathtaking, rare, almost holy.

---

**After delivery:** I wire the frames in as one shared image per rarity, so the phone
loads each once and reuses it for every card, and the two backs into the pack
reveal. If new card paintings or effect layers arrive later, run
`python3 tools/bake-foil.py` (or `python3 tools/bake-foil.py <card-id>`) to bake
their foil prints.
