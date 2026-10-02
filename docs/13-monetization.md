# Monetization: Chimes, the Shop and Stripe

## What's for sale (docs/06 §9)

- **Chimes** are bought with real money and spent in the Shop on packs:

  | Pack | Chimes |
  |---|---|
  | Standard | 120 |
  | 5 Standard | 500 |
  | 10 Standard | 900 |
  | Collector | 280 |
  | Faction | 150 |
  | Firstfall | 150 |

- **Chimes bundles:**

  | Chimes | Price | Bonus |
  |---|---|---|
  | 500 | $4.99 | |
  | 1,100 | $9.99 | +10% |
  | 2,400 | $19.99 | +20% |
  | 6,500 | $49.99 | +30% |

- **First Purchase Bundle** (one per account), $4.99: 3 Collector + 10 Standard Packs and an Alt-Art Aurelle.
- **Never sold:** Power, stats, Focus, READs, Initiative, exclusive Champions. Money speeds up a collection that free play completes (docs/07 §2.6: spenders gain nothing measurable).

## How a purchase works

1. **The player taps a Chimes bundle.** The game calls the Supabase function `create-checkout`. The function checks who is signed in, looks up the price on the server, and opens a Stripe Checkout page.
2. **The player pays on Stripe.** Card details never touch the game.
3. **Stripe calls `stripe-webhook`.** The function checks Stripe's signature and records the purchase in the `purchases` table.
4. **The server adds the purchase to the player's vault** (docs/15) when the game returns from Stripe and whenever the player signs in. It records which purchases it has added, so each pays exactly once, and the game never grants purchases itself.

Players must be signed in to buy, so purchases follow the account.

## Setup (about 30 minutes, once)

### 1. Stripe
1. Create an account at stripe.com.
2. Stay in **Test mode** (the toggle at the top) until you've tested a purchase.
3. Go to **Developers → API keys** and copy the **Secret key** (`sk_test_…`).

### 2. Supabase: the table
In the SQL Editor, run `game/supabase/purchases.sql`.

### 3. Supabase: the two functions
Go to **Edge Functions → Deploy a new function → Via editor**. Deploy both:

| Function name | Code from | "Verify JWT" |
|---|---|---|
| `create-checkout` | `game/supabase/functions/create-checkout/index.ts` | **OFF** (it checks the signed-in player itself) |
| `stripe-webhook` | `game/supabase/functions/stripe-webhook/index.ts` | **OFF** (Stripe doesn't sign in) |

### 4. Supabase: secrets
Go to **Edge Functions → Secrets** and add:
- `STRIPE_SECRET_KEY`: the `sk_test_…` key from step 1.
- `STRIPE_WEBHOOK_SECRET`: from step 5 below.
- `SITE_URL`: `https://threnyxtcg.com`
- `STRIPE_TAX` (optional): leave it unset so Stripe Tax records sales tax at checkout. Prices include tax (the buyer pays the listed price). Set it to `off` only to sell without tax (checkout fails if Stripe Tax isn't set up in the Stripe account).

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically.

### 5. Stripe: the webhook
1. Go to **Developers → Webhooks → Add endpoint**.
2. URL: `https://dydncpywveeudvtroljl.supabase.co/functions/v1/stripe-webhook`
3. Events: `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
4. Copy the **Signing secret** (`whsec_…`) into the `STRIPE_WEBHOOK_SECRET` secret.

### 6. Turn it on
`payments: true` in `game/client/js/config.js` (already on).

### 7. Test
1. Sign in, then go to Shop → buy 500 Chimes.
2. Pay with Stripe's test card: `4242 4242 4242 4242`, any future date, any CVC.
3. You land back in the Shop with the Chimes added.

When that works, switch Stripe to **Live mode**, create the live secret key and a live webhook, update both secrets, and you're taking real payments.

## Before charging real players
- **Stripe needs your business details** (identity, bank account) before live payouts.
- **Terms of service, a privacy policy and a refund policy.** Stripe and app stores expect them. For a minors audience, check local rules on loot boxes. The game already publishes pack odds (Packs → Published odds).
- **App stores:** selling digital goods *inside* an iOS or Android app must use Apple's or Google's in-app purchases (with their 15–30% fee). Stripe is fine for the **website**.
- **Cheating:** collections and Chimes live on the server for signed-in players (docs/15).
