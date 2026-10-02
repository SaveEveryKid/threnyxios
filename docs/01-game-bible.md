# PHASE 1 — GAME BIBLE

> Status: **LOCKED** (see Quality Gate at bottom).
> Title: **THRENYX** — the name of the world and the game (set by the studio head). Season 1: **FIRSTFALL**. "EPOCH" is retired.

---

## 1. Product identity in one breath

A mobile-first digital trading card game where two players each bring **eight Champions**, fight across **three lanes** with simultaneous, hidden orders, and win by silencing the other player's **Voice** — by out-thinking the person across from them, not by owning a bigger number.

The sentence the whole product is built to produce:

> **"I knew you were going to do that."**

The three games inside the product:

| Game | Question it asks | Where it lives |
|---|---|---|
| **Competition** | Can I outthink another human? | Clash, READ, Ranked, Draft, Rivals |
| **Collection** | Can I acquire, complete, improve, display and trade what I want? | Packs, The Vault, Ascension, Trade |
| **Identity** | What do my cards, history and pulls say about me? | Legacy (provenance), Immortals, Rivals, profile, Alliance |

They reinforce each other through one rule: **what makes a card desirable is never what makes it win.** Rarity, treatment and history drive collecting and identity; design, matchup and the player's mind drive competition. That separation is what lets us monetize the collection without poisoning the competition.

---

## 2. Player fantasies

1. **The Reader** — "I saw it coming." Wins by reading people. Served by READ, Rivals, Final Clash.
2. **The Architect** — "Wait a minute…" Finds squad synergies nobody else noticed. Served by Faction / Class / Alignment / Traits / Relationships.
3. **The Collector** — "58 / 60. I need those two." Served by The Vault, story sets, character arcs, silhouettes.
4. **The Trader** — "What do you want for it?" Served by Trade and Legacy.
5. **The Fan** — "Who the hell is this?" Served by characters, lore, arcs as collectibles.
6. **The Ritualist** — "Packs and Daily Read every morning." Served by free packs, Daily Read, streaks.

Every major feature must serve at least one fantasy strongly and harm none.

---

## 3. The Sacred Five

If scope pressure hits, these are protected over everything else, in this order of dependency:

1. **CLASH** — the battle. If it isn't fun with grey boxes, nothing else matters.
2. **READ** — the signature mind-game. The franchise's cultural hook.
3. **PACKS** — opening is entertainment, not a transaction.
4. **THE VAULT** — the collection is a place you enter, not a list.
5. **TRADE** — the T in TCG. Cards move between people and carry their history with them.

---

## 4. Locked terminology

Terms are chosen to be short, shoutable and unambiguous on a phone. Once locked, UI, card text and docs use exactly these words.

**Match structure**
- **Champion** — a character card. The only card type at launch.
- **Octave** — the 8 Champions you bring. Visible to both players at match start.
- **Hand** — Champions you can deploy (hidden from the opponent). You open with 3 and draw 1 each round.
- **Reserve** — Champions not yet in hand (hidden order).
- **Lanes** — three per side, facing each other. A Champion stays in its lane until it **Falls**.
- **Health** — each Champion's life. At 0 it **Falls** and cannot return unless a card says so.
- **Voice** — each player's life (30). When your Voice falls silent, you lose.
- **Round** — Deploy, then Command, then the lanes resolve. A **Match** ends when a Voice reaches 0 (or after round 9, higher Voice wins).
- **Clash** — the in-world name for a match between Octaves ("a Clash of record").

**Combat**
- **Orders** — **STRIKE**, **GUARD**, **SCHEME**. Strike beats Scheme, Scheme beats Guard, Guard beats Strike. The winning Order happens; the Order it beats is cancelled; mirrors both happen.
  - **STRIKE** hits the Champion opposite (overkill spills into the Voice).
  - **SCHEME** hits the enemy Voice directly.
  - **GUARD** ripostes a Strike; otherwise it raises a **Shield** equal to its Power.
- **Power** — the Champion's stat for its Order, plus Focus, READ and abilities.
- **Shield** — absorbs damage before health. Doesn't stack beyond the Guard that raised it.
- **Focus** — +2 Power on one Champion. 3 per match, 1 per round.
- **READ** — once per match, call the Order of an enemy Champion that faces one of yours. **READ ✓**: its Order is cancelled and yours gets +3. **MISREAD**: −2.
- **Last Words** — an ability that triggers when its Champion Falls.
- **Initiative** — decides exact ties. Passes to whoever lost more Voice in a round.

**Collection**
- **Rarity** — Common, Rare, Epic, Legendary, Mythic.
- **Immortal** — prestige treatment of an existing card. Zero competitive difference.
- **Showcase** — premium visual variants (alt art, foil, animated).
- **Legacy** — the tracked, transferable history of an individual card copy.
- **Ascension** — using duplicates to visually evolve a card and advance mastery. Never Ranked power.
- **The Vault** — the collection.
- **Pack Ticket** — an item that opens a real pack.

**Currencies (maximum three, ever)**
- **Pack Tickets** (item, earned)
- **Embers** — soft currency from duplicates/recycling; crafts and Ascends.
- **Crowns** — premium currency (name subject to Phase 3 world fit).

Any proposal that adds a fourth currency must remove one.

---

## 5. Design principles

1. **The engine may be complex. The experience must be simple.** Players learn four beats — *Deploy, Command, Reveal, Aftermath* — never a 14-step stack.
2. **Every decision is a read.** A choice that has an obvious correct answer every time is not a decision; remove it or add tension.
3. **All three Orders stay plausible.** Stats live in a narrow band (≈4–7). Seeing a Champion must never tell you its Order.
4. **Information must be actionable.** Information abilities must change a future decision.
5. **Snowballs must be contestable, comebacks must be earned.** No rubber-banding that manufactures fake wins.
6. **Rarity ≠ power.** A Common can be a tournament staple. A Mythic is special for its story, spectacle and mechanical uniqueness, not its stats.
7. **Short and dense.** Target match: 2–4 minutes. Every animation must justify its milliseconds.
8. **Characters first.** No filler cards. Would someone care about this Champion with average stats? If not, rework.
9. **No secret mechanics.** Every competitive effect is written on the card.
10. **Celebrate first, offer second.** Never interrupt an emotional moment with a sale.
11. **Kill your darlings.** Evidence beats attachment — including attachment to this document.

---

## 6. Monetization rules (the Trust Contract)

**We sell:** acceleration of collecting, cosmetic prestige (Showcase, Immortal chances, frames, Vault décor), Season Pass, targeted packs, convenience that never touches match outcomes.

**We never sell:**
- extra Ranked Focus, READs, Initiative, or any in-match resource
- permanent Ranked Power, stat upgrades, or stronger paid versions of Champions
- paid-only Champions, paid-only abilities, or paid-only required counters
- energy/stamina gates on ordinary PvP
- undisclosed odds, or odds that differ between free and paid Standard Packs

**Guardrails:**
- Every card obtainable in paid packs is obtainable free (Event cards included, via earnable Event currency/tickets).
- Odds are published, truthful, and bad-luck protection is disclosed.
- Crafting (Embers) guarantees any specific Champion is reachable without luck.
- **Draft** mode ignores collection entirely — the permanent proof that skill is the product.
- **Economy success test:** if spending independently predicts Ranked wins, the economy has failed and must change.

---

## 7. Visual principles (seed — fully defined in Phase 5)

- **A premium game client that runs in a browser**, not a website. No white panels, SaaS cards, or template gradients.
- **Dark, deliberate, high-contrast.** Light is precious: it signals rarity, action, and victory.
- **One universe.** Every card shares rendering philosophy, lighting logic, frame language and typography.
- **Silhouette first.** Every major Champion must be identifiable as a black shape.
- **Rarity readable without labels.** Frame material, light behavior and motion escalate per tier.
- **Spectacle is budgeted.** Commons are calm; Mythics break the frame. If everything glows, nothing does.
- **Performance is art direction.** 60fps on mid-range phones beats one more particle system.

---

## 8. Scope discipline

Phases are strictly sequential. Each ends with a written quality gate. Future-phase systems are **not** scaffolded early. Content cap before validation: **30 Champions**.

---

## 9. Phase 1 Quality Gate

| Check | Result |
|---|---|
| Identity states what the game is and why it is different | PASS — "outthink the person," rarity ≠ power split |
| Sacred Five named and ordered by dependency | PASS |
| Terminology locked, currencies capped at three | PASS |
| Principles are testable (each maps to a Phase 2/5/8 metric) | PASS |
| Monetization rules include a falsifiable failure test | PASS — spend must not predict Ranked wins |
| Open items explicitly deferred | Title locked: THRENYX (Season 1: FIRSTFALL). Premium currency name → Phase 3. Exact numbers (Order Power, READ, Focus) → Phase 2 simulation. |

**Gate: PASSED. Advancing to Phase 2 — Combat.**
