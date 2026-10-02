// GUEST PLAY — the rules for playing THRENYX before making an account.
// Shared by the economy server (which enforces them), the pvp server and the
// game (which only shows them). docs/18-guest-play.md.
//
// A guest is a real player: a Supabase anonymous user with a server vault. Saving
// the profile turns that same user into a username account, so nothing has to
// be copied and nothing can be lost or duplicated.
//
// After training (which never counts), a guest gets GUEST_PLAY_DURATION_MINUTES
// or GUEST_MAX_DUELS completed Duels, whichever comes first. A Duel is checked
// only when it starts: one started while allowed always finishes and pays.

export const GUEST_PLAY_DURATION_MINUTES = 30;
export const GUEST_MAX_DUELS = 5;
// a Duel that started while allowed can report its result this long after it began
export const GUEST_DUEL_GRACE_MINUTES = 120;
// friend challenges a guest can play (invited by a saved account), on top of the above
export const GUEST_FRIEND_MATCHES = 6;
// an open challenge link stays valid this long
export const CHALLENGE_TTL_HOURS = 24;

const MIN = 60000;

/** Is this signed-in user a guest? (anonymous, and not yet saved as an account) */
export const isGuestUser = (u) => !!u && !!u.is_anonymous && !u.app_metadata?.threnyx_account;

export const freshGuest = () => ({ since: null, duels: 0, starts: [], converted: null });

/**
 * Where a guest stands: { allowed, duelsLeft, minutesLeft, started, over }.
 * `g` is vault.econ.guest (or null for a guest who hasn't played a Duel yet).
 */
export function guestStatus(g, now = Date.now()) {
  g = g || freshGuest();
  const started = g.since != null;
  const minutesLeft = started ? Math.max(0, GUEST_PLAY_DURATION_MINUTES - (now - g.since) / MIN) : GUEST_PLAY_DURATION_MINUTES;
  const duelsLeft = Math.max(0, GUEST_MAX_DUELS - (g.duels || 0));
  const allowed = duelsLeft > 0 && minutesLeft > 0;
  return { allowed, duelsLeft, minutesLeft: Math.ceil(minutesLeft), started, over: !allowed };
}

/** A guest starts a Duel. Returns { ok, guest } (a new copy) or { ok: false, reason }. */
export function startGuestDuel(g, now = Date.now()) {
  g = { ...freshGuest(), ...(g || {}) };
  const st = guestStatus(g, now);
  if (!st.allowed) return { ok: false, reason: 'limit', guest: g };
  const fresh = (g.starts || []).filter((t) => now - t < GUEST_DUEL_GRACE_MINUTES * MIN);
  // Duels started but not finished (a reload mid-duel) hold a place, with one spare,
  // so abandoning Duels can't stretch the allowance
  if ((g.duels || 0) + fresh.length >= GUEST_MAX_DUELS + 1) return { ok: false, reason: 'limit', guest: { ...g, starts: fresh } };
  return { ok: true, guest: { ...g, since: g.since ?? now, starts: [...fresh, now] } };
}

/** A guest's Duel ended. Returns { ok, guest } or { ok: false } when no Duel was started for it. */
export function finishGuestDuel(g, now = Date.now()) {
  g = { ...freshGuest(), ...(g || {}) };
  const fresh = (g.starts || []).filter((t) => now - t < GUEST_DUEL_GRACE_MINUTES * MIN);
  if (!fresh.length) return { ok: false, guest: { ...g, starts: fresh } };
  fresh.shift();
  return { ok: true, guest: { ...g, starts: fresh, duels: (g.duels || 0) + 1 } };
}

// ---- saving the profile -----------------------------------------------------------
export const USERNAME_RULE = /^[A-Za-z0-9_]{3,18}$/;
export const PASSWORD_MIN = 8;
/** null if fine, else what to fix. */
export function profileProblem({ username, password }) {
  if (!USERNAME_RULE.test(String(username || ''))) return 'Player names are 3–18 letters, numbers or _.';
  if (String(password || '').length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters for your password.`;
  return null;
}

// ---- the funnel (names only: what happened, never who or what was said) -------------
export const FUNNEL_EVENTS = new Set([
  'visitor_landing', 'guest_created', 'training_started', 'training_skipped', 'training_completed',
  'guest_duel_started', 'guest_duel_completed', 'friend_invite_opened', 'friend_invite_accepted',
  'friend_invite_invalid', 'guest_reward_earned', 'guest_pack_opened', 'account_prompt_shown',
  'account_creation_started', 'guest_account_converted', 'account_conversion_failed',
  'challenge_friend_clicked', 'challenge_link_shared', 'account_signed_in', 'referral_cta_clicked',
]);
