// Stripe calls this when a payment completes. It checks Stripe's signature,
// then records the purchase for the player to claim in the game. Deploy with
// "Verify JWT" OFF (Stripe doesn't sign in). See docs/13-monetization.md.
import Stripe from 'https://esm.sh/stripe@16.12.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { httpClient: Stripe.createFetchHttpClient() });
const crypto = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, req.headers.get('Stripe-Signature')!, Deno.env.get('STRIPE_WEBHOOK_SECRET')!, undefined, crypto);
  } catch (e) {
    return new Response(`Bad signature: ${(e as Error).message}`, { status: 400 });
  }
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const s = event.data.object as Stripe.Checkout.Session;
    if (s.payment_status === 'paid' && s.client_reference_id && s.metadata?.product) {
      const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const { error } = await admin.from('purchases').upsert(
        { id: s.id, user_id: s.client_reference_id, product: s.metadata.product, amount_cents: s.amount_total ?? 0 },
        { onConflict: 'id', ignoreDuplicates: true },
      );
      if (error) return new Response(error.message, { status: 500 }); // Stripe retries
    }
  }
  return new Response('ok');
});
