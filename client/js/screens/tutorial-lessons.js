// TRAINING CONTENT — the lessons, their opponents and the coach, with no DOM,
// so sim/tutorial-proof.js can play every lesson exactly as the game does and
// prove the promise: follow the coach and you win, every time.
//
// Training plays the Duel (engine/duel.js). Every training opponent is
// scripted with one habit the lesson's idea beats, and the coach knows the
// script, so it can always point at ONE exact card (and say when Focus or a
// READ is worth it).
import { cloneDuel, playDuel, duelStats, canRead } from '../../../engine/duel.js';
import { evaluate } from '../../../engine/duel-ai.js';
import { CARDS } from '../../../engine/cards/index.js';

const P = (speaker, text) => ({ speaker, text });
// Short training Duels.
export const SHORT = { voice: 10, duels: 5, finalDouble: false };
const SHAPE = (id, name, extra = {}) => ({ id, name, title: 'Training yard', skill: 0.1, faction: 'margin', ...extra });

// ---- scripted opponents -------------------------------------------------------
// habit: sends its biggest Strike when it Leads, its biggest Guard when it
// Answers, never spends Focus or READ. Easy to see, easy to beat.
const biggest = (ids, k) => [...ids].sort((a, b) => duelStats(b)[k] - duelStats(a)[k] || ids.indexOf(a) - ids.indexOf(b))[0];
export const habitScript = () => ({
  lead: (st) => biggest(st.sides[st.lead].hand, 'strike'),
  answer: (st) => ({ answer: biggest(st.sides[1 - st.lead].hand, 'guard'), answerFocus: false }),
  finish: () => ({ leadFocus: false, switchTo: null }),
});

// ---- the coach ----------------------------------------------------------------------
// It knows the script, so each pick is exact: the move that leaves you best off
// after this duel (engine/duel-ai.js `evaluate`).
const after = (st, choice) => playDuel(cloneDuel(st), choice);
const value = (st, choice) => evaluate(after(st, choice), 0);

// teach: 'read' prefers a Lead that sets up a winning READ switch (the READ lesson)
export function coachLead(st, script, teach = null) {
  let best = null, bv = -Infinity;
  for (const id of st.sides[0].hand) {
    const a = script.answer(st, id);
    const f = coachFinish(st, id, a).finish;
    const v = value(st, { lead: id, ...a, ...f }) + (teach === 'read' && f.switchTo ? 100 : 0);
    if (v > bv) (bv = v), (best = id);
  }
  return best;
}
// Focus / READ after their Answer: only when it clearly helps.
export function coachFinish(st, lead, a) {
  const me = st.sides[0];
  const base = value(st, { lead, ...a, leadFocus: false, switchTo: null });
  let finish = { leadFocus: false, switchTo: null }, bv = base;
  const opts = [];
  if (me.focus > 0) opts.push({ leadFocus: true, switchTo: null });
  if (canRead(st, a.answer)) for (const x of me.hand) if (x !== lead) opts.push({ leadFocus: false, switchTo: x });
  for (const o of opts) {
    const v = value(st, { lead, ...a, ...o });
    if (v > bv + 1) (bv = v), (finish = o);
  }
  return { finish, gain: bv - base };
}
export function coachAnswer(st, lead, script) {
  let best = null, bv = -Infinity;
  for (const id of st.sides[0].hand)
    for (const f of st.sides[0].focus > 0 ? [false, true] : [false]) {
      const a = { answer: id, answerFocus: f };
      const v = value(st, { lead, ...a, ...script.finish(st, lead, id, f) }) - (f ? 1 : 0);
      if (v > bv) (bv = v), (best = a);
    }
  return best;
}

// ---- the lessons ----------------------------------------------------------------
function lessonBattle({ mine, theirs, persona, rules = {}, tutorial = {}, coach }) {
  return { mine, theirs, persona, script: habitScript(), tutorial, duelRules: { ...SHORT, ...rules }, coach };
}

export const LESSONS = [
  {
    title: 'Lead', teaches: 'Send first. Your Strike against their Guard.',
    grant: ['pip', 'ossian', 'benn'],
    panels: [
      P('', '<em>A frosty castle yard at sunrise. A kid with a lantern waves you over.</em>'),
      P('Tamsin', '"Hi! I’m Tamsin! Out here nobody fights wars. We <b>Duel</b>: one hero against one, cards face up, and the bigger number wins."'),
      P('Tamsin', '"Knock their <b>Voice</b> (the bell) down to zero and you win! Here, three heroes. They hit HARD."'),
    ],
    after: 'Big red Strike numbers: these three hit hard when they Lead.',
    battle: () =>
      lessonBattle({
        mine: ['pip', 'ossian', 'benn'], theirs: ['inklings', 'verity', 'grael'],
        rules: { fixedLead: 0 },
        persona: SHAPE('ink', 'The Ink Blobs', { lines: { intro: '(The ink on the practice shields wobbles… and stands up!)', win: '(The ink blobs giggle and splash.)', lose: '(The ink blobs run back into the straw.)' } }),
        tutorial: { noFocus: true, noRead: true },
        coach: {
          who: 'Tamsin',
          intro: ['You <b>Lead</b>: you send a hero first. It hits with its red <b>Strike</b>.', 'They block with a blue <b>Guard</b>. Bigger number wins. Easy!'],
          lead: 'Tap the glowing hero. You’ll see its Strike against each of their Guards.',
          answer: 'Pick the glowing hero to block!',
          win: 'The winner’s <b>Wound</b> (the blood drop) comes off their Voice!',
        },
      }),
  },
  {
    title: 'Answer', teaches: 'See their hero, then block it.',
    grant: ['hadric', 'dunstan', 'dask'],
    panels: [
      P('Sir Hadric', '"Hmph. The Rat Gang only knows one thing. Charging in first."'),
      P('Tamsin', '"Then let them! When they <b>Lead</b>, you <b>Answer</b>: you see who they sent, then pick who blocks. A big <b>Guard</b> stops them cold!"'),
    ],
    after: 'Big blue Guard numbers: these three are walls.',
    battle: () =>
      lessonBattle({
        mine: ['hadric', 'dunstan', 'dask'], theirs: ['corbel', 'tallis', 'rue', 'benn'],
        rules: { fixedLead: 1, voice: 6, handicap: { 1: 2 } },
        persona: SHAPE('rats', 'The Rat Gang', { lines: { intro: 'Oi! We hit first, we hit always!', win: 'Told ya. Always first!', lose: 'Shields?! Why’d it have to be shields!' } }),
        tutorial: { noFocus: true, noRead: true },
        coach: {
          who: 'Tamsin',
          intro: ['The Rat Gang always charges in first. Good: you see who’s coming!', '<b>Answer</b> with a hero whose blue <b>Guard</b> is bigger.'],
          lead: 'Send the glowing hero.',
          answer: 'Block with the glowing hero: its Guard is bigger!',
          win: 'Blocked! The loser’s hero loses hearts. Out of hearts, it falls.',
        },
      }),
  },
  {
    title: 'Wound', teaches: 'Win a duel, wound their Voice.',
    grant: ['odo', 'aria', 'wren'],
    panels: [
      P('', '<em>A huge, silent library. Even your footsteps are quiet here.</em>'),
      P('Aria', '"Shhh! Winning a duel is only half of it. The winner’s <b>Wound</b> is how much it hurts their Voice."'),
      P('Aria', '"So send a sneaky hero with a big Wound into a duel it can win! Take these three."'),
    ],
    after: 'Big Wound numbers: every duel these three win really hurts.',
    battle: () =>
      lessonBattle({
        mine: ['odo', 'aria', 'wren', 'hadric', 'pip', 'dunstan'], theirs: ['garrick', 'gorm', 'ottilie', 'ebb'],
        rules: { handicap: { 1: 2 } },
        persona: SHAPE('wall', 'The Glass Wall', { faction: 'crown', lines: { intro: 'We are the wall. We do not move.', win: 'Nothing gets past us.', lose: 'Something… got past us.' } }),
        tutorial: { noFocus: true, noRead: true },
        coach: {
          who: 'Aria',
          intro: ['Whoever loses a duel Leads the next one. Falling behind gives you the first move!', 'Win with your big-Wound heroes and watch their Voice drop.'],
          lead: 'Send the glowing hero: it can win AND hurt.',
          answer: 'Answer with the glowing hero.',
          win: 'See how much that Wound hurt?',
        },
      }),
  },
  {
    title: 'Focus', teaches: '+2 when it counts.',
    grant: ['tamsin', 'mote', 'anselm'],
    unlock: 'focus',
    panels: [
      P('Tamsin', '"Sometimes your hero is just a little too small. That’s what <b>Focus</b> is for!"'),
      P('Tamsin', '"Focus gives your hero +2 for one duel. You only get two each match, so use them when +2 turns a loss into a win!"'),
    ],
    after: 'Three all-round heroes, good at everything.',
    battle: () =>
      lessonBattle({
        mine: ['tamsin', 'mote', 'anselm', 'hadric', 'odo', 'pip', 'aria', 'dunstan'], theirs: ['smudge', 'pellPim', 'tomas', 'rue', 'bess'],
        rules: { handicap: { 1: 1 } },
        persona: SHAPE('duel', 'The Canal Duelists', { faction: 'hour', lines: { intro: 'We swing it HARD.', win: 'Swing, swing, swing!', lose: 'Where did that +2 come from?!' } }),
        tutorial: { noRead: true },
        coach: {
          who: 'Tamsin',
          intro: ['You get two <b>Focus</b> a match. Each one is +2 for one duel.', 'I’ll shout when +2 is worth it!'],
          lead: 'Send the glowing hero.',
          answer: 'Answer with the glowing hero.',
          focus: 'Tap <b>Focus +2</b>: it turns this duel your way!',
          win: 'Nice!',
        },
      }),
  },
  {
    title: 'READ', teaches: 'Change your mind after they Answer.',
    grant: ['nan', 'dilly', 'ione', 'sentry9'],
    unlock: 'read',
    panels: [
      P('Old Nan', '"Sit down, dearie. When you Lead, they get to see your hero before they Answer. Sneaky, eh?"'),
      P('Old Nan', '"Once a match you can <b>READ</b>: after you see their Answer, swap your hero for another from your hand. Then THEY get the surprise!"'),
    ],
    after: 'Four clever heroes. The best players save their READ for the duel that matters.',
    battle: () =>
      lessonBattle({
        mine: ['nan', 'dilly', 'ione', 'sentry9', 'tamsin', 'hadric', 'odo', 'pip'], theirs: ['sera', 'hesper', 'corbel', 'tallis', 'lina'],
        rules: { fixedLead: 0 },
        persona: SHAPE('spar', 'The Sparring-Man', { faction: 'crown', lines: { intro: 'Prince Corvin taught me everything. Mostly: hit.', win: 'Hit. Always hit!', lose: 'How did you KNOW?!' } }),
        tutorial: { noFocus: true },
        coach: {
          who: 'Old Nan', teach: 'read',
          intro: ['You Lead every duel here. Watch his Answer, then decide.'],
          lead: 'Send the glowing hero.',
          answer: 'Answer with the glowing hero.',
          read: 'Now <b>READ</b>! Switch to the glowing hero: it beats his Answer.',
          win: 'Well caught, dearie.',
        },
      }),
  },
];

// ---- Lesson VI: your deck against Marrow -----------------------------------------
export const FINAL = {
  title: 'Your Deck', teaches: 'Pick your 8 favourite heroes and Duel for real!',
  panels: [
    P('Sir Hadric', '"Sixteen heroes. Not bad, kid. Not bad at all."'),
    P('Tamsin', '"A real deck has <b>eight</b> heroes, your <b>Octave</b>. Pick your favourites! Mix some big Strikes, some big Guards and some big Wounds."'),
    P('', '<em>Past the yard wall, a scrappy kid called Marrow wants to battle you!</em>'),
  ],
  theirs: ['smudge', 'corbel', 'grael', 'verity', 'inklings', 'fenwick', 'rue', 'bess'],
  battle(mine, persona) {
    return {
      mine, theirs: this.theirs.slice(), persona: { ...persona, skill: 0.2 }, duelRules: { handicap: { 1: 1 } }, // a first real Duel you can win: following the hints wins ~95%
      coach: {
        who: 'Tamsin',
        intro: ['A real Duel! Eight duels, and the last one counts double.', 'Watch the glowing hero if you need a hint. You’ve got this!'],
        lead: 'The glowing hero is my pick.',
        answer: 'I’d Answer with the glowing hero.',
        focus: 'Focus would help here!',
        read: 'A READ switch wins this one!',
      },
    };
  },
};
