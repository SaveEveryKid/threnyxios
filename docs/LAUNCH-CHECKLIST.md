# Launch morning checklist

Do these top to bottom. Each one takes a few minutes.
To copy a file: open its GitHub link and tap **Copy raw file**.
Links start with `https://github.com/SaveEveryKid/idea/blob/claude/epoch-tcg/game/`

---

## Part 1: Supabase SQL (SQL Editor)
For each file: **New query**, paste it, **Run**. All of them are safe to run again.

- [ ] **1.** `supabase/purchases.sql`
- [ ] **2.** `supabase/vaults.sql`
- [ ] **3.** `supabase/oktober.sql` (new: the tournament)
- [ ] **3b.** `supabase/referrals.sql` (new: invite codes)
- [ ] **3c.** `supabase/alliance-chat-off.sql` (new: removes Alliance chat for good)
- [ ] **3d.** `supabase/text-filter.sql` (new: word filter on Alliance names, mottos and member names)

## Part 2: Redeploy the functions (Edge Functions)
For each one: open it → **Code** → select all and delete → paste the new file → **Deploy**.

- [ ] **4.** **pvp** ← `supabase/functions/pvp/index.ts` (now also filters display names)
  *Echoes, the activity feed, the 60-second disconnect rule, Oktoberfest, emotes*
- [ ] **5.** **economy** ← `supabase/functions/economy/index.ts`
  *reward limits, ranked rewards, the Eighth Bell prize, invites and the share bonus*
- [ ] **6.** **create-checkout** ← `supabase/functions/create-checkout/index.ts`
  *tax included in prices, starter bundle removed*
- [ ] **7.** **stripe-webhook**: no change needed.
- [ ] **8.** On **all four** functions, open **Details** and check **Verify JWT is OFF**.

## Part 3: Supabase settings (one-time)
- [ ] **9.** **Edge Functions → Secrets.** Check these three are set:
  - `STRIPE_SECRET_KEY` = your **live** key (`sk_live_…`)
  - `STRIPE_WEBHOOK_SECRET` = the **live** webhook's secret (`whsec_…`)
  - `SITE_URL` = `https://threnyxtcg.com`
- [ ] **10.** **Authentication → Sign In / Providers → Email:** **Confirm email OFF**.
- [ ] **11.** **Authentication → URL Configuration:** Site URL `https://threnyxtcg.com`, and add it to Redirect URLs too.

## Part 4: Stripe (Live mode)
- [ ] **12.** **Developers → Webhooks → your live webhook → Event deliveries.** Find your starter-bundle purchase and tap **Resend**. It should say **200**.
- [ ] **13.** **Tax → Settings** (in live mode): head office address, category **Video Games – streamed – non subscription – with limited rights**, prices **include** tax.

## Part 5: Test it (on your phone)
Close the tab and open **threnyxtcg.com** fresh.

- [ ] **14.** Sign in. Your collection is there.
- [ ] **15.** **More → Rules** opens the Rules screen.
- [ ] **16.** **Home → Oktoberfest banner** opens the standings (not an error).
- [ ] **17.** **Online → Find a match.** At 8 seconds an Echo is offered; at 30 seconds an Echo match starts by itself.
- [ ] **18.** Play one ranked or Echo match. You get rewards, and the "Just now" feed shows it.
- [ ] **19.** **Shop → 500 Chimes** with your real card. The Chimes arrive. Then refund it in **Stripe → Payments**.
- [ ] **20.** The starter bundle you bought earlier shows up (3 Collector + 10 Standard packs and an alt-art Aurelle).

**If something fails, screenshot it and send it to me.**

---

## Part 6: Live voice chat (when you're ready; the game works without it)
Full notes: `docs/17-voice-chat.md` → BUILT.
- [ ] **V1.** SQL Editor: run `supabase/voice.sql`.
- [ ] **V2.** Cloudflare → **Realtime → Serverless SFU → Create application**. Keep the App ID and App token handy (don't paste the token anywhere but Supabase).
- [ ] **V3.** Supabase → Edge Functions → **Secrets**: add `CF_REALTIME_APP_ID` and `CF_REALTIME_APP_SECRET`.
- [ ] **V4.** Stripe (live) → **Identity**: activate it.
- [ ] **V5.** New Edge Function **voice** ← `supabase/functions/voice/index.ts`, **Verify JWT OFF**.
- [ ] **V6.** Redeploy **economy** and **create-checkout** (the Season Pass).
- [ ] **V7.** Test with a friend: both set your birth month and year in **More → Voice chat**, do the card check, switch Friend Voice on, start a Friend Challenge, tap **JOIN VOICE**.

## Part 7: Guest play (strangers play before making an account)
Full notes: `docs/18-guest-play.md`.
- [ ] **G1.** Supabase → **Authentication → Sign In / Providers → Allow anonymous sign-ins: ON**.
- [ ] **G2.** SQL Editor: run `supabase/guest.sql`, then re-run `supabase/text-filter.sql`.
- [ ] **G3.** Redeploy **economy**, **pvp**, **voice** and **create-checkout**, each from its `index.ts`.
- [ ] **G4.** Test on your phone in a private tab: open threnyxtcg.com → **Skip training · Play now** → you're in a Duel with no account. Then **Save my profile** from Home: your Champions stay.
- [ ] **G5.** Online → **Make a link** → send it to a friend → they tap it and play you without an account.

## Part 8: Friends and trading
Full notes: `docs/19-friends-trading.md`.
- [ ] **F1.** SQL Editor: run `supabase/trading.sql`.
- [ ] **F2.** Redeploy **economy** from `supabase/functions/economy/index.ts`.
- [ ] **F3.** Test with a friend: **Home → Friends** → send your code → they add you → accept → tap **Wanna Duel?** → tap **Trade** and send an offer → they get a banner, tap **Counter**, send it back → you accept.

# To-do list (after launch)

**Waiting on you**
- [ ] When your **Alabama sales tax number** arrives: **Stripe → Tax → Registrations → Add → Alabama**.
- [ ] Have your accountant or a lawyer skim the **Terms, Privacy, Refunds and Oktoberfest Official Rules** pages.
- [ ] **Art for Oktoberfest** (prompts are in chat): the hall background, event banner, finals arena, Oktoberfest pack, badges and share image. Send them however they come out.
- [ ] Tell me **go** on the Oktoberfest hype features: points shown after every match, the community Bell meter, and the finals weekend spectacle.

**Waiting on me (say the word)**
- [ ] **Refunds and chargebacks:** take the Chimes back automatically when you refund someone in Stripe. *Do this one soon.*
- [ ] **Player-to-player trading**, so the Eighth Bell can actually be traded (needed by Nov 2).
- [ ] **Password reset** for username accounts that didn't give an email.
- [ ] **Eighth Bell foil and shimmer effects** (optional polish).

**Key dates**
- **Oct 1–30:** Oktoberfest qualifying (starts on its own).
- **Sat Oct 31 – Sun Nov 1:** finals for the top 8.
- **Mon Nov 2:** the Eighth Bell goes to the champion automatically.
