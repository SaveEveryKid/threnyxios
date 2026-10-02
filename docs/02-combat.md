# COMBAT: THE DUEL

> Engine: `engine/duel.js`. AI: `engine/duel-ai.js`. Per-card Duel tuning: `engine/data/duel-tune.js` (written by `node sim/duel.js --tune N`). Sim: `sim/duel.js`. Tests: `test/duel.test.js`. Training proof: `sim/tutorial-proof.js`. Screen: `client/js/screens/duel.js`.
> The Duel replaces the Reckoning (three lanes, hidden Orders, simultaneous reveal). Players found the Reckoning slow and guessy: most of each round was a blind guess, and a match took 8+ minutes. The Duel is **open information**: every decision is made with everything on the table, matches take about 3 minutes, and the sequencing of your Champions is the skill. The Reckoning engine (`engine/battle.js`) is still used by online PvP until the server switches over.

## 1. The rules (player-facing)

**Setup.** Each player brings an **Octave** of 8 Champions. Shuffle; draw a hand of **3** (both hands are **face up**); the rest is your **Reserve**. Each player has **20 Voice**, **2 Focus** and **1 READ**. Who Leads first is random.

**A duel.** Up to **8** duels a match.
1. The **Lead** sends one Champion from hand.
2. The **Answer** sees it and sends one of theirs (adding **Focus +2** now if they want).
3. The Lead may add **Focus +2** last, and may spend its **READ** to switch its Champion for another in hand.
4. **Clash.** Lead power = **Strike** (+ abilities, Focus). Answer power = **Guard** (+ abilities, Focus). Higher wins.
   - The loser's Champion takes **margin + 1** damage (minus shields); a Champion at 0 health **Falls** and the extra spills into the Voice.
   - The winner's **Wound** hits the loser's **Voice**. (Wound is the card stat once called Scheme; it is still `scheme` in the code.) **The final duel counts double.**
   - A tie: both Champions take 1.
5. Survivors go to the bottom of the Reserve; both draw back to 3.
6. **Whoever lost the duel Leads the next one** (the stronger seat goes to whoever is behind).

**Winning.** A Voice at 0, or the higher Voice after duel 8.

**What the screen tells you.** The numbers only: your Strike against each of their Guards (abilities, Bonds and Focus included), never who will win. The opponent's unused Focus and READ glow when they could still use them on your pick. After the reveal a stamp says how it went: *Good read!*, *Crushed!*, *Blocked!*, *Hit!*, *Punished.*, *Read you.*, *Stand-off.* AI opponents talk when they Focus, switch, win big or are cornered, and a Lead that out-muscles your whole hand lands with a slam.

## 2. Why these rules (sim evidence, `node sim/duel.js`)

| Measure | Result | Target |
|---|---|---|
| Length | 7.8 duels ≈ 3.3 min | 3–4 min |
| First Lead wins | ~52–55% | ≤ 55% |
| Lead wins its duel | ~55% | close to 50% |
| Comeback from 5+ down after duel 4 | ~18% | 15–25% |
| Reach the final duel | ~87% | high |
| Final duel flips the leader | ~23% | 15–30% |
| Expert vs greedy "biggest number" | ~80% | skill matters |

Design choices the sims settled:
- **Loser Leads** (79% of matches reach the final duel, vs 61% with winner Leads).
- **Focus last for the Lead** and **READ = switch after seeing the Answer**: the Lead's power is answering information, not guessing.
- **Final duel ×2**: the last duel always matters.
- **Hand of 3, both public**: few enough options to read at a glance, enough to plan.
- The card tuner only moves **Scheme** and **Health**; Strike/Guard stay printed so the clash stays readable.

## 3. Abilities in the Duel

Card abilities are the same data as before (`engine/kitdsl.js`), read in Duel terms (`engine/duel.js` `cond`/`runOps`, words via `client/js/ui/duel-text.js`):
- *when using STRIKE / GUARD* → when Leading / Answering.
- *the enemy opposite* → the enemy it duels. *Champions beside this* → your Champions still to fight.
- *round N* → duel N. *can't use an Order* → −2 to that stat this duel.
- *READ reveals / correct READ* → gain a READ / when you use a READ.

## 4. The AI

`makeDuelAI({ skill })` searches one duel deep exactly (the Duel is open and deterministic) and scores the result: Voice difference, a danger curve near 0, the strength still in hand and Reserve, Focus and READs. Lower skill adds noise and sometimes just sends the biggest number.

## 5. Training

Five lessons (Lead, Answer, Scheme, Focus, READ) against scripted opponents, then your own Octave against Marrow. The coach knows each script and makes the right Champion glow. `sim/tutorial-proof.js` proves that following it wins every lesson, every time.

## 6. Anomalies (weekly)

Each Anomaly is a Duel rules override (`engine/modes.js`): 4 Focus; 2 READs; Focus +3; 12 Voice; 30 Voice and 10 duels; hand of 4; no Focus and 2 READs; winner Leads; Answers +1.

## 7. Deck styles and Bonds

`engine/archetypes.js`: 12 styles (Knights, Silencers, the Unsung, the Sleepless, Last Words, Clockwork, the Court, Children, Readers, Focus, Wardens, Momentum). Each Champion has one or two styles, read from its traits and its ability. **4 Champions of one style Bond**: each fights with +1 (Legendaries and Mythics +1 Leading / +2 Answering), adjusted per style by `engine/data/arch-tune.js`. **One Mythic per Octave.**

Proof (`node sim/archetypes.js 36 --tune N`): the deck builder's best Octave for each style from the full collection, round robin.

| | Before Bonds | Now |
|---|---|---|
| Style win rates | 19%–85% | 37%–65% |
| Builds share (of 8) | — | 2.4 Champions on average |

The rarity edge, measured as the same style built from a smaller collection against the full-collection build: commons only wins about 36%; commons + rares about 32–40%; everything below Legendary about 43–48%. Without Bonds there is no edge at all (commons only: 61%).

`engine/deckbuild.js` is "Pick for me": one build per style the collection can Bond, near-duplicates dropped, plus suggested swaps and a 60-Duel test. The game's own duelists (`client/js/core/opponents.js`) play styles too, with commons only on the first Ladder rungs and every rarity at the top.
