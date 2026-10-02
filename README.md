> **This repository is a copy of the live THRENYX game, made for building the iPhone app.** The live game (threnyxtcg.com) is built from a different repository and isn't affected by anything here. To build the app, start with [`RORK-IOS-PROMPT.md`](RORK-IOS-PROMPT.md).

# THRENYX

*A world that is a funeral song, still being sung.*

Threnyx is a mobile-first digital trading card game about reading the person across from you. Each player brings an **Octave** of eight Champions and fights a best-of-five series of simultaneous **Clashes**: choose a Champion, then an **Order** (Strike › Scheme › Guard › Strike), maybe spend **Focus**, maybe **READ** their Order. Season 1 is **FIRSTFALL**.

## Run it

```bash
cd game
npx http-server . -p 8080 -c-1
# open http://localhost:8080/client/ in a phone-sized window
npm test          # engine + collection tests
```

## What's here

| Path | Contents |
|---|---|
| `docs/01-game-bible.md` | Identity, Sacred Five, terminology, principles, monetization rules |
| `docs/02-combat.md` | The Clash rules, the parameter sweep and the combat proof gate |
| `docs/03-world-bible.md` | Threnyx: cosmology, history, factions, the central mystery, sealed truths |
| `docs/04-character-bible.md` | Flagship dossiers and the relationship web |
| `docs/06-collection-economy.md` | Packs, odds, pity, Embers, Ascension, Legacy, trading, store, and the Players A–E economy proof |
| `docs/07-balance.md` | The 120-card balance proof |
| `docs/08-modes-social.md` | Ranked, Draft, Anomaly, Daily Read, Rivals, Alliances, Wars, World Bosses, event pools, onboarding |
| `docs/09-season-firstfall.md` | The 10-week season: story, events, World Boss *The Rest*, Claims, Season Pass |
| `docs/10-client.md` | Client architecture, screens, the READ moment, the pack ceremony, gates |
| `docs/lore/` | Backstories for all 120 Champions and the Codex |
| `engine/` | Rules, ability DSL, cards, AI (exact equilibrium solver), collection, modes |
| `sim/` | Simulation harness, tuner, proof suite, economy sim |
| `client/` | The game |
| `art/THRENYX_ART_PROMPTS.md` | Art production prompts (art comes last) |
