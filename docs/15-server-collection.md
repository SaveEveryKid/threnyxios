# The collection on the server, and password accounts

## What changed

**Everything of value now lives on the server** for signed-in players:
- your collection and each card's history;
- Chimes, Embers and pack tickets;
- the free-pack timer;
- the bookkeeping that decides which rewards are still owed.

The game can only *ask* the server to do things: "open this pack", "buy this offer", "this match ended". The server runs the game's own rules (`engine/economy.js`) on its copy, called the **vault**, and sends the new vault back. A player who edits their saved game changes nothing that matters: the server's numbers win the next time the game talks to it.

What the server enforces:
- **Packs, Spoils, crafting, burning, Ascension, Trade Hall deals:** rolled or checked on the server. You can only spend what you have and trade what you own.
- **Purchases:** the Stripe webhook records a payment, and the server adds it to the vault itself, exactly once.
- **Alliance chests:** paid into the vault once per tier, after the database confirms the claim.
- **Online play:** the `pvp` server checks every Champion in your Octave against your vault. You can't bring a card you don't own.
- **Once-only and once-a-day rewards:** training, story chapters, rank rewards, daily objectives, the Daily Read streak and the puzzle each pay once. The server keeps the record.

**What the server can't fully check:** it can't replay matches against the computer, so it can't prove you really won one. Those rewards are *bounded* instead:
- at least 20 seconds between match results;
- 80 paying matches a day;
- Spoils capped at 5 cards a day;
- Draft pays up to 8 times a day, and the Long Road up to 4;
- a match's stats are clamped to what's possible;
- only cards you own can gain Legacy.

A cheater could at most earn what a very dedicated player earns. They can't create packs, Chimes or cards from nothing.

**Guests** (not signed in) play exactly as before, with the same rules running on their device. Signing in the first time brings their collection across, with these checks:
- real cards only, at most 24 copies of each;
- no Immortals;
- tickets and Embers capped;
- **Chimes capped at what the account actually bought.**

After that first sign-in, the server's copy is the only one that counts.

**Accounts:**
- **New accounts:** a username and a password. An email address is optional, for recovery.
- **Signing in:** username (or email) plus password. There's no email link.
- **Existing email accounts:** set a password in **More → Password** while still signed in, then sign in with that email and password from then on.

## Setup (Supabase dashboard, about 10 minutes)

Get each file with **Copy raw file** on GitHub.

### 1. SQL
In **SQL Editor**, run each file (clear the editor between them):
1. `game/supabase/purchases.sql`: run it again. It now stops players from collecting purchases themselves, so only the server does.
2. `game/supabase/vaults.sql`: the new vaults table.

Both are safe to run again.

### 2. The `economy` function (new)
**Edge Functions → Deploy a new function → Via Editor**:
- **Name:** `economy`
- **Code:** all of `game/supabase/functions/economy/index.ts`
- Deploy, then turn **Verify JWT off** (it checks the player itself).

### 3. Redeploy `pvp`
Open the `pvp` function and replace its code with the new `game/supabase/functions/pvp/index.ts` (it now checks decks against vaults), then deploy. Verify JWT stays off.

### 4. Password sign-in
**Authentication → Sign In / Providers → Email**:
- **Email** provider: on.
- **Confirm email: off.** Username accounts have no inbox to confirm. With it on, new accounts can't sign in.

### 5. Your own account, before signing out anywhere
Your account was made with an email link, so it has no password yet. On a device where you're signed in, go to **More → Password** and set one. From then on, sign in with your email and that password.

### 6. Check it
1. Open the game signed in. Your collection should look the same: the server's vault is made from it on this first visit.
2. Open a pack, buy something with Chimes, and play a match. All of it now goes through the server.
3. Online play checks your deck against your vault. A deck with a card you don't own is refused.

**If the game can't reach the `economy` function** (not deployed yet, or offline at sign-in), it keeps playing on the device, as before, and switches over on the next launch once the function answers.

## After changing the rules
Anything in `engine/` (cards, rewards, prices) or a `server.ts`:
```sh
cd game && bash tools/bundle-functions.sh
```
Then redeploy both `economy` and `pvp` with their new `index.ts`, so the server and the game use the same rules.

## Where the code lives
| Piece | File |
|---|---|
| The rules for every change | `engine/economy.js` (tests: `test/economy.test.js`) |
| Trade Hall stock and deals | `engine/tradehall.js` |
| Server | `supabase/functions/economy/server.ts` → bundled `index.ts` (check: `node sim/economy-server-test.mjs`) |
| Table | `supabase/vaults.sql` |
| Game side | `client/js/core/vault.js`; sign-in in `client/js/core/cloud.js` and `client/js/ui/account.js` |

## Not built yet
- **Match replays on the server** would turn "bounded" into "proven" for matches against the computer.
- **Password reset for username accounts** that gave no email: for now, contact support.
- **Player-to-player trading** is built: docs/19-friends-trading.md.
