# THRENYX — Oktober Tournament Art (drop-in batch)

> The art for the October tournament and its one-of-one prize card. The working name is "Oktoberfest"; nothing below contains lettering, so the art works with any final name.
> Generate every image, save each at its exact path, then zip the `threnyx-art/` folder as **threnyx-art-oktober.zip**.
> **12 required images + 2 optional.**

## ⚠ Retakes after the first pass (do these first)
The first pass got the look right. Keep A1 (the Eighth Bell card), A3 (foil) and the hall's mood exactly as they are. These need redoing:

- **Every file must be a separate PNG at its exact size.** Do not send a collage or contact sheet.
- **Real transparency only.** A2, A4 and A5 came back with a grey checkerboard painted into the image. The background must be actual alpha (empty pixels), not a picture of a checkerboard.
- **A2 (effect layer):** paint ONLY the sparks, ash-leaves, bell-crack glow and candle flicker. **Do not include the woman or the bell**: everything except the effect is transparent.
- **A4 (ripples):** rings only, centred on the **crack in the bell** from A1 (about 60% down, centre). No crosshair lines.
- **A5 (glints):** place the glints on A1's actual armour edges, bell rim and candle crown, not spread evenly.
- **A6 (mask):** this is a stencil, not a black-and-white copy of the painting. **Her face, hair and skin must be pure black.** Armour, bell, candle crown and moon are white. The background is black.
- **A1 (small fix, optional):** darken and simplify the lower 45% (the bell), because the card's name and stats sit there.
- **B7 (hall):** came back landscape. It must be **portrait, 1080x1920**: same hall, same bell, composed tall.
- **B8 (finals floor):** **top-down, looking straight down at the floor**, with three gold lanes running top to bottom. **No bracket, boxes or frames**: the game draws the bracket itself.
- **B9 (banner):** the bell on the right third, small duelist silhouettes facing it, and **the left 55% dark and empty**. No crowd, no central figure.
- **C10 (card back):** **flat, front-on, a single card filling the whole canvas**, perfectly symmetrical. Not a stack and not at an angle.
- **C11 (pack):** a **foil wrapper pack** (a flat sealed bag with crimped ends), standing upright. Not a box.
- **C12 (badges):** missing. Two flat emblems on transparency: a gold bell with a crown of eight flames (left), and a bronze bell with no crown (right).
- **D13/D14 (optional):** D13 has the herald on the **right** half with the left half dark; D14 is a **face-down card on black velvet** with gold light at its edges, not a crowd scene.

## Rules for every image
- **Style:** painterly dark-fantasy oil painting, museum-grade. Deep chiaroscuro, a strong rim light, visible brushwork, fine painted grain. Faint concentric sound-ripples move through the air from the main light (Threnyx is a world made of sound).
- **No text of any kind:** no letters, numbers, logos, signatures, watermarks, UI or frames.
- **Format:** PNG at the exact size given. Keep file names exactly as written (case-sensitive).
- **The October look:** this event is the Thirteenth Toll of the year's end. Late-autumn night, burnished bronze and old gold, deep wine-red and black, falling leaves that turn to ash and gold sparks as they fall, a low harvest moon. Keep it dark fantasy: **no beer, steins, pretzels, pumpkins, bunting or festival kitsch.**
- **Faction looks** (for anything showing the five factions together):
  - **Crown:** obsidian glass, bone-white cloth, ember light, falling ash.
  - **Quiet:** black stone, cold silver, clapperless bells, moonlight.
  - **Hourwrights:** verdigris brass, clockwork, amber gas-light, bell-jars of glowing hours.
  - **Margin:** scaffolds over white fog, violet lamps, rags, half-erased people.
  - **Vigil:** white and gold, candles, lanterns, sleepless eyes, choirs.

---

## A. The one-of-one prize card — "The Eighth Bell" (6 required)

**Who she is.** In the old calendar October was the eighth month, and every Threnyx deck is an Octave of eight. The Eighth Bell is the bell that rings only once, for the one duelist who outlasts everyone. She is a tall, ageless herald, with armour forged from pieces taken from all five factions:
- a black-glass Crown pauldron with ember light in its cracks;
- a cold silver Quiet gorget hung with a tiny clapperless bell;
- a verdigris Hourwright gauntlet whose clockwork glows amber;
- a Margin cloak whose hem dissolves into half-erased ink lines;
- a Vigil crown of eight small candle flames.

Her face is calm, severe and dignified, with bronze-gold eyes. Both hands rest on the rim of a great bronze bell at her feet, as tall as her waist. The bell is cracked once down its side, with molten gold light inside the crack. Behind her is a low harvest moon in a wine-dark sky, and autumn leaves turning to gold sparks and ash as they fall around her.

**This exact character must be identical in every file in section A.** A1 is the master. A2 to A6 are layers painted to sit exactly on top of A1, at the same size and position.

1. `cards/eighthBell.png`: **1024x1536.** The card art.
   - Her face sits between 12% and 50% of the height, near the horizontal centre.
   - Keep 90px clear at the top: no candle flames touching the edge.
   - Keep the top-left and top-right 160x160px corners free of her face (badges sit there).
   - The lower 45% (the bell, cloak and ground) stays darker and simpler, because the card's name and stats cover it.
   - Full bleed, with no border.
   - This should be the single most beautiful painting in the game.
2. `rarity_effect_layers/eighthBell/eighthBell_unique_effect.png`: **1024x1536, transparent.** A living effect over the art: slow gold sparks and ash-leaves drifting down, a soft halo of light pulsing from the bell's crack, and the eight candle flames flickering. Only the effect is painted; everything else is fully transparent.
3. `mythic_holo_layers/eighthBell/eighthBell_foil_rainbow.png`: **1024x1536.** A rainbow-foil sheen in bronze, gold and wine-red bands, flowing diagonally. The game blends it over the art.
4. `mythic_holo_layers/eighthBell/eighthBell_sound_ripples.png`: **1024x1536, transparent.** Fine gold concentric rings radiating from the bell's crack across the whole card, thin and elegant.
5. `mythic_holo_layers/eighthBell/eighthBell_specular_glints.png`: **1024x1536, transparent.** Sharp white-gold star glints placed on her armour edges, the bell rim and the candle flames: about 25 small points, no large flares.
6. `mythic_holo_layers/eighthBell/eighthBell_holo_mask.png`: **1024x1536, grayscale.** White where the foil should shine (her armour, the bell, the candle crown, the moon), black on her face, skin and the dark background, and greys in between.

---

## B. Tournament screens (3 required)

7. `ui/oktober.png`: **1080x1920.** The tournament hall screen background.
   - A great black-stone hall at night, open on one side to a low harvest moon.
   - Banners of the five factions hang along the walls: plain cloth in their colours, with no symbols that look like letters.
   - At the far end, on a dais, the great cracked bronze bell from section A hangs alone, with gold light in its crack. **Nobody stands beside it**, because no one has won it yet.
   - Autumn leaves drift in through the arches.
   - Keep the top 12% and bottom 25% dark and plain, and keep the middle calm, because the leaderboard sits over it.
8. `ui/oktober-finals.png`: **1080x1920, top-down.** The finals duelling floor.
   - A round bronze-and-black-stone arena floor seen from directly above, with three long gold-inlaid lanes running top to bottom and a thin gold line across the middle.
   - Autumn leaves and gold sparks are scattered across the stone, and a ring of candles marks the outer edge.
   - **No people.** Keep it calm, because cards are laid over it.
9. `ui/oktober-banner.png`: **1536x640, landscape.** The home-screen event banner.
   - The cracked bronze bell on the right third, lit gold from inside its crack. Five duelists stand in silhouette on the left, one per faction look, facing it.
   - Harvest moon and falling gold leaves.
   - **Keep the left 55% dark and simple**, because the game writes the event name and countdown there.

---

## C. Rewards (4 required)

10. `cardback/oktober.png`: **1024x1536.** The Finalist card back, given only to the top 8.
    - Perfectly symmetrical, left to right and top to bottom, like an antique engraved object.
    - Deep wine-red lacquer with fine engraved bronze-gold linework.
    - In the exact centre, a circular emblem: a cracked bell with gold light in the crack, inside concentric rings, surrounded by eight small gold stars.
    - Autumn-leaf filigree in all four corners, and a thin double gold border inset 60px from the edge.
    - Keep all ornament at least 70px from the top and bottom edges, because the game crops about 50px off each.
11. `packs/oktober.png`: **1024x1536.** The commemorative pack, given to everyone who takes part.
    - A sealed foil card pack, centred and upright, about 70% of the height, with crimped seals top and bottom and realistic foil reflections.
    - Wine-red and bronze foil showing the cracked bell under a harvest moon, with falling gold leaves.
    - On pure black with a soft spotlight.
12. `icon/oktober-badges.png`: **1024x512, transparent.** Two emblems side by side, each centred in its own 512x512 half. Embossed metal, with strong silhouettes that read at 40px.
    - **Left, "Champion":** the cracked bell in solid gold with a small crown of eight flames above it.
    - **Right, "Finalist":** the same bell in bronze, with no crown.

---

## D. OPTIONAL — Promotion (2)
For announcing the tournament online. Text is added afterwards, so leave room.

13. `promo/oktober-share.png`: **1200x630.** The link-preview image.
    - The Eighth Bell from A1, from the waist up, on the right half, lit gold.
    - **Keep the left 50% dark, wine-red and plain** for the title text.
14. `promo/oktober-reveal.png`: **1080x1350.** A teaser post.
    - The A1 card seen face-down on black velvet, with only its silhouette and a seam of gold light escaping around its edges.
    - The bell's sound-rings ripple across the velvet, and a single autumn leaf rests beside it.
    - Keep the top 20% dark for text.

---

## Packaging
```
threnyx-art/
  cards/eighthBell.png
  rarity_effect_layers/eighthBell/eighthBell_unique_effect.png
  mythic_holo_layers/eighthBell/eighthBell_foil_rainbow.png
  mythic_holo_layers/eighthBell/eighthBell_sound_ripples.png
  mythic_holo_layers/eighthBell/eighthBell_specular_glints.png
  mythic_holo_layers/eighthBell/eighthBell_holo_mask.png
  ui/oktober.png
  ui/oktober-finals.png
  ui/oktober-banner.png
  cardback/oktober.png
  packs/oktober.png
  icon/oktober-badges.png
  promo/oktober-share.png        (optional)
  promo/oktober-reveal.png       (optional)
```
Zip it as **threnyx-art-oktober.zip** and send it over. The game converts and wires everything in.
