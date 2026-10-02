# PHASES 7–8 — THE CLIENT (Playable Core + Collection)

> Status: **built and playable offline**; the live service (PvP, trading between players, Alliances, World Boss) is Phase 9–10 and needs a server.
> Run: `cd game && npx http-server . -p 8080` → open `http://localhost:8080/client/` on a phone (or a phone-sized window).

---

## 1. Architecture

| Layer | What | Where |
|---|---|---|
| **Engine** (shared) | rules, ability DSL, 120 cards, AI, collection, modes | `game/engine/` |
| **Client** | zero-build ES modules, no framework, no bundle step | `game/client/` |
| **AI** | Expert/Novice agents in a **Web Worker** (UI never blocks on the equilibrium solver) | `client/js/core/ai-worker.js` |
| **Save** | one JSON blob in `localStorage` (the game still runs if storage is blocked) | `client/js/core/store.js` |
| **Audio** | fully synthesized WebAudio: bells, choir pads, impacts, **the Hush** | `client/js/core/audio.js` |
| **Art** | placeholder system now; painted art drops in via `client/art/manifest.json` | `client/js/art/` |

The same engine that ran the balance simulations runs the game, so the balance numbers describe the game you play.

## 2. Screens

| Screen | Purpose |
|---|---|
| **Home** | Answers *"what should I do right now?"* with one primary action (first pack → story → free packs → Daily Read → Battle), plus six calm tiles, today's objectives and the Firstfall Claims |
| **The Reckoning** (battle) | Full-screen, three lanes a side. **Deploy:** tap a hand card, tap a glowing lane (two in round 1), tap a pending card to take it back. **Command:** an Order picker under each of your Champions shows its Power for each Order; Focus (tap it, then a Champion) and READ (tap it, then an enemy facing one of yours, then call its Order). Lock → the Hush beat → every Order badge slams in → **READ ✓ / MISREAD** → the lanes resolve one by one (see §3). Health bars with ghost drain, Shield chips, forbidden-Order stamps, silenced marks and buff tags live on each lane. Long-press any card to inspect it; the Octave sheet shows both Octaves with status (In Play, Fallen, In Hand when revealed). Tap the field to speed up playback |
| **Battle hub** | Ladder (7 tiers, Notes, bonus Note for clutch wins), your Octave, the weekly Anomaly, Rivals, Draft, Story |
| **Packs** | The shelf, published odds, your pity counters, and the **opening ceremony** |
| **The Vault** | Faction pages with silhouettes for missing cards and completion counts; card detail with **Legacy**, Ascend, Burn, Craft; *Burn spares* (safe by design) |
| **Octave builder** | Pick 8 unique Champions; live faction and trait counts and **active Bonds** |
| **Story** | 10 Firstfall chapters: illustrated scenes plus a Story Clash each |
| **Daily Read** | Today's shared board position: give every Champion an Order (plus Focus/READ), lock, then see your score, the best possible answer and how you ranked against the field; streak, share |
| **Draft** | 18 face-up, ban, snake draft vs the AI drafter (synergy- and denial-aware), then fight |
| **Rivals** | Head-to-head history, streaks, READs landed, Deciders, instant rematch. No tendency stats, by design |
| **Codex** | In-world documents that disagree, unlocked by story progress |
| **More** | Profile name, stats, sound/haptics, reset |

## 3. Impact: how a round plays out on screen
Everything that happens in the engine is emitted as an event, and the battle screen stages it beat by beat (`client/js/screens/battle.js`, `client/css/battle.css`):
1. **Both locked:** the screen dims and desaturates (the Hush) and a low swell plays.
2. **Orders reveal:** every Champion's Order badge slams in with a thud; Focus is ringed in gold.
3. **The READ:** **READ ✓** is a white flash, huge typography collapsing from 3×, two expanding rings, a resolving three-bell chord with choir, and the haptic `12-40-60`; the called Order's badge shatters. **MISREAD** is a chromatic-split glitch and a detuned bell pair.
4. **Lane by lane, left to right**, the lane is spotlit and:
   - **STRIKE / riposte:** the attacker lunges into the enemy lane; on impact the target whites out and shakes, a slash streaks across it, a damage number pops (bigger for 6+), the health bar drops instantly while a pale **ghost bar** drains after it, the screen shakes in proportion to the damage, and an impact thud scales with it.
   - **SCHEME / an unopposed attack:** a violet (or red) **bolt** flies from the Champion into the enemy **Voice** meter, which flashes red, and its number punches down.
   - **Overkill** fires a second bolt from the fallen Champion into the Voice.
   - **GUARD:** a blue shield bursts over the Champion and its Shield chip pops.
   - **Beaten Orders** crack and the Champion recoils.
5. **Falls:** the Champion whites out, greys, tilts and drops out of its lane to a funeral bell.
6. **Abilities** announce themselves on their Champion ("Imperial Decree", "The Last Ember · Last Words") before their effects play: buffs float up in green, forbidden Orders stamp onto the target, silenced Champions grey out, lanes slide when a Champion moves, revealed hand cards turn face-up.
7. **Low Voice** (10 or less) turns the meter red and pulses it.

## 4. The pack-opening ceremony
1. **Hold to open:** a charge ring fills over 0.85 s, the pack trembles, haptic ticks.
2. **Tear:** noise sweep, burst of light, the pack flies apart.
3. **Cards arrive face-down one at a time, lowest rarity first.** Before each flip, the card's edge **glows its rarity** and **hums its rarity's pitch**: silver for Rare, violet for Epic, a pulsing gold for Legendary. You know before you know.
4. **Mythic / Immortal:** tapping triggers **the Hush**. All sound cuts out, the screen goes black for 0.95 s, one deep haptic, then three rings burst, the card flips, a low bell and choir, and **MYTHIC** in letters.
5. **Summary:** NEW tags, duplicate counts, tap any card to inspect it. *Open another* appears only after the celebration, and only if you already own more packs. There is no store prompt.

## 5. Onboarding (forced training, tested headless by `tools/tutorial.mjs`)
| Step | What happens |
|---|---|
| Launch | The router sends every screen to **Training** until it is finished; the nav bar and top bar are hidden |
| Lessons I–V | Strike, Guard, Scheme, Focus, READ. Each lesson's scene, then its Champions flip in with their bios, then a short scripted Clash the lesson's rule wins |
| Lesson VI | Build your first Octave from the 16 you earned (or tap Suggest), then a full-rules Clash against Marrow |
| After | +2 Pack Tickets, home screen, everything open. The Story chapters are now story, not tutorial |

## 6. Performance decisions
- The AI runs off the main thread. Solving a Command takes 3–10 ms and a Deploy ~30–100 ms in the worker.
- Card art in grids and hands is **rasterised once** to cached WebP thumbnails. Large views use the source image.
- Animation is transform- and opacity-only, and `prefers-reduced-motion` disables the looping effects.
- Battle playback is presentation only: the engine resolves the whole round first, the screen plays the event list against the pre-round board, then redraws from the true state, so animation can never desync the rules.
- There's no framework and no bundle; each screen is lazy-loaded on first visit.

## 7. What is simulated vs live
| System | Status in this build |
|---|---|
| Ranked | **Ladder vs AI personas** (7 personas with human-like habits you can learn). Real PvP matchmaking needs the server |
| Rivals | Implemented against personas |
| Daily Read | Real deterministic scenario; the "world split" is **projected** from a simulated population until the live service exists (labelled in the UI) |
| Trading | Engine, safeguards and Legacy transfer implemented and tested (`test/collection.test.js`). The client UI needs a second human, so it ships with the server |
| Alliances, Alliance Wars, World Boss, Event pools | Designed (`docs/08`, `docs/09`); server-side |

## 8. Quality gates

**Playable core (Phase 7): PASS.** Full matches are playable end to end on a 390×844 phone viewport with zero console errors (`tools/play.mjs`). The battle is fast (~15–20 s per Clash including presentation), dramatic, and every rule is visible at the moment it matters.

**Collection (Phase 8): PASS.** Packs use the real engine with published odds and visible pity. The Vault shows completion, silhouettes and Legacy. Duplicates → Ascension/Embers; crafting works. The economy is proven in `docs/06`.

**UX proof gate: PASS (headless), human test pending.** A new player opens a pack, sees rarity through frame, gem, glow and sound, plays a match, and learns Champion selection and the three Orders before Focus or READ exist. Human first-time-user testing is the next step and can't be simulated.

## 9. Premium motion (locked requirement)

**Foil under a moving light.** The phone is the light source: its tilt (relative to however the player holds it) is written once per frame to `:root` as `--gx/--gy/--gm`, and every card on screen reads it. The painting never moves. Only the light does:

| Rarity | Under tilt |
|---|---|
| Common | Nothing moves |
| Rare | A soft silver/blue band slides across the card's painted sheen layer and brightens with the angle |
| Epic | A wider violet/cyan band; the aura and ripples drift and swell with the tilt |
| Legendary | A narrow gold sweep that flares on tilt, plus a gold highlight crossing the frame |
| Mythic | Rainbow foil whose hue turns with the angle, sound ripples that drift and swell, glints that fire only inside the light band, and the tilt rainbow limited by the card's own holo mask |

The band runs opposite to the tilt (the light stays put in the room), its angle turns with the tilt, and brightness, sparkle and hue all scale with how far the phone is tipped. Held still, the layers rest at a low glow and timed sweeps stop while the sensors are live. iOS grants motion access only from a tap: the first tap anywhere asks. Showcase cards also answer a finger drag, which is the fallback wherever sensors are blocked. Collection grids stay still so a 120-card Vault never repaints on every tilt.

> **Premium cards must support device-orientation-reactive presentation. Mythic and Immortal cards use phone tilt to drive parallax depth, foil reflection, lighting, particles and selective environmental movement. The effect must stay subtle enough to feel physical rather than gimmicky, run at 60 FPS on supported phones, and fall back to touch/pointer movement when motion sensors are unavailable.**

The goal is the feeling of holding a real premium card. The card itself hardly moves: **the light moves.**

### 9.1 Tiers
| Tier | Cards | Phone motion | What reacts |
|---|---|---|---|
| Full | Mythic, Immortal | 100% | parallax art (and cutout figure), holo foil, glare, rim light, particles, environment |
| Light | Legendary, Foil, Alt Art | 60% | parallax art, glare, rim light (plus holo foil for Foil) |
| None | Common, Rare, Epic | — | pointer tilt only, as before |

Motion runs only on **showcase views** (inspect, the Vault, the pack reveal, trades). Hands and grids stay still, both for focus and for the frame budget.

### 9.2 How it feels physical (`client/js/core/motion.js`)
- **Relative, not absolute.** Tilt is measured against a baseline that slowly follows the player's grip (τ ≈ 3.2 s). Any comfortable hold is neutral, and only the small movements of the hand move the light. A full effect needs about 20° of movement.
- **Smoothing.** Raw sensor readings are low-passed (k = 0.35 per event). Each card has a critically damped spring (τ 0.10 s on the phone, 0.07 s under a finger, 0.22 s back to rest).
- **Only a little rotation.** From the phone, the card rotates at most 4°; a finger allows up to 14°. A real card moves *with* the hand, so what changes is the reflections, not the geometry.
- **Screen rotation** is honoured (portrait, landscape, upside-down).
- **No timed gimmicks while held.** On premium cards, the Legendary auto-sweep fades out and the Mythic pulse ring hides whenever the hand is driving the light.

### 9.3 Layers (back to front)
1. **Art** slides against the tilt (−0.3em). A **cutout** figure, when the final art has one, slides with it (+0.3em): true depth. Mythic cutouts break out above the frame.
2. **Holo foil**: a diamond lattice (the mask) over an oversized rainbow that slides with the tilt, so colour rolls across the foil like pressed chrome. It is kept off the Champion: with a cutout it follows the exact silhouette, without one a centred vignette. Full on Immortal and Foil; edge-only on Mythic.
3. **Environment** (selective movement): a high haze drifting through the sky over 38 s, and a faction-coloured light breathing at the horizon (5.5 s).
4. **Particles** (`client/js/ui/fx.js`, canvas): faction weather at three depths, with nearer motes sliding further. Crown embers, Quiet dust, Hourwright sparks, Margin ink, Vigil candle-motes. Immortals add glints that flare only when the light passes over them.
5. **Rim light**: a specular line around the frame, opposite the tilt. The Mythic prismatic frame also turns with the hand.
6. **Glare**: the room's light source, a soft-light reflection over the whole surface that moves opposite the tilt, plus a sharp foil streak on Foil, Mythic and Immortal.

### 9.4 Fallbacks
| Situation | Behaviour |
|---|---|
| Android, most browsers | Sensors start automatically, with no prompt |
| iOS | Asks for motion access once, from a tap on a showcase card or the Settings toggle, never mid-reveal |
| Denied, unsupported, desktop, or a sandboxed frame (e.g. the claude.ai artifact viewer) | Finger or pointer drives the same light |
| Sensor goes quiet (> 1 s) | Hands over to the pointer or rest; the next reading re-centres the baseline |
| `prefers-reduced-motion` | No sensor, no rotation, no particles, no environment loops |
| Settings → Card motion off | Pointer only |

### 9.5 Performance (`tools/motion.mjs`)
- Per frame, the controller writes 7 custom properties to one card. It skips the write entirely when the card has settled.
- Everything that moves is `transform` / `translate` / `opacity`. Gradients paint once and slide under masks.
- Particles: ≤ 28 pre-rendered sprites plus 16 glints on a canvas at ≤ 2× DPR. One shared `requestAnimationFrame` serves every card and stops when nothing is subscribed.
- Measured (headless Chromium, **software rendering, no GPU**, 390×844 @3×): one Immortal under continuous sensor sway holds **60 FPS**, p95 16.8 ms. Four premium cards at once hold about 54 FPS. Real phones composite on the GPU and have headroom.

### 9.6 What the final art must supply
For each Mythic and Immortal: the painting plus a **transparent cutout** of the Champion from the same image (already specified in `art/THRENYX_ART_PROMPTS.md`). The cutout gives true parallax depth, the breakout, and keeps the foil off the Champion. Without a cutout everything still works, with flatter depth.
