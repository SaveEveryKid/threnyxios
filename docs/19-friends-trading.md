# 19 · Friends and trading

Friends, quick messages, friend trades, counter-offers and a public Trade Board, built so a child can use all of it safely. Trading itself is wide open: no waiting periods, limits or fees.

## Safety, first

| Rule | How it's enforced |
|---|---|
| **No typed chat, anywhere.** Messages come from a set list (`PRESETS` in `engine/social.js`): "Wanna Duel?", "You sending the invite or am I?", "Check that trade I sent." and so on. | The server stores only a message's id and refuses ids that aren't on the list. The database refuses anything that isn't a short lowercase id (`friend_messages.preset` check). Typed text can't get in. |
| **Nobody can search for players.** A friend is added by friend code or link, from a match you just played, or from "People you played" (online matches in the last 14 days; Echoes don't count). | `add` takes a code, a match id (checked: you were in it) or the id of someone you played. Never a name. |
| **You choose who can ask.** Anyone with my code / People I've played / No one. | `friend_codes.allow`, checked on every request. |
| **A leaked code can be replaced.** "Get a new friend code"; the old one stops working. | `settings { newCode }`. |
| **No means no.** A declined request can't be sent again for 7 days. Block from a request, a friend's page or anywhere: friendship, messages, offers and Board posts between you end, and they can't ask again. | `player_blocks` (shared with voice), checked by every operation. |
| **Guests can't use any of it.** | Refused by the server; the screens send guests to "Save your profile". |
| **No asking for something for nothing.** An offer must include at least one of your own cards. Gifts to friends are allowed. | `offer` refuses an empty "give". |
| **No bait-and-switch.** Offers can't be edited, only replaced; accepting shows exactly what moves, with a short pause before Accept works. | Offers are immutable rows; the swap re-checks the exact copies. |
| **Rate limits** (spam, not trading): 40 messages an hour, 2 s between messages to the same friend, 20 requests waiting, 100 friends, 25 offers waiting, 10 Board posts. | `SOCIAL` and `TRADE` in `engine/social.js`. |

## Trading rules: open

Trading is encouraged, so there are **no restrictions** on it: no account age, no Duel count, no daily limit, no wait on new cards, no Trade Seal. Anyone with a saved profile can trade at once. (Cards never change a Champion's Power, so someone who farms free cards gains a collection, not an edge over other players.)

What stays:
- **The active Octave stays put.** A card in the Octave you're using can't be traded (its spare copies can); any other card can, even your only copy. Checked on this device, because decks live in the save: the trade builder, a Board post and "Trade now" won't pick those cards, and accepting an offer that asks for one says to swap it out first.
- A **saved profile** (guests can't trade: a guest can vanish, and the cards with it).
- Only cards move. Chimes, Embers and Pack Tickets never do. Trades are final.
- An offer must include at least one of your own cards (no asking for free cards).
- The Trade Hall's traders (the game's own) still charge their Trade Seal: `TRADE_RULES` in `engine/collection.js`.

To bring any limit back, set it in `TRADE` (`engine/social.js`): `minAccountDays`, `minMatches`, `dailyTrades`, `newCopyLockHours`, `seal: true`. Then rebundle and redeploy **economy**.

## Making an offer: three steps

1. **Pick what you want** from their Vault → **Confirm selection** (or "Ask for nothing" for a gift).
2. **Pick what you'll give** → **Confirm selection** (at least one card; your active Octave's cards are marked 🔒 and stay).
3. **Check the trade** (You get / You give, each with Change) → **Confirm trade**.

An offer on a Trade Board post skips step 1 (it asks for the whole post). A counter-offer starts at step 1 with the offer turned around, already picked.

## Accept, counter, decline

Every offer you receive (from a friend, on your Board post, or a counter) shows **Accept… · Counter · Decline**.
- **Counter** opens the trade builder with the offer turned around (what they offered, what they asked for), already picked. Add or remove cards on either side and send it. Their offer is marked **Countered**, and they see yours as a **Counter-offer**, which they can accept, decline or counter again. Counters work between strangers too (they started from a Board post).
- A new offer to the same player replaces your old one.

## Being told

While THRENYX is open it checks every 45 seconds (and as soon as you come back to it):
- a **banner** at the top, once per thing: "Bob sent you a trade offer", "…a counter-offer", "Bob traded with you" (your offer accepted, or your post taken), "…wants to be friends", or a friend's message. Tap it to go straight there. Not shown during a match, or on the screen that already shows it;
- a **dot on Home** in the bottom bar, and the counts on the Friends and Trade tiles;
- the **number on the app icon** when THRENYX is on the home screen (iPhone 16.4+ and Android).

Notifications while THRENYX is closed (phone push notifications) aren't built yet: see the end of this page.

## How a trade happens

1. An offer (to a friend, on a Board post, or a counter) is checked when it's sent: both players have saved profiles and the copies exist.
2. On **Accept** (or **Trade now** on a post) the server reads both vaults and checks everything again from scratch.
3. `swapVaults` moves the copies: the owner chain gets the new owner and the history gets "Traded from Alice to Bob." If the receiver already has a copy with the same id, the copy gets a fresh one.
4. `trade_swap` (SQL) writes **both vaults in one transaction**, each only if it hasn't changed since it was read. If either changed (another device, another trade), nothing is written and the server reads again and retries.
5. The trade is logged in `trade_log`. Posts and offers that named the moved copies close.

An offer is claimed (`status = done`) before the swap, so a double tap or two devices can't run it twice. If the swap fails, the offer goes back to open, or closes if it can never happen.

## The pieces

| Piece | Where |
|---|---|
| Rules, presets, the swap | `engine/social.js` |
| Server (inside the **economy** function, `action: 'social'`) | `supabase/functions/economy/social.ts` |
| SQL | `supabase/trading.sql` |
| Friends screen | `client/js/screens/friends.js` |
| Trade screen: Trade Board · Offers · Trade Hall | `client/js/screens/trade.js` |
| Offer builder, card rows, confirm | `client/js/ui/trade-ui.js` |
| "Add as a friend" after an online match | `client/js/screens/duel.js` |
| Friend links `threnyxtcg.com/?friend=CODE` | `client/js/main.js` |
| Tests | `test/social.test.js` · `node sim/social-server-test.mjs` (95 checks) · `node sim/browser/social-flows.mjs` (two players at iPhone size) |

Server operations (`{ action: 'social', op }`): `status`, `ping`, `add`, `accept`, `decline`, `remove`, `block`, `unblock`, `settings`, `messages`, `send`, `vault`, `trades`, `offer` (with `counter` for a counter-offer), `counterView`, `respond`, `cancel`, `board`, `postView`, `post`, `unpost`, `take`.

In the game: `client/js/core/notify.js` (banners, the Home dot, the app-icon number).

## Switching it on

1. SQL Editor: run `supabase/trading.sql`.
2. Redeploy **economy** from `supabase/functions/economy/index.ts`.
3. Test with a friend (both with saved profiles): Friends → send your code → they add you → "Wanna Duel?" → Trade → they Counter → you Accept.

## Watching for abuse

```sql
-- the most active traders this week
select a as player, count(*) from trade_log where created_at > now() - interval '7 days' group by a
union all select b, count(*) from trade_log where created_at > now() - interval '7 days' group by b order by 2 desc limit 20;

-- one-way flows: one account receiving from many (alt farming)
select b, count(distinct a) as senders, count(*) from trade_log where created_at > now() - interval '30 days' and b_gave = '[]'::jsonb group by b order by 2 desc limit 20;
```

To undo a trade from a stolen account, swap the copies back by hand in both vaults (`vaults.data.profile.items` / `copies`) and bump each `version`.

## Not built yet: phone push notifications

Telling someone while THRENYX is **closed** needs Web Push: a service worker, a key pair kept in Supabase secrets, a table of each device's subscription, and the economy function sending a push when an offer arrives. On iPhone it only works when THRENYX is added to the home screen (iOS 16.4+). It's the next step if the in-game notices aren't enough.
