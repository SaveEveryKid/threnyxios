// Starts a Stripe Checkout for a signed-in player. Prices live HERE (the
// server), never in the page. Deploy: see docs/13-monetization.md.
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const PRODUCTS: Record<string, { name: string; cents: number; once?: boolean; until?: string }> = {
  // starter (First Purchase Bundle) is off sale for now; past buys still deliver
  // one-time first purchases (engine/shop.js has what they contain)
  spark: { name: 'First Spark', cents: 99, once: true },
  firstlight: { name: 'First Light', cents: 199, once: true },
  // pass_firstfall (the Season Pass, $12.99) is off sale until Ranked Voice is live:
  // add it back here and remove `hidden` in engine/shop.js
  //   pass_firstfall: { name: 'Firstfall Season Pass', cents: 1299, once: true, until: '2027-01-04T00:00:00Z' },
  chimes240: { name: '240 Chimes', cents: 299 },
  chimes500: { name: '500 Chimes', cents: 499 },
  chimes1100: { name: '1,100 Chimes', cents: 999 },
  chimes2400: { name: '2,400 Chimes', cents: 1999 },
  chimes6500: { name: '6,500 Chimes', cents: 4999 },
};
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
// Stripe Tax works out sales tax at checkout. Prices INCLUDE tax: the
// buyer pays the listed price and the tax comes out of it. Set the STRIPE_TAX secret to "off" to sell without it.
const TAX = Deno.env.get('STRIPE_TAX') !== 'off';
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { httpClient: Stripe.createFetchHttpClient() });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  try {
    // who is buying: the player's own sign-in token, checked by the server
    // (the same way as the pvp function, so it works with either key style)
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s*/i, '');
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ error: 'Sign in first.' }, 401);
    // guests save their profile first, so a purchase always belongs to a real account
    if (user.is_anonymous && !user.app_metadata?.threnyx_account) return json({ error: 'Save your profile to make purchases.', code: 'guest' }, 403);
    const { product, returnTo } = await req.json();
    const p = PRODUCTS[product];
    if (!p) return json({ error: 'Unknown product.' }, 400);
    if (p.until && Date.now() >= Date.parse(p.until)) return json({ error: 'That season has ended.' }, 410);
    if (p.once) {
      const { count } = await admin.from('purchases').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('product', product);
      if (count) return json({ error: 'You already have this one.' }, 409);
    }
    const back = typeof returnTo === 'string' && /^https:\/\//.test(returnTo) ? returnTo.split('#')[0] : Deno.env.get('SITE_URL')!;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: p.cents, tax_behavior: 'inclusive', product_data: { name: `Threnyx · ${p.name}` } } }],
      automatic_tax: { enabled: TAX },
      client_reference_id: user.id,
      customer_email: user.email ?? undefined,
      metadata: { product, user_id: user.id },
      success_url: `${back}#/shop?paid=1`,
      cancel_url: `${back}#/shop`,
    });
    return json({ url: session.url });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
