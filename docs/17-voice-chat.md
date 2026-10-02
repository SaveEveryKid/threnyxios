# VOICE CHAT: ARCHITECTURE REVIEW (before implementation)

> Status: **PROPOSAL, nothing built.** Written 1 October 2026 from an inspection of the code on `claude/epoch-tcg`. Cloudflare prices below come from search results quoting Cloudflare's pricing pages (developers.cloudflare.com was not reachable from the build environment); re-check them in the Cloudflare dashboard before launch.
>
> Guiding principles: voice makes THRENYX feel like two people at a table; voice is never necessary; voice never destabilises the game (iPhone Safari above all); safety, parental control, privacy, blocking, muting and reporting are designed in from the start.

---

## DECISIONS (1 October 2026)

**Voice is locked for every account by default. A self-declared age never unlocks it.**

| Feature | What unlocks it |
|---|---|
| **Friend Voice** (adults; only with someone you gave a challenge code to) | A **payment-card check** through Stripe: a $0 or $1-refunded authorisation. The card must be **credit or debit, not prepaid** (Stripe reports the funding type; most kids' cards are prepaid). The account must **not have declared an under-18 birth month and year.** |
| **Ranked Voice** (strangers) | A **one-time ID scan** (Stripe Identity: a government ID + a live selfie match) showing 18+, **plus an active Season Pass.** |
| **Under 13** | Never. No setting, card, ID or PIN changes it. |

1. **Birth month and year from every player** (once: at sign-up, or before first voice use for existing players). It only ever *removes* access: a declared under-18 can't unlock voice with a card. The server stores only the age band (`adult` / `teen` / `under13`) and when it was set; the client can't change it.
2. **What we keep from the checks:**
   - card check: the result (passed, funding type) and the date, never the card number, which stays at Stripe;
   - ID scan: "verified 18+" and the date, **never the ID image, the selfie, the ID number or the full date of birth.** Stripe processes the documents and the face match under its own terms.
3. **Cost:** the ID scan is about $1.50 per verification (to be confirmed on Stripe's pricing page), paid once per account. The Season Pass covers it.
4. **Mute, Block, Report,** the opt-in JOIN button, the mic never turning on by itself, and hidden IP addresses (Cloudflare SFU) apply to every call, Friend and Ranked alike.
5. **Parents** (for any future teen voice):
   - The parent holds the PIN and only the parent can reset it, from their own signed-in Parent Account. The child's account has no path to the PIN.
   - Parent Accounts must pass at least the card check (an ID scan is the stronger option; decide before Phase 3).
   - Ranked stranger voice is never available under 18.
6. **Legal review before launch:**
   - "card = adult" for Friend Voice;
   - the ID scan's face match under state biometric laws (Illinois BIPA, Texas, Washington);
   - Privacy Policy wording for both checks.

## Summary: what the inspection found

| Area | What exists today |
|---|---|
| PvP | Supabase Edge Function `pvp` (Deno), tables `pvp_matches` / `pvp_queue` / `pvp_profiles` / `pvp_pings`, Supabase Realtime pings + 5 s poll. Duel played in turns. |
| Matchmaking | One ranked pool (plus an Oktoberfest finals pool), `pvp_claim_partner` RPC, Echo offered after 8 s. |
| Friend Challenges | 6-character code, no friend list or friend graph. |
| Accounts | Supabase Auth: username + password (an internal address, no real email), optional recovery email in user metadata, or Google sign-in. |
| **Age** | **None collected.** No age gate, no birth date, no age band. The Privacy Policy says the game is not for under-13s and 13–17s "should have" a parent's permission, but nothing checks either. |
| **Parent / child** | **None.** One account per player; nothing distinguishes a parent from a child. |
| **Parental controls** | **None.** |
| **Blocking** | **None.** (Only a local "mute their emotes" switch.) |
| **Reporting** | **None.** |
| **Season Pass / entitlements** | **None.** Stripe Checkout sells one-time Chimes bundles into a `purchases` table; no subscriptions or season entitlements. The weekly "season" track is free. |
| Cloudflare | Workers **static assets only** (`wrangler.jsonc` serves `game/site`). No Workers code, Durable Objects or Realtime. |
| Feature flags | **None.** Client config is a static `client/js/config.js`; server behaviour by env vars. |
| Analytics | **None**, and the Privacy Policy promises "no analytics trackers". A local playtest log exists on the device only. |
| Settings | Local `store.settings`, copied into the `saves` table, which **the client can write**. Unsafe for anything protective. |

**The core finding:** THRENYX has no age information and no way to tell a parent from a child. A parental PIN built today would be a PIN the child can reset, so the brief's own rule (Part 8: *"If the current identity system cannot securely distinguish the parent from the child, STOP and report"*) applies. This report recommends building the voice system and its safety layer in a form that **ships adults-only first**, with the parental framework designed now but released only after legal review (see "Recommendation").

---

## CURRENT PVP ARCHITECTURE

- **Server:** `supabase/functions/pvp/server.ts`, bundled to `index.ts` with the shared engine. It uses the service-role key, so players never touch `pvp_matches` directly; RLS gives them no policies.
- **Match state:** `pvp_matches.data` (JSON) holds the Duel state, turn, clocks, emotes, rematch flags and Echo info. Optimistic concurrency uses a `version` column (`mutate()` retries up to 5 times).
- **Change notification:** the `pvp_pings` row (`match_id, a, b, version, status`) is published over Supabase Realtime. RLS lets only `a` or `b` read it. The client (`client/js/core/pvp.js` `RemoteMatch`) listens and also polls every 5 s.
- **Actions:** `profile, leaderboard, queue, cancel, echo, challenge, join, status, view, move, emote, resign, rematch, pulse`.
- **Presence:** each call marks the caller "seen"; 60 s of silence forfeits (`dropCheck`). Echoes never drop.
- **Client:** `client/js/screens/duel.js` (DuelScreen remote mode), `client/js/screens/online.js` (lobby).

## CURRENT MATCHMAKING FLOW

1. The client calls `queue` with its deck. The server checks the deck against the player's server-side vault and the Octave rules.
2. The server upserts a `pvp_queue` row and calls `pvp_claim_partner(user, rating, match, pool)`, which atomically pairs with the nearest-rated waiting player.
3. If paired, `startMatch()` inserts the `pvp_matches` row (status `live`) and its ping.
4. If not paired, the player waits. The lobby offers an Echo after 8 s and starts one at 30 s.
5. One population: ranked and finals are the only pools. **Voice must not add a pool** (Part 3): the design below decides voice only after `startMatch()`.

## CURRENT FRIEND CHALLENGE FLOW

1. `challenge` creates an `open` match row with a random 6-character code (32-symbol alphabet, about 1.07 billion codes) and the host's deck.
2. The friend enters the code and calls `join`. The server makes the match `live`, sets `m.friendly = true` and clears the code.
3. Friendly matches don't change ratings or score Oktoberfest points.

There is no friend list, so "friend" means "someone you gave a code to". That's still a deliberate choice: you can't be pulled into a friend match by a stranger. It's the right trust boundary for Friend Voice.

## CURRENT AUTHENTICATION MODEL

- Supabase Auth.
- **Username accounts:** `username@<internal domain>` + password, created without email confirmation. Recovery only through an optional `recovery_email` in user metadata.
- **Email accounts:** a real email + password, with reset links.
- **Google OAuth.**
- Edge Functions verify the bearer JWT (`admin.auth.getUser(token)`).
- There's one person per account as far as the system knows. Nothing records who controls the account or their age.

## CURRENT ACCOUNT AGE MODEL

**None.** No age, birth date or age band is collected anywhere: sign-up, profile or save. The only age-related text:
- the Privacy Policy, §8: not intended for under-13s; 13–17 "should have" parental permission, and "must have it" to buy;
- the Terms (13+, under-18s need permission to buy);
- the Shop: "Under 18? Ask a parent or guardian first."

**Consequence:** the server cannot know whether an account is an adult, a teen or under 13. Any age-dependent voice rule needs an age model first.

## CURRENT PARENT / CHILD ACCOUNT MODEL

**None.** There are no linked guardian accounts, no guardian email distinct from the player's, and no verified relationship. A child who knows the account password (which they must, to play) can do anything the account can do: reset its password, change its recovery email, sign in elsewhere.

## CURRENT PARENTAL CONTROLS

**None.**

## CURRENT BLOCKING SYSTEM

**None.** The only control is a local toggle that hides the opponent's emote bubbles (`settings.muteEmotes`). Nothing stops two players being matched or chatting in an Alliance.

## CURRENT REPORTING SYSTEM

**None.** Alliance chat exists (`alliance_messages`) but has no report action. The Privacy Policy mentions moderating chat, but there's no tooling.

## CURRENT SEASON PASS / ENTITLEMENT SYSTEM

**None.** What exists:
- `engine/shop.js` lists one-time products with prices in cents.
- `create-checkout` makes a Stripe Checkout session; the server enforces the price.
- `stripe-webhook` writes paid sessions into `purchases`.
- The `economy` function collects unclaimed purchases into the player's server-side vault.

There are no subscriptions, expiring entitlements or seasons with an end date tied to purchases. A Season Pass needs a new **entitlements** model; see "Database changes". The price ($12.99: 1 Mythic + 2 Collector + 5 Standard Packs + Ranked Voice; it ends with the season whenever it's bought) should live in the product catalogue or Stripe Price, not in code paths that check eligibility. Eligibility checks "has an active `season_pass` entitlement for season X", never a price.

## CURRENT CLOUDFLARE INFRASTRUCTURE

- One Worker, `idea`, serving static assets (`game/site`) with `Cache-Control: no-cache` headers. There's no server code on Cloudflare.
- All server logic is in Supabase Edge Functions; Realtime is Supabase Realtime.
- Using Cloudflare Realtime means adding a **Cloudflare Realtime app** (an App ID and an app secret). The secret must live only server-side, as a Supabase function secret, the same way Stripe keys do. **No Cloudflare Worker is required**: the Realtime SFU is driven by HTTPS calls from our existing `pvp` function.

---

## RECOMMENDED WEBRTC ARCHITECTURE

Two WebRTC peers that never connect to each other directly: **both connect to Cloudflare's SFU**.
- Each player has one peer connection to the SFU: it publishes one audio track and subscribes to one (the opponent's).
- The **SFU hides each player's IP address from the other**, which matters for privacy, especially with minors. Direct peer-to-peer would expose IPs to the opponent, so P2P is **rejected**.
- Cloudflare's SFU has no "rooms" a client can name. Our backend decides which session may pull which track, which is exactly the authorization point we want (Part 39).
- Audio only. Video, screen and data channels are disabled.

## RECOMMENDED CLOUDFLARE REALTIME PRODUCT / API

**Cloudflare Realtime SFU** (formerly Calls), driven by its HTTPS API from the `pvp` Edge Function:
- `POST https://rtc.live.cloudflare.com/v1/apps/{appId}/sessions/new` creates a session for one player's peer connection, with their SDP offer.
- `POST …/sessions/{sessionId}/tracks/new` publishes the player's local audio track, or subscribes to the opponent's (`location: "remote"`, the opponent's `sessionId` + `trackName`).
- `PUT …/sessions/{sessionId}/tracks/close` closes tracks; the session ends when the peer connection closes.
- `Authorization: Bearer <APP_SECRET>`, server-side only.
- Cloudflare TURN is available for restrictive networks. TURN and SFU usage are billed together and not double-charged.

**Not RealtimeKit.** It's the higher-level kit with its own UI and SDK. It's priced per participant-minute (about $0.0005/min for audio-only, per search results), which is several times the SFU cost at scale (see costs). It also brings a large SDK to iPhone Safari, the opposite of "lightweight".

## AUDIO FLOW

1. The player taps **JOIN VOICE**. Only then is `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false })` called.
2. One `RTCPeerConnection` (to Cloudflare, with Cloudflare STUN/TURN). The audio transceiver is `sendrecv`; the Opus target bitrate is set through `RTCRtpSender.setParameters` (`maxBitrate`, about 32 kbps).
3. The opponent's track plays in a single hidden `<audio autoplay playsinline>` element, reused across calls. **No AudioContext, no analysers, no visualisers.**
4. **Self-mute:** `track.enabled = false`, which is instant and local; WebRTC sends silence frames. The track is kept so unmuting doesn't re-prompt.
5. **Mute opponent:** `audioEl.muted = true`, instant and local, no network round trip.
6. **Leave:** stop tracks, close the peer connection, tell the server (best effort). See "Voice cleanup plan".

The game's own sound (WebAudio in `core/audio.js`, the score in `core/music.js`) stays separate. The only coupling allowed is a state flag: while voice is connected the game ducks its own music and decorative SFX (see **LIVE VOICE AUDIO ON IPHONE**). No audio flows between the two systems.

## SIGNALING FLOW

All signalling goes over **our** authenticated `pvp` function: new actions on a separate code path, never through `move`, never touching `m.version`. "Opponent joined voice" notifications use a **separate** Realtime row, `voice_pings`, so voice traffic can't wake or reorder gameplay refreshes.

```
Client A                         pvp function                         Cloudflare SFU
  | voice_policy(match) ------------> | auth, membership, policy (both sides)
  | <---- { available, reasonCode* }  |        *reasonCode only for your own side
  | [player taps JOIN VOICE, mic permission granted]
  | voice_join(match, offerSDP) -----> | re-check policy; rate limit
  |                                    | sessions/new + tracks/new(local) -----> |
  |                                    | <------------------ answerSDP, sessionId |
  |                                    | store voice_sessions row (match, user, sessionId, trackName, expires)
  | <------------- answerSDP (no sessionId needed by client)
  |   ...ICE/DTLS to Cloudflare...
  |                                    | if opponent also joined: tracks/new(remote) for each side
  | voice_pings row bumps -----------> both clients: "opponent joined", renegotiate (pull)
  | voice_leave / match over --------> | tracks/close, delete row, bump voice_pings
```

If only one player joins, they see **WAITING FOR OPPONENT TO JOIN VOICE**. Nothing is pulled until both have joined, so there's never a one-way call.

## SERVER-SIDE VOICE AUTHORIZATION FLOW

Every voice action re-derives everything from the database and **trusts no client field**.
1. **Authenticate** the JWT and get the `uid`.
2. **Membership:** load `pvp_matches` by id; `uid` must be `a` or `b`; status must be `live`; the match must not be an Echo.
3. **Flags:** `voiceSystemEnabled` plus `friendVoiceEnabled` or `rankedVoiceEnabled` for this match type (friendly or ranked/finals), plus any rollout cohort.
4. **Policy for both players** (see below). Voice is available only if *both* allow it for this match type, and neither has blocked the other.
5. **Rate limits:** joins per user per match, per hour, and reports per day.
6. Then create or pull Cloudflare sessions. Store `voice_sessions(match_id, user_id, cf_session_id, track_name, created_at, expires_at)`.
7. **Expiry:** sessions are bound to `match_id` + `user_id` and live only while the match is live, with a hard cap of about 30 minutes. A finished match or a block closes them server-side.

The client never sees the opponent's Cloudflare session ID. The server performs the "pull" on the client's behalf, so there's nothing to enumerate or replay.

## PROPOSED VOICE POLICY MODEL

Computed server-side by one pure function (`engine/voice-policy.js`, unit-tested and shared by the server), from server-only data:

```js
voicePolicy(account, { matchType }) => {
  friendVoiceAllowed, rankedVoiceAllowed,   // may this account use voice in this kind of match
  microphoneAllowed, receiveVoiceAllowed,   // separate send/receive permissions
  requiresNotice,                           // first-use safety notice not yet acknowledged (version)
  reason                                    // PRIVATE: 'flag_off' | 'age' | 'parental' | 'moderation' | 'setting_off' | 'no_pass' | ...
}
```

Inputs, all server-side:
- `account_age_band` (`adult | teen | under13 | unknown`);
- `parental_controls` (per-capability ALLOW/BLOCK);
- `voice_prefs` (the player's own Friend / Ranked toggles; default **off**);
- `voice_restrictions` (moderation: warning, temporary or permanent, per mode);
- `entitlements` (active `season_pass` for ranked);
- feature flags;
- `player_blocks`.

The rules, in order, where the first failure wins:

| Check | Rule |
|---|---|
| 1. Flags | Feature flags off → unavailable. |
| 2. Moderation | A moderation restriction for this mode → unavailable. Moderation overrides everything. |
| 3. Age band | `under13` → ranked always unavailable; friend voice unavailable in V1 too (see "Under-13 handling"). `unknown` → unavailable until the age step is done. `teen` → only what parental controls allow (V1: unavailable until the parental framework ships). |
| 4. Parental controls | They block → unavailable. A Season Pass can never override them (Part 33). |
| 5. Player's own setting | Off → unavailable. |
| 6. Ranked only | An active Season Pass entitlement is required. |
| 7. Blocks | Either player has blocked the other → unavailable for this pair. |

**What the opponent receives:** only `VOICE AVAILABLE`, `VOICE NOT AVAILABLE`, `OPPONENT HAS NOT JOINED` or `OPPONENT IN VOICE`. The `reason` goes only to the account's own client, and its wording there is generic for parental reasons ("🔒 Voice unavailable").

## UNDER-13 HANDLING

- **Today the game has no under-13 accounts by policy**, but no gate enforces that. An age step is required before any voice launch.
- **Age step (decided):** a neutral birth month and year prompt. It shouldn't say "you must be 13", which invites lying. It runs once at sign-up and for existing accounts before first voice use. The server stores only the derived **age band** and the date it was established, **not the birth date**, and the band can't be changed from the client. A second attempt shows the stored result, which prevents retry-until-adult.
- **V1 rule for under-13:** no Ranked stranger voice, ever, under any setting or PIN. **Also no Friend voice in V1.** Allowing any voice for under-13s would need verifiable parental consent under COPPA, which THRENYX can't do today (see legal items).
- **What the age step does to existing under-13 players** is a policy decision for legal review. The current Privacy Policy says such accounts are deleted. The voice project shouldn't silently change that, so the review must decide before the age step ships.
- **The rest of THRENYX keeps working.** Voice simply isn't offered.

## TEEN / PARENT-CONTROLLED ACCOUNT HANDLING

**Rule (product decision, 1 Oct 2026): the parent holds the PIN, and only the parent can reset it.** The child never sets, sees or resets it, and nothing in the child's account can reset it.

That needs the system to know who the parent is. So parents get **their own login**, a **Parent Account**, separate from the child's game account.

**How a parent takes control**
1. In the child's app, the player goes to Settings → Parental Controls → "Link a parent". The server shows a one-time link code, valid for 15 minutes and single-use.
2. The parent signs in on **their own device** to the Parent Account page, or creates the Parent Account there.
3. The parent enters the code, approves the link, and **sets the PIN**. All of this happens in the parent's session; the child's session never takes part.
4. Linking is one-way: once linked, **the child cannot unlink**. Only the parent can release the account (or account deletion through support).

**How a parent changes controls**
- **On the parent's device:** from the Parent Account page (signed in). No PIN needed there; the parent login is the authority.
- **On the child's device:** Settings → Parental Controls → enter the PIN. The server checks it and returns a 5-minute elevation token that the save requires.

**How the PIN is reset (parent only)**
- Only from the signed-in Parent Account: "Reset PIN" asks for the **parent's password again**, then accepts a new PIN.
- The child's password, the child's recovery email and the child's session can **never** reset or reveal the PIN. There is no reset button in the child's app at all.
- If the parent forgets the parent password: the parent account's own email recovery (a verified email is required on Parent Accounts), or support with proof of payment-card ownership (below).

**The remaining weak point, and the fix**
A determined child could make a *second* account and call it the parent. So a Parent Account must pass an **adult check before it can link**. The recommended check is a **payment-card verification through Stripe**: a $0 / $1-refunded authorisation. We never see the card number; Stripe already handles our payments. It's a widely used signal that an adult controls the account. Whether it's enough for each market is a legal-review item.

**Controls** (ALLOW/BLOCK each): Friend Challenge Voice · Ranked Voice · Microphone · Incoming Voice. The framework is general, so purchases, Alliance chat and play-time limits can be added later.

**Defaults for a linked teen:** all voice **blocked** until the parent turns something on. The intended setting, "Friend Voice allowed, Ranked blocked", is one tap for the parent.

**Under-13:** the parent framework never enables Ranked stranger voice for an under-13 account (a hard server rule). Whether a parent can enable *Friend* voice for an under-13 is a legal question (COPPA verifiable parental consent). V1 keeps it off.

**Ship order:** adult voice first (Phase 1). The Parent Account, link, PIN and card check come next (Phase 3), behind `parentalVoiceControlsEnabled`, after legal sign-off.

## PARENT PIN SECURITY MODEL

- **Set and reset only from the signed-in Parent Account.** Reset needs the parent password re-entered. The child's account has no path to it.
- **Format:** 4–8 digits.
- **Hashing:** Argon2id (or scrypt), a per-row salt and a server-side pepper (a function secret), in a server-only table with no read policy. The raw PIN is never stored, logged, sent to analytics, sent to opponents, or shown back to anyone, the parent included. A forgotten PIN is reset, not revealed.
- **Verification only on the server.** `parental_verify(pin)` in an Edge Function returns a short-lived (5 min), single-purpose **elevation token** that protected saves require. There's no client-side or localStorage-only check.
- **Rate limiting:** 5 wrong tries → 15-minute lock, escalating. The message is a generic "Incorrect PIN" with no hints. The **parent is notified** (email) after repeated failures. Locks are logged without the PIN.
- **Every change is recorded** (who, when, which setting) and visible to the parent on the Parent Account page.
- **Tables:**
  - `parent_accounts(user_id, email_verified_at, adult_check_at, adult_check_method)`;
  - `parent_links(child_user_id pk, parent_user_id, linked_at)`;
  - `parent_pins(child_user_id pk, pin_hash, salt, failed_count, locked_until, set_at)`;
  - `parental_controls(child_user_id, key, value, changed_by, changed_at)`.

## PRIVACY DATA FLOW

```
Player device ──(HTTPS, JWT)──> Supabase Edge Function `pvp` ──(HTTPS, app secret)──> Cloudflare Realtime API
      │                                  │ reads: matches, age band, controls, prefs,
      │                                  │        restrictions, entitlements, blocks
      │                                  │ writes: voice_sessions (ephemeral), reports, events
      └──(WebRTC: DTLS-SRTP audio, ICE)──────────────────────────────> Cloudflare SFU ──> opponent device
```

Audio is encrypted in transit (DTLS-SRTP) between each device and Cloudflare. As an SFU, Cloudflare terminates and forwards the media; it doesn't record it unless asked, and we never ask.

## WHAT DATA WOULD BE SENT TO CLOUDFLARE OR ANY THIRD PARTY

- **Cloudflare Realtime:**
  - the players' **IP addresses** and network candidates (unavoidable for WebRTC);
  - the **live audio stream**, transient and not stored by us;
  - SDP (codec info);
  - **opaque, random track names** that we generate (no usernames, user IDs or match IDs in anything we send);
  - their own usage records for billing.
- **Supabase:** the new tables below, as today.
- **Not sent to Cloudflare:** user IDs, usernames, age, parental state, Season Pass status, match details.
- **No other third party.** No transcription, no AI moderation, no analytics vendor.

## WHAT DATA WOULD BE STORED

| Data | Where | Retention |
|---|---|---|
| Age band + date established (not the birth date) | `account_safety` | Life of account |
| Voice preferences (Friend/Ranked on/off), notice-ack version | `voice_prefs` | Life of account |
| Parent Account, link, PIN hash, controls (phase 3) | `parent_accounts`, `parent_links`, `parent_pins`, `parental_controls` | Life of account |
| Voice session records (match, user, Cloudflare session id, times) | `voice_sessions` | **Deleted at match end**; a minimal row (match, user, seconds connected) kept 90 days for cost and abuse review |
| Blocks | `player_blocks` | Until unblocked or account deleted |
| Reports (reporter, reported, match, time, match type, voice active?, category, optional short text) | `player_reports` | 1 year or as legal review decides |
| Moderation restrictions | `voice_restrictions` | Per penalty |
| Season Pass entitlement | `entitlements` | Purchase records follow existing tax retention |
| Product events (no content) | `voice_events` | 13 months, then aggregated |

## WHAT DATA WOULD NOT BE STORED

No audio, recordings or clips; no transcripts; no speech recognition; no voiceprints, speaker IDs or biometric data; no birth dates (only the band); no raw PINs; no opponent-visible age or parental information; and no conversation content in reports. The report form will say plainly: "No recording exists; tell us what happened."

## LEGAL / PRIVACY ITEMS THAT REQUIRE HUMAN REVIEW

Not legal advice. These are engineering flags for a qualified reviewer **before launch**:
1. **COPPA (US).** Voice is personal information when collected from a child. Is THRENYX "directed to children" in its art, tone or tutorial? The tutorial is pitched "so an eight-year-old can play" (`screens/tutorial.js` comment), which may matter. Does an age gate create *actual knowledge* of under-13 users, and what happens to them? Is any under-13 voice possible without verifiable parental consent? (This design assumes no.)
2. **Teens.**
   - Is a Parent Account with a payment-card adult check adequate for 13–17 in the target markets?
   - **UK Age Appropriate Design Code (Children's Code):** high-privacy defaults for under-18s, which voice off by default meets.
   - **UK Online Safety Act:** user-to-user features need risk assessments and reporting duties.
   - **EU DSA**, **GDPR Art. 8:** the age of digital consent varies 13–16 by country.
   - **California CCPA/CPRA** (minors) and the **Age-Appropriate Design Code**, which is partly enjoined, so check its status.
3. **Season Pass sales to minors.** The Terms already require parental permission for under-18s to buy; Ranked Voice inside a paid pass doesn't change the safety rules, which is good. Check auto-renewal law if the pass ever renews (recommend: **no auto-renew**, one season, one charge).
4. **Privacy Policy updates needed:**
   - voice (live, not recorded, via Cloudflare);
   - IP addresses visible to Cloudflare during voice;
   - age band collection;
   - Parent Accounts: parent email, adult-check record (phase 3);
   - blocks and reports retention;
   - first-party product events, which replace "no analytics" with an honest statement of first-party, content-free telemetry;
   - Cloudflare's role, upgraded from "hosts the website" to "realtime voice".
5. **Terms updates:** voice conduct rules, moderation powers (voice suspensions), what reporting does.
6. **Data processing terms with Cloudflare** for Realtime: check the DPA covers it, and where the media is processed.
7. **Law-enforcement and safety escalation process** for threats or child-safety reports: who reads reports, and how fast.
8. **Existing gap, independent of voice:** with no age gate today, the "not for under-13" statement is unenforced. Worth fixing anyway.

## IPHONE SAFARI RISKS

| Risk | Mitigation |
|---|---|
| `getUserMedia` must follow a user tap; home-screen apps may re-prompt each launch | Request only on the JOIN VOICE tap; never on page load; never auto-rejoin with the mic (Part 29). |
| **The audio session switches to play-and-record** when the mic is live: game music and SFX get quieter, can move to the earpiece, and Bluetooth (AirPods) switches to the low-quality call profile | Expected iOS behaviour. Duck our music while in voice; test speaker, AirPods and wired routes; document it in the notice ("your game sound may get quieter while voice is on"). |
| **Our WebAudio context can be interrupted** (calls, Siri, route changes) | The existing `audio.js` resume-on-gesture stays; voice never touches that context. |
| Remote `<audio>` autoplay blocked | Start playback inside the JOIN VOICE gesture; if `play()` rejects, show "Tap to hear opponent". |
| **Backgrounding or lock:** iOS ends or mutes the mic track | Listen for track `ended` / `mute` and `visibilitychange`; on return show **VOICE DISCONNECTED · REJOIN VOICE**. Gameplay resumes first. |
| Network change (Wi-Fi ↔ cellular) | One ICE restart attempt within 10 s; otherwise disconnect voice cleanly. |
| Memory leaks from peer connections and tracks | Strict cleanup + a 50-cycle soak test (below). |
| CPU and battery | No visualisers, no AudioContext analysis, no per-frame UI; one status icon updated on events only. |
| The previous crash pattern (heavy compositor layers) | The voice UI is 3–4 small buttons with no filters, blend modes, masks or animation loops. |

## EXPECTED BITRATE

- **Opus mono, about 32 kbps target** (cap 40, floor about 20 under poor networks), 20 ms frames, DTX on, so silence costs almost nothing.
- With RTP/UDP/IP overhead, about **40–48 kbps per active direction**, falling sharply during silence (DTX).
- Each participant sends one stream to Cloudflare and receives one from it.

## ESTIMATED COST AT …

Billing basis (re-verify): **Cloudflare Realtime SFU + TURN, $0.05 per GB of egress from Cloudflare, the first 1,000 GB per month free**, a single shared allowance. Ingress isn't charged.

Each connected participant receives one stream. At a conservative **48 kbps with no DTX savings**, that's 6 KB/s, or **21.6 MB per participant-hour**. This is a worst-case number; with DTX, real usage is likely 30–50% lower.

| Concurrent voice users (constant, 24/7) | Egress per hour | Per month (730 h) | Monthly cost after the 1,000 GB free tier |
|---|---|---|---|
| **100** | 2.2 GB | about 1,580 GB | **about $29** |
| **1,000** | 21.6 GB | about 15,770 GB | **about $740** |
| **10,000** | 216 GB | about 157,700 GB | **about $7,840** |

- **Per voice-hour:** about $0.001 per participant-hour, or about **0.2¢ per two-player hour**.
- **Reality check:** "concurrent" here means *constantly*, around the clock. Real usage peaks and troughs, so monthly cost will usually be well below these figures.
- **Comparison:** RealtimeKit at about $0.0005 per participant-minute is $0.03 per participant-hour, about **28× more**.
- **Season Pass economics:** at $12.99, even a player in voice 2 hours a day costs about 6¢ a month in egress.
- Supabase signalling cost is negligible (a handful of function calls per match).

## VOICE CLEANUP PLAN

`client/js/voice/session.js` exposes a single `VoiceSession` with exactly one `destroy()`. It's called on match end, leaving voice, leaving the screen (DuelScreen `destroy()`), sign-out, a block, a policy revocation, or an unrecoverable error. `destroy()`:
1. stops every local `MediaStreamTrack` (this releases the mic and clears the iOS indicator);
2. removes and nulls the remote `<audio>` element (`srcObject = null`, then `remove()`);
3. closes the `RTCPeerConnection` and removes all its listeners, through one `AbortController` whose `signal` is passed to every `addEventListener`;
4. clears every timer: reconnect, ICE restart, join timeout;
5. unsubscribes the `voice_pings` Realtime channel;
6. tells the server `voice_leave` (best effort, and the server also closes on match end);
7. drops all references, so the object can be collected.

The server mirrors this: match `over`, `resign`, a disconnect forfeit or a block closes the Cloudflare tracks and deletes `voice_sessions` rows. A sweeper closes anything past `expires_at`.

**Soak test (Playwright, Chromium with a fake media device):** 50 cycles of enter match → join voice → connect → leave voice → end match. After the run it asserts:
- 0 live tracks;
- 0 open peer connections (instrumented constructor);
- listener counts back to baseline;
- no pending timers;
- heap within ±5% of baseline after a forced GC.

The same cycle is run by hand on a real iPhone (Safari and the home-screen app) with Web Inspector memory snapshots.

## BLOCK / REPORT FLOW

- **Block** (in voice controls, the post-match screen, and later a profile):
  1. Writes `player_blocks(blocker, blocked)`.
  2. The server immediately closes voice for that match, and the client destroys its session at once without waiting.
  3. Gameplay continues.
  4. In future matches between the pair, voice is never offered.
  5. Matching each other is still allowed in V1 (one population). Avoiding re-pairing is a later option.
  6. Emotes from a blocked player are also hidden.
- **Report:** **REPORT PLAYER** is always visible in voice controls and on the result screen.
  1. Pick a category: Harassment / bullying · Hate or abusive language · Sexual content · Threats · Sharing/requesting personal information · Spam / disruptive · Other.
  2. Optionally add up to 500 characters of text.
  3. The server records the reporter, the reported player, the match, the time, the match type, whether voice was active (from `voice_sessions`, not from the client), the category and the note.
  4. Rate limit: 10 reports a day per reporter, 1 per reported player per match.
  5. The reporter is offered "Also block this player?".
- **Moderation V1:** a SQL view of reports and a function to set `voice_restrictions`, operated by you. No moderation console in V1.

## FEATURE FLAG PLAN

A server-only `app_flags` table (key, value JSON, updated_at), read by the `pvp` function and cached for 30 s. Flags:
- `voiceSystemEnabled`: the master kill switch, which disables all voice actions instantly without touching PvP;
- `friendVoiceEnabled`;
- `rankedVoiceEnabled`;
- `parentalVoiceControlsEnabled`;
- `voiceCohort`: `internal` → `adult_friend` → `friend_beta` → `ranked_pass` → `expanded`;
- `voiceAllowlist`: user ids for stage 1.

The client asks `voice_policy` per match and shows nothing unless told voice is available. Turning a flag off also makes the server close active voice sessions on the next voice call, or via the sweeper within 1 minute.

The flags can sit in a Supabase table rather than a Cloudflare service, because all voice authority already lives in the Supabase `pvp` function.

## ANALYTICS PLAN

**First-party, content-free events.** These go in a `voice_events` table (user id, match id, match type, event, small numeric fields such as `seconds` or a `failure_kind` enum, timestamp), written only by the server. The client-originated ones (permission denied, connection failure, self-muted) are sent as batched, rate-limited `voice_event` calls.

- **Events:** the full list from the brief (`voice_offered` … `voice_locked_by_policy`), plus `voice_seconds` on leave and `ice_restart`.
- **Never logged:** audio, transcripts, PINs, birth dates, report free-text (only in `player_reports`), conversation content.
- **Answers it enables:**
  - voice adoption per match type;
  - Season Pass voice uptake;
  - matches per day and D7/D30 retention for voice users against matched non-voice users;
  - referral conversion for friend-voice inviters;
  - reports and blocks per 100 voice matches;
  - client crash and reload rate in voice against non-voice sessions (from the existing crash recorder, if the player opts to share).
- **Cost monitoring:** sum of `voice_seconds` × the average bitrate assumption = estimated GB and $, shown as a daily SQL view, reconciled monthly against Cloudflare's usage page. Also tracked: concurrent sessions (count of open `voice_sessions`), failed connections, TURN share (from ICE candidate types reported at connect).
- **Privacy Policy wording must change**, since it currently says no analytics. This is first-party and disclosed.

## FILES THAT WOULD CHANGE

**New:**
- `engine/voice-policy.js`: the pure policy function, unit-tested and shared.
- `supabase/voice.sql`: tables, RLS and helper functions.
- `client/js/voice/session.js`: WebRTC and cleanup.
- `client/js/voice/ui.js`: the small controls, the notice and the report form.
- `client/js/screens/parental.js` and a Parent Account page, plus `supabase/functions/parent/…` (phase 3: link codes, PIN set/verify/reset, adult check via Stripe, parent email).
- `test/voice-policy.test.js`, `sim/voice-server-test.mjs`, `scratch soak test`.

**Changed:**
- `supabase/functions/pvp/server.ts`: new actions `voice_policy`, `voice_join`, `voice_renegotiate`, `voice_leave`, `voice_event`, `block`, `unblock`, `report`, plus voice teardown in finish, resign and drop paths. It **does not change `move` or the Duel engine.**
- `client/js/screens/duel.js`: mounts the voice controls in remote mode only, and calls `voice.destroy()` in `destroy()`/`finish()`.
- `client/js/screens/more.js`: settings for Voice (Friend/Ranked toggles), the age step entry, Parental Controls (phase 2) and the block list.
- The sign-up flow in `client/js/ui/account.js`: the age step.
- `client/legal/privacy.html`, `client/legal/terms.html`.
- `docs/14-pvp-alliances.md` (deploy steps).
- Shop and Season Pass screens, when the pass is built: `engine/shop.js`, `create-checkout`, `stripe-webhook` (writes `entitlements`).

## DATABASE CHANGES

All of these are server-only (no client write policies). Reads are limited to your own rows where shown.

- `account_safety(user_id pk, age_band text, band_set_at, band_source)`: no client write; read own band.
- `voice_prefs(user_id pk, friend_on bool default false, ranked_on bool default false, notice_version int)`: written via the function.
- `voice_restrictions(user_id, mode, kind, until, reason_code, created_at)`.
- `player_blocks(blocker, blocked, created_at, pk(blocker, blocked))`: read own.
- `player_reports(id, reporter, reported, match_id, match_type, voice_active, category, note, created_at)`.
- `voice_sessions(match_id, user_id, cf_session_id, track_name, created_at, expires_at, connected_seconds)`.
- `voice_pings(match_id pk, a, b, version, updated_at)`: Realtime publication; RLS so only `a`/`b` can read; carries no reasons.
- `voice_events(…)` as above.
- `app_flags(key pk, value jsonb, updated_at)`.
- `entitlements(user_id, kind, season, starts_at, ends_at, source_purchase)`: for the Season Pass.
- Phase 3: `parent_accounts`, `parent_links`, `parent_pins`, `parental_controls` (see Parent PIN security model).

## SERVER CHANGES

- `pvp` function:
  - the voice actions, with the membership + policy + rate-limit gate on each;
  - Cloudflare API calls with `CF_REALTIME_APP_ID` / `CF_REALTIME_APP_SECRET` (new function secrets, never in the client);
  - teardown hooks on every way a match ends;
  - block and report.
- A sweeper, run on match end and via a scheduled function or `pg_cron` every minute, closes expired voice sessions.
- `stripe-webhook`: writes the Season Pass entitlement (when the pass is built).
- Phase 3: a `parent` function for link codes, PIN set/verify/reset, elevation tokens and the Stripe adult check.

## CLIENT CHANGES

- Voice controls in DuelScreen, remote matches only:
  - a single 🎙 chip showing the state (Available / Waiting / Connected / Disconnected / 🔒 Unavailable);
  - tapping it opens a small sheet: Mic on/off (icon + text, not colour alone), Mute opponent, Leave voice, Report, Block.
- The first-use safety notice, text as in the brief, with an acknowledgement version.
- Settings → Voice (toggles, block list); the age step; Parental Controls (phase 2).
- No visualisers or animation loops. State changes come from events only.

## RISKS TO EXISTING GAMEPLAY

| Risk | Why it's contained |
|---|---|
| Voice code crashes the battle screen | Isolated module; every call wrapped; failures call `destroy()` and show "Voice disconnected"; DuelScreen never awaits voice. |
| Signalling slows gameplay | Separate actions and a separate Realtime row; never bumps `m.version`; the gameplay poll is untouched. |
| iOS audio session changes the game's sound | Expected and minor; tested; documented. |
| A bad deploy | The `voiceSystemEnabled` kill switch; voice is additive server code. |
| Edge Function cold starts or latency | Voice actions only on taps, never in the turn loop. |
| Privacy or legal exposure | Adults-only V1; nothing recorded; review gate before teen voice. |

## ROLLBACK PLAN

1. **Instant:** set `voiceSystemEnabled=false` in `app_flags`. The UI hides, the server refuses voice actions, and the sweeper closes sessions within a minute. PvP is unaffected.
2. **Client:** revert the client commit. Voice UI code is in separate files, and DuelScreen keeps a one-line mount.
3. **Server:** redeploy the previous `pvp` `index.ts`. The voice tables can stay (unused) or be dropped by `voice.sql`'s `down` section.
4. **Cloudflare:** rotate or delete the Realtime app secret, which ends all voice immediately and independently of our code.

---

## LIVE VOICE AUDIO ON IPHONE (Safari ↔ Safari)

The primary real-world case is **iPhone Safari against iPhone Safari**, on the speaker, AirPods, other Bluetooth headsets or wired headphones. The rule: **on iPhone, gameplay is sacred; voice and music adapt around the game, never the other way around.**

### CURRENT THRENYX AUDIO ARCHITECTURE

There's one Web Audio `AudioContext`, made on the first tap (`core/audio.js initAudio()`):

```
                   ┌─ SFX voices (oscillators, noise, envelopes) ─► master (gain 0.8) ─► DynamicsCompressor ─┐
AudioContext ──────┤                       └─► reverb send (gain 0.35) ─► Convolver ─► master                ├─► destination
                   └─ <audio> A, B, C ─► MediaElementSource ─► per-player gain ─► musicBus (gain 1) ─────────┘
```

- **SFX:** every sound is synthesised (bells, thuds, whooshes, tones, choir) and scheduled into `master`. Nothing is sampled.
- **Music:** `core/music.js` owns three `<audio>` elements, unlocked inside the first tap:
  - A and B carry the score, crossfading at loop points;
  - C carries one-shot stings, which duck the score to about 15% underneath them;
  - each element feeds the context through `createMediaElementSource`, a per-player gain and `musicBus`.
- **The Hush:** ramps both `master` and `musicBus` to silence, then restores them. Today it restores `musicBus` to a **hard-coded 1**.
- **Backgrounding:** `music.js` pauses and resumes its elements on `visibilitychange`.
- **The loop watcher:** `music.js` uses the shared `onFrame` loop from `core/motion.js` to catch loop points. This is an existing per-frame callback (cheap, but present).

### HOW BACKGROUND MUSIC IS CURRENTLY PLAYED

Streamed MP3s (no whole-track buffers in memory) through the three `<audio>` elements above, routed **through Web Audio**, so music volume is controlled by Web Audio gains. Per-track mix levels run 0.42–0.55; stings duck the score with gain ramps of about 0.25 s.

### HOW SFX ARE CURRENTLY PLAYED

Synthesised on demand into `master` → compressor → output, with an optional reverb send. Each `sfx.*` call creates short-lived nodes that are garbage-collected when they finish. There are no sample files.

### WHETHER WEB AUDIO / AUDIOCONTEXT IS ALREADY USED

**Yes**, and for everything: SFX and music both depend on that single `AudioContext`. This matters on iOS. Starting the microphone changes the iPhone's audio session (to play-and-record), and historically WebKit has:
- suspended or "interrupted" existing AudioContexts;
- routed them to the earpiece;
- dropped their level;
- or run them at a mismatched sample rate, so the audio sounds sped up or slowed down.

Because the music `<audio>` elements are bound to this context with `createMediaElementSource`, the context **cannot simply be thrown away and rebuilt**: an element can only ever be attached to one context. This is the main iPhone risk (see Risks).

### CURRENT VOLUME SETTINGS ARCHITECTURE

**On/off only.** Settings → Sound (sets `master` to 0.8 or 0) and Settings → Music (starts or frees the players). There are **no volume sliders**; the player's actual loudness is the phone's hardware volume.

So "userMusicVolume" today is effectively `musicOn ? 1 : 0` × the per-track mix level. The voice design keeps that and adds **one** setting. No mixer.

### HOW YOU PLAN TO KEEP WEBRTC AUDIO SEPARATE

- **Microphone:** `getUserMedia({ audio: {...}, video: false })` → the mic track goes **straight into `RTCPeerConnection.addTrack`**. It's never connected to the AudioContext, never mixed with anything, and no `MediaStreamDestination` is ever created. Outgoing audio is the microphone only (rule 6).
- **Remote voice:** the opponent's `MediaStream` → one `<audio playsinline autoplay>` element dedicated to voice. It's **not** passed through Web Audio (no `createMediaStreamSource`), so it can't be mixed into anything and can't reach the outgoing capture through the app.
- **Game audio:** stays on its existing AudioContext. The only connection between the two systems is a **state flag** (`voiceActive`) that `core/audio.js` reads to set two gains. No audio flows between them.
- **Failure isolation:** every voice call is wrapped. An exception in voice calls `voice.destroy()` and shows "Voice disconnected"; it never throws into `audio.js`, `music.js` or `DuelScreen`. Game audio code never imports voice code.

### HOW MUSIC DUCKING WILL WORK

The volume model is state-based, never cumulative:
- `userMusicOn`: the existing setting, never touched by voice.
- `voiceDuckSetting`: the new setting **REDUCE MUSIC DURING VOICE CHAT**, default ON.
- `voiceActive`: true only while **both** players are joined *and* remote audio is actually playing.
- `duckMultiplier = (voiceActive && voiceDuckSetting) ? 0.25 : 1`
- `musicBus target = hushed ? 0 : duckMultiplier`

Implementation in `core/audio.js`:
- A new `setVoiceDuck(active)` stores the boolean and ramps `musicBus` to its **target** over about 350 ms (`cancelScheduledValues` + `setValueAtTime(current)` + `linearRampToValueAtTime(target)`).
- Calling it ten times in a row lands on the same value, so reconnects, unmutes and route changes can't stack (80% → 20% → 5% is impossible).
- The Hush's restore changes from the hard-coded `1` to the current target, so a Hush during voice comes back ducked, not at full volume.
- Stings keep ducking the score on their own per-player gains, which multiply with the bus. A victory sting during voice plays at 25% of its normal level, which is wanted.
- On voice end, `setVoiceDuck(false)` ramps back to 1 over about 350 ms. `destroy()` always calls it, including on errors, so the game can't be left quiet.

### HOW SOUND EFFECT LEVELS WILL WORK

Priority while voice is active: **remote voice > important gameplay SFX > music (ducked) > decorative SFX.**
- **Important SFX keep their level:** clash, clashWin, clashLose, reveal, deploy, focus, read/misread, matchWin/matchLose, slam.
- **Decorative SFX play at about 50%:** tap, select, cardFlip, power ticks, packHold, title, ambient whooshes. This is done with a small `decor` multiplier inside the existing `sfx` helpers, keyed off `voiceActive`. It's a constant, not a processing node.
- **The `master` level drops from 0.8 to about 0.65** while voice is active, so the loudest impacts can't smother speech. The existing compressor already limits peaks.
- Nothing is muted outright. Card and combat feedback stays clearly audible.

### HOW SAFARI AUTOPLAY WILL BE HANDLED

- **JOIN VOICE is the gesture.** Inside that tap, synchronously:
  1. create (or reuse) the voice `<audio>` element;
  2. call `audioEl.play()` on it while empty, to unlock it, the same trick `music.js` already uses;
  3. call `initAudio()` (resumes the game context);
  4. start `getUserMedia`.
- While the page is capturing the microphone, Safari allows audio playback of the incoming `MediaStream`.
- If `audioEl.play()` still rejects when the remote track arrives, show **TAP TO ENABLE VOICE AUDIO**. That button's tap calls `play()` again. Never fail silently.

### HOW IPHONE SPEAKER ECHO WILL BE HANDLED

- **Constraints:** `{ echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }`. After capture, read `track.getSettings()` and log which ones Safari actually honoured, as a product event, so real support is measured rather than assumed.
- **No custom echo cancellation.** On iOS, WebRTC capture runs through Apple's voice-processing path, which cancels what the phone itself is playing, the game's music included, as long as that sound goes through the same audio session. That is the mechanism that keeps one player's soundtrack out of the other's ears.
- **Belt and braces:** music ducked to 25% and decorative SFX halved reduce what the speaker pushes into the mic in the first place.
- **The Audio Session API** (`navigator.audioSession`, Safari 16.4+), feature-detected:
  - set `navigator.audioSession.type = 'play-and-record'` just before `getUserMedia`, so iOS routing is deliberate rather than switched mid-stream;
  - set it back to `'auto'` in `destroy()`;
  - if the API is absent, do nothing.
- **Accept, and say in the notice,** that while voice is on the phone may treat the game like a call: sound can get a little quieter, and AirPods switch to call mode.

### HOW AIRPODS / BLUETOOTH ROUTING WILL BE TESTED

**Automated tests can't reproduce iOS routing.** These must be run on real iPhones, and I can't run them from here. The checklist ships as `docs/17-voice-chat.md` § Device test matrix, with a pass or fail per row, and is required before each rollout stage. For every row, verify:
- remote voice is audible;
- the mic is live (the other phone hears you);
- music is at the ducked level, not silent and not full;
- SFX play;
- no "chipmunk" or slowed audio;
- the opponent's voice isn't doubled;
- the match continues.

**Device test matrix**

| # | Setup | Action |
|---|---|---|
| A | No AirPods | Join voice; talk both ways |
| B | AirPods already connected | Join voice |
| C | Joined on the speaker | Connect AirPods mid-call |
| D | Joined on AirPods | Take them out / disconnect mid-call |
| E | In voice | Turn Bluetooth off |
| F | After E | Turn Bluetooth back on |
| G | In voice | Wired headphones in, then out |
| H | In voice | Change hardware volume; toggle Music and Sound settings |
| I | In voice | Self-mute and unmute; mute the opponent and unmute |
| J | Pairs | speaker↔speaker · AirPods↔speaker · AirPods↔AirPods · BT headset↔AirPods · music on↔on · off↔on |
| K | Interruptions | Incoming call · FaceTime · Siri · Control Center · lock/unlock · app switch · Safari background/foreground · Wi-Fi↔cellular |
| L | Repetition | Join/leave voice 25× in one session; music must be back at normal every time |

Run each row in Safari and in the home-screen app, since the home-screen app has its own permission behaviour, on at least one recent and one older supported iOS version.

### HOW INTERRUPTIONS WILL BE DETECTED

These listeners are all registered with one `AbortController` and removed together:
- **The local mic track:** `ended`, `mute` / `unmute`;
- **The peer connection:** `connectionstatechange` and `iceconnectionstatechange` (`disconnected`, `failed`);
- **The page:** `visibilitychange`, `pagehide` / `pageshow`;
- **Devices:** `navigator.mediaDevices` `devicechange` (route changes such as AirPods in or out);
- **The game's AudioContext:** `statechange` (`suspended` / Safari's `interrupted`). This handler lives in `audio.js` and is game-owned. It resumes the context on the next tap; it does not wait on voice.
- **The remote `<audio>`:** `pause` / `stalled` while voice is supposedly active.

No polling. Every state change comes from these events.

### HOW BROKEN MICROPHONE TRACKS WILL RECOVER

When the page becomes visible again, or after a route change, the **gameplay is restored first**: the match view refreshes as it does today. Then, after a short settle (about 1.5 s), voice inspects the mic track:
- `readyState === 'live'`, not muted, and the connection fine → nothing to do.
- **Ended, or still muted 3 s after becoming visible → one controlled attempt:**
  1. If the mic permission is still granted on this page and the tab is visible, call `getUserMedia` again with the same constraints.
  2. Then `sender.replaceTrack(newTrack)` and stop the old track. **No renegotiation, no new peer connection, no match reload.**
- The peer connection is `disconnected`/`failed` → one ICE restart through our server within 10 s.
- **At most one recovery attempt per interruption.** Never in a loop. Never automatic while the tab is hidden.
- If Safari requires a gesture (rejects without one) → don't retry; show the button (below).

### WHAT HAPPENS IF RECOVERY FAILS

**The game wins.**
1. Call `voice.destroy()`: stop everything, close the peer connection, restore music.
2. Show a small notice: **VOICE AUDIO INTERRUPTED · REJOIN VOICE**.
3. REJOIN VOICE is a fresh, gesture-started join through the server, re-authorised.
4. The match continues exactly as before. No reload, no forfeit, no gameplay calls blocked on voice.
5. A `voice_disconnected` event records the reason category, for the stability numbers.

### HOW AUDIO RESOURCES WILL BE CLEANED UP

This extends the general cleanup plan. `voice.destroy()` is idempotent and always:
1. stops every local track, which releases the mic and clears the iOS orange dot;
2. empties the remote `<audio>` (`pause()`, `srcObject = null`), keeping one element for reuse because the element is unlock-sensitive on iOS, and never creating a new one per call;
3. closes the peer connection;
4. aborts all listeners (one `AbortController`);
5. clears every timer: settle, recovery, ICE restart, join timeout;
6. calls `setVoiceDuck(false)`, which ramps music back to 1;
7. resets the SFX `decor` multiplier and `master` to normal;
8. sets `navigator.audioSession.type = 'auto'` if it was set;
9. unsubscribes `voice_pings`;
10. sets `voiceActive = false`.

**Automated soak test** (Chromium with a fake mic): 50 cycles of join → connect → leave, interleaved with match ends. After each cycle it asserts:
- `musicBus.gain` back at 1 (±0.01);
- `master` back at 0.8;
- 0 live local tracks;
- 0 open peer connections;
- 1 voice `<audio>` element;
- listener and timer counters back at baseline.

At the end, heap within ±5% after GC. The same 25-cycle run is done by hand on iPhone with Web Inspector.

### FILES THAT NEED TO CHANGE (audio)

- `client/js/core/audio.js`:
  - `setVoiceDuck(active)`, a state-based ramp on `musicBus`;
  - the Hush restores to the duck target instead of 1;
  - voice-time `master` level and the decorative `decor` multiplier;
  - an AudioContext `statechange` handler that resumes on the next tap.
- `client/js/core/music.js`: no logic change expected. Stings already compose with the bus.
- `client/js/voice/session.js` (new): capture constraints, the remote element, the Audio Session API, interruption listeners, the single recovery attempt, `destroy()`.
- `client/js/voice/ui.js` (new): status chip; "Tap to enable voice audio"; "Voice audio interrupted · Rejoin voice".
- `client/js/core/store.js`: a default `settings.voiceDuck = true`.
- `client/js/screens/more.js`: the **Reduce music during voice chat** toggle, shown with the Sound and Music toggles.
- Tests: `sim/voice-soak.mjs` (Playwright, fake media); the manual device matrix above.

### RISKS (audio)

| Risk | Likelihood | Handling |
|---|---|---|
| **The game's AudioContext is disturbed when the mic starts**: suspended, quieter, earpiece, or wrong-rate "chipmunk" audio | Medium on some iOS versions | `navigator.audioSession` set before capture; context `statechange` resume; **test row A/B on each iOS version.** If the rate bug appears, the fallback is to recreate the AudioContext *and* the three music elements inside the JOIN VOICE gesture, which is a contained change to `audio.js`/`music.js` because both are already rebuilt on unlock. It's only done if the matrix shows the bug. |
| AirPods route changes break capture or playback | Medium | One `replaceTrack` attempt, then fail gracefully (rows C–F). |
| Speakerphone echo of the opponent's music | Low–medium | iOS voice processing + ducking + halved decorative SFX; measured in the matrix. |
| Music left quiet after voice | Low | State-based duck, `destroy()` always restores, soak test asserts it. |
| Voice code throwing into the game | Low | Isolation, try/catch boundaries, no imports from game audio into voice beyond `setVoiceDuck`. |
| Memory growth over many matches | Low | One element reused, one peer connection per join, the soak test. |
| Battery or CPU | Low | No analysers, visualisers or new frame loops; the existing music loop watcher is unchanged. |

## RECOMMENDATION

**Proceed, in phases. Do not ship any voice to minors yet.**

1. **Phase 0, foundations (needed regardless of voice):**
   - the age step (age band only), blocks, reports, `app_flags`, first-party events;
   - Privacy and Terms updates;
   - **legal review of the age model and the under-13 question.**
2. **Phase 1, adult Friend Voice:**
   - `voice_policy` + Cloudflare SFU + controls + cleanup + soak test;
   - Stage 1 internal allowlist → Stage 2 adult Friend Challenges;
   - real-device iPhone testing (speaker, AirPods, wired; lock, call, network switch).
3. **Phase 2, Season Pass + Ranked Voice (adults):** the entitlements model, the pass product (no auto-renew), Ranked Voice behind its flag.
4. **Phase 3, teen voice under parental controls:** **only after legal sign-off.** Parent Accounts with an adult (payment-card) check; the parent links the child, holds the PIN and is the only one who can reset it. Teens default to all voice blocked until the parent allows it. Under-13 voice stays off.

**Why not all at once:** the parental PIN can't be made genuinely secure on the current account model, which has no age and no parent identity; Parent Accounts fix that in Phase 3. Shipping it now would be "fake parental security", which the brief rules out. Everything else (WebRTC via Cloudflare SFU, server-authoritative policy, opt-in, mute, block, report, cleanup, flags, analytics) fits the existing architecture cleanly, with no change to the Duel engine or matchmaking.

Sources for Cloudflare details (re-verify in the dashboard before launch): [Cloudflare TURN/SFU product page](https://www.cloudflare.com/products/turn-sfu/), [Realtime SFU pricing](https://developers.cloudflare.com/realtime/sfu/pricing), [Realtime SFU Connection API](https://developers.cloudflare.com/realtime/sfu/api/), [Negotiation and session lifecycle](https://developers.cloudflare.com/realtime/sfu/concepts/negotiation/), [RealtimeKit pricing](https://developers.cloudflare.com/realtime/realtimekit/pricing), [Cloudflare Realtime product page](https://www.cloudflare.com/products/realtime/).

## BUILT (1 October 2026): what shipped, and how to switch it on

Voice is built and **switched on** (app_flags seeded true). Until the steps below are
done, the game simply shows no JOIN VOICE button (the server reports
`unavailable`), and Settings → Voice says it's still being set up. Matches are never
affected.

| Piece | File |
|---|---|
| Who may talk (pure, unit-tested) | `engine/voice-policy.js`, `test/voice-policy.test.js` |
| Tables, flags, the refunded-pass column | `supabase/voice.sql` |
| Server (age, card check, ID check, relay, blocks, reports, events, limits) | `supabase/functions/voice/server.ts` → bundled `index.ts` |
| Season Pass product and the season end date | `engine/shop.js` (`PASSES`), `supabase/functions/create-checkout/index.ts` |
| The call itself (WebRTC, recovery, cleanup) | `client/js/voice/session.js` |
| Chip, sheet, notice, report, Settings → Voice | `client/js/voice/ui.js` |
| Ducking and decorative-sound levels | `client/js/core/audio.js` (`setVoiceDuck`) |
| Server test (fake Cloudflare + Stripe, 57 checks) | `node sim/voice-server-test.mjs` |
| Browser soak test (50 rounds, real WebRTC) | `node sim/voice-soak.mjs` |

### Switching it on (one time)

1. **Supabase → SQL Editor:** run `supabase/voice.sql`.
2. **Cloudflare → Realtime → Serverless SFU → Create application.** Copy the **App ID** and the **App token**.
3. **Supabase → Edge Functions → Secrets:** add `CF_REALTIME_APP_ID` and `CF_REALTIME_APP_SECRET` (the token). Never paste the token in chat or the game. `STRIPE_SECRET_KEY` and `SITE_URL` are already there.
4. **Stripe → Identity:** activate Identity (live mode). Nothing to paste: the voice function uses the existing secret key.
5. **Supabase → Edge Functions → Deploy a new function** named **voice**, pasting `supabase/functions/voice/index.ts`. Open **Details** and turn **Verify JWT OFF** (like the others).
6. Redeploy **economy** (`supabase/functions/economy/index.ts`, it now knows the Season Pass) and **create-checkout** (the Season Pass price).

### Day to day

- **Switches:** Supabase → Table Editor → `app_flags`. `voiceSystemEnabled` off stops all voice within 30 seconds; `friendVoiceEnabled` and `rankedVoiceEnabled` stop one kind.
- **Reports:** Table Editor → `player_reports` (status `open`). To act: set `voice_accounts.restricted_friend` / `restricted_ranked` to true (with `restricted_until` for a time-out), then mark the report `actioned` or `dismissed`.
- **Refunding a Season Pass:** refund it in Stripe, then set `refunded_at` on its row in `purchases`. Ranked Voice stops at once.
- **The season's end:** change `PASSES.firstfall.ends` in `engine/shop.js` and `until` in create-checkout together.
- **Cost watch:** Cloudflare → Realtime → usage. Audio is about 50 KB/s per listener; the first 1,000 GB a month are free.

### Known limits

- No TURN relay of our own: players on very strict networks (some school or office Wi-Fi) may fail to connect. They see "Voice couldn't connect", and the match goes on.
- An ID check can't stop one adult's ID from being used for several accounts. Reports and restrictions cover abuse.
- The Parent Account model stays designed, not built: under the current rules a declared under-18 never gets voice.
