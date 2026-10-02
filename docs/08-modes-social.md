# MODES, PROGRESSION & SOCIAL SYSTEMS

> Status: **LOCKED**. Engine support: `engine/modes.js` (Anomaly, Draft, Daily Read), `engine/battle.js` (all Matches), `engine/collection.js` (rewards).
> Rule zero: **Ranked is sacred.** It always uses the standard rules from `docs/02-combat.md`. Every experiment lives in Anomaly.

---

## 1. Mode map

| Mode | What it tests | Collection matters? | Session |
|---|---|---|---|
| **Ranked** | mastery of the real game | yes (every card is craftable) | 2–4 min |
| **Draft** | card evaluation, denial, adaptation | **no** | 6–8 min |
| **Anomaly** | adapting to new rules | yes | 2–4 min |
| **Daily Read** | one decision, the same one for everyone | no | 1–2 min |
| **Story** (Firstfall chapters) | learning + lore | no (scripted Octaves) | 3–5 min |
| **Rival Challenge / Friendly** | people | yes | 2–4 min |
| **Alliance War** | strategy + your recorded habits | yes | async |
| **World Boss** | the whole world against one thing | yes | 2–3 min |

---

## 2. Ranked

**Ladder:** Initiate → Chorister → Cantor → Arbiter → Warden → Paragon → **Threnodist** (top 500 by rating).

- Initiate to Paragon: 5 divisions each, 4 **Notes** per division. A win gains 1 Note, a loss removes 1. There's no loss protection from Arbiter up.
- A **clutch win** (winning with your Voice at 10 or less) gains 1 extra Note. The most dramatic wins are worth the most.
- **Threnodist** is a live Elo leaderboard.
- **Season reset:** drop 1 tier (Threnodist → Paragon 1).
- **Matchmaking** is by hidden rating, never by collection. Mirror protection: you won't face the same opponent twice in a row unless you're Rivals and both press Rematch.
- **Shot clock:** Deploy 12 s, Command 20 s. A timeout plays a random legal Champion and your highest Order with no Focus or READ.
- **Rewards:** tier milestone tickets (Faction Packs at Cantor+, Collector Pack at Warden+) and a season-end card back plus a frame per tier. No stat rewards, ever.

## 3. Draft (pure skill)

1. 18 Champions dealt face-up from the whole set, one per character, **rarity ignored**.
2. Each player **bans 1**, simultaneously.
3. **Snake draft** (A · B B · A A · B B · …) until each player holds 8.
4. Play one standard Match.

- **Entry:** 1 Draft Token (earned: 1 per day for playing any 3 Matches; or 1 Standard ticket).
- **Run:** play until 3 wins or 2 losses. 3 wins → Collector Pack + 2 Standard; 2 → 2 Standard; 1 → 1 Standard; 0 → 1 Standard. Break-even is generous on purpose.
- The AI drafter (`draftValue`) scores cards by balance rating, synergy with its own picks (faction, trait, **Bonds**), and denial value against your picks.

## 4. Anomaly (the playground)

One rule set per week, from `ANOMALIES`:

| Anomaly | Rule |
|---|---|
| Deep Breath | 5 Focus each |
| Two Minds | 2 READs each |
| The Held Note | READ ✓ +5, MISREAD −3 |
| Blood Moon | Voices start at 20: everything is lethal |
| The Long Night | Voices start at 40, twelve rounds |
| Warband | deploy up to 2 Champions every round |
| The Hush | no Focus; READ +5 |
| Clean Cuts | overkill no longer spills into the Voice |
| Open Court | open with 5 Champions in hand |

Anomaly results never touch Ranked rating. The weekly Anomaly also gets a 3-win reward track (Faction Pack).

## 5. The Daily Read

**Every player gets the same position each day.** The engine plays a seeded expert match to a tense Command phase (round 3 or later, at least two Champions a side, a Voice at 22 or less), then freezes it:

- both boards: every Champion, its health, shields and buffs
- both Voices, Focus and READs, and Initiative
- anything revealed about the enemy hand

The opponent's orders are **already locked**: sampled once from the expert with the day's seed, and identical for everyone.

**You choose:** an Order for each of your Champions, plus Focus and READ if you have them. **Reveal** shows your score (Voice dealt − Voice taken, ±3 per Champion felled or lost, ±50 if it ends the match), the **best possible answer** (found by searching every legal command), and how your score ranks against the field.

- **Streak:** consecutive days *played* (not won), so playing is always rewarded. Every 3 days → 1 Standard ticket. A *win streak* is tracked separately for bragging rights.
- **Share card** (spoiler-free):
  ```
  THRENYX · Daily Read #17
  ▲⛊◉ +Focus READ
  +7 (best +9)
  Streak 12
  ```

## 6. Rivals

- **Becoming Rivals:** play the same person 3 times within 30 days, or press **Declare Rival** after any match (both must accept).
- **The Rival Card** shows:
  - head-to-head record, current streak, and longest streak
  - READs landed on each other
  - Final Clashes between you
  - the **Deciders** (any match that broke a tie in the rivalry)
  - the Champions each of you has beaten the other with most
- **Instant Rematch** from the results screen. Both press it and you're back in within 3 seconds.
- **No behavioural analytics.** The game never shows "they Guard 64% of the time". You learn people yourself; that's the game.
- **Rival Deciders** are auto-clipped for sharing, and the Champions used get the *Rival Decider* Legacy honor.

## 7. Alliances

- Up to **30 members**. Roles: **Leader**, up to 3 **Officers**, **Members**.
- **The Hall:** a customisable banner (faction colour, sigil and motto), a **Trophy Room** (members lend cards to display, and their Legacy shows), a **Trade Room** (members post Have/Want; trades inside an Alliance pay half the Trade Seal), and a **History** log of wars, boss kills and legendary pulls.
- **Weekly Alliance Chest,** filled by different kinds of play, so every player type contributes:

| Contribution | Counts |
|---|---|
| Battler | Match wins (any mode) |
| Reader | Daily Read played, READs landed |
| Collector | Vault milestones, Trophy Room loans |
| Trader | trades completed inside the Alliance |
| Warrior | Alliance War attacks |

  Chest tiers pay everyone who contributed at least once: Standard tickets, and a Faction Pack at the top tier.

## 8. Alliance Wars (asynchronous)

- **When:** weekends, from Friday 18:00 to Sunday 18:00 (48 h). Nobody needs to be online at the same time.
- **Map:** a **war map of the Meridian** with 15 holdings in 5 regions (Cinderhold, Coda, Carillon, the Margin, Lanternfast).
- **Defense:** each member sets 1 defensive Octave, placed on a holding by the officers.
- **Defense AI plays with your habits.** The defender is the Expert AI, but its Order choices are *biased toward that member's recorded tendencies* from their last 50 Ranked matches. You're attacking a Warden's habits, not a random bot: *READ the person*, even while they sleep.
- **Attacks:** 3 per member per war. Winning captures the holding (its points). A holding can be recaptured, and defenses heal after 4 h.
- **Region bonus:** holding all 3 holdings in a region gives a war-only bonus. Example: *Carillon: your attacks start with 4 Focus*. Bonuses are posted before the war so officers can plan.
- **Priority targets:** officers mark them, and captures there count double.
- **Results:** war points decide the war. Alliance rating moves, and the history log records the Decisive Capture, with a Legacy honor for the Champions used.

## 9. World Bosses — *SOMETHING HAS ARRIVED*

- **Announcement:** a global takeover. The home screen goes dark, the audio stops (the Hush), then the boss's name appears.
- **Fighting it:** a special Match against a boss Octave with boss rules (see Season doc for *The Rest*). **Damage = the sum of your winning Final Power across the match.** A win adds a Victory Bonus.
- **Three bars:** personal damage, Alliance damage, and a **server-wide** health bar everyone watches fall live.
- **Milestones:**

| Level | Rewards |
|---|---|
| Personal | tickets, Boss frame, the boss card-back |
| Alliance | Collector Packs |
| Global | kill phases unlock story, and the killing phase drops the event Mythic treatment for everyone who dealt damage |

- **Killing Blow:** the player who lands the final hit on a phase gets a unique Legacy honor on the Champion they used.

## 10. Event reward pools (finite, transparent)

For example, **"The Empty Portrait"** pool contains 50 rewards: 1 Immortal Aurelle, 2 Alt Arts, 6 Collector Packs, 15 Faction Packs, and 26 Standard Packs.

- Each event token draws **one** reward, and that reward **leaves the pool**. The UI shows exactly what's left.
- The major prize is guaranteed by draw 50 at the latest.
- After the major prize is drawn, the player may **reset** the pool (a new pool of 50, same contents). Remaining items are lost, and the UI warns before resetting.
- Tokens are earned by play (event wins, daily objectives) and are also in event bundles. Every pool can be finished free within the event's length with daily play (roughly 45 min/day).

## 11. Story Mode (Firstfall chapters)

- 10 chapters (see the Season doc). Each is a short illustrated scene followed by a **Story Clash** with scripted Octaves that teaches something: Chapter 1 teaches Orders, Chapter 3 teaches READ.
- Rewards: packs, Story-only card backs, and Codex pages.
- Replayable at **Heroic** difficulty (Expert AI), which rewards a title.

## 12. Onboarding (first session)

| Time | Step |
|---|---|
| Launch | **Training starts, and nothing else opens until it is finished.** No nav bar, no packs, no Vault |
| Lesson I · Strike | Receive Pip, Ossian and Benn. The Ink-Shapes always SCHEME, so STRIKE wins |
| Lesson II · Guard | Receive Hadric, Dunstan and Dask. The Scaffold-Rats always STRIKE, so GUARD wins |
| Lesson III · Scheme | Receive Odo, Aria and Wren. The Glass Wall always GUARDS, so SCHEME wins |
| Lesson IV · Focus | Receive Tamsin, Mote and Anselm. **Focus** unlocks |
| Lesson V · READ | Receive Nan, Dilly, Ione and Sentry Nine. The Sparring-Man always STRIKES; the hint says so. **READ** unlocks |
| Lesson VI · Your Octave | Build an Octave of 8 from the 16 you earned, then fight Marrow with full rules. Win or lose, training ends |
| Then | +2 Pack Tickets, and the Meridian (every screen) opens |

Lessons I–V are short Clashes: 12 Voice, 5 rounds, all three lanes filled in round one. Lose one and you retry it. Each lesson hands its Champions over with their backstories, so the starting collection is **built, not given**, and every starter copy's history begins with *"Earned in training: the Guard lesson, Cinderhold yard."*

## 13. Sharing

- **Replay clips** (10–15 s, vertical) are generated automatically for: READ ✓ moments, clutch wins, upsets (lower-tier player beats higher by 3+ tiers), Rival Deciders, Mythic pulls, and Immortal pulls.
- A clip shows both Champions, the lock, the reveal, READ, the Power breakdown slam, and the outcome. It carries a THRENYX watermark and a tag to challenge the player.

## 14. Friends and profiles

- **Profile:** avatar (any owned Champion; Ascended cards animate), frame, title, favorite card with Legacy, Ranked tier, Rivals, Alliance, and a showcase of 3 cards.
- **Friends:** challenge, spectate (5-second delay), trade, and gift a Standard ticket once per day.

---

## Added for the 10/10 pass

### The Long Road (single player, `engine/road.js`, `screens/road.js`)
A run of nine stops with your active Octave and three lives. Each stop offers two ways forward:
- **Duel** / **Champion Duel** (the foe has +1 to every stat and +1 Focus; better rewards).
- **Campfire**: recover a life, or temper one Champion (+1 to every stat, +2 health).
- **Shrine**: one of two relics.
- The ninth stop is **the Archivist**: +6 Voice, +1 to every stat, an extra READ and Ultimate.

A win pays a choice of three:
- a new Champion, who replaces one you carry;
- an upgrade to a carried Champion;
- a relic (11 in the pool: +4 Voice, +1 READ, +1 Focus, +1 Ultimate, 2 shield on entry, free misreads, an extra first-round deploy, +1 STRIKE / GUARD / SCHEME to all, +2 health to all).

A loss costs a life and you walk on unpaid; a lost boss can be retried while lives remain. The run pays 20 Embers per stop reached plus 15 per win, 1 Pack Ticket from stop 6, and 3 for clearing. Difficulty curve: `docs/07-balance.md` §2.7.

### Daily Puzzle (`engine/modes.js` buildPuzzle, `screens/puzzle.js`)
- The enemy's Command is shown face up. Find the Command that takes their Voice to 0 this round, in three tries.
- Their Voice is set to the most any Command can finish, and the obvious answer (beat every lane) never works.
- Solving pays 10 Embers per star (3 for a first-try solve).
- The separate Daily Read (hidden orders, scored against the world) stays.

### Weekly season (`engine/goals.js`)
- Wins in any mode, Monday to Monday, fill a track: 3 wins → 1 Pack Ticket · 6 → 100 Embers · 10 → 2 Tickets · 15 → 3 Tickets + 150 Embers.
- It replaces the ladder's old "a ticket every third win".

### Hero Mastery (`engine/goals.js`)
Four steps per Champion, read from its battle record across your copies and paid at match end:

| Step | Needs | Pays |
|---|---|---|
| Blooded | Take the field 3 times | 25 Embers |
| Proven | Win 5 matches with it | 50 Embers |
| Feared | Fell 6 enemy Champions | 75 Embers |
| Legend | Win 15 matches and deal 80 | 1 Pack Ticket |

Shown on the card in the Vault.

### Readable opponents
- Each rival persona has a learnable **habit** (e.g. Kess strikes when behind) and an **honesty** rate.
- Before you lock, the rival's Champions **lean** toward an Order. The lean is honest at the persona's rate; otherwise it bluffs by showing the Order that beats the real one.
- At the reveal, each lean is stamped BLUFF or ✓.
- Enemy Champions show their last four Orders.
- The VS intro scouts what you have learned about the rival.

### In-battle reading aids
- **Hold an Order** to preview it against each Order the enemy opposite could give, with WIN / EVEN / LOSE.
- **Bond threads** link allies whose abilities are powering each other, with the Power given.

### Playtest log (`core/playtest`: `client/js/core/playlog.js`)
- The last 200 matches and quits are kept on the device.
- More → Playtest report summarises them and copies or downloads the JSON.
