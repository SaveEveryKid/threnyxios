// TEXT FILTER — for words other players can read: Alliance names, mottos and
// member names. Catches swearing, slurs, sexual words and contact details
// (links, @handles, phone numbers, "add me on…"), including spaced-out,
// stretched and number-for-letter spellings (f u c k, fuuuck, sh1t).
//
// The same lists run on the server: `node tools/gen-text-filter-sql.mjs`
// writes supabase/text-filter.sql from this file. Change the lists here, then
// regenerate and re-run that SQL.

// Blocked anywhere, even inside other letters (rare inside innocent words).
export const ANYWHERE = [
  'fuck', 'shit', 'cunt', 'nigger', 'nigga', 'faggot', 'bitch', 'whore', 'slut', 'dildo', 'porn',
  'penis', 'vagina', 'jizz', 'twat', 'motherf', 'asshole', 'hitler', 'nazi', 'kkk', 'tranny',
  'kike', 'blowjob', 'handjob', 'cumshot', 'orgasm', 'masturbat', 'boner', 'erection',
];
// Blocked only as a whole word (they turn up inside innocent words: class, cockatoo, Sussex).
export const WORDS = [
  'ass', 'asses', 'arse', 'dick', 'dicks', 'cock', 'cocks', 'cum', 'sex', 'sexy', 'rape', 'raped',
  'rapist', 'pedo', 'pedophile', 'fag', 'fags', 'tit', 'tits', 'titty', 'boob', 'boobs', 'nude', 'nudes',
  'naked', 'horny', 'spic', 'homo', 'hoe', 'hoes', 'pussy', 'pussies', 'wank', 'wanker', 'chink',
  'retard', 'retards', 'retarded', 'bastard', 'bastards', 'damn', 'crap', 'piss', 'fuk', 'fck', 'fcuk',
  'stfu', 'wtf', 'omfg', 'kys', 'milf', 'dilf', 'nsfw', 'xxx', 'thot', 'simp', 'incel', 'lmfao', 'anal',
];
// Contact details: ways to take a conversation somewhere we can't see.
export const CONTACT_WORDS = [
  'snapchat', 'insta', 'instagram', 'discord', 'tiktok', 'whatsapp', 'telegram', 'kik', 'facebook',
  'twitter', 'twitch', 'youtube', 'reddit', 'gmail', 'hotmail', 'yahoo', 'outlook', 'roblox',
];
export const CONTACT_PATTERNS = ['https?', 'www', '[.,] *(com|net|org|gg|io|me|tv|ly|co|uk|xyz)\\b', '@', '[0-9][0-9 ().-]{5,}[0-9]'];

// number-for-letter spellings, read only inside a word (sh1t, a$$), never a
// plain number or a "!" at the end
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', 9: 'g', $: 's', '!': 'i', '|': 'i' };
// "fuck" → f+u+c+k+: also matches fuuuck
export const stretch = (w) => [...w].map((c) => c + '+').join('');

const anywhere = new RegExp(ANYWHERE.map(stretch).join('|'));
const word = new RegExp(`^(${WORDS.map(stretch).join('|')})$`);
const contactWord = new RegExp(`^(${CONTACT_WORDS.join('|')})$`);
const contact = new RegExp(CONTACT_PATTERNS.join('|'));

/** The words in a text, as the filter reads them. */
export function words(text) {
  const raw = String(text ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  return raw.split(/[^a-z0-9$!|]+/)
    .map((c) => c.replace(/^[!|]+|[!|]+$/g, ''))
    .map((c) => (/[a-z]/.test(c) ? c.replace(/[0-9$!|]/g, (x) => LEET[x] ?? '') : ''))
    .map((c) => c.replace(/[^a-z]/g, ''))
    .filter(Boolean);
}

/** null if fine, else a short reason the player can act on. */
export function textProblem(text) {
  const raw = String(text ?? '').toLowerCase();
  if (contact.test(raw)) return 'No links, handles or phone numbers, please.';
  const toks = words(text);
  if (toks.some((t) => contactWord.test(t))) return 'No social media or contact details, please.';
  // spaced-out letters (f u c k) are read as one word
  const runs = [];
  let run = '';
  for (const t of [...toks, '']) {
    if (t.length === 1) run += t;
    else (run.length > 1 && runs.push(run), (run = ''));
  }
  if ([...toks, ...runs].some((t) => anywhere.test(t) || word.test(t))) return 'Please choose different words.';
  return null;
}
