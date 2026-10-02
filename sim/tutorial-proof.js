// Proves the training promise: play exactly what the coach points at and you
// win, every lesson, every time. Plays each lesson with the real Duel engine,
// the real scripted opponents and the real coach
// (client/js/screens/tutorial-lessons.js), as screens/duel.js builds them.
// Usage: node sim/tutorial-proof.js [games per lesson = 500]
import { createDuel, playDuel } from '../engine/duel.js';
import { LESSONS, coachLead, coachAnswer, coachFinish } from '../client/js/screens/tutorial-lessons.js';

/** The rules a training Duel is played with (screens/duel.js `duelRules`). */
export function lessonRules(spec) {
  const rules = { ...(spec.duelRules || {}) };
  if (spec.tutorial?.noFocus) rules.focus = 0;
  if (spec.tutorial?.noRead) rules.reads = 0;
  return rules;
}

export function playLesson(spec, seed) {
  const st = createDuel([spec.mine, spec.theirs], { seed, rules: lessonRules(spec) });
  const script = spec.script;
  for (let g = 0; g < 20 && !st.over; g++) {
    if (st.lead === 0) {
      const lead = coachLead(st, script, spec.coach?.teach);
      const a = script.answer(st, lead);
      playDuel(st, { lead, ...a, ...coachFinish(st, lead, a).finish });
    } else {
      const lead = script.lead(st);
      const a = coachAnswer(st, lead, script);
      playDuel(st, { lead, ...a, ...script.finish(st, lead, a.answer, a.answerFocus) });
    }
  }
  return st;
}

export function prove(games = 500, log = console.log) {
  let fails = 0;
  const report = [];
  LESSONS.forEach((L, i) => {
    let wins = 0, duels = 0, focus = 0, reads = 0;
    const lost = [];
    for (let g = 1; g <= games; g++) {
      const st = playLesson(L.battle(), g * 7919 + i);
      duels += st.history.length;
      focus += (lessonRules(L.battle()).focus ?? 2) - st.sides[0].focus;
      reads += st.history.filter((h) => h.read && h.lead === 0).length;
      if (st.winner === 0) wins++;
      else if (lost.length < 3) lost.push(g);
    }
    fails += games - wins;
    const r = { lesson: L.title, wins, games, duels: +(duels / games).toFixed(1), focusUsed: +(focus / games).toFixed(2), readsUsed: +(reads / games).toFixed(2), lost };
    report.push(r);
    log(JSON.stringify(r));
  });
  return { fails, report };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { fails } = prove(+(process.argv[2] || 500));
  console.log(fails ? `FAILED: ${fails} losses` : 'Every lesson won, every time.');
  process.exit(fails ? 1 : 0);
}
