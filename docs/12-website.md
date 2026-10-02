# Putting THRENYX on a website, with accounts

The game is plain files: no server code runs it. Any static host can serve it. Accounts and cloud saves use **Supabase**, which has a free tier. The same service can later carry PvP.

## 1. Build the site

```sh
cd game
bash tools/build-site.sh   # writes game/site/ (index.html + client/ + engine/, ~80 MB)
```

To check it locally, run `python3 -m http.server 8080 --directory site` and open http://localhost:8080.

## 2. Host it (pick one)

**Cloudflare Pages (recommended: free, fast, handles the art sizes)**
1. Go to dash.cloudflare.com → Workers & Pages → Create → Pages → Connect to Git.
2. Choose `SaveEveryKid/idea` and the branch `claude/epoch-tcg`.
3. Set these build settings:
   - Root directory: `game`
   - Build command: `bash tools/build-site.sh`
   - Output directory: `site`
4. Deploy. You get `https://<name>.pages.dev`. Add your own domain under Custom domains.

Every push to the branch redeploys the site.

**Netlify:** use the same settings: base `game`, build `bash tools/build-site.sh`, publish `game/site`.

**Any web host:** run the build and upload the contents of `site/`.

Without step 3, progress already saves in each browser on each device. It only disappears if that browser's site data is cleared.

## 3. Turn on accounts (Supabase)

1. Create a project at supabase.com.
2. **SQL editor**: run this once.

```sql
create table public.saves (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.saves enable row level security;
create policy "own save: read"   on public.saves for select using (auth.uid() = user_id);
create policy "own save: insert" on public.saves for insert with check (auth.uid() = user_id);
create policy "own save: update" on public.saves for update using (auth.uid() = user_id);
```

3. **Authentication → URL Configuration**:
   - Set Site URL to your site address, for example `https://threnyx.pages.dev`.
   - Add the same address to Redirect URLs.
4. **Authentication → Providers**:
   - Email is on by default. It sends a sign-in link, so there are no passwords.
   - Google is optional. It needs a Google Cloud OAuth client; Supabase's page for the provider walks through it.
5. **Project Settings → API**: copy the Project URL and the `anon` public key into `game/client/js/config.js`:

```js
export const CLOUD = { url: 'https://xxxx.supabase.co', anonKey: 'eyJ…' };
```

The anon key is meant to be public. The row-level security rules above make sure each player can only read and write their own save.

6. Commit and push. The site redeploys with accounts switched on.

## How it behaves

**Signing in**
- More → Account → Sign in, with Google or an emailed link.
- On a new device, the training screen shows **Already played? Sign in**, so you never repeat the tutorial.

**Saving**
- The save follows the account. Every change uploads about 2 seconds later, and again when the tab is hidden.
- On sign-in the newer save wins, except that a device still in training always takes the account's save.

**Skip training** is on the training screen. It gives all 16 starter heroes, a ready-made deck, Focus and READ, and the finishing reward.

## Security note

The save lives on the player's device and the game trusts it. That's fine for single-player. For PvP, ranked play and trading, the server must hold the collection and settle matches itself, so players can't edit their saves to cheat. That's part of the PvP work.
