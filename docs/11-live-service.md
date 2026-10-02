# PHASES 9–10 — THE LIVE SERVICE (specification)

> Status: **partly built.** Accounts with username and password, cloud saves (docs/12), payments (docs/13), ranked and friendly PvP, Alliances with chat and a weekly chest (docs/14), and a server-owned collection (docs/15) are live code. Still to build: server replays of matches against the computer, player trading, Alliance Wars, and Daily Read aggregation. The engine is already server-ready: pure JSON state, deterministic RNG, no DOM dependencies. The server runs the *same* `engine/` modules as the client and simulations.

---

## 1. Principles
1. **The server is the truth** for everything that has value: collection, packs, currencies, Legacy, rating, trades.
2. **Hidden information never leaves the server.** Each player gets a *view* of the match: their own hand and Reserve, the enemy's public Octave, the enemy's Spent Champions, and only the enemy hand cards they've revealed through intel.
3. **Deterministic replays.** Every match stores `seed + actions`. Any match can be replayed exactly, which covers clips, disputes and anti-cheat review.
4. **Offline play stays offline.** Story, Draft vs AI, Ladder vs personas and the Trade Hall work without a connection on a separate local save. Online collection and online Ranked are server-owned.

## 2. Components

| Service | Responsibility |
|---|---|
| **Gateway** | WebSocket connections, auth tokens, rate limits |
| **Account** | profile, settings, friends, Rivals, Alliance membership |
| **Collection** | copies, Legacy, packs (`openPack` runs **server-side** only), Embers, crafting, Ascension |
| **Match** | authoritative match rooms running `engine/rules.js`; shot clocks; reconnection; replay storage |
| **Matchmaking** | Ranked queue by hidden rating (Glicko-2) with ladder tiers shown; Rival rematch; friend challenge codes |
| **Trade** | trade sessions; `validateTrade` / `executeTrade` server-side; risk scoring |
| **Live Ops** | Daily Read (scenario per day plus aggregation of answers), events, reward pools, World Boss HP, Claims standings |
| **Store** | platform receipts to Chimes; Season Pass; purchase history (never touches match data) |

## 3. Match protocol

```
C→S  queue.join {mode:'ranked'|'anomaly'|'draft', octave:[8 ids]}
S→C  match.start {matchId, you:0|1, view, opponent:{name,tier,avatar,rival?}}
S→C  phase.deploy {view, deadline}
C→S  deploy {uid}
S→C  opponent.locked
S→C  phase.command {view (both Champions revealed + On-Reveal events), legal, deadline}
C→S  command {order, focus, read}
S→C  clash.result {result (typed Power), events, view}
...
S→C  match.end {winner, ratingDelta, rewards, legacyUpdates, replayId}
C→S  rematch.request / S→C rematch.accepted
```

- **Shot clocks:** Deploy 12 s, Command 20 s. A timeout plays a random legal Champion, or the highest printed Order with no Focus or READ.
- **Disconnects:** a 45 s grace period, during which the clock keeps running and timeouts play for you. After 3 consecutive timeouts, you forfeit.
- **The server validates every action** with `isLegalCommand`. Clients can't see enemy hand uids except those revealed by intel.

## 4. Trade protocol

```
C→S  trade.open {with: friendId | rivalId | allianceMateId}
S→C  trade.session {id, parties, offers:[[],[]]}
C→S  trade.offer {copyIds:[...]}          // replaces your side
S→C  trade.update {offers, sealCost, locked:[false,false], reviewUntil}
C→S  trade.lock                             // any later change unlocks both sides
S→C  trade.review {until: now+10s}          // both locked: 10-second review
C→S  trade.confirm (hold 1.5 s client-side)
S→C  trade.done {moved: [...], legacy appended}
```

- Server-side safeguards from `TRADE_RULES`: account ≥7 days, ≥20 matches, 5 trades/day, a 48 h lock on new copies, and a Trade Seal in Embers.
- **Risk scoring** (flag for review, never auto-ban):
  - repeated one-way value transfers between accounts sharing a device or IP
  - trades within 24 h of a password or email change
  - new accounts receiving Legendary+ copies
  - trade chains converging on one account
- A flagged trade is **held** for up to 24 h rather than executed. Both players are told *"This trade is being checked"* and neither is accused.

## 5. Daily Read aggregation
- The server builds the day's scenario with `buildDailyRead` and a fixed seed (identical everywhere, including offline clients).
- Answers are aggregated by `(order, focus, read)`. The client shows the **real** world split once online. Offline clients keep showing the projected split, labelled as such.

## 6. Rating
- **Glicko-2** hidden rating drives matchmaking. The visible ladder (Notes and tiers) is a presentation layer with loss protection below Arbiter.
- **Threnodist** is the top 500 by rating, shown on a live leaderboard.
- Rating never depends on collection. The weekly integrity report checks `corr(spend, win rate | rating band)`, and if spending predicts winning, the balance team is paged.

## 7. Data model (core tables)

| Table | Key fields |
|---|---|
| `account` | id, name, created, device_ids[], rating, rd, vol, ladder{tier,div,notes}, flags |
| `copy` | copy_id, card_id, owner_id, treatment, serial, first_owner, acquired, source |
| `copy_owner_history` | copy_id, owner_id, from_ts, via (pack/trade/craft/reward) |
| `copy_stats` | copy_id, battles, clash_wins, reads_hit, finals_won, match_wins, honors[] |
| `wallet` | account_id, embers, chimes, tickets{standard,collector,faction,event}, pity{legendary,mythic} |
| `match` | match_id, mode, seed, octaves[2], actions[], winner, started, ended |
| `rival` | a_id, b_id, record, reads, deciders, last_match |
| `trade` | trade_id, parties, offers, seal, status, risk_score, executed_at |
| `alliance`, `alliance_member`, `war`, `war_holding`, `boss_damage`, `event_pool` | per docs/08 |

## 8. Build order
1. **Gateway + accounts + server-side collection** (packs, crafting, Legacy). The client switches its store to online mode.
2. **Ranked PvP match rooms** + matchmaking + Rivals + replays.
3. **Trading** + friends.
4. **Daily Read aggregation** + leaderboards.
5. **Alliances**, then **Alliance Wars** (defense AI biased by each member's recorded tendencies).
6. **Events**, reward pools, **World Boss** (global HP and phase rules).
