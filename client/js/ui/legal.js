// Links to the legal pages (client/legal/), resolved from this module so they
// work both in the repo and on the built site.
const at = (f) => new URL('../../legal/' + f, import.meta.url).href;
export const LEGAL = { terms: at('terms.html'), privacy: at('privacy.html'), refunds: at('refunds.html'), oktober: at('oktober.html') };
export const legalLinks = (sep = ' · ') =>
  [`<a href="${LEGAL.terms}" target="_blank" rel="noopener">Terms</a>`, `<a href="${LEGAL.privacy}" target="_blank" rel="noopener">Privacy</a>`, `<a href="${LEGAL.refunds}" target="_blank" rel="noopener">Refunds</a>`].join(sep);
