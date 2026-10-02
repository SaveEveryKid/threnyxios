# Oktoberfest 2026: the October tournament

**The prize:** The Eighth Bell, a one-of-one card (one copy, never reprinted).

## How it runs
| | When (US Central) | What |
|---|---|---|
| Qualifying | Thu 1 Oct – Fri 30 Oct | Every ranked online match scores: win **3**, loss **1**. An Echo win scores **1**, up to 3 a day. One opponent scores 3 times a day; friendly matches don't score. |
| Finals | Sat 31 Oct – Sun 1 Nov | The top 8 play their own ladder, against each other only, whenever they're free. Everyone starts at 1000 (Elo, K 32); a pair counts 4 times; 3 finals matches to be eligible. |
| Oktoberfest Packs | all month | Everyone: qualifying points 10 / 25 / 50 / 100 pay 1 / 1 / 2 / 3 Oktoberfest 2026 Packs (5 foil cards: 4 Rare+, 1 Epic+). Delivered by the `economy` function on the next visit, each once; never sold, never imported from a guest save. |
| Winner | Mon 2 Nov | Highest finals rating among eligible finalists (ties: most wins, then seed). If nobody played 3, most finals wins; if none were played, the top qualifier. |

The Official Rules are at `client/legal/oktober.html` (linked from the Oktoberfest screen).

## Where the code is
| Piece | File |
|---|---|
| Dates, scoring, standings | `engine/oktober.js` (tests: `test/oktober.test.js`) |
| Scoreboard and finals queue | `supabase/oktober.sql` |
| Scoring at the end of each ranked match, the finalists, finals matchmaking, the `oktober` action | `supabase/functions/pvp/server.ts` (check: `node sim/oktober-server-test.mjs`) |
| Screen, home banner, lobby link and finals queue | `client/js/screens/oktober.js`, `home.js`, `online.js` |

## Setup (Supabase, 5 minutes)
1. **SQL Editor:** run `game/supabase/oktober.sql` (safe to run again).
2. **Redeploy `pvp`** with the new `game/supabase/functions/pvp/index.ts` (Verify JWT stays off).

Until both are done, matches play normally and the Oktoberfest screen says the tournament server isn't set up; nothing breaks.

## Still to do
- ~~The Eighth Bell as a real card~~ Done: `engine/cards/unique.js` (Mythic, Vigil, 4/5/5, 6 health, "Rings Once"; on par with the other Mythics in 1,200 simulated games). Never in packs, Spoils, Draft, crafting, burning, imports or merchant trades. The `economy` function gives it to the champion automatically on their first visit after the finals, once.
- Finalist and champion badges (art job C12).
