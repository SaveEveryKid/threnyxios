Build an iPhone app for my finished game, THRENYX, so it passes Apple App Store review. The game is already complete and live at https://threnyxtcg.com. Do NOT redesign, rewrite or "improve" the game. Keep every screen, rule, number, card, artwork, sound, animation and server function exactly as they are. Only make the changes listed under "What must change for Apple". If something isn't on that list, leave it alone.

## Where the game is

This GitHub repository. It's a copy of the live game, made for building the iPhone app, so change only what this prompt asks.

- `client/` holds the screens, styles, art and audio. `client/index.html` is the page.
- `engine/` holds the game rules, imported by the client with relative paths.
- **The ready-to-run web build:** run `bash tools/build-site.sh` (it needs `git` and `node`) to produce `site/`, a self-contained copy of `client/` + `engine/` with `site/index.html` as the entry point. This is exactly what runs at threnyxtcg.com, and it's what the app should bundle. (`site/` is a build output, not committed.)
- `supabase/` holds the database SQL and Supabase Edge Functions (`economy`, `pvp`, `voice`, `create-checkout`, `stripe-webhook`). Each function's `server.ts` is the source; `index.ts` is the bundled file built by `bash tools/bundle-functions.sh`.
- `docs/` explains everything. `docs/13-monetization.md`, `docs/15-server-collection.md`, `docs/17-voice-chat.md`, `docs/18-guest-play.md` and `docs/19-friends-trading.md` matter most here.
- Tests: `npm test` (unit tests), plus `node sim/*-server-test.mjs` for the server functions. Keep them passing.

The backend is Supabase (project URL and public anon key are in `client/js/config.js`; they're meant to be public). All game logic that has value (the collection, packs, Chimes, trades) runs on the server in the `economy` Edge Function. The app must keep using that same backend so web and iPhone players share one account, one collection and one leaderboard.

## How to build it

1. An Expo (React Native) app in a new folder `ios-app/`, built with EAS (it needs native modules, so a development build, not Expo Go). Bundle ID: `com.threnyx.app`. App name: THRENYX. Portrait only. iPhone first; iPad allowed but not required.
2. A full-screen `react-native-webview` that runs the game from the built `site/` files, **bundled inside the app** (not loaded from the website), so it opens instantly and training and matches against the computer work offline. The game uses JavaScript ES modules, which WKWebView won't load from `file://`. Serve the bundled `site/` folder from a small local static server inside the app (e.g. `@dr.pogodin/react-native-static-server`) on `http://localhost:<port>/`, and load that. Allow WebView settings the game needs: JavaScript, DOM storage (it saves with `localStorage`, which must persist between launches), inline media playback, media playback without a user gesture for sound effects, and WebRTC microphone access (live voice chat).
3. Respect the iPhone safe areas (notch and home bar). The game already pads for them with `env(safe-area-inset-*)`; make sure the WebView doesn't add extra insets or bounce/overscroll.
4. Add a small JavaScript bridge (`window.ReactNativeWebView.postMessage` one way, `injectJavaScript` the other) and set `window.THRENYX_APP = { platform: 'ios', version }` before the game loads, so the game knows it's inside the iPhone app. Make the smallest possible changes to the game's JavaScript to use the bridge; don't touch anything else in it.

## What must change for Apple

### 1. Purchases must use Apple In-App Purchase (Guideline 3.1.1)

On the website, Chimes and bundles are bought through Stripe Checkout (`client/js/core/cloud.js` → `checkout()` → `create-checkout` function → `stripe-webhook` writes a row to the `purchases` table → the `economy` function grants it). Inside the iPhone app, all of these must be bought with StoreKit In-App Purchase instead, and no Stripe link, button or page may appear anywhere in the app.

- Use `react-native-iap` (or RevenueCat's `react-native-purchases`) for StoreKit 2.
- Products to create in App Store Connect (same prices as the website's `engine/shop.js` PRODUCTS):

| App Store product ID | Game product id | Type | Price |
|---|---|---|---|
| com.threnyx.app.spark | spark | Consumable (server allows 1 per account) | $0.99 |
| com.threnyx.app.firstlight | firstlight | Consumable (server allows 1 per account) | $1.99 |
| com.threnyx.app.chimes240 | chimes240 | Consumable | $2.99 |
| com.threnyx.app.chimes500 | chimes500 | Consumable | $4.99 |
| com.threnyx.app.chimes1100 | chimes1100 | Consumable | $9.99 |
| com.threnyx.app.chimes2400 | chimes2400 | Consumable | $19.99 |
| com.threnyx.app.chimes6500 | chimes6500 | Consumable | $49.99 |
| com.threnyx.app.pass_firstfall | pass_firstfall | Non-Renewing Subscription | $12.99 |

The Season Pass (`pass_firstfall`) is hidden in the game until I switch voice chat on (`hidden: true` in `engine/shop.js`). Set it up in App Store Connect but keep it hidden in the app until the game un-hides it. It ends on the season's end date whenever it's bought, and the game already tells the player that before they pay; keep that message on the iOS purchase sheet too.

- Flow: the game's Buy button calls the bridge instead of `checkout()` when `window.THRENYX_APP` is set → the app starts the StoreKit purchase with `appAccountToken` set to the player's Supabase user id (a UUID) → on success, the app sends the signed transaction (JWS) to a **new Supabase Edge Function `apple-iap`**, with the player's Supabase session token → the function verifies the JWS with Apple's certificate chain (or asks the App Store Server API), checks the bundle ID, the product, and that `appAccountToken` matches the signed-in user, then inserts a row into the existing `purchases` table: `{ id: 'apple_' + transactionId, user_id, product: <game product id>, amount_cents }`. Inserting the same transaction twice must be harmless (the id is the primary key) → only after the server says OK does the app call `finishTransaction` → the game then calls its existing purchase claim (`claimPurchases` in `cloud.js` / the `economy` function's `vault` action), which grants the items exactly as it does for Stripe today. Don't change how the economy grants purchases.
- Refunds: App Store Server Notifications V2 (`REFUND`) to the same `apple-iap` function. Record them; follow whatever the Stripe webhook does for refunds today.
- Unfinished transactions found at app start (crash, lost signal) must be sent to `apple-iap` and finished, so nobody pays without getting their Chimes.
- A "Restore purchases" button in the Shop (needed for the Season Pass): it re-sends current entitlements to `apple-iap`.
- Guests (players who haven't saved a profile) can't buy; the game already sends them to "Save your profile" first. Keep that.
- Chimes-to-pack offers inside the game (Standard, Collector, Faction, Firstfall, Mythic Pack) are spent with in-game Chimes and stay exactly as they are.
- Pack odds are already published in the game (Packs screen → Published odds, including the Mythic Pack). Guideline 3.1.1 requires this for random items; keep it visible.
- Secrets for `apple-iap` (App Store Connect API key, issuer ID, key ID, bundle ID) go in Supabase → Edge Functions → Secrets. Never put them in the app or the web code.

### 2. Account deletion inside the app (Guideline 5.1.1(v))

Add "Delete my account" to the game's More screen (under the account section), with a clear confirmation step ("This deletes your profile, collection and progress forever"). It calls a new Edge Function `account` (op `delete`) that deletes the signed-in user with `admin.auth.admin.deleteUser`. Their vault, saves, friends, trades and so on are removed by the existing `on delete cascade` foreign keys. Before deleting, copy that user's rows from `purchases` into a new table `purchase_records` (same columns, no foreign key), because purchase records must be kept for tax law (the Privacy Policy says so). Then sign the player out and return to the start screen. Works for guests too.

### 3. Reporting players (Guideline 1.2, user-generated content)

The game already has the other safety pieces: a word filter on player names, no typed chat (friend messages are picked from a fixed list), Block on friend pages and requests, and Report inside voice chat. Add a **Report** button next to Block on a friend's page (`client/js/screens/friends.js`) and on a Trade Board post (`client/js/screens/trade.js`), with the same categories the voice report uses. Save reports to the existing `player_reports` table through the existing `voice` function's report action, or a tiny new `report` op in the `economy` function. Add a support contact (email or form link) on the More screen.

### 4. Make it a real app, not a website in a box (Guideline 4.2)

- **Push notifications** with `expo-notifications`: when a trade offer, counter-offer, accepted trade, friend request, friend message or "Wanna Duel?" arrives. The game already detects all of these (`client/js/core/notify.js`; the `economy` function's `social` → `ping` op returns them). Store each device's Expo push token in a new `push_tokens` table (user_id, token, platform, updated_at; row level security on), saved through a new `economy` op, and send pushes from the `economy` function when those events are created (offer, respond, counter, add, accept, send). Ask for notification permission after the player's first friend request or trade, not at first launch. Tapping a notification opens the right screen (`#/trade?tab=offers`, `#/friends`, `#/friends?id=…`).
- The app-icon badge shows the number of waiting offers, requests and messages (the game already computes this; just set it natively).
- Native haptics through the bridge where the game already vibrates (`client/js/core/haptics.js`).
- Native share sheet for the game's Share buttons (friend link, Duel challenge link, invite link).
- **Universal Links**: `https://threnyxtcg.com/?duel=CODE`, `?friend=CODE` and `?ref=CODE` should open the app when it's installed. Add the associated-domains entitlement, and give me the `apple-app-site-association` file to host on the website.
- Hide the game's "Add THRENYX to your home screen" tile inside the app (it's for the website).

### 5. Sign-in

The game uses its own username and password accounts (and anonymous guest play) through Supabase. Google sign-in exists in the code but is switched off (`google: false` in `config.js`). Keep it off in the app, so Sign in with Apple isn't required (Guideline 4.8). If you turn on any third-party sign-in, add Sign in with Apple too.

### 6. Voice chat

Live voice chat uses WebRTC (Cloudflare Realtime) inside the game, and is for adults only behind the game's existing age and card or ID checks. Keep all of that. Add the microphone permission string: "THRENYX uses the microphone only for live voice chat with other players during a match, when you switch it on." Make sure WebRTC audio works in the WebView (`allowsInlineMediaPlayback`, `mediaPlaybackRequiresUserAction=false`, iOS 15+ microphone permission handling). The Stripe card check and Stripe Identity ID check used for voice are age verification, not purchases. They open in Safari or an in-app browser, never take payment, and are allowed. Keep them.

### 7. Privacy and App Store Connect

- Privacy Policy URL: https://threnyxtcg.com/client/legal/privacy.html. Terms: https://threnyxtcg.com/client/legal/terms.html. Both are already in the game.
- Add a privacy manifest (`PrivacyInfo.xcprivacy`) with the required-reason API declarations for every SDK used.
- App Privacy answers ("nutrition label"), from the game's Privacy Policy: user ID, username, optional email, purchase history, gameplay data, optional voice (live only, never recorded), crash data, and first-party product interaction events (`funnel_events`, used only to improve onboarding). Nothing is used for tracking and there are no ads, so **no App Tracking Transparency prompt**.
- Export compliance: HTTPS only, so set `ITSAppUsesNonExemptEncryption` to NO.
- Age rating questionnaire: random paid items (loot boxes) yes, in-app purchases yes, user interaction yes (friends with preset messages, trading, voice for verified adults only), no unrestricted web access. Do not put the app in the Kids category.
- Give me the App Store screenshots list (6.7" and 6.5" iPhone), a short and long description, keywords and a review note that explains: guest play needs no account; a demo username and password for the reviewer (I'll make one); where pack odds are shown; that voice chat is adults-only and off by default; and that all digital items are bought with In-App Purchase.

### 8. Hidden web-only bits

When `window.THRENYX_APP` is set, the game must not show: Stripe or any "pay on the website" link, prices that differ from the App Store's (use StoreKit's localized prices on the Shop's real-money rows), the website install tile, or browser-only hints. Everything else looks and plays exactly the same as the website.

## Don't change

The cards, art, sounds, music, rules, Duel engine, AI, story, Codex, pack odds, Ascension, crafting, Embers, Mythic Pack, weekly limits, trading, friends, preset messages, guest play, Oktoberfest, the Supabase tables and the existing Edge Functions (`economy`, `pvp`, `voice`, `create-checkout`, `stripe-webhook`), except the small additions above. The website keeps using Stripe; only the iPhone app uses Apple In-App Purchase.

## When you're done, give me

1. The Expo project.
2. Every new or changed file in the game and in `supabase/` (the new `apple-iap` and `account` functions, the push additions, and the SQL for `purchase_records`, `push_tokens` and anything else new), with exact steps to deploy them.
3. A checklist for App Store Connect: products, the Server Notifications URL, the API key into Supabase secrets, Universal Links, TestFlight, and review notes.
