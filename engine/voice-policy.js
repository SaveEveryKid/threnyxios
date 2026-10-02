// VOICE POLICY — who may use live voice, decided on the server only
// (supabase/functions/voice). Pure: everything it needs is passed in, so it
// is unit-tested and can never be fooled by a client field. docs/17.
//
// The access model (decided 1 Oct 2026):
//   Friend Voice (a Friend Challenge, someone you gave the code to):
//     a payment-card check passed (credit or debit, not prepaid)
//     AND the player did not declare an under-18 birth month/year.
//   Ranked Voice (strangers):
//     a one-time ID scan showing 18+ AND an active Season Pass.
//   Under 13 (declared): never.
//   Every voice: system flags on, no moderation restriction, the player's
//   own setting on, and neither player has blocked the other.

export const NOTICE_VERSION = 1; // bump when the first-use safety notice changes materially

/** Age band from a declared birth month (1-12) and year, at `now`. */
export function ageBand(month, year, now = new Date()) {
  month = Number(month);
  year = Number(year);
  if (!Number.isInteger(month) || !Number.isInteger(year) || month < 1 || month > 12) return null;
  const y = now.getUTCFullYear(), m = now.getUTCMonth() + 1;
  if (year < y - 120 || year > y) return null;
  // the youngest they could be: born on the last day of that month
  const age = y - year - (m <= month ? 1 : 0);
  return age >= 18 ? 'adult' : age >= 13 ? 'teen' : 'under13';
}

/**
 * One account's voice permissions.
 * a = {
 *   band: 'adult'|'teen'|'under13'|null,        // declared (null: not asked yet)
 *   cardCheck: { ok, funding } | null,          // Stripe card check result
 *   idAdult: boolean,                           // Stripe Identity: verified 18+
 *   pass: boolean,                              // active Season Pass
 *   prefs: { friend, ranked },                  // the player's own switches (default off)
 *   restriction: { friend?, ranked? } | null,   // moderation: true = suspended in that mode
 * }
 * flags = { voiceSystemEnabled, friendVoiceEnabled, rankedVoiceEnabled }
 * Returns { friend: {ok, reason}, ranked: {ok, reason} }; reasons are private to this account.
 */
export function accountPolicy(a, flags) {
  const out = {};
  for (const mode of ['friend', 'ranked']) out[mode] = decide(a, flags, mode);
  return out;
}

function decide(a, flags, mode) {
  const no = (reason) => ({ ok: false, reason });
  if (!flags?.voiceSystemEnabled) return no('off');
  if (mode === 'friend' && !flags.friendVoiceEnabled) return no('off');
  if (mode === 'ranked' && !flags.rankedVoiceEnabled) return no('off');
  if (a?.guest) return no('account'); // a guest saves their profile first
  if (a?.restriction?.[mode]) return no('restricted');
  if (a?.band === 'under13') return no('age');
  if (a?.band == null) return no('age_unknown');
  if (mode === 'friend') {
    if (a.band !== 'adult') return no('age');
    if (!a.cardCheck?.ok || a.cardCheck.funding === 'prepaid') return no('card');
  } else {
    if (a.band !== 'adult') return no('age');
    if (!a.idAdult) return no('id');
    if (!a.pass) return no('pass');
  }
  if (!a.prefs?.[mode]) return no('setting');
  return { ok: true, reason: null };
}

/**
 * Voice between two players in one match. kind: 'friend' (Friend Challenge)
 * or 'ranked' (matchmaking, finals). Echoes never have voice.
 * Returns { available, mine: {ok, reason} } for player `me` (0|1). The
 * opponent's reason never leaves the server: only "available or not".
 */
export function matchPolicy({ kind, echo, accounts, flags, blocked }, me) {
  if (echo || (kind !== 'friend' && kind !== 'ranked')) return { available: false, mine: { ok: false, reason: 'not_voice_match' } };
  const pol = accounts.map((a) => accountPolicy(a, flags)[kind]);
  const mine = pol[me];
  const available = !blocked && pol[0].ok && pol[1].ok;
  return { available, mine };
}

/** What a reason means to the player it belongs to (never shown to the opponent). */
export const REASON_TEXT = {
  off: 'Voice chat is switched off right now.',
  restricted: 'Voice chat is unavailable on this account.',
  age: 'Voice chat is unavailable on this account.',
  age_unknown: 'Confirm your birth month and year to use voice chat.',
  card: 'Friend voice needs a quick card check (credit or debit). No charge.',
  id: 'Ranked voice needs a one-time ID check.',
  pass: 'Ranked voice is part of the Season Pass.',
  setting: 'Turn voice on in Settings → Voice.',
  not_voice_match: 'Voice isn’t available in this match.',
  unavailable: 'Voice chat is being set up. Check back soon.',
  account: 'Save your profile to use voice chat.',
};

/** Client event names the server accepts (product telemetry, never content). */
export const VOICE_EVENTS = new Set([
  'voice_offered', 'voice_join_clicked', 'mic_permission_requested', 'mic_permission_granted', 'mic_permission_denied',
  'voice_connection_started', 'voice_connection_success', 'voice_connection_failure', 'both_players_connected',
  'self_muted', 'opponent_muted', 'voice_left', 'voice_disconnected', 'voice_locked_by_policy', 'voice_recovered',
  'voice_constraints', 'ice_restart',
]);
