# PROVING THE 120 IN THE RECKONING

> Status: **LOCKED** (gate at bottom). Combat rules: `docs/02-combat.md`.
> Reproduce: `node sim/rtune.js 16000 <seed>` (per-card Octave win rate; `--apply` nudges outliers) · `node sim/rproof.js` (factions, archetypes, skill, flow, spending) · `node sim/economy.js` first for the spending Octaves · `node sim/reckon.js` (vanilla prototype metrics) · `node sim/aitune.js` (AI weight search).
> **Rules at this proof:** 7 rounds, Voice 30, lane ground (terrain), Last Stand (+2 at 10 Voice or less, both sides in the final round; misreads cost double), one Ultimate per match (charged after 3 rounds: +1 Power, can't be beaten or read), counter-deploy (the side without Initiative places face up first). The per-card table (2.1) is from the 9-round rules; everything else was re-run on the current rules.
> Raw results: `sim/cache/rtune-*.json`, `sim/cache/rproof.json`. The first combat system's proofs (v1–v5) are in git history.

---

## 1. Method

Every balance match is **Expert vs Expert** (`engine/battle-ai.js`): exact mixed-strategy lane games solved by LP, deploys solved as a small game over the resulting boards with On Reveal effects simulated, opponent modelling. It runs the same engine the game runs. Its value weights were tuned by self-play until no variant beat the default.

| Test | Measures | Size |
|---|---|---|
| Random Octaves | each card's **Octave win rate** in random 8-of-120 Octaves | 16,000 matches (~2,100 appearances per card) |
| Mono-faction | the 5 factions as random 8-of-24 Octaves, round robin | 6,000 |
| Archetypes | 12 synergy Octaves, round robin | 13,200 |
| Skill | Expert / Novice / Greedy / Random | 1,600 per pairing |
| Flow | rounds, falls, hits, Orders, Focus, READ, comebacks | 6,000 |
| Spending | best buildable Octaves of Players A–E (economy sim), 6 players per tier | 2,400 per pairing |

## 2. Results

### 2.1 Per card
- Spread **1.63** SD against **1.08** of pure sampling noise: the real imbalance is about ±1.2 points.
- **115 of 120** within 47–53%. Just outside: Lysander 47.0, Teodor 47.0, Aldous 47.0 (and Gideon 47.8, a Machine-synergy card measured outside its deck, as intended).
- By rarity: Common 50.0 · Rare 49.8 · Epic 49.8 · Legendary 50.8 · Mythic 50.5. **Rarity is not power.**
- By faction (random Octaves): 49.5–50.4.

### 2.2 Mono-faction Octaves
| Ashen Crown | Quiet | Hourwrights | Margin | Vigil |
|---|---|---|---|---|
| 49.3 | 49.3 | 53.0 | 48.0 | 50.4 |

### 2.3 Archetypes (round robin)
| Octave | Win rate |
|---|---|
| Children | 56.3 |
| Readers | 55.1 |
| Focus engine | 54.8 |
| Tricksters (forbid / move / bluff) | 53.4 |
| Knights (shield wall) | 51.1 |
| Sustain (Voice healing) | 50.4 |
| Silencers | 49.5 |
| Unsung (Hollow King) | 47.8 |
| Sleepless (late game) | 47.2 |
| Last Words | 44.9 |
| Machines | 44.9 |
| Aggro strikers | 44.6 |

Every archetype sits between 44.6% and 56.3%, so no deck dominates and every deck has good and bad matchups. The new rules moved the thinking decks up (Tricksters 45.5 → 53.4, Focus engine 50.6 → 54.8: counter-deploy and Last Stand reward timing) and the brute decks down (Aggro 48.1 → 44.6, Sleepless 53.0 → 47.2: shorter matches leave less late game). Watch Children and Aggro in human play.

### 2.4 Skill
| Matchup | Win rate |
|---|---|
| Expert vs Novice | **91.9%** |
| Expert vs Greedy | 91.6% |
| Expert vs Random | 99.1% |
| Novice vs Random | 82.3% |
| Expert (exploit 0.7) vs Novice | 94.3% |

The Reckoning has far more decisions per match than the first system (Expert vs Novice was 78.8%): every round is a deploy plus one Order per Champion, plus Focus and READ timing. Exploiting a predictable player is worth another ~5 points, which is what the ladder personas' habits are for.

### 2.5 Flow (expert mirror)
| Metric | Value |
|---|---|
| Rounds per match | 5.34 of 7 (about 2 minutes; under 1.5 in fast mode) |
| Ended by silence (Voice 0) | 82.9% |
| Champions fallen per match | 5.9 |
| Champion hits per round | 2.1 |
| Voice damage per round | 10.2 |
| Orders used (Strike / Guard / Scheme) | 42 / 27 / 31% |
| Focus used per player | 3.0 of 3 |
| READs per player / hit rate | 1.15 / 51% |
| Won from 6+ Voice down after round 3 | 22.4% |

A first cut of the new rules (Last Stand for both sides from 10 Voice, +2 Ultimates) ended matches in 3.8 rounds; Last Stand became a comeback for the side that is behind, and Ultimates +1 after a 3-round charge.

### 2.6 Does spending predict winning?
| Matchup | Lower spender's win rate |
|---|---|
| A (free, 15 min/day) vs E (heavy), week 1 | 49.0% |
| A vs E, week 2 | 50.8% |
| A vs E, week 4 | 50.1% |
| B (free, 1 h/day) vs E, week 2 | 50.2% |
| C (~$10/mo) vs D (~$25/mo), week 2 | 50.3% |

A heavy spender has no measurable edge, even in a free player's first week. **Money doesn't buy wins.**

### 2.7 The Long Road (single player)
Expert player against the road's opponents (persona skill mixes Expert and Novice play, as in the game), 200 matches each:

| Stop | Player win rate |
|---|---|
| Stop 1 duel (Marrow), no relics | 74.5% |
| Stop 5 duel (Tallow-Jack), 2 relics | 76.0% |
| Stop 6 Champion Duel (Oren Halewright), 2 relics | 55.0% |
| The Archivist, 3 relics and 4 upgrades | 40.0% |
| The Archivist, no relics | 17.5% |

The build matters: relics and upgrades more than double the boss win rate. With three lives and boss retries, a good player clears in about half their runs.

### 2.8 The Daily Puzzle
Every day's puzzle is solved exhaustively (all of the player's Commands against the shown enemy Command): 1–4 winning lines out of 27–108, never the obvious one (beat every lane), built in under 1.5 s on a phone.

## 3. What the proofs caught

| # | Finding | Fix |
|---|---|---|
| 1 | Attacks into an empty lane never reached the Voice (an engine bug caught by `test/battle.test.js`) | fixed; every number above is from the corrected engine |
| 2 | Voice 24: matches too short to play an Octave | Voice 30 |
| 3 | +1 Guard was worth nothing (a flat mend) | GUARD raises a Shield equal to its Power |
| 4 | READ on unopposed Champions landed 80% of the time | READ only in contested lanes |
| 5 | The AI over-valued Champion health and Guard vs Voice (self-play tuning) | weights tuned until no variant wins |
| 6 | Random-Octave tuning ignores Bonds: Dask, Tamsk and Machines were raised to Strike 7, then dominated their own decks (Unsung 65%, Machines 61%, Knights 57%) | walls back to wall stats, Bonds +2 → +1, Knight/Machine/Unsung auras only on GUARD |
| 7 | All-fragile decks collapsed (Last Words 36%, Tricksters 41%, Focus engine 44%) | +1 health on the Crown martyrs, bigger Last Words (Ember 4, Cassius 3), bluff bonus +3, bigger Focus payoffs |
| 8 | New pace rules as first drafted ended matches in 3.8 rounds | Last Stand only for the side behind (both in the final round), Ultimates +1 after 3 rounds, Voice 30 |
| 9 | A daily "win against any answer" puzzle almost never exists: the Order triangle lets the defender blank any lane | the puzzle shows their Command and asks for the exact finishing line |

## 4. Gate

| Requirement | Result |
|---|---|
| No Order dominates | ✔ 42 / 27 / 31%. Guard is the least used but the reason is structural (it only riposts a Strike), and Guard-heavy decks (Knights, Machines) are viable |
| No archetype dominates | ✔ 12 archetypes within 44.6–56.3%; 5 factions within 48.0–53.0% |
| Rarity ≠ strength | ✔ 49.8–50.8% across rarities |
| READ useful, not mandatory | ✔ about 1.15 per player per match, lands 51% |
| Skill matters | ✔ Expert 92% vs Novice |
| Spending doesn't predict winning | ✔ within 1 point from day one |
| Impact | ✔ ~2 Champion hits and 10 Voice damage every round; 5.9 falls per match; 83% end with a Voice going silent |
| Matches in target length | ✔ 5.3 of 7 rounds; 22% comebacks from 6+ down |

**Gate: PASSED.** Next signal: **human play**, now measured by the on-device playtest log (More → Playtest report): win and comeback rates, quit rate, Order mix and per-opponent results. Watch Children, Readers and Aggro, and whether players learn the rivals' habits and tells.
