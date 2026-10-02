# COLLECTION, ECONOMY & TRADE

> Status: **LOCKED** (gate at bottom). Engine: `engine/collection.js`. Simulation: `sim/economy.js`.
> Principle: **generous free play, tempting optional acceleration, zero purchasable power.**

---

## 1. What a player owns

- **Copies.** Every card a player owns is an individual object with a **copy id** and a **Legacy record**. Owning one copy of a Champion lets you use it in any Octave. Extra copies feed Ascension, trading and Embers.
- **Treatments** (cosmetic only): Standard · **Foil** · **Alt Art** · **Immortal** (numbered, max 10,000 per card per edition).
  - **Foil:** a rainbow holo that rolls across the card as it tilts. Code only.
  - **Alt Art:** the same painting re-graded, with its own frame. Every card has one fixed grade: **ink-wash** (monochrome on paper, ivory frame), **moonlit** (cold blue, silver frame) or **ember-lit** (burnt orange, bronze frame). Code only.
  - **Immortal:** obsidian and white-gold frame, full foil, serial number. Uses a dedicated masterpiece painting when one exists (20 are briefed for the Legendaries and Mythics); otherwise the card's normal painting.
- **Ascension tier** (per card, cosmetic): Tempered → Radiant → Ascended.

An Octave is **8 different Champions** (two versions of the same character can't share an Octave). No card has a copy limit, because one is all you ever need to play.

---

## 2. Currencies (three, forever)

| Currency | Earned by | Spent on |
|---|---|---|
| **Pack Tickets** (Standard / Collector / Faction / Event) | free timer, objectives, Daily Read, tracks, events, Ranked, Season Pass | opening that pack |
| **Embers** | burning spare copies | crafting any card, trade seals |
| **Chimes** (premium) | purchase; small free amounts from Season Pass and Ranked | packs, Season Pass, cosmetics |

No energy. No stamina. No fourth currency.

---

## 3. Packs

| Pack | Cards | Slots | How to get it |
|---|---|---|---|
| **Standard** | 3 | Open · Open · **Rare-or-better** | 2 free per day (1 every 12 h, store up to 2), tickets, 120 Chimes |
| **Collector** | 5 | Open · Open · Rare+ · **Epic+** · **Showcase** | events, Season Pass, weekly track top tier, 280 Chimes |
| **Faction** (targeted) | 3 | Standard slots, one faction's pool | Ranked milestones, events, 150 Chimes |
| **Firstfall** (event) | 3 | Open · Rare+ · Rare+ | Firstfall event currency (free), 160 Chimes |

**Free and paid Standard Packs are the same pack.** The odds table below is the only table.

### 3.1 Published odds (per slot)

| Slot | Common | Rare | Epic | Legendary | Mythic |
|---|---|---|---|---|---|
| Open | 79% | 17.04% | 3.66% | 0.24% | 0.06% |
| Rare-or-better | — | 85% | 13% | 1.7% | 0.3% |
| Epic-or-better | — | — | 91% | 7.5% | 1.5% |

Per Standard Pack: **Legendary-or-better ≈ 2.6%**, **Mythic ≈ 0.4%**.

**The pace (tuned October 2026).** A heavy free player (every free pack, plus a few hours of Ranked a day, which always pays) owns every Common in about a week, every Rare in about two, every Epic in about three, every Legendary in about seven weeks, all five Mythics in about seven weeks, and has **all five Mythics fully Ascended in about three months** (mostly with Embers: see §4). A player on about 10 Ranked matches a day takes about six months for the same. Less play than that, packs close the gap. Simulated by the economy sim with the game's own reward rules.

**Showcase slot** (Collector): the best card of the pack becomes **Foil** 80.7% · **Alt Art** 19% · **Immortal** 0.3%.

### 3.2 Bad-luck protection (disclosed; counters visible in the Vault)
- **Legendary+:** after 35 packs without one, +3% per pack to the Rare+ slot; **guaranteed by pack 45**.
- **Mythic:** after 115 packs without one, +1.2% per pack; **guaranteed by pack 140**.
- Counters are shared across all pack types.

### 3.3 Duplicate protection
- **Legendary / Mythic:** no duplicate until you own every card of that rarity.
- **Common / Rare / Epic:** missing cards are twice as likely as owned ones. Cards you already own 4+ copies of are 4× less likely.
- Duplicates still matter: they feed Ascension, trading and Embers.

### 3.4 Presentation order
Cards reveal from lowest to highest rarity, so every pack builds toward its best card. The pack-opening ceremony is specified in the Client doc.

---

## 3b. Spoils (a card for every win)

The winner of a Ladder, Story, Anomaly or Rival match takes a card. Published odds, per win:

| Common | Rare | Epic | Legendary | Mythic |
|---|---|---|---|---|
| 74.25% | 21% | 4.5% | 0.22% | **0.03% (about 1 in 3,300)** |

- **Only the first 5 wins each day** drop a card. After that a win pays **15 Embers**. A loss always pays **5 Embers**.
- **Harder wins roll better:** the Epic, Legendary and Mythic odds rise with the opponent's skill and for a clutch win, up to 1.5× (Epic) and 2× (Legendary and Mythic). At best a Mythic is about 1 in 1,700.
- **No pity counter.** Packs stay the reliable road to Legendaries and Mythics (with a Legendary guaranteed inside 45 packs and a Mythic inside 140); Spoils are the lottery on top.
- Training and Draft pay no Spoils.
- The roll is client-side for now. **Once player trading is live, the Spoils roll must move to the server**, like pack opening.

## 4. Embers and crafting

| Rarity | Burn a copy | Craft a copy |
|---|---|---|
| Common | 5 | 50 |
| Rare | 15 | 150 |
| Epic | 50 | 500 |
| Legendary | 250 | 2,000 (a copy of one you own) |
| Mythic | 800 | 2,800 (a copy of one you own) |

Commons, Rares and Epics can be crafted outright, so a deck is never out of reach. **Legendaries and Mythics can't be crafted until you've pulled one**: after that, Embers make more copies of it for Ascension. Pulling them stays the chase; Embers (from wins and burned duplicates) are the grind that Ascends them. That's where a heavy player's Embers go. The Vault's *Burn Spares* button never burns your last copy, any non-standard treatment, or copies reserved for your next Ascension tier.

---

## 5. Ascension (the duplicate sink)

| Tier | Spare copies | What changes (no Power, ever) |
|---|---|---|
| **Tempered** | 2 | Faction-coloured metal corner brackets and rivets on the frame |
| **Radiant** | 4 | + the trim breathes light, a lit faction name plate, a light sweep across the card |
| **Ascended** | 8 | + motes rising through the painting, an outer glow, and the ✦ Ascended crest |

All three are drawn in code over the card's one painting: **no extra artwork**. Your Ascension and best finish show everywhere your copy appears: the Vault, the Octave builder, your hand and your side of the board.

Ascension spends spare copies: **plain ones first, then Foils** (a Collector Pack turns its best card Foil, so a Mythic pulled from one still counts). Alt Art, Immortal and Oktoberfest copies are never spent. Full Ascension of one card takes **14 spare copies** (2 + 4 + 8). **Mythics take 6** (1 + 2 + 3), so maxing all five is a three-month goal for a heavy free player rather than a lifetime one. For the whole set that's 1,570 copies, a sink big enough to last years. The oldest copy (the one with the longest Legacy) is never consumed.

---

## 6. Legacy (provenance)

Every copy records:
- **First Owner**, date acquired, source (e.g. *"Collector Pack, Firstfall Week 3"*)
- **Battles, Clash wins, Match wins, READs hit, Final Clashes won**
- **Honors**: *Firstfall Claims Finalist*, *World Boss Killing Blow*, *Alliance War Champion*, *Rival Decider* (the 17th match)
- **Owner chain**: each owner and the date they received it
- **Serial** (Immortals)

Every copy also keeps a **History**: a short log, oldest first, that travels with it.
- **Origin:** *"Pulled from a Standard Pack."* · *"Taken as Spoils from Kess the Quick on the Ladder (Cantor II), round 7."* · *"Earned in training: the Guard lesson, Cinderhold yard."* · *"Forged from Embers."*
- **Feats**, written only when they happen: first Clash, felling 2+ Champions in a match, an 8+ damage blow, standing behind a READ that landed, holding the line in a win from the brink, finishing a win on 1–2 health, milestones (10/25/50/100/250/500 Clashes and Champions felled).
- **Hands:** *"Traded from Ilka Venn to You."*
- The origin line is never dropped; the log keeps the latest 40 entries.

When a card is traded, **its history travels with it**. Two identical Legendaries become different objects: one has 4,216 battles and three previous owners, the other was opened yesterday.

No blockchain, no NFTs. Legacy is server-authoritative data.

---

## 7. Trading

> *"I want your Hollow King." "What do you want?" "Nyx and Vega." "Deal."*

**Flow:** Offer → counter → both lock → a **10-second review** after the final change → both hold **Confirm** → sealed.

**Safeguards** (as first designed; **player trading launched with none of these**: no age, match, daily or new-copy limits and no Trade Seal, see docs/19. Cards never change Power, so farming gains a collection, not an edge. The Trade Hall's traders keep the seal):

| Rule | Value | Stops |
|---|---|---|
| Account age | 7 days | throwaway alts, bots |
| Matches played | 20 | farm accounts |
| Trades per day | 5 | laundering, market flooding |
| New-copy lock | 48 h | stolen-account dumping, instant flipping of pack pulls |
| **Trade Seal** (Embers, paid by both sides, set by the rarest item) | Rare 10 · Epic 40 · Legendary 150 · Mythic 400 · Immortal 800 | makes alt-account funneling expensive; honest trades cost almost nothing |
| Review window | 10 s after final change | bait-and-switch scams |
| Server risk scoring | flags repeated one-way trades between linked devices/IPs, sudden bulk transfers after a password change | account theft, RMT |
| No forced fairness | gifts and lopsided deals are allowed | keeps trading *real* |

Chimes, Embers and Tickets can never be traded, only cards. There is no auction house: trading is person-to-person. Friends trade from each other's Vaults, and anyone who can trade can use the public **Trade Board** (post "Have / Want"). Built in docs/19-friends-trading.md.

---

## 8. Earning (free), per week

| Source | 15 min/day (A) | 1 hr/day (B) |
|---|---|---|
| Free pack timer (2/day) | 12 | 14 |
| Daily objectives (1 ticket/day for 3 quick goals) | 3.5 | 7 |
| Daily Read streak (ticket every 3 days) | 2 | 2 |
| Weekly track (5 tickets for 25 wins) | 2 | 5 |
| Ranked milestones | 1 | 2 |
| Events | 1 | 3 + 1 Collector |
| **Standard-pack equivalents** | **≈ 21** | **≈ 33 + 1 Collector** |

---

## 9. Store (starting prices)

**Mythic Pack** (added October 2026): **800 Chimes** (the first one ever: 500), **3 a week** (weeks start Monday 00:00 UTC). One card, always a Mythic: one you don't own yet first; once you own all five, a plain copy of one that still needs copies to fully Ascend (each equally likely). It's the midseason buy: a heavy free player is about 12 Mythic copies short of maxing all five at day 60, a lighter player about 23, a casual one about 25, so finishing by day 60 costs about $95, $185 and $200. The weekly cap keeps Mythics special and means nobody buys the whole chase in a day. Modelled average spend per active player per season: about $4.75 with it, about $1 without (typical free-to-play conversion; replace with real numbers once there are some).

| Offer | Price | Contents |
|---|---|---|
| Standard Pack | $1.19 (120 Chimes) | 1 Standard |
| 5 Standard | $4.99 | 5 Standard |
| 10 Standard | $8.99 | 10 Standard |
| Collector Pack | $2.79 (280 Chimes) | 1 Collector |
| **First Purchase** | **$4.99** | 3 Collector + 10 Standard + **Alt-Art Aurelle** + profile frame (one-time) |
| **Season Pass** (10 weeks) | **$9.99** | premium track: 25 Standard + 5 Collector tickets, 3 season Alt Arts, Vault décor, card-back, 300 Chimes back |
| Daily Collector Offer | $1.99 | 1 Collector (once per day, shown *after* your free packs are opened) |

**The Nudge, with rules:** "Open another?" appears only on the pack results screen, after the celebration finishes, and never during a Mythic or Immortal reveal. No offers in battle, in the Vault, or on a loss screen.

**Never sold:** Focus, READs, Initiative, stats, exclusive Champions, required counters, energy.

---

## 10. Economy proof (sim, 20 trials per player, real pack engine)

Collection = unique cards owned out of 120 (Legendary /15, Mythic /5).

| Week | A · free 15 min | B · free 1 h | C · ~$10/mo | D · ~$25/mo | E · heavy |
|---|---|---|---|---|---|
| 1 | 52 (1.3 L, 0.2 M) | 73 (2.1, 0.3) | 69 (2.4, 0.1) | 80 (3.0, 0.8) | 105 (7.2, 1.8) |
| 2 | 80 (3.0, 0.4) | 96 (4.5, 0.7) | 93 (4.6, 0.5) | 102 (6.3, 1.8) | 117 (13.6, 3.5) |
| 4 | 100 (5.8, 1.2) | 111 (9.2, 2.0) | 109 (9.6, 1.8) | 116 (12.6, 3.4) | **120** |
| 8 | 114 (11.6, 2.9) | **120** | 119 | **120** | 120 |
| 12 | 119 (14.8, 4.5) | 120 | 120 | 120 | 120 |

By week 12, Immortals: E 0.6, D 0.1, others 0. Alt Arts: E 33, D 5, B/C ~2.

| Required outcome | Result |
|---|---|
| A can fully enjoy and compete | ✔ 52 cards in week 1 (a legal Octave on day 1); competitive parity shown in §11 |
| B builds a strong collection | ✔ complete set in ~8 weeks |
| C feels meaningful acceleration | ✔ +65% more Legendaries than A at week 4, for less play time than B |
| D has significantly greater freedom | ✔ set complete ~2 weeks before B; 5× B's Alt Arts |
| E chases status, rarity, completeness | ✔ complete by week 4, then Alt Arts, Ascension, Immortals (rare even for E) |
| E cannot buy Ranked dominance | see §11: power is flat across rarity and ownership |

**Season cadence:** 10-week seasons. Each new season adds about 40 cards (the Firstfall set is 120). Free players always have access to a competitive Octave and finish most of a set within its season. The long chases are Legendaries, Mythics, variants, Ascension and Legacy.

---

## 11. The failure test: does spending predict winning?

Checked in the balance gate (`docs/07-balance.md`, the Reckoning):
1. **Rarity vs power:** Common 50.0 · Rare 49.8 · Epic 49.8 · Legendary 50.8 · Mythic 50.5. ✔ flat.
2. **Owned-collection strength** (expert vs expert, best buildable Octaves): A vs E week 1 **46.1%**, week 2 **46.5%**, week 4 **49.1%**; B vs E week 2 **48.8%**; C vs D week 2 **49.7%**. ✔ Spending is worth at most ~4 points in a free player's first two weeks, and nothing by week 4.

If either ever fails, cards get rebalanced, never pack odds.

## Gate
The collection model, odds, protection, Embers, Ascension, Legacy and trade rules are implemented in `engine/collection.js`, covered by `test/collection.test.js`, and exercised by the economy sim. The §11 checks pass. **Gate: PASSED.**
