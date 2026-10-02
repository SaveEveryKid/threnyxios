# 18 · Guest play: zero-friction onboarding

A stranger who taps a THRENYX link plays before being asked for anything:

> **VISIT → PLAY → UNDERSTAND → EARN SOMETHING → CARE ABOUT IT → SAVE IT**

## How it works

| Piece | Where |
|---|---|
| The rules (limits, link expiry, funnel event names), shared by game and servers | `engine/guest.js` |
| Guest identity: a Supabase **anonymous user**, made on the first real Duel or skip | `client/js/core/cloud.js` (`startGuest`) |
| Guest allowance, enforced | economy function: `guestStart`, `matchEnd` |
| Saving the profile (the same user gets a username + password) | economy function: `convert`; `client/js/ui/save-profile.js` |
| Landing (Learn to Duel / Skip training · Play now / Sign in) | `client/js/screens/tutorial.js` (`landing`) |
| Save your THRENYX profile (the gate, and account-only features) | `client/js/screens/save.js` |
| A friend's Duel link `threnyxtcg.com/?duel=CODE` | `client/js/screens/challenge.js`; pvp function: `peek`, `join` |
| Funnel events | `client/js/core/funnel.js` → economy `event` → `funnel_events` |
| SQL | `supabase/guest.sql`, `supabase/text-filter.sql` (regenerated) |
| Tests | `test/guest.test.js` · `node sim/guest-server-test.mjs` · `node sim/browser/guest-flows.mjs` |

### One player, start to finish

1. **First visit.** No player exists yet. Training runs on the device (it needs no server and gives nothing that isn't replayed later).
2. **The first real Duel** (the end of training, Skip training, or accepting a friend's Duel) makes a guest: `signInAnonymously()`. The server makes the guest's vault **fresh**, plus only what training hands anyone (the lessons the save says are done). A forged save brings nothing.
3. **Guest play.** Each non-training Duel is checked as it **starts** (`guestStart`). A Duel that started always finishes and pays. Its result is accepted for 2 hours after it began.
4. **The limit.** After `GUEST_PLAY_DURATION_MINUTES` (30) or `GUEST_MAX_DUELS` (5), whichever comes first, the next Duel shows **Save your THRENYX profile**. Packs already earned can still be opened, and nothing is taken away.
5. **Saving.** A name, a password and an optional email, in one step. The server gives the same user id an email (`<name>@USER_DOMAIN`), the password, and `app_metadata.threnyx_account = true`. Same id means the same vault, cards, packs, history, referral and matches. Nothing is copied, so nothing can be lost or doubled. A retry or a double tap is harmless. If saving fails, nothing changes and the player can try again.

**Who counts as a guest:** anonymous and *not* `threnyx_account`. The engine's `isGuestUser`, SQL `is_guest()`, checkout, voice and pvp all use this same test.

### Friend Duel links

- The host taps **Make a link** (Online → Challenge a friend). That gives the share sheet or a copied link: `https://threnyxtcg.com/?duel=CODE`. Typing the code still works.
- The link opens straight to **BYRON CHALLENGED YOU TO A DUEL**. The visitor gives a name, taps **Accept Duel**, becomes a guest, gets the starter Octave if needed, and the Duel starts. No account, no code to type. A 60-second lesson is offered and never forced.
- **Past the guest limit, the invited Duel still plays.** The guards against abuse:
  - only a **saved** player's invitation can be answered by a guest, so nobody can mint links to themselves;
  - a guest gets at most `GUEST_FRIEND_MATCHES` (6) friend matches, rematches included;
  - links expire after `CHALLENGE_TTL_HOURS` (24) and are used up on join.
- **Expired or invalid links** show **This Duel invitation has expired** with Start training / Play THRENYX. Never a blank page.
- A match with a guest is unrated, guests stay off the leaderboard, and a friend's rematch stays friendly. That last one also fixed an older bug: rematches used to turn ranked.

### What needs a saved profile

Ranked, Echoes and making challenge links (pvp), Alliances (SQL), invite rewards, voice chat, and purchases. A guest who tries a purchase saves first and then comes back to that product. Everything else is the real game: the same Duel engine, collection, packs and rewards. There is no demo mode.

### Abuse, honestly

Browser storage can't stop someone determined: a private window makes a new guest. What stops the trivial resets:

- The guest session survives refreshes and returning visits. Supabase keeps the session, so reloading never grants fresh time.
- The allowance lives on the server, in the vault.
- Supabase rate-limits anonymous sign-ins per IP address (Auth → Rate Limits; 30 an hour by default). Optional: switch on CAPTCHA for sign-ins.
- A guest's farm is worth little: 5 Duels of rewards, nothing tradeable, nothing that leaves the guest.

No fingerprinting is used.

### Referrals

A visitor who arrived through an invite link (`?ref=`) keeps the attribution: it's bound to the guest's id, which is kept on saving. A referred friend **doesn't count** while still a guest, and wins against guests never count toward anyone's referral.

## Switching it on (one time)

1. Supabase → **Authentication → Sign In / Providers → Allow anonymous sign-ins: ON.**
2. SQL Editor: run `supabase/guest.sql`, then re-run `supabase/text-filter.sql` (it now refuses guests in Alliances).
3. Redeploy the functions: **economy**, **pvp**, **voice** and **create-checkout** (each from its `index.ts`).
4. Optional: Auth → Rate Limits (anonymous sign-ins), and CAPTCHA.

Without step 1, everything still works the old way: training on the device, then an account.

## Funnel metrics

Events (names only):

- **Training:** `visitor_landing`, `training_started`, `training_skipped`, `training_completed`
- **Guest play:** `guest_created`, `guest_duel_started`, `guest_duel_completed`, `guest_reward_earned`, `guest_pack_opened`
- **Invites:** `friend_invite_opened`, `friend_invite_accepted`, `friend_invite_invalid`
- **Saving the profile:** `account_prompt_shown`, `account_creation_started`, `guest_account_converted`, `account_conversion_failed`, `account_signed_in`
- **Sending challenges:** `challenge_friend_clicked`, `challenge_link_shared`

Each event carries a random visitor id made on the device (`threnyx.visitor`). Once there is a player, it also carries their user id. `funnel_daily` gives a daily summary.

```sql
-- people who did step A, and how many of them went on to step B (by visitor)
with a as (select distinct visitor from funnel_events where name = 'visitor_landing' and created_at > now() - interval '7 days'),
     b as (select distinct visitor from funnel_events where name = 'training_started')
select count(*) as landed, count(b.visitor) as started_training from a left join b using (visitor);
-- swap the names for: visitor_landing → guest_duel_started · training_started → training_completed
-- training_skipped → guest_duel_started · guest_duel_started → guest_duel_completed
-- friend_invite_opened → friend_invite_accepted

-- second Duel: people with 2+ completed guest Duels
select count(*) from (select visitor from funnel_events where name = 'guest_duel_completed' group by visitor having count(*) >= 2) t;

-- guest → saved profile (by player id), and friend Duel → saved profile
select count(distinct user_id) filter (where name = 'guest_created') as guests,
       count(distinct user_id) filter (where name = 'guest_account_converted') as saved
from funnel_events where created_at > now() - interval '30 days';

-- saved players who then sent their own challenge
select count(distinct c.user_id) from funnel_events c
join funnel_events s on s.user_id = c.user_id and s.name = 'guest_account_converted' and c.created_at > s.created_at
where c.name = 'challenge_link_shared';
```

## Housekeeping

Guests who never save leave anonymous users behind. Monthly, in the SQL editor:

```sql
delete from auth.users where is_anonymous and created_at < now() - interval '90 days'
  and not coalesce((raw_app_meta_data ->> 'threnyx_account')::boolean, false);
```

Their vaults and saves go with them (`on delete cascade`).

## Known limits

- An existing player who signs in from a guest session switches to their account. That account's own save loads. The guest's progress stays on the guest profile; it isn't merged, because two collections can't be combined safely. The sign-in window says so.
- Google sign-in isn't offered as a way to save a guest profile. Saving uses a username and password.
- iPhone layout was tested in Chromium at iPhone sizes (390×844, 375×667). Test on a real iPhone before a big push: the keyboard, the share sheet, and opening a link from Messages.
