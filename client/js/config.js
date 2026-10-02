// Deployment settings. Fill in CLOUD to turn on accounts and cloud saves
// (see docs/12-website.md). Left empty, the game saves on this device only.
export const CLOUD = {
  url: 'https://dydncpywveeudvtroljl.supabase.co',
  anonKey: 'sb_publishable_A3GwDxNtUhpgjJUM5bOwmA_SjdIgaG_', // public key (safe to ship in the page)
  payments: true, // Stripe Checkout (docs/13-monetization.md)
  google: false, // true once Google is enabled in Supabase (Sign In / Providers)
};
