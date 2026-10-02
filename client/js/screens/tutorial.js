// TRAINING — the forced tutorial, pitched so an eight-year-old can play.
// Nothing else opens until it is finished. Each lesson teaches one idea of the
// Duel in plain words (Lead, Answer, Wound, Focus, READ), hands over the
// heroes built for it, and ends in a short Duel against an opponent with one
// habit. A coach (Tamsin, Aria, Old Nan) talks in the guide, makes the right
// hero glow, and awards up to three stars. Lesson VI builds your first deck
// from the sixteen heroes you earned and plays a real Duel.
import * as store from '../core/store.js';
import * as vault from '../core/vault.js';
import { setBattle } from '../core/session.js';
import { CARDS } from '../../../engine/cards/index.js';
import { renderCard, esc } from '../ui/card.js';
import { sfx } from '../core/audio.js';
import { haptic } from '../core/haptics.js';

import { LESSONS, FINAL } from './tutorial-lessons.js';
import * as cloud from '../core/cloud.js';
import { openSignIn } from '../ui/account.js';
import { track } from '../core/funnel.js';
import { startLadder } from './play.js';

// Stars for a lesson: a win is at least two; three with half your Voice left.
const starsFor = (st) => (st.sides[0].voice / st.rules.voice >= 0.5 ? 3 : 2);
// how each lesson ends, in the coaches' words
const WIN_LINES = [
  'First blood! Tamsin cheers so loud the straw dummies fall over.',
  'Not one sword got through. Sir Hadric nods. Once.',
  'The Glass Wall cracked! Aria allows herself a tiny “yes”.',
  'Perfect timing. Tamsin wants to learn that trick.',
  'Old Nan cackles. “He never saw it coming, dearie.”',
];
const starText = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

export function scene(kicker, panels, then) {
  const app = document.getElementById('app');
  const sc = document.createElement('div');
  sc.className = 'scene';
  let i = 0;
  const show = () => {
    const p = panels[i];
    sc.innerHTML = `<div class="kicker" style="margin-bottom:auto;padding-top:20px">${esc(kicker)}</div>
      <div class="scene__panel">${p.speaker ? `<span class="speaker">${esc(p.speaker)}</span>` : ''}${p.text}</div>
      <div class="scene__tap">Tap to continue</div>`;
    sfx.tap();
  };
  sc.onclick = () => {
    if (++i >= panels.length) {
      sc.remove();
      then();
    } else show();
  };
  show();
  app.appendChild(sc);
}

// The lesson's Champions are handed over: they flip in one by one.
function reveal(ids, line, then) {
  const app = document.getElementById('app');
  const r = document.createElement('div');
  r.className = 'tut-reveal';
  const w = Math.min(104, Math.floor((innerWidth - 40) / ids.length) - 8);
  r.innerHTML = `<div class="kicker">New heroes! They’re yours to keep</div><div class="tut-reveal__row" data-row></div>
    <div class="lore tut-reveal__line">${esc(line)}</div><div class="tut-reveal__bios" data-bios></div><div class="scene__tap">Tap to continue</div>`;
  const row = r.querySelector('[data-row]');
  ids.forEach((id, i) => {
    const c = renderCard(CARDS[id], { width: w, flat: true });
    c.style.animationDelay = i * 0.22 + 's';
    c.classList.add('tut-in');
    row.appendChild(c);
    setTimeout(() => (sfx.cardFlip(), haptic.tick()), 220 * i + 150);
  });
  r.querySelector('[data-bios]').innerHTML = ids.map((id) => `<p><b>${esc(CARDS[id].name)}.</b> ${esc(CARDS[id].bio)}</p>`).join('');
  app.appendChild(r);
  let ok = false;
  setTimeout(() => (ok = true), 700);
  r.onclick = () => {
    if (!ok) return;
    r.remove();
    then();
  };
}

function startLesson(n, ctx, replay = false, back = null) {
  const L = LESSONS[n];
  scene(`Lesson ${n + 1} of 6 · ${L.title}`, L.panels, () => {
    // a replay: the same lesson, no heroes handed over, nothing saved
    if (replay) {
      const b = L.battle();
      setBattle({
        mode: 'tutorial', noRewards: true, practice: true, ...b,
        title: b.persona.name, sub: `Practice · ${L.title}`, resultKicker: `Practice · ${L.title}`, rematch: false,
        winLine: 'Nicely done.', loseLine: 'Try it again any time.',
        continueLabel: 'Back to training',
        onContinue: (c) => c.go('tutorial', { replay: 1, t: Date.now() }),
      });
      return ctx.go('battle', { t: Date.now() });
    }
    const give = async () => {
      const s = store.get();
      if (s.tut.granted >= n) return fight();
      try {
        await vault.act('lesson', { n }); // the lesson's Champions, from the vault
      } catch (e) {
        return ctx.toast(e.message);
      }
      store.update((st) => {
        st.tut.granted = n;
        if (L.unlock) st.unlock[L.unlock] = true;
      });
      reveal(L.grant, L.after, fight);
    };
    const fight = () => {
      const b = L.battle();
      setBattle({
        mode: 'tutorial', noRewards: true, ...b,
        title: b.persona.name, sub: `Lesson ${n + 1} · ${L.title}`, resultKicker: `Lesson ${n + 1} · ${L.title}`, rematch: false,
        onEnd: ({ won, state }) => {
          if (!won) return [];
          const stars = starsFor(state);
          store.update((st) => {
            st.tut.lesson = Math.max(st.tut.lesson, n + 1);
            (st.tut.stars ||= {})[n] = Math.max(st.tut.stars?.[n] || 0, stars);
          });
          return [['Lesson complete', L.title], ['Stars', starText(stars)]];
        },
        winLine: WIN_LINES[n] || 'You did it!',
        loseLine: '“Shake it off. Again!” says Tamsin. Follow the glow and you’ll get them.',
        continueLabel: 'Continue',
        // the 60-second training from a friend's invitation goes back to the invitation
        onContinue: (c) => (back ? c.go(back.to, back.params) : c.go('tutorial', { t: Date.now() })),
      });
      ctx.go('battle', { t: Date.now() });
    };
    give();
  });
}

function startFinal(ctx) {
  const persona = store.PERSONAS[0];
  scene('Training · Lesson 6 of 6 · Your Octave', FINAL.panels.slice(2), async () => {
    // the first real Duel: a visitor becomes a guest player now, so what they win is kept
    await becomeGuest('training');
    const s = store.get();
    setBattle({
      mode: 'tutorial', final: true, ...FINAL.battle(s.octaves[s.active].cards.slice(), persona),
      title: persona.name, sub: persona.title, resultKicker: 'Your first Duel', rematch: false,
      onEnd: ({ won }) => {
        // the +2 Pack Tickets come with the match result (the vault's training reward)
        store.update((st) => {
          st.onboard = 'done';
          st.seenDuel = true;
          st.unlock.focus = true;
          st.unlock.read = true;
        });
        track('training_completed', { won: !!won });
        return [['Training complete', 'You’ve learned the Duel']];
      },
      winLine: 'You beat Marrow! He shakes your hand and wants a rematch already.',
      loseLine: 'Marrow wins this time, but you’re ready. Training is done: the whole world is waiting!',
      continueLabel: 'Enter the Meridian',
      onContinue: (c) => c.go('home'),
    });
    ctx.go('battle', { t: Date.now() });
  });
}

// Lesson VI: build an Octave of eight from the sixteen.
function builder(root, ctx) {
  const s = store.get();
  const pool = store.STARTER.filter((id) => (s.profile.copies[id] || []).length);
  let cur = s.octaves[s.active].cards.filter((id) => pool.includes(id));
  const suggest = ['odo', 'ossian', 'pip', 'ione', 'mote', 'dunstan', 'tamsin', 'anselm'].filter((id) => pool.includes(id));
  const draw = () => {
    root.innerHTML = `
      <div class="kicker">Training · Lesson 6 of 6</div><div class="h1">Your Deck</div>
      <div class="lore" style="margin:4px 0 10px">Tap 8 heroes to put them in your deck (your <b>Octave</b>). Mix big Strikes, big Guards and big Wounds. Hold a card to read about it, or tap <b>Pick for me</b>.</div>
      <div class="row" style="gap:8px;margin-bottom:10px"><div class="kicker grow">${cur.length} / 8 chosen</div>
        <button class="btn btn--sm btn--ghost" data-suggest>Pick for me</button>
        <button class="btn btn--sm" data-seal ${cur.length === 8 ? '' : 'disabled'}>Battle!</button></div>
      <div class="pick-grid" data-pick></div>`;
    const pick = root.querySelector('[data-pick]');
    for (const id of pool) {
      const cell = document.createElement('div');
      cell.className = 'cell' + (cur.includes(id) ? ' in' : '');
      cell.appendChild(renderCard(CARDS[id], { width: 84, flat: true }));
      let t = null;
      cell.addEventListener('pointerdown', () => (t = setTimeout(() => ((t = 'long'), inspect(ctx, id)), 420)));
      cell.addEventListener('pointerup', () => {
        if (t === 'long') return;
        clearTimeout(t);
        if (cur.includes(id)) cur = cur.filter((x) => x !== id);
        else if (cur.length < 8) cur.push(id);
        else return sfx.error();
        sfx.select();
        draw();
      });
      cell.addEventListener('pointerleave', () => t !== 'long' && clearTimeout(t));
      pick.appendChild(cell);
    }
    root.querySelector('[data-suggest]').onclick = () => ((cur = suggest.slice()), sfx.select(), draw());
    root.querySelector('[data-seal]').onclick = () => {
      if (cur.length !== 8) return;
      store.update((st) => (st.octaves[st.active] = { name: 'First Octave', cards: cur.slice() }));
      sfx.lock();
      startFinal(ctx);
    };
  };
  draw();
}

function inspect(ctx, id) {
  const m = ctx.modal(`<div data-c></div><div class="lore" style="text-align:center;max-width:320px">${esc(CARDS[id].bio)}</div>`);
  m.el.querySelector('[data-c]').replaceWith(renderCard(CARDS[id], { size: 'full', width: Math.min(300, innerWidth - 60), tilt: true }));
}

// A visitor becomes a guest (a real player, kept on the server) when they first
// play something worth keeping. Quietly does nothing for players already signed
// in, or if guest play isn't switched on (the game then plays on this device).
export async function becomeGuest(from) {
  if (!cloud.enabled || cloud.currentUser()) return;
  if (await cloud.startGuest()) track('guest_created', { from });
}

/** What skipping training does to the save (the server hands out the heroes). */
export function markTrainingSkipped(st) {
  st.octaves[st.active] = { name: 'First Octave', cards: ['odo', 'ossian', 'pip', 'ione', 'mote', 'dunstan', 'tamsin', 'anselm'] };
  st.tut.lesson = LESSONS.length;
  st.tut.granted = LESSONS.length - 1;
  st.unlock.focus = st.unlock.read = true;
  st.onboard = 'done';
  st.seenDuel = true;
}

// Skip: every lesson's heroes, a ready-made deck, Focus and READ unlocked, the
// same reward as finishing, and straight into a real Duel. No lecture.
function skipTraining(ctx) {
  const m = ctx.modal(`<div class="h-display" style="font-size:24px;text-align:center">Jump straight into a Duel?</div>
    <div class="muted" style="margin:8px 0 16px;text-align:center">You get 16 starter Champions and a ready-made deck. You’ll learn as you play.</div>
    <button class="btn btn--big" data-yes style="width:100%">Play now</button>`);
  m.el.querySelector('[data-yes]').onclick = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Getting your Champions…';
    track('training_skipped');
    try {
      await becomeGuest('skip');
      await vault.act('finishTraining', { skip: true }); // every starter still missing, and the reward
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Play now';
      return ctx.toast(err.message);
    }
    m.close();
    store.update(markTrainingSkipped);
    sfx.select();
    startLadder(store.PERSONAS[0], ctx.go); // a real Duel, now
  };
}

/** The 60-second training from a friend's invitation: Lesson I, then back. */
export function quickLesson(ctx, { back } = {}) {
  track('training_started', { from: 'invite' });
  const [to, q] = String(back || 'home').split('?');
  startLesson(0, ctx, store.get().onboard === 'done', { to, params: Object.fromEntries(new URLSearchParams(q || '')) });
}

// ---- for players who already finished training --------------------------------------
/** A practice Duel with your own Octave against Marrow, the coach helping. Pays and records nothing. */
export function startPractice(ctx, back = 'home') {
  const s = store.get();
  const persona = store.PERSONAS[0];
  setBattle({
    mode: 'tutorial', noRewards: true, practice: true, ...FINAL.battle(s.octaves[s.active].cards.slice(), persona),
    title: persona.name, sub: 'Practice Duel', resultKicker: 'Practice Duel', rematch: false,
    winLine: 'That’s the Duel. Go get them.', loseLine: 'Practice is free. Try again any time.',
    continueLabel: 'Continue',
    onContinue: (c) => c.go(back, { t: Date.now() }),
  });
  ctx.go('battle', { t: Date.now() });
}

// The one-time welcome for players from before the Duel.
const DUEL_NEWS = [
  { speaker: '', text: '<em>The Meridian has changed the way it settles things.</em>' },
  { speaker: 'Tamsin', text: '"Battles are now <b>Duels</b>! One Champion against one, up to <b>8 duels</b> a match. Both hands are face up, so no more guessing what they’ll do."' },
  { speaker: 'Tamsin', text: '"One side <b>Leads</b>: they send a Champion first, and it fights with its <b>Strike</b>. The other side sees it and <b>Answers</b> with one of theirs, using its <b>Guard</b>. Bigger number wins!"' },
  { speaker: 'Tamsin', text: '"The winner’s <b>Wound</b> (the blood drop) comes off the loser’s Voice. Whoever loses a duel Leads the next one, and the <b>final duel counts double</b>."' },
  { speaker: 'Old Nan', text: '"<b>Focus</b> is +2 for one duel. A <b>READ</b> lets the Lead swap Champions after seeing the Answer. Before you commit, the game shows the numbers. Reading them is up to you. Off you go, dearie."' },
];
export function needsDuelWelcome() {
  const s = store.get();
  return s.onboard === 'done' && !s.seenDuel;
}
export function duelWelcome(ctx) {
  store.update((st) => (st.seenDuel = true)); // once, even if they close it halfway
  scene('What’s new · The Duel', DUEL_NEWS, () => {
    const m = ctx.modal(`<div class="h-display" style="font-size:22px">Try a Duel?</div>
      <div class="muted" style="margin:8px 0 14px">A practice match with your own Octave, with Tamsin pointing out good moves. It doesn’t count for anything.</div>
      <button class="btn" data-practice>Play a practice Duel</button>
      <button class="btn btn--ghost" data-lessons style="margin-top:8px">Replay the training lessons</button>
      <button class="btn btn--ghost" data-skip style="margin-top:8px">Skip, I’ve got it</button>`);
    m.el.querySelector('[data-practice]').onclick = () => (m.close(), sfx.select(), startPractice(ctx));
    m.el.querySelector('[data-lessons]').onclick = () => (m.close(), sfx.select(), ctx.go('tutorial', { replay: 1 }));
    m.el.querySelector('[data-skip]').onclick = () => (m.close(), sfx.tap());
  });
}

// Replay any lesson, or a practice Duel, any time (More → Replay training).
function replayList(root, ctx) {
  root.innerHTML = `
    <div class="tut">
      <div class="kicker">Training · practice</div>
      <div class="h1">Replay training</div>
      <div class="lore" style="margin:4px 0 16px">Play any lesson again, or a practice Duel with your own Octave. Practice pays and records nothing.</div>
      <div class="tut-steps">${LESSONS.map((l, i) => `<button class="tut-step now" data-lesson="${i}" style="text-align:left;width:100%;font:inherit;color:inherit;border:0;cursor:pointer"><span>${['I', 'II', 'III', 'IV', 'V'][i]}</span><div><b>${esc(l.title)}</b><small>${esc(l.teaches)}</small></div><em>Play</em></button>`).join('')}</div>
      <button class="btn btn--big" data-practice style="margin-top:18px">Practice Duel with your Octave</button>
      <button class="btn btn--sm btn--ghost" data-back style="margin-top:12px;align-self:center">Back</button>
    </div>`;
  root.querySelectorAll('[data-lesson]').forEach((b) => (b.onclick = () => (sfx.select(), startLesson(+b.dataset.lesson, ctx, true))));
  root.querySelector('[data-practice]').onclick = () => (sfx.select(), startPractice(ctx, 'tutorial'));
  root.querySelector('[data-back]').onclick = () => ctx.go('more');
}

export function render(root, params, ctx) {
  const s = store.get();
  if (s.onboard === 'done') return params.replay ? replayList(root, ctx) : ctx.go('home');
  const n = s.tut.lesson;
  if (n >= LESSONS.length) {
    if (!s.tut.finalIntro) {
      store.update((st) => (st.tut.finalIntro = true));
      scene('Training · Lesson 6 of 6 · Your Octave', FINAL.panels.slice(0, 2), () => builder(root, ctx));
    }
    return builder(root, ctx);
  }
  const L = LESSONS[n];
  // a first visit: one clear thing to do (play), one for the impatient, sign in for returning players
  if (n === 0 && (s.tut.granted ?? -1) < 0 && !cloud.currentUser()) return landing(root, ctx);
  root.innerHTML = `
    <div class="tut">
      <div class="kicker">Training · the castle yard</div>
      <div class="h1">Learn to Duel</div>
      <div class="lore" style="margin:4px 0 16px">Five quick fights, about a minute each, then your first real Duel. Win the heroes, keep the heroes.</div>
      <div class="tut-steps">${[...LESSONS, FINAL]
        .map((l, i) => `<div class="tut-step ${i < n ? 'done' : i === n ? 'now' : ''}"><span>${i < n ? '✓' : ['I', 'II', 'III', 'IV', 'V', 'VI'][i]}</span><div><b>${esc(l.title)}</b><small>${esc(l.teaches)}</small>${s.tut.stars?.[i] ? `<small class="tut-stars">${starText(s.tut.stars[i])}</small>` : ''}</div>${l.grant ? `<em>+${l.grant.length} heroes</em>` : ''}</div>`)
        .join('')}</div>
      <button class="btn btn--big btn--pulse" data-begin style="margin-top:18px">${s.tut.granted >= n ? 'Try again' : n === 0 ? 'Begin training' : 'Next lesson'} · ${esc(L.title)}</button>
      <div class="row" style="justify-content:center;gap:8px;margin-top:14px;flex-wrap:wrap"><button class="btn btn--sm btn--ghost" data-world>What is Threnyx?</button><button class="btn btn--sm btn--ghost" data-skip>Skip training</button>${cloud.enabled && !cloud.currentUser() ? '<button class="btn btn--sm btn--ghost" data-signin>Already played? Sign in</button>' : ''}</div>
      <div class="muted" style="text-align:center;font-size:12px;letter-spacing:.2em;text-transform:uppercase;margin-top:8px">${store.STARTER.filter((id) => (s.profile.copies[id] || []).length).length} / 16 heroes earned</div>
    </div>`;
  root.querySelector('[data-skip]').onclick = () => skipTraining(ctx);
  root.querySelector('[data-world]').onclick = () => ctx.go('world');
  root.querySelector('[data-signin]')?.addEventListener('click', () => openSignIn(ctx));
  root.querySelector('[data-begin]').onclick = () => {
    sfx.select();
    if (n === 0) track('training_started');
    startLesson(n, ctx);
  };
}

function landing(root, ctx) {
  root.innerHTML = `
    <div class="landing">
      <div class="hero"><div class="star"></div><div class="logo">THRENYX</div><div class="season">A dark-fantasy card game</div></div>
      <div class="landing__tag">Outthink them before they outthink you.</div>
      <div class="lore landing__sub">Pick a Champion. Hide your move. Read theirs. Free, right here in your browser.</div>
      <button class="btn btn--big btn--pulse" data-learn style="width:100%">Learn to Duel</button>
      <button class="btn btn--ghost" data-skip style="width:100%;margin-top:10px">Skip training · Play now</button>
      <div class="landing__links">
        <button class="linkish" data-world>What is Threnyx?</button>
        ${cloud.enabled ? '<span class="muted">·</span><span class="muted">Already have an account?</span> <button class="linkish" data-signin>Sign in</button>' : ''}
      </div>
    </div>`;
  root.querySelector('[data-learn]').onclick = () => (sfx.select(), track('training_started'), startLesson(0, ctx));
  root.querySelector('[data-skip]').onclick = () => (sfx.tap(), skipTraining(ctx));
  root.querySelector('[data-world]').onclick = () => ctx.go('world');
  root.querySelector('[data-signin]')?.addEventListener('click', () => openSignIn(ctx));
}
