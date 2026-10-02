// THE DUEL SCREEN — every battle against the AI (Ladder, Rivals, Story, Draft,
// the Long Road, the Anomaly, training). Rules: engine/duel.js. AI:
// engine/duel-ai.js. One thumb, portrait:
//   their bar · their hand (face up) · the duel stage · the guide · your hand · your bar
// The guide always says what to do now and shows the numbers (Strike against
// Guard, abilities and Bonds included); it never says who will win. Reading
// the duel is the player's job. After the reveal, a stamp says how it went:
// Good read! · Crushed! · Blocked! · Hit! · Punished. · Read you. · Stand-off.
// Danger comes from the opponent: Focus and READ they could still use glow,
// they talk when they Focus, switch, win big or are cornered, and a Lead that
// out-muscles your hand lands with a slam.
// Online matches (spec.remote, client/js/core/pvp.js) play the same screen:
// the server owns the match, the screen shows its view and sends your turns.
import { CARDS } from '../../../engine/cards/index.js';
import { createDuel, cloneDuel, playDuel, preview, duelStats, canRead, isFinalDuel, DUEL_RULES, CLUTCH_AT } from '../../../engine/duel.js';
import { makeDuelAI } from '../../../engine/duel-ai.js';
import { makeRng } from '../../../engine/rng.js';
import { EMOTES } from '../../../engine/pvp.js';
import { takeBattle, setBattle } from '../core/session.js';
import * as store from '../core/store.js';
import { FEATURES } from '../core/features.js';
import * as vault from '../core/vault.js';
import * as music from '../core/music.js';
import { sfx } from '../core/audio.js';
import { haptic } from '../core/haptics.js';
import { renderCard, esc } from '../ui/card.js';
import { lookFor } from '../ui/look.js';
import { icon } from '../ui/icons.js';
import { uiArt } from '../art/index.js';
import { duelText, duelShort } from '../ui/duel-text.js';
import { ARCH } from '../../../engine/archetypes.js';
import { habitScript, coachLead, coachAnswer, coachFinish } from './tutorial-lessons.js';
import { crumb, battleOn, battleOff } from '../core/crumbs.js';
import { isGuest } from '../core/cloud.js';
import { track } from '../core/funnel.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// a Champion's short name: "Dame Orla Cinder" → "Orla", "The Ashen Choir" → "Ashen Choir"
const TITLES = /^(The|Ser|Dame|Lady|Lord|Sir|Captain|Brother|Sister|Old|Foreman|Saint)$/;
const first = (id) => {
  const w = CARDS[id].name.split(' ');
  if (w[0] === 'The') return w.slice(1, 3).join(' ');
  return TITLES.test(w[0]) && w[1] ? w[1] : w[0];
};
// the clash, as numbers only
const cmp = (pv, leadSide) => {
  const l = pv.power?.lead.total ?? '–', a = pv.power?.answer.total ?? '–';
  const [x, y] = leadSide === 0 ? [l, a] : [a, l];
  const [ix, iy] = leadSide === 0 ? ['i-strike', 'i-guard'] : ['i-guard', 'i-strike'];
  return `<div class="dl-cmp"><b class="${leadSide === 0 ? 'dl-atk' : 'dl-def'}">${icon(ix)}${x}</b><span>vs</span><b class="${leadSide === 0 ? 'dl-def' : 'dl-atk'}">${icon(iy)}${y}</b>${pv.triggers.length ? `<em>${esc(pv.triggers.slice(0, 2).join(' · '))}</em>` : ''}</div>`;
};
// what the opponent says, when it matters (a persona's own line first)
const BARKS = {
  focus: ['Not this one.', 'Watch closely.', 'All of it, now.', 'I was saving this.'],
  read: ['Saw that coming.', 'Too slow.', 'Predictable.', 'I know that look.'],
  big: ['Again?', 'Is that all?', 'Down you go.', 'That one hurt, didn’t it?'],
  cornered: ['Not yet.', 'I’m still here.', 'One more.', 'You’ll have to finish it.'],
  slam: ['Try and stop this.', 'Brace yourself.', 'Here it comes.'],
};

export async function render(root, params, ctx) {
  const spec = takeBattle();
  if (!spec) return ctx.go('play');
  const d = new DuelScreen(root, spec, ctx);
  window.__duel = d; // for playtests and debugging
  d.run();
  return () => d.destroy();
}

class DuelScreen {
  constructor(root, spec, ctx) {
    this.root = root;
    this.spec = spec;
    this.ctx = ctx;
    this.seed = spec.seed ?? ((Math.random() * 2 ** 31) | 0);
    const cfg = spec.config || {};
    let rules = {};
    if (spec.duelRules) rules = { ...spec.duelRules };
    else {
      // older specs carry Reckoning numbers: a short match stays a little short
      if (cfg.voice) rules.voice = Math.min(DUEL_RULES.voice, cfg.voice + 4);
      if (cfg.rounds) rules.duels = Math.min(DUEL_RULES.duels, Math.max(5, cfg.rounds + 1));
      if (cfg.focus != null) rules.focus = Math.min(DUEL_RULES.focus, cfg.focus);
      if (cfg.reads != null) rules.reads = Math.min(DUEL_RULES.reads, cfg.reads);
    }
    if (spec.tutorial?.noFocus) rules.focus = 0;
    if (spec.tutorial?.noRead) rules.reads = 0;
    this.remote = spec.remote || null;
    this.st = this.remote ? cloneDuel(this.remote.view.state) : createDuel([spec.mine, spec.theirs], { seed: this.seed, rules, mods: spec.mods || [], names: ['You', spec.title || 'Opponent'] });
    const skill = spec.mode === 'tutorial' ? 0.15 : spec.persona?.skill ?? 0.6;
    this.ai = (spec.script?.lead && spec.script) || makeDuelAI({ skill, rand: makeRng(this.seed ^ 0x9e37) });
    // training: the coach's model of the opponent (exact when it is scripted)
    this.coach = spec.coach || null;
    this.model = (spec.script?.lead && spec.script) || habitScript();
    this.dead = false;
    this.t0 = Date.now();
    this.stats = { felled: 0, won: 0, reads: 0 };
  }
  destroy() {
    this.dead = true;
    clearInterval(this.clockTimer);
    this.voiceChat?.destroy();
    removeEventListener('resize', this.onResize);
    this.ro?.disconnect();
    this.remote?.close();
    battleOff();
    music.stop(0.4);
  }
  // ------------------------------------------------------------------ layout
  build() {
    const s = this.spec;
    this.root.innerHTML = `
      <div class="dl">
        <div class="dl-bar dl-bar--opp" data-bar="1"></div>
        <div class="dl-hand dl-hand--opp" data-hand="1"></div>
        <div class="dl-stage" data-stage>
          <div class="dl-count" data-count></div>
          <div class="dl-arena">
            <div class="dl-slot" data-slot="0"><span class="dl-slot__tag">You</span></div>
            <div class="dl-vs" data-vs>VS</div>
            <div class="dl-slot" data-slot="1"><span class="dl-slot__tag">${esc(first2(s.title || 'Them'))}</span></div>
          </div>
        </div>
        <div class="dl-guide" data-guide></div>
        <div class="dl-hand dl-hand--me" data-hand="0"></div>
        <div class="dl-bar dl-bar--me" data-bar="0"></div>
        <button class="quit-btn compact dl-quit" data-quit aria-label="Forfeit">⚑ <span>Forfeit</span></button>
      </div>`;
    this.el = (q) => this.root.querySelector(q);
    const arena = (s.arena && uiArt(s.arena, true)) || uiArt('arena-' + (s.persona?.faction || 'stillhouse'), true) || uiArt('arena-stillhouse', true);
    if (arena) this.el('.dl').style.backgroundImage = `linear-gradient(rgba(5,5,8,0.62), rgba(5,5,8,0.72)), url("${arena}")`;
    this.el('[data-quit]').onclick = (e) => this.quitTap(e.currentTarget);
    if (this.remote) this.setupOnline();
    this.layout();
    this.onResize = () => {
      clearTimeout(this.resizeT);
      this.resizeT = setTimeout(() => !this.dead && (this.layout(), this.paint()), 150);
    };
    addEventListener('resize', this.onResize);
    // and whenever the screen's own box changes (first measure, a phone settling its bars)
    if (window.ResizeObserver) {
      let last = '';
      this.ro = new ResizeObserver(() => {
        const dl = this.el('.dl');
        const k = dl ? dl.clientWidth + 'x' + dl.clientHeight : '';
        if (k && k !== last) (last = k), this.onResize();
      });
      this.ro.observe(this.el('.dl'));
    }
    this.paint();
  }
  // bars, hands and the duel counter, from the state
  paint() {
    const st = this.st;
    for (const s of [0, 1]) {
      const p = st.sides[s];
      const name = s === 0 ? store.get().settings.name || 'You' : this.spec.title || 'Opponent';
      const pct = Math.max(0, Math.min(100, (100 * p.voice) / st.rules.voice));
      this.el(`[data-bar="${s}"]`).innerHTML = `
        <div class="dl-who"><b>${esc(name)}</b><span>${s === st.lead && !st.over ? 'Leads this duel' : s === 1 ? esc(this.spec.sub || '') : ''}</span></div>
        <div class="dl-res" data-res="focus" title="Focus">${icon('i-focus')}<b>${p.focus}</b></div>
        <div class="dl-res dl-res--read ${p.reads ? '' : 'used'}" data-res="read" title="READ">${icon('i-read')}<b>${p.reads}</b></div>
        <div class="dl-voice ${p.voice <= CLUTCH_AT ? 'low' : ''}" title="Voice">${icon('i-voice')}<div class="dl-voice__bar"><i style="width:${pct}%"></i></div><b>${Math.max(0, p.voice)}</b></div>
        <div class="dl-piles" title="Reserve · Fallen"><span>${p.reserve.length}<i>left</i></span>${p.fallen.length ? `<span class="dl-fell">${p.fallen.length}<i>fell</i></span>` : ''}</div>`;
      const hand = this.el(`[data-hand="${s}"]`);
      hand.innerHTML = '';
      const w = s === 0 ? this.cardW(0) : this.cardW(1);
      for (const id of p.hand) hand.appendChild(this.card(s, id, w));
    }
    this.el('[data-count]').innerHTML = st.over ? '' : `Duel <b>${st.duel}</b> of ${st.rules.duels}${isFinalDuel(st) ? ' · <span class="dl-final">Final duel · Voice damage ×2</span>' : ''}`;
  }
  // Card sizes from the space the screen really has: both hands three across,
  // the same size, as big as fits; the stage gets what's left.
  layout() {
    const dl = this.el('.dl');
    const cs = getComputedStyle(dl);
    const H = dl.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const W = dl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const guide = Math.round(Math.min(215, Math.max(140, H * 0.27)));
    const free = H - 2 * 46 - guide - 5 * 6; // two bars, the guide, the gaps
    const across = (W - 2 * 6) / 3;
    // both hands the same size: their numbers matter as much as yours
    this.wMe = this.wOpp = Math.floor(Math.max(72, Math.min(across, (free * 0.36) / 1.4, 150)));
    dl.style.setProperty('--dl-guide', guide + 'px');
  }
  cardW(s) {
    if (!this.wMe) this.layout();
    return s === 0 ? this.wMe : this.wOpp;
  }
  // a Champion as the Duel sees it: its Duel numbers, its wounds
  card(s, id, w) {
    const side = this.st.sides[s], d = duelStats(id), b = side.buff[id];
    const def = { ...CARDS[id], duelView: true, stats: { strike: d.strike + b.strike, guard: d.guard + b.guard, scheme: d.scheme + b.scheme }, hp: side.hp[id] };
    const el = renderCard(def, { width: w, flat: true, ...(s === 0 ? lookFor(id) : {}) });
    el.dataset.id = id;
    if (side.hp[id] < side.maxHp[id]) el.insertAdjacentHTML('beforeend', `<span class="dl-wound">${side.hp[id]}/${side.maxHp[id]}</span>`);
    if (side.ward[id]) el.insertAdjacentHTML('beforeend', `<span class="dl-ward">${icon('i-guard')}${side.ward[id]}</span>`);
    const bd = side.bond?.[id];
    if (bd) el.insertAdjacentHTML('beforeend', `<span class="dl-bond" title="Bonded: ${esc(ARCH[bd.arch]?.name || '')}">${bd.lead === bd.answer ? `+${bd.lead}` : !bd.lead ? `${icon('i-guard')}+${bd.answer}` : `+${bd.lead}·${icon('i-guard')}+${bd.answer}`}</span>`);
    let t = null;
    el.addEventListener('pointerdown', () => (t = setTimeout(() => ((t = 'long'), this.inspect(s, id)), 420)));
    el.addEventListener('pointerup', () => t !== 'long' && clearTimeout(t));
    el.addEventListener('pointerleave', () => t !== 'long' && clearTimeout(t));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('click', (e) => { if (t === 'long') { e.stopImmediatePropagation(); t = null; } });
    return el;
  }
  inspect(s, id) {
    const c = CARDS[id], d = duelStats(id);
    const m = this.ctx.modal(`<div data-c></div>
      <div class="dl-insp"><span>${icon('i-strike')} Strike <b>${d.strike}</b> when Leading</span><span>${icon('i-guard')} Guard <b>${d.guard}</b> when Answering</span><span>${icon('i-scheme')} Wound <b>${d.scheme}</b>: Voice damage when it wins</span><span>${icon('i-health')} Health <b>${this.st.sides[s].hp[id]}/${this.st.sides[s].maxHp[id]}</b></span></div>
      ${duelText(c) ? `<div class="lore" style="text-align:center;max-width:330px">${esc(duelText(c))}</div>` : ''}
      ${this.st.sides[s].bond?.[id] ? `<div class="dl-insp-bond">Bonded · ${esc(ARCH[this.st.sides[s].bond[id].arch].name)}: +${this.st.sides[s].bond[id].lead} Leading, +${this.st.sides[s].bond[id].answer} Answering</div>` : ''}`);
    m.el.querySelector('[data-c]').appendChild(renderCard(c, { size: 'full', width: Math.min(260, innerWidth - 80), ...(s === 0 ? lookFor(id) : {}) }));
  }
  guide(html, say = null) {
    this.el('[data-guide]').innerHTML = (say && this.coach ? `<div class="dl-coach"><b>${esc(this.coach.who)}:</b> ${say}</div>` : '') + html;
  }
  // ------------------------------------------------------------------ flow
  async run() {
    this.build();
    battleOn({ mode: this.spec.mode, opp: this.spec.persona?.id || null, at: new Date().toISOString() });
    music.play(this.spec.mode === 'story' ? 'story' : 'battle');
    await this.intro();
    if (this.remote) return this.runRemote();
    while (!this.st.over && !this.dead) {
      const L = this.st.lead;
      const choice = L === 0 ? await this.myLead() : await this.theirLead();
      if (this.dead) return;
      if (!choice) break; // forfeited
      await this.resolve(choice);
    }
    if (!this.dead) this.finish();
  }
  async intro() {
    const p = this.spec.persona;
    const line = p?.lines?.intro;
    this.guide(`<div class="dl-intro">${line ? `<p class="lore">“${esc(line)}”</p>` : ''}<p><b>${this.st.lead === 0 ? 'You Lead first.' : `${esc(this.spec.title || 'They')} Lead first.`}</b> Best of ${this.st.rules.duels} duels. Hold a card to read it.</p>${this.bondIntro()}</div>`);
    await sleep(this.spec.mode === 'tutorial' ? 600 : 1300);
    for (const say of this.coach?.intro || []) {
      if (this.dead) return;
      await new Promise((res) => {
        this.guide(`<button class="btn btn--sm dl-go" data-go>Got it</button>`, say);
        this.el('[data-go]').onclick = () => (sfx.tap(), res());
      });
    }
  }
  bondIntro() {
    const line = (s) => {
      const n = {};
      for (const b of Object.values(this.st.sides[s].bond || {})) n[b.arch] = (n[b.arch] || 0) + 1;
      return Object.keys(n).map((a) => esc(ARCH[a].name)).join(' · ');
    };
    const mine = line(0), theirs = line(1);
    if (!mine && !theirs) return '';
    return `<p class="dl-bondline">${mine ? `Your Bond: <b>${mine}</b>` : ''}${mine && theirs ? ' · ' : ''}${theirs ? `Theirs: <b>${theirs}</b>` : ''}</p>`;
  }
  // pick one of your hand; resolves with the id (or null if the match ended)
  pickFromHand(onPick) {
    return new Promise((res) => {
      const hand = this.el('[data-hand="0"]');
      hand.classList.add('choosing');
      const done = (v) => (this.lockHand(), res(v));
      hand.querySelectorAll('.card').forEach((c) => (c.onclick = () => { sfx.select(); hand.querySelectorAll('.card').forEach((x) => x.classList.toggle('is-selected', x === c)); onPick(c.dataset.id, done); }));
      this.cancelPick = () => done(null);
    });
  }
  // what they could still do to your pick glows on their bar
  threat(on, { read = false } = {}) {
    const them = this.st.sides[1];
    this.el('[data-bar="1"] [data-res="focus"]')?.classList.toggle('live', on && them.focus > 0);
    this.el('[data-bar="1"] [data-res="read"]')?.classList.toggle('live', on && read && them.reads > 0 && them.hand.length > 1);
  }
  // the opponent speaks (AI matches only; a persona's own line first)
  bark(kind, chance = 1) {
    if (this.remote || this.dead || Math.random() > chance) return;
    const own = this.spec.persona?.lines?.[kind];
    const pool = own ? [].concat(own) : BARKS[kind];
    if (!pool?.length) return;
    this.el('.dl-bark')?.remove();
    const b = document.createElement('div');
    b.className = 'dl-bark';
    b.textContent = `“${pool[Math.floor(Math.random() * pool.length)]}”`;
    this.el('.dl').appendChild(b);
    setTimeout(() => b.remove(), 2400);
  }
  // after the reveal: how it went, in one word or two
  stamp(evs, L) {
    const win = evs.find((e) => e.t === 'win');
    const read = evs.find((e) => e.t === 'read');
    const fellThem = evs.some((e) => e.t === 'fall' && e.side === 1), fellMe = evs.some((e) => e.t === 'fall' && e.side === 0);
    let text, good = null;
    if (!win) text = 'Stand-off.';
    else if (win.side === 0) {
      good = true;
      text = read?.side === 0 ? 'Good read!' : win.margin >= 4 || fellThem ? 'Crushed!' : L === 0 ? 'Hit!' : 'Blocked!';
    } else {
      good = false;
      text = read?.side === 1 ? 'Read you.' : win.margin >= 4 || fellMe ? 'Crushed.' : L === 0 ? 'Blocked.' : 'Punished.';
    }
    const el = document.createElement('div');
    el.className = `dl-stamp ${good === true ? 'good' : good === false ? 'bad' : ''}`;
    el.textContent = text;
    this.el('.dl-arena').appendChild(el);
    setTimeout(() => el.remove(), 1700);
    return { win, good };
  }
  // your hand stops answering taps (until the next pick)
  lockHand() {
    this.threat(false);
    const hand = this.el('[data-hand="0"]');
    hand.classList.remove('choosing');
    hand.querySelectorAll('.card').forEach((c) => ((c.onclick = null), c.classList.remove('is-selected')));
  }
  // ---- you Lead
  async myLead() {
    const st = this.st;
    const lead = await this.chooseLead();
    if (lead == null) return null;
    this.guide(`<div class="dl-ask">${esc(this.spec.title || 'Your opponent')} is choosing an Answer…</div>`);
    await sleep(650);
    const ans = this.ai.answer(st, lead);
    this.place(1, ans.answer, ans.answerFocus);
    sfx.reveal();
    if (ans.answerFocus) this.bark('focus');
    await sleep(350);
    // your finish: Focus last, maybe a READ switch
    return await this.myFinish(lead, ans);
  }
  // pick who Leads (with what it does against each of theirs); null if the match ended
  async chooseLead() {
    const st = this.st, me = st.sides[0], them = st.sides[1];
    this.guide(this.coach ? '' : `<div class="dl-ask"><b>You Lead.</b> Send a Champion: it attacks with ${icon('i-strike')} Strike. Their answer comes from the 3 cards at the top.</div>`, this.coach?.lead);
    this.hint('lead');
    this.threat(true);
    const lead = await this.pickFromHand((id, done) => {
      const rows = them.hand.map((a) => {
        const pv = preview(st, { lead: id, answer: a, answerFocus: false, leadFocus: false }, 0);
        return `<div class="dl-vsrow"><span>vs <b>${esc(first(a))}</b></span><span class="dl-vsnum"><b class="dl-atk">${icon('i-strike')}${pv.power?.lead.total ?? '–'}</b><b class="dl-def">${icon('i-guard')}${pv.power?.answer.total ?? '–'}</b></span></div>`;
      }).join('');
      const p0 = duelStats(id).strike + me.buff[id].strike;
      this.guide(`<div class="dl-pick"><div class="dl-pick__head"><b>${esc(CARDS[id].name)}</b> ${icon('i-strike')}${p0}<span>${esc(duelShort(CARDS[id]))}</span></div>
        <div class="dl-vslist">${rows}</div>
        ${them.focus ? `<div class="dl-note">They have ${them.focus} Focus: an Answer can add +2.</div>` : ''}
        <div class="dl-row"><button class="btn btn--sm dl-go" data-go>Send ${esc(first(id))}</button></div></div>`, this.coach && this.suggested && id !== this.suggested ? 'Try the glowing one!' : null);
      this.el('[data-go]').onclick = () => (sfx.deploy(), done(id));
    });
    if (lead != null) this.place(0, lead);
    return lead;
  }
  myFinish(lead, ans) {
    const st = this.st, me = st.sides[0];
    const readOk = canRead(st, ans.answer);
    if (!me.focus && !readOk) return { lead, ...ans, leadFocus: false, switchTo: null };
    const tip = this.coach ? coachFinish(st, lead, ans).finish : null;
    return new Promise((res) => {
      this.cancelFinish = () => (this.lockHand(), res(null));
      let focus = false, sw = null;
      const draw = () => {
        const say = !tip ? null : tip.switchTo && sw !== tip.switchTo ? this.coach.read || 'READ!' : tip.leadFocus && !focus ? this.coach.focus || 'Focus!' : 'Now tap <b>Clash!</b>';
        const cur = sw || lead;
        const pv = preview(st, { lead, ...ans, leadFocus: focus, switchTo: sw }, 0);
        this.guide(`<div class="dl-pick">
          <div class="dl-pick__head"><b>${esc(first(cur))}</b> vs <b>${esc(first(ans.answer))}</b>${ans.answerFocus ? ' <span class="dl-tag">Focused</span>' : ''}</div>
          ${cmp(pv, 0)}
          <div class="dl-row">
            ${me.focus ? `<button class="btn btn--sm btn--ghost dl-tog ${focus ? 'on' : ''}" data-focus>${icon('i-focus')} Focus +2</button>` : ''}
            ${readOk ? `<button class="btn btn--sm btn--ghost dl-tog ${sw ? 'on' : ''}" data-read>${icon('i-read')} ${sw ? 'Switched' : 'READ: switch'}</button>` : ''}
            <button class="btn btn--sm dl-go" data-go>Clash!</button>
          </div>
          ${readOk && !sw ? '<div class="dl-note">READ: swap in another Champion from your hand now that you’ve seen their answer (once a match).</div>' : ''}</div>`, say);
        if (tip?.leadFocus && !focus) this.el('[data-focus]')?.classList.add('dl-suggest');
        if (tip?.switchTo && !sw) {
          this.el('[data-read]')?.classList.add('dl-suggest');
          this.el(`[data-hand="0"] .card[data-id="${tip.switchTo}"]`)?.classList.add('dl-suggest');
        }
        this.el('[data-focus]')?.addEventListener('click', () => (sfx.tap(), (focus = !focus), draw()));
        this.el('[data-read]')?.addEventListener('click', async () => {
          sfx.tap();
          if (sw) return (sw = null), this.place(0, lead), draw();
          this.guide(`<div class="dl-ask">Tap the Champion to switch in.</div>`);
          const hand = this.el('[data-hand="0"]');
          hand.querySelectorAll('.card').forEach((c) => (c.onclick = () => { if (c.dataset.id === lead) return; sw = c.dataset.id; this.place(0, sw); draw(); }));
        });
        this.el('[data-go]').onclick = () => {
          const missed = tip && ((tip.switchTo && sw !== tip.switchTo) || (tip.leadFocus && !focus));
          if (missed && !this.nudged) {
            this.nudged = true;
            sfx.error();
            this.el('[data-guide] .dl-coach')?.remove();
            this.el('[data-guide]').insertAdjacentHTML('afterbegin', `<div class="dl-coach"><b>${esc(this.coach.who)}:</b> Wait! ${tip.switchTo && sw !== tip.switchTo ? 'Use your <b>READ</b> first: switch to the glowing hero.' : 'Tap <b>Focus +2</b> first.'}</div>`);
            return;
          }
          sfx.deploy();
          this.lockHand();
          res({ lead, ...ans, leadFocus: focus, switchTo: sw });
        };
      };
      draw();
    });
  }
  // ---- they Lead, you Answer
  async theirLead() {
    const st = this.st, me = st.sides[0], them = st.sides[1];
    this.guide(`<div class="dl-ask">${esc(this.spec.title || 'Your opponent')} is choosing who to Lead with…</div>`);
    await sleep(700);
    const lead = this.ai.lead(st);
    this.place(1, lead);
    sfx.reveal();
    // a Lead that out-muscles everything in your hand lands hard
    const hit = duelStats(lead).strike + them.buff[lead].strike + (them.bond?.[lead]?.lead || 0);
    const wall = Math.max(...me.hand.map((id) => duelStats(id).guard + me.buff[id].guard + (me.bond?.[id]?.answer || 0)));
    if (hit > wall) {
      this.el('[data-slot="1"] .card')?.classList.add('dl-slam');
      sfx.slam?.();
      haptic.slam();
      this.bark('slam', 0.6);
    }
    await sleep(300);
    const ans = await this.chooseAnswer(lead);
    if (!ans) return null;
    await sleep(450);
    const f = this.ai.finish(st, lead, ans.answer, ans.answerFocus);
    if (f.switchTo) {
      this.guide(`<div class="dl-ask">${icon('i-read')} <b>READ!</b> ${esc(this.spec.title || 'They')} switch to <b>${esc(CARDS[f.switchTo].name)}</b>.</div>`);
      this.place(1, f.switchTo);
      sfx.reveal();
      this.bark('read');
      await sleep(900);
    }
    if (f.leadFocus) (this.el('[data-slot="1"] .card')?.classList.add('dl-focused'), this.bark('focus'));
    return { lead, ...ans, ...f };
  }
  // pick your Answer to their Lead (and Focus); null if the match ended
  async chooseAnswer(lead) {
    const st = this.st, me = st.sides[0], them = st.sides[1];
    this.guide(`<div class="dl-ask"><b>${esc(CARDS[lead].name)}</b> attacks with ${icon('i-strike')}${duelStats(lead).strike + them.buff[lead].strike}.${this.coach ? '' : ` <b>Answer</b> with a Champion: it defends with ${icon('i-guard')} Guard.`}</div>`, this.coach?.answer);
    this.hint('answer', lead);
    this.threat(true, { read: true });
    let focus = false;
    const ans = await this.pickFromHand((id, done) => {
      const draw = () => {
        const pv = preview(st, { lead, answer: id, answerFocus: focus, leadFocus: false }, 0);
        this.guide(`<div class="dl-pick">
          <div class="dl-pick__head"><b>${esc(first(id))}</b> vs <b>${esc(first(lead))}</b><span>${esc(duelShort(CARDS[id]))}</span></div>
          ${cmp(pv, 1)}
          <div class="dl-row">
            ${me.focus ? `<button class="btn btn--sm btn--ghost dl-tog ${focus ? 'on' : ''}" data-focus>${icon('i-focus')} Focus +2</button>` : ''}
            <button class="btn btn--sm dl-go" data-go>Answer</button>
          </div>
          ${them.focus ? `<div class="dl-note">They have ${them.focus} Focus: they can still add +2 after you answer.</div>` : ''}</div>`,
          !this.coach ? null : id !== this.suggested ? 'Try the glowing one!' : this.tipFocus && !focus ? this.coach.focus || 'Focus!' : null);
        if (this.coach && id === this.suggested && this.tipFocus && !focus) this.el('[data-focus]')?.classList.add('dl-suggest');
        this.el('[data-focus]')?.addEventListener('click', () => (sfx.tap(), (focus = !focus), draw()));
        this.el('[data-go]').onclick = () => {
          // training: the coach wanted Focus here; say so once before letting it go
          if (this.coach && id === this.suggested && this.tipFocus && !focus && !this.nudged) {
            this.nudged = true;
            sfx.error();
            this.el('[data-guide] .dl-coach')?.remove();
            this.el('[data-guide]').insertAdjacentHTML('afterbegin', `<div class="dl-coach"><b>${esc(this.coach.who)}:</b> Wait! Tap <b>Focus +2</b> first, or this one gets away.</div>`);
            this.el('[data-focus]')?.classList.add('dl-suggest');
            return;
          }
          sfx.deploy();
          done({ answer: id, answerFocus: focus });
        };
      };
      draw();
    });
    if (ans) this.place(0, ans.answer, ans.answerFocus);
    return ans;
  }
  // training: point at the coach's move
  hint(kind, lead) {
    this.nudged = false;
    this.suggested = null;
    this.tipFocus = false;
    if (!this.coach) return;
    if (kind === 'lead') this.suggested = coachLead(this.st, this.model, this.coach.teach);
    else {
      const a = coachAnswer(this.st, lead, this.model);
      this.suggested = a.answer;
      this.tipFocus = a.answerFocus;
    }
    this.el(`[data-hand="0"] .card[data-id="${this.suggested}"]`)?.classList.add('dl-suggest');
  }
  place(s, id, focused = false) {
    const slot = this.el(`[data-slot="${s}"]`);
    slot.querySelector('.card')?.remove();
    // as big as the stage allows
    const w = Math.floor(Math.max(56, Math.min(150, (this.el('.dl-arena').clientWidth - 70) / 2, (slot.clientHeight || 180) / 1.4)));
    const c = this.card(s, id, w);
    c.classList.add('dl-in');
    if (focused) c.classList.add('dl-focused');
    slot.appendChild(c);
    // the number that matters in this duel, big: Strike for the Lead, Guard for the Answer
    slot.querySelector('.dl-power')?.remove();
    const side = this.st.sides[s], leading = s === this.st.lead, k = leading ? 'strike' : 'guard';
    const n = duelStats(id)[k] + side.buff[id][k] + ((leading ? side.bond?.[id]?.lead : side.bond?.[id]?.answer) || 0);
    slot.insertAdjacentHTML('beforeend', `<span class="dl-power ${leading ? 'dl-atk' : 'dl-def'}">${icon(leading ? 'i-strike' : 'i-guard')}${n}</span>`);
    // the card leaves the hand
    this.el(`[data-hand="${s}"] .card[data-id="${id}"]`)?.classList.add('dl-gone');
  }
  // ---- the clash, beat by beat
  async resolve(choice) {
    const st = this.st, L = st.lead;
    const before = [st.sides[0].voice, st.sides[1].voice];
    playDuel(st, choice);
    if (choice.switchTo && L === 0) this.stats.reads++;
    await this.animate(st.events, L, [before[0] - st.sides[0].voice, before[1] - st.sides[1].voice]);
  }
  // online: a duel the server resolved (its events, from your side)
  async resolveRemote(res) {
    const before = [this.st.sides[0].voice, this.st.sides[1].voice];
    if (res.choice.switchTo && res.lead === 0) this.stats.reads++;
    // the newest state once nothing else is waiting to be shown
    if (!this.remote.hasResult()) this.st = cloneDuel(this.remote.view.state);
    else this.st.sides.forEach((x, i) => (x.voice = res.voice[i]));
    await this.animate(res.events, res.lead, [before[0] - res.voice[0], before[1] - res.voice[1]]);
  }
  async animate(evs, L, lost) {
    // the duelists on the stage (a READ switch or a timeout may have changed them)
    const d = evs.find((e) => e.t === 'duel');
    if (d) for (const s of [0, 1]) if (this.el(`[data-slot="${s}"] .card`)?.dataset.id !== d.ids[s]) this.place(s, d.ids[s]);
    const clash = evs.find((e) => e.t === 'clash');
    const win = evs.find((e) => e.t === 'win');
    const lines = [];
    for (const e of evs) if (e.t === 'ability' && e.trig === 'reveal') lines.push(`${first(e.id)}: ${e.name}`);
    const vs = this.el('[data-vs]');
    if (clash) {
      const pl = clash.power[L], pa = clash.power[1 - L];
      const mine = L === 0 ? pl : pa, theirs = L === 0 ? pa : pl;
      vs.innerHTML = `<b class="${L === 0 ? 'dl-atk' : 'dl-def'}">${mine.total}</b><span>${icon(L === 0 ? 'i-strike' : 'i-guard')} vs ${icon(L === 0 ? 'i-guard' : 'i-strike')}</span><b class="${L === 0 ? 'dl-def' : 'dl-atk'}">${theirs.total}</b>`;
      vs.classList.add('on');
      sfx.clash();
      haptic.tick();
    }
    await sleep(700);
    const myWin = win && win.side === 0, theirWin = win && win.side === 1;
    this.stamp(evs, L);
    if (theirWin && win.margin >= 4) this.bark('big', 0.6);
    else if (myWin && this.st.sides[1].voice > 0 && this.st.sides[1].voice <= CLUTCH_AT) this.bark('cornered', 0.5);
    if (win) {
      this.el(`[data-slot="${win.side}"] .card`)?.classList.add('dl-winner');
      this.el(`[data-slot="${1 - win.side}"] .card`)?.classList.add('dl-loser');
      myWin ? sfx.clashWin() : sfx.clashLose();
      if (myWin) this.stats.won++;
    }
    for (const e of evs) if (e.t === 'ability' && e.trig !== 'reveal') lines.push(`${first(e.id)}: ${e.name}`);
    const falls = evs.filter((e) => e.t === 'fall');
    for (const f of falls) this.el(`[data-slot="${f.side}"] .card[data-id="${f.id}"]`)?.classList.add('dl-falls');
    this.stats.felled += falls.filter((f) => f.side === 1).length;
    const verdict = !win ? 'A standoff.' : myWin ? 'You win the duel!' : 'You lose the duel.';
    this.guide(`<div class="dl-result ${myWin ? 'good' : theirWin ? 'bad' : ''}"><b>${verdict}</b>
      <span>${lost[1] > 0 ? `They lose ${lost[1]} Voice. ` : ''}${lost[0] > 0 ? `You lose ${lost[0]} Voice. ` : ''}${falls.map((f) => `${esc(first(f.id))} falls.`).join(' ')}</span>
      ${lines.length ? `<em>${esc([...new Set(lines)].slice(0, 3).join(' · '))}</em>` : ''}</div>`, myWin && this.coach?.win ? this.coach.win : null);
    if (lost[1] > 0) this.flashBar(1);
    if (lost[0] > 0) (this.flashBar(0), haptic.slam());
    await sleep(falls.length || lines.length ? 1500 : 1100);
    vs.classList.remove('on');
    vs.textContent = 'VS';
    for (const s of [0, 1]) this.el(`[data-slot="${s}"] .card`)?.remove(), this.el(`[data-slot="${s}"] .dl-power`)?.remove();
    this.paint();
  }
  flashBar(s) {
    const b = this.el(`[data-bar="${s}"]`);
    b.classList.remove('hit');
    void b.offsetWidth;
    b.classList.add('hit');
  }
  // ------------------------------------------------------------------ online
  async runRemote() {
    const r = this.remote;
    const them = esc(this.spec.title || 'They');
    while (!this.dead) {
      if (r.hasResult()) {
        const res = await r.nextResult();
        if (this.dead) return;
        if (res.kind === 'end') break;
        await this.resolveRemote(res);
        continue;
      }
      const v = r.view;
      if (v.over) break;
      this.st = cloneDuel(v.state);
      this.paint();
      const t = v.turn;
      if (t.lead) this.place(this.st.lead, t.lead);
      if (t.answer) this.place(1 - this.st.lead, t.answer.answer, t.answer.answerFocus);
      if (v.waiting.includes('you')) {
        if (t.phase !== 'lead') sfx.reveal();
        const ui = t.phase === 'lead' ? this.chooseLead().then((id) => id && { lead: id })
          : t.phase === 'answer' ? this.chooseAnswer(t.lead)
          : Promise.resolve(this.myFinish(t.lead, t.answer)).then((c) => c && { leadFocus: c.leadFocus, switchTo: c.switchTo });
        const mv = await Promise.race([ui, r.changed(v.version).then(() => null)]);
        if (this.dead) return;
        if (!mv) {
          // the clock ran out (a move was played for you) or the match ended
          this.cancelPick?.();
          this.cancelFinish?.();
          continue;
        }
        this.guide(`<div class="dl-ask">Sent…</div>`);
        const err = await r.move(mv);
        if (err && !this.dead) this.ctx.toast(err);
      } else {
        this.guide(`<div class="dl-ask">${them} ${t.phase === 'lead' ? 'choose who to Lead with' : t.phase === 'answer' ? 'choose an answer' : 'decide on Focus or a READ'}…</div>`);
        await r.changed(v.version);
      }
    }
    if (this.dead) return;
    const v = r.view;
    this.st = cloneDuel(v.state);
    this.st.over = true;
    this.st.winner = v.winner;
    this.paint();
    this.finish();
  }
  remoteLine(won) {
    const by = this.remote?.view?.by, who = this.spec.title || 'They';
    if (by === 'resign') return won ? `${who} forfeited. The win is yours.` : 'You forfeited. It counts as a loss.';
    if (by === 'disconnect') return won ? `${who} lost connection for over a minute. The win is yours.` : 'You were disconnected for over a minute, so the match was forfeited.';
    if (by === 'timeout') return won ? `${who} stopped answering. The win is yours.` : 'You ran out of time too many times.';
    if (by === 'update') return 'This match started before the game was updated. It ends with no result.';
    return null;
  }
  // the shot clock, "they lost connection", and emotes
  setupOnline() {
    const dl = this.el('.dl');
    const clock = document.createElement('div');
    clock.className = 'pvp-clock dl-clock';
    dl.appendChild(clock);
    const tick = () => {
      const v = this.remote.view;
      const left = v?.deadline && !v.over ? Math.max(0, Math.ceil((v.deadline - Date.now()) / 1000)) : 0;
      clock.textContent = left ? left + 's' : '';
      clock.classList.toggle('low', left > 0 && left <= 8);
      const away = v?.oppSeen && !v.over ? v.now - v.oppSeen + (Date.now() - (this.remote.viewAt || Date.now())) : 0;
      let warn = this.el('.dl-away');
      if (away > 15000) {
        if (!warn) (warn = document.createElement('div')), (warn.className = 'dl-away'), dl.appendChild(warn);
        warn.textContent = `${this.spec.title || 'They'} lost connection · they forfeit in ${Math.max(0, Math.ceil((60000 - away) / 1000))}s`;
      } else warn?.remove();
    };
    tick();
    this.clockTimer = setInterval(tick, 500);
    if (this.remote.view?.echo) return; // Echoes don't chat
    // live voice chat, kept apart from the match: if it fails, nothing here notices
    const name = this.spec.title || 'Them';
    const blocked = () => (this.chatBlocked = true);
    import('../voice/ui.js').then((v) => {
      this.voiceUi = v;
      if (this.dead || this.finished) return;
      this.voiceChat = v.mountVoice(dl, { matchId: this.remote.id, name, ctx: this.ctx, onBlocked: blocked });
    }).catch((e) => console.warn('voice', e.message));
    const btn = document.createElement('button');
    btn.className = 'emote-btn dl-emote';
    btn.setAttribute('aria-label', 'Emote');
    btn.textContent = '💬';
    dl.appendChild(btn);
    const close = () => this.el('.emote-pick')?.remove();
    btn.onclick = (e) => {
      e.stopPropagation();
      if (this.el('.emote-pick')) return close();
      sfx.tap();
      const muted = !!store.get().settings.muteEmotes;
      const pick = document.createElement('div');
      pick.className = 'emote-pick dl-emote-pick';
      pick.innerHTML = EMOTES.map((x) => `<button data-emote="${x.id}">${esc(x.text)}</button>`).join('') + `<button class="emote-mute" data-mute>${muted ? 'Unmute' : 'Mute'} ${esc(this.spec.title || 'them')}</button><button class="emote-mute" data-report>Report or block ${esc(this.spec.title || 'them')}</button>`;
      pick.onclick = async (ev) => {
        ev.stopPropagation();
        const b = ev.target.closest('button');
        if (!b) return;
        close();
        if (b.dataset.report != null) return this.voiceUi?.openReport(this.ctx, this.remote.id, name, { onBlocked: () => (blocked(), this.voiceChat?.session.refresh()) });
        if (b.dataset.mute != null) {
          store.update((x) => (x.settings.muteEmotes = !muted));
          return this.ctx.toast(muted ? 'Their emotes are back on' : 'Their emotes are muted');
        }
        this.emoteBubble(0, b.dataset.emote);
        const err = await this.remote.emote(b.dataset.emote);
        if (err && !this.dead) this.ctx.toast(err);
      };
      dl.appendChild(pick);
      setTimeout(() => document.addEventListener('pointerdown', (ev) => !pick.contains(ev.target) && ev.target !== btn && close(), { once: true }), 0);
    };
    // emotes from someone you blocked never show
    this.remote.onEmote = (id) => !this.dead && !store.get().settings.muteEmotes && !this.chatBlocked && !this.voiceChat?.session.iBlocked && this.emoteBubble(1, id);
  }
  emoteBubble(side, id) {
    const text = EMOTES.find((x) => x.id === id)?.text;
    if (!text) return;
    this.el(`.emote-bubble--${side}`)?.remove();
    const b = document.createElement('div');
    b.className = `emote-bubble emote-bubble--${side} dl-bubble--${side}`;
    b.textContent = text;
    this.el('.dl').appendChild(b);
    if (side === 1) sfx.tap();
    setTimeout(() => b.remove(), 2800);
  }
  // ---- forfeit
  quitTap(btn) {
    if (this.st.over) return;
    if (!btn.classList.contains('armed')) {
      btn.classList.add('armed');
      btn.textContent = 'Tap again: you lose';
      clearTimeout(this.quitT);
      this.quitT = setTimeout(() => (btn.classList.remove('armed'), (btn.innerHTML = '⚑ <span>Forfeit</span>')), 4000);
      return;
    }
    this.forfeited = true;
    if (this.remote) {
      // the server ends it; its result finishes the match
      this.cancelPick?.();
      this.cancelFinish?.();
      btn.disabled = true;
      return this.remote.resign();
    }
    this.st.over = true;
    this.st.winner = 1;
    this.cancelPick?.();
    this.finish();
  }
  // ------------------------------------------------------------------ the end
  async finish() {
    if (this.finished) return;
    this.finished = true;
    battleOff();
    this.voiceChat?.destroy(); // voice ends with the match
    this.el('[data-quit]')?.remove();
    const st = this.st, me = st.sides[0];
    const won = st.winner === 0;
    if (this.spec.finale && won) music.play('finale', { fade: 0.6 });
    else music.stop(0.6);
    const clutch = won && me.voice <= CLUTCH_AT;
    const fought = [...new Set(st.history.map((h) => h.ids[0]).filter(Boolean))];
    const rewards = [];
    // practice (training replays, the welcome Duel) leaves your stats and goals alone
    if (!this.spec.practice) store.update((s) => {
      s.stats.matches++;
      if (won) s.stats.wins++;
      if (clutch) s.stats.finals++;
      store.bumpObjective('matches');
      if (won) store.bumpObjective('wins');
      if (clutch) store.bumpObjective('finals');
      if (this.stats.felled) store.bumpObjective('kills', this.stats.felled);
      if (this.stats.reads) store.bumpObjective('readsHit', this.stats.reads);
      if (this.stats.won) store.bumpObjective('duelsWon', this.stats.won);
      if (FEATURES.claims && won && s.pledge) {
        const n = this.spec.mine.filter((id) => CARDS[id].faction === s.pledge).length;
        if (n >= 4) {
          s.claims[s.pledge] += clutch ? 2 : 1;
          rewards.push(['Claim points', `+${clutch ? 2 : 1} ${s.pledge}`]);
        }
      }
    });
    crumb('duel end saved');
    let res = { rewards: [], spoils: null };
    if (!this.spec.noRewards) {
      try {
        res = (await vault.act('matchEnd', {
          mode: this.spec.mode, won, clutch, fought, feats: {}, fell: [...me.fallen],
          endHp: Object.fromEntries(fought.filter((id) => !me.fallen.includes(id)).map((id) => [id, me.hp[id]])),
          opp: this.spec.title || 'an opponent', kicker: this.spec.resultKicker, persona: this.spec.persona?.id, skill: this.spec.persona?.skill,
          round: st.history.length, chapter: this.spec.chapter, final: !!this.spec.final, noSpoils: !!this.spec.noSpoils,
          match: this.remote?.id, // online: the server checks the real result
        })) || res;
      } catch (e) {
        res = { rewards: [['Rewards', e.message]], spoils: null };
      }
    }
    if (this.dead) return;
    rewards.unshift(...res.rewards);
    if (won && this.spec.mode !== 'tutorial') import('../core/cloud.js').then((c) => c.contribute(this.remote ? 'pvp' : 'battle'));
    const extra = this.spec.onEnd?.({ won, finalWin: clutch, state: st, readsHit: this.stats.reads }) || [];
    rewards.push(...extra);
    if (won) haptic.win();
    if (!(this.spec.finale && won) && !music.sting(won ? 'victory' : 'defeat')) won ? sfx.matchWin() : sfx.matchLose();
    // guests: a gentle way to keep what they've won; saved players: pass it on
    const guest = isGuest() && this.spec.mode !== 'tutorial';
    if (guest) track('guest_duel_completed', { won, online: !!this.remote });
    if (guest && res.rewards?.length) track('guest_reward_earned');
    const after = guest
      ? `<div class="result__save"><span>Keep your Champions and rewards</span><button class="btn btn--sm" data-saveprofile>Save profile</button></div>`
      : this.remote && !this.remote.view?.echo && this.spec.mode !== 'tutorial'
        ? `<div class="row result__social"><button class="btn btn--sm btn--ghost" data-befriend>Add ${esc(first2(this.spec.title || 'them'))} as a friend</button><button class="btn btn--sm btn--ghost" data-challenge>Challenge a friend</button></div>`
        : '';
    const p = this.spec.persona;
    const line = this.remoteLine(won) || (this.forfeited ? 'You forfeited. It counts as a loss.' : won ? this.spec.winLine || p?.lines?.lose || 'The Voice is yours.' : this.spec.loseLine || p?.lines?.win || 'Not this time.');
    const r = document.createElement('div');
    r.className = 'result';
    const art = uiArt(won ? 'victory' : 'defeat', true);
    if (art) r.style.backgroundImage = `linear-gradient(rgba(4,4,7,0.72), rgba(4,4,7,0.82)), url("${art}")`;
    r.innerHTML = `
      <div class="kicker">${esc(this.spec.resultKicker || (this.spec.mode === 'ladder' ? store.tierName() : ''))}</div>
      <div class="result__title ${won ? 'win' : 'lose'}">${won ? 'VICTORY' : 'DEFEAT'}</div>
      <div class="lore" style="text-align:center;max-width:320px">${esc(line)}</div>
      ${res.spoils ? `<div class="dl-spoils" data-spoils></div>` : ''}
      <div class="result__stats">
        <div><b>${Math.max(0, me.voice)}–${Math.max(0, st.sides[1].voice)}</b><span>Voice</span></div>
        <div><b>${this.stats.won}/${st.history.length}</b><span>Duels won</span></div>
        <div><b>${this.stats.felled}</b><span>Felled</span></div>
      </div>
      ${rewards.length ? `<div class="result__rewards">${rewards.map(([a, b]) => `<div><span>${esc(a)}</span><b class="gold">${esc(b)}</b></div>`).join('')}</div>` : ''}
      <div class="row" style="width:100%;max-width:360px;gap:10px">
        ${this.spec.rematch !== false ? '<button class="btn btn--ghost grow" data-rematch>Rematch</button>' : ''}
        <button class="btn grow" data-continue>${esc(this.spec.continueLabel || 'Continue')}</button>
      </div>
      ${after}`;
    this.el('.dl').appendChild(r);
    if (res.spoils) {
      const sp = res.spoils, box = r.querySelector('[data-spoils]');
      box.innerHTML = `<div class="kicker">Spoils</div>`;
      const c = renderCard(CARDS[sp.cardId], { width: 96, flat: true, treatment: sp.treatment && sp.treatment !== 'standard' ? sp.treatment : null });
      c.classList.add('dl-in');
      box.appendChild(c);
      box.insertAdjacentHTML('beforeend', `<div class="dl-spoils__name"><b class="rar-${sp.rarity}">${esc(CARDS[sp.cardId].name)}</b> · ${sp.rarity}${sp.isNew ? ' <span class="tag tag--new">New</span>' : ''}</div>`);
      if (sp.rarity !== 'common') sfx.rarity(sp.rarity);
    }
    r.querySelector('[data-saveprofile]')?.addEventListener('click', () => import('../ui/save-profile.js').then((m) => m.openSaveProfile(this.ctx, { why: 'result' })));
    // the person you just played: a friend request, checked against the match itself
    r.querySelector('[data-befriend]')?.addEventListener('click', async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      try {
        const res = await vault.social('add', { match: this.remote.id });
        b.textContent = res.friends || res.already ? 'Friends ✓' : 'Request sent ✓';
        sfx.select();
      } catch (err) {
        this.ctx.toast(err.message);
        b.disabled = false;
      }
    });
    r.querySelector('[data-challenge]')?.addEventListener('click', () => (track('challenge_friend_clicked', { from: 'result' }), this.ctx.go('online', { host: 1 })));
    r.querySelector('[data-continue]').onclick = () => (this.spec.onContinue ? this.spec.onContinue(this.ctx) : this.ctx.go('home'));
    r.querySelector('[data-rematch]')?.addEventListener('click', (e) => {
      if (this.spec.onRematch) return this.spec.onRematch(this.ctx, e.currentTarget);
      setBattle({ ...this.spec, seed: undefined });
      this.ctx.go('play', { t: Date.now() });
      setTimeout(() => this.ctx.go('battle', { t: Date.now() }), 0);
    });
  }
}
function first2(name) {
  return String(name).split(' ').slice(0, 2).join(' ');
}
