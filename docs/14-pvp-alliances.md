# Online play and Alliances: switching them on

Both features are built. They need the same Supabase project that already runs accounts and cloud saves. You can set up everything from the Supabase dashboard, with no command line. It takes about five minutes.

## What's built

**Online PvP (the Reckoning, live)**
- **Ranked:** finds an opponent near your rating using your active Octave. Ratings use Elo (start 1000, K=32). A win or loss moves you about 16 points.
- **Challenge a friend:** makes a 6-letter code. Your friend enters it and you play an unranked match.
- **Leaderboard:** the top 50 by rating.
- **Rematch:** starts when both players press it. Sides swap, so the other player places first.
- **The server owns the match** (`supabase/functions/pvp`). It uses the game's own engine and sends each player only their own view: you never receive the opponent's hand, and nobody can fake a move.
- **Shot clocks:** 25 seconds to place, 35 to give orders. When a clock runs out, the server plays for the late player. After 3 timeouts, that player forfeits.
- **Moves arrive instantly** through Supabase Realtime. A 5-second poll backs this up, so a dropped connection catches up on its own.

**Alliances**
- Up to 30 players. The leader can name up to 3 Officers.
- Roles:
  - The leader can promote, demote, hand over leadership and remove members.
  - Officers can remove Members.
  - If the leader leaves, an Officer takes over, or the oldest member if there is no Officer. The last player out closes the Alliance.
- **Live chat.** Each player can post once every 2 seconds.
- **Weekly chest.** Everyone's play fills it:

  | Play | Points | Cap |
  |---|---|---|
  | A win against the AI | 1 | 10 a day |
  | A win online | 2 | 10 a day |
  | The Daily Read | 3 | once a day |
  | A Long Road clear | 5 | once a day |

  Chest tiers:
  - 60 points: 1 Standard pack.
  - 180 points: 2 Standard packs.
  - 360 points: 1 Faction pack.

  Every member who added points that week can claim each tier they reach, once. The chest resets each Monday (ISO week).
- **The database enforces every rule** (`supabase/alliances.sql`), so the game can't be tricked into extra points or packs.

## Setup

### 1. Run the SQL (once)
In the Supabase dashboard, open **SQL Editor → New query**. Paste in the whole of each file below, one at a time, and press **Run**:

1. `game/supabase/pvp.sql`
2. `game/supabase/alliances.sql`

Both files are safe to run again. They also switch on Realtime for the tables that need it.

### 2. Deploy the `pvp` function
Go to **Edge Functions → Deploy a new function → Via editor**:

- **Name:** `pvp`. It must be exactly this.
- **Code:** paste the whole of `game/supabase/functions/pvp/index.ts`. It is one self-contained file: the server plus the game's rules.
- **Verify JWT:** turn it **off**. The function checks who is signed in on its own. Projects that use the new `sb_publishable_` keys can have this check refuse valid players, and the game then shows "Can't connect".

Press **Deploy**. The function needs no secrets: Supabase provides its own URL and key automatically.

> Supabase can't import code from other sites, so the rules are built into `index.ts`. If the card rules change (`engine/`) or the server (`server.ts`), run `bash tools/bundle-functions.sh` and **redeploy** the new `index.ts`, so the server and the game use the same rulebook.

### 3. Try it
1. Sign in on two devices with two different email addresses. A phone and a laptop work, or a normal window plus a private one.
2. On both, open **Play → Online → Find a match**. They pair within a few seconds.
3. Or tap **Make a code** on one device and enter the code on the other.
4. For Alliances, open **More → Alliance**. Found one on the first device and join it from the second.

**Testing without a second person:** open `#/online?local=1` on the site. It runs the same match flow against a test opponent inside the page.

## Where the code lives

| Piece | File |
|---|---|
| Match rules (the Duel, in turns), clocks, Elo | `engine/pvp.js` (tests: `test/pvp.test.js`) |
| Server | `supabase/functions/pvp/server.ts`, bundled into `index.ts` by `tools/bundle-functions.sh` (Node check: `sim/pvp-server-test.mjs`) |
| Tables and matchmaking | `supabase/pvp.sql` |
| Game side of a live match | `client/js/core/pvp.js`, `client/js/screens/online.js`, online mode in `screens/duel.js` |
| Alliances: rules | `supabase/alliances.sql` (tests: `supabase/test/alliances_test.sql`) |
| Alliances: screen | `client/js/screens/alliance.js` |

## Not built yet
- **Decks are checked against the server's copy of each collection** (docs/15), so nobody can bring a card they don't own.
- **Not built yet:** Alliance Wars, player trading, Daily Read results across all players, and Glicko-2 ratings (Elo is used for now).
- **No reconnect prompt yet:** if you close the app mid-match, the match keeps running and its clock keeps ticking. Opening **Online** again returns you to the match: Find a match detects that you're in a live match and takes you back.

## Echoes, online rewards and the pulse (launch update)

- **Echoes.** When nobody else is searching, players can duel an Echo: the Octave a real player last took online (before anyone has, a house duelist's), played by the Duel AI on the server. Always labelled ("Echo of …"), it answers instantly and counts for **half rating**. The lobby offers one after 8 seconds of searching and starts one at 30. Rematch starts another at once.
- **Rewards** (engine/economy.js): ranked matches against real people pay without a daily limit (`WIN_REWARD`: first win of the day a Collector Pack Ticket, +20 Embers a win, a Pack Ticket every 3 in a row), checked against the match itself. Everything against the AI (Ladder, Rivals, Anomaly, bosses, Echoes, friendly games) pays `AI_REWARDS_PER_DAY` = 10 times a day. The story pays each chapter once, on its first clear; replays pay nothing.
- **The pulse** (`pvp` action `pulse`): players active in the last 10 minutes, matches today and the last 8 results. Real numbers; Echo matches count as matches.

Deploy: redeploy both `pvp` and `economy` with their new `index.ts`. No SQL changes.
- **Forfeit and disconnects.** Any match can be forfeited from the in-match Octaves menu (it counts as a loss). Online, each player's game checks in with the server every 5 seconds; a player not heard from for 60 seconds forfeits (`engine/pvp.js` `DROP_AFTER`, `dropCheck`), and the other player sees a countdown after 15 seconds of silence. If both drop, the first one back wins. Echoes never drop.

## The Duel online (combat update)

Online matches play the Duel (`docs/02-combat.md`) in turns: the Lead sends, the Answer answers (with Focus or not), the Lead finishes (Focus, a READ switch; skipped when there is nothing to decide). Each turn has a **30-second** clock (`CLOCK.move`); a late turn is played for you (your biggest number, no Focus), and three in a row forfeit. The client sends one action, `move`; the old `deploy` and `command` actions answer "reload the game". A match started before the update ends with **no result** (no rating change, no rewards) the next time anyone opens it.

Deploy: redeploy `pvp` with its new `index.ts`. No SQL changes.
