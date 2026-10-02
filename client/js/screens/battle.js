// THE RECKONING — battle screen and match controller.
// Three lanes a side. Every exchange is staged lane by lane: lunges, riposte,
// bolts into the Voice, shields, damage numbers, health draining, falls.
import { CARDS, cardText } from '../../../engine/cards/index.js';
import { createBattle, deploy, command, publicView, cloneState, allowedOrders, isLegalCommand, deploysAllowed, deployOrder, LANES, powerFor, TERRAIN, lastStandActive, ultCharged, bondsFor } from '../../../engine/battle.js';
import { ORDERS } from '../../../engine/orders.js';
import { lookFor } from '../ui/look.js';
import { renderCard, esc } from '../ui/card.js';
import { icon } from '../ui/icons.js';
import { sfx } from '../core/audio.js';
import { haptic } from '../core/haptics.js';
import * as store from '../core/store.js';
import { FEATURES } from '../core/features.js';
import * as vault from '../core/vault.js';
import { takeBattle } from '../core/session.js';
import { recordBattle, addHistory, rollSpoils, SPOILS_PER_DAY, SPOILS_EMBERS } from '../../../engine/collection.js';
import { LIST } from '../../../engine/cards/index.js';
import { uiArt, avatarArt, factionArt, artFor } from '../art/index.js';
import { Juice } from '../ui/juice.js';
import { MASTERY, cardStats, masteryLevel, seasonWin, applyReward } from '../../../engine/goals.js';
import * as music from '../core/music.js';
import { logMatch } from '../core/playlog.js';
import { crumb, battleOn, battleOff } from '../core/crumbs.js';
import { previewOrder } from '../../../engine/battle-ai.js';
import { EMOTES } from '../../../engine/pvp.js';

// ---------------------------------------------------------------------------
// AI bridge (Web Worker)
// ---------------------------------------------------------------------------
let worker = null;
let reqId = 0;
const waiting = new Map();
function ai(kind, payload) {
  if (!worker) {
    worker = new Worker(new URL('../core/ai-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const w = waiting.get(e.data.id);
      if (w) {
        waiting.delete(e.data.id);
        w(e.data.choice);
      }
    };
  }
  const id = ++reqId;
  return new Promise((res) => {
    waiting.set(id, res);
    worker.postMessage({ id, kind, ...payload });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LABEL = { strike: 'Strike', guard: 'Guard', scheme: 'Scheme' };
const SHORT = { strike: 'STR', guard: 'GRD', scheme: 'SCH', all: 'ALL' };

// Default spec: a Ladder match against a persona using your active Octave.
export function ladderSpec(persona) {
  const s = store.get();
  const mine = s.octaves[s.active].cards;
  return { mode: 'ladder', mine, theirs: personaOctave(persona), persona, title: persona.name, sub: persona.title };
}

export function personaOctave(p) {
  // Personas favour their faction; fill from the rest of the set.
  const pool = Object.values(CARDS).filter((c) => !c.unique);
  const seed = [...p.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
  let x = seed || 1;
  const rnd = () => (x = (x * 1103515245 + 12345) >>> 0) / 4294967296;
  const fac = pool.filter((c) => c.faction === p.faction).sort(() => rnd() - 0.5);
  const rest = pool.filter((c) => c.faction !== p.faction).sort(() => rnd() - 0.5);
  return [...fac.slice(0, 5), ...rest.slice(0, 3)].map((c) => c.id);
}

export async function render(root, params, ctx) {
  let spec = takeBattle();
  if (!spec) {
    const persona = store.PERSONAS[Math.min(store.PERSONAS.length - 1, store.get().ladder.tier)];
    spec = ladderSpec(persona);
  }
  const b = new Battle(root, spec, ctx);
  b.run().catch((e) => console.error('battle crashed', e?.stack || e));
  return () => b.destroy();
}

function majorityFaction(ids) {
  const n = {};
  for (const id of ids || []) n[CARDS[id]?.faction] = (n[CARDS[id]?.faction] || 0) + 1;
  return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0];
}

// Press helper: tap vs. long-press (inspect).
function pressable(el, onTap, onLong) {
  let t = null;
  el.addEventListener('pointerdown', () => {
    t = setTimeout(() => {
      t = 'long';
      onLong?.();
    }, 420);
  });
  el.addEventListener('pointerup', () => {
    if (t === 'long') return (t = null);
    clearTimeout(t);
    t = null;
    onTap?.();
  });
  const cancel = () => {
    if (t !== 'long') clearTimeout(t);
    t = null;
  };
  el.addEventListener('pointerleave', cancel);
  el.addEventListener('pointercancel', cancel);
}

class Battle {
  constructor(root, spec, ctx) {
    this.root = root;
    this.spec = spec;
    this.ctx = ctx;
    this.dead = false;
    this.matchId = 'm' + Date.now() + Math.random().toString(36).slice(2, 6);
    this.seed = spec.replay ? spec.replay.seed : (Math.random() * 2 ** 32) >>> 0;
    // Locked mechanics are removed from the match for BOTH players.
    const un = store.get().unlock;
    const rules = { ...(spec.config || {}) };
    const scripted = spec.mode === 'story' || spec.mode === 'tutorial';
    if (spec.tutorial?.noFocus || (!scripted && !un.focus)) rules.focus = 0;
    if (spec.tutorial?.noRead || (!scripted && !un.read)) rules.reads = 0;
    // online: the server owns the match; we hold our own view of it
    this.remote = spec.remote || null;
    this.state = this.remote ? cloneState(this.remote.view.state) : createBattle([spec.mine, spec.theirs], CARDS, { seed: this.seed, rules, initiative: spec.initiative, mods: spec.mods, terrain: spec.terrain });
    this.voiceShown = [this.state.p[0].voice, this.state.p[1].voice];
    this.habits = {}; // enemy Champion uid -> the Orders it has given
    this.baseSpeed = store.get().settings.fast ? 2 : 1;
    this.speed = this.baseSpeed;
    this.build();
  }

  // playtest log: record what happened, and quits too
  log(quit) {
    if (!this.spec.replay && this.t0) battleOff(quit ? 'left' : 'result');
    if (this.logged || this.spec.replay || !this.t0) return;
    this.logged = true;
    if (quit && !this.state.history.some((h) => h.command)) return; // left before any round was played
    logMatch({ spec: this.spec, state: this.state, started: this.t0, quit, peeks: this.peeks, fast: this.baseSpeed > 1 });
  }

  destroy() {
    this.log(true);
    this.dead = true;
    ai('end', { matchId: this.matchId });
    this.hideClock?.();
    this.remote?.close();
    window.removeEventListener('resize', this.onResize);
    this.juice?.destroy();
  }

  // ------------------------------------------------------------------ DOM
  build() {
    this.root.innerHTML = `
      <div class="rk">
        <div class="rk-strip" data-strip="1"></div>
        <div class="rk-ohand" data-ohand></div>
        <div class="rk-field" data-field>
          <div class="rk-row rk-row--opp" data-row="1"></div>
          <div class="rk-mid"><div class="rk-terrain" data-terrain></div><span data-mid>Round 1</span></div>
          <div class="rk-row rk-row--me" data-row="0"></div>
          <div class="rk-hint" data-hint></div>
        </div>
        <div class="rk-strip rk-strip--me" data-strip="0"></div>
        <div class="rk-dock" data-dock></div>
      </div>`;
    this.el = (sel) => this.root.querySelector(sel);
    // painted arena: the opponent's home ground, else the Stillhouse
    const fac = this.spec.persona?.faction || majorityFaction(this.spec.theirs);
    const lite = !!store.get().settings.lite; // iPhone: the smaller copies (the art sits under a dark wash)
    const arena = (this.spec.arena && uiArt(this.spec.arena, lite)) || uiArt('arena-' + fac, lite) || uiArt('arena-stillhouse', lite);
    if (arena) this.el('.rk').style.backgroundImage = `linear-gradient(rgba(5,5,8,0.55), rgba(5,5,8,0.55)), url("${arena}")`;
    this.size();
    this.juice = new Juice(this.el('.rk'), { ambient: fac });
    if (this.spec.coach) this.el('.rk').classList.add('coached');
    this.onResize = () => {
      this.size();
      this.juice.resize();
      this.renderBoard();
      this.fitQuit();
    };
    window.addEventListener('resize', this.onResize);
    this.renderStrips();
    this.renderBoard();
    this.renderOppHand();
    this.renderTerrain();
    // tap anywhere on the field during resolution to speed it up
    this.el('[data-field]').addEventListener('pointerdown', () => this.resolving && (this.speed = 2.2));
    if (this.remote && !this.remote.view?.echo) this.setupEmotes();
    this.setupForfeit();
  }

  // Forfeit, always in sight: a flag under the opponent's bar in every mode.
  // First tap arms it (it counts as a loss), a second tap within 4 s confirms.
  setupForfeit() {
    if (!this.canForfeit()) return;
    const b = document.createElement('button');
    b.className = 'quit-btn';
    b.setAttribute('aria-label', 'Forfeit');
    b.innerHTML = '⚑ <span>Forfeit</span>';
    this.el('.rk').appendChild(b);
    this.fitQuit();
    let timer;
    b.onclick = (e) => {
      e.stopPropagation();
      if (!this.canForfeit()) return b.remove();
      if (!b.classList.contains('armed')) {
        sfx.tap();
        b.classList.remove('compact');
        b.classList.add('armed');
        b.textContent = 'Tap again: you lose';
        timer = setTimeout(() => (b.classList.remove('armed'), (b.innerHTML = '⚑ <span>Forfeit</span>'), this.fitQuit()), 4000);
        return;
      }
      clearTimeout(timer);
      b.remove();
      this.forfeitMatch();
    };
  }

  // Online emotes: a small button on the left edge, a pop-up of fixed phrases,
  // speech bubbles over each side. All absolutely placed: nothing on the board moves.
  setupEmotes() {
    const rk = this.el('.rk');
    const btn = document.createElement('button');
    btn.className = 'emote-btn';
    btn.setAttribute('aria-label', 'Emote');
    btn.textContent = '💬';
    rk.appendChild(btn);
    const close = () => this.el('.emote-pick')?.remove();
    btn.onclick = (e) => {
      e.stopPropagation();
      if (this.el('.emote-pick')) return close();
      sfx.tap();
      const muted = !!store.get().settings.muteEmotes;
      const pick = document.createElement('div');
      pick.className = 'emote-pick';
      pick.innerHTML = EMOTES.map((x) => `<button data-emote="${x.id}">${esc(x.text)}</button>`).join('') + `<button class="emote-mute" data-mute>${muted ? 'Unmute' : 'Mute'} ${esc(this.who(1).name)}</button>`;
      pick.onclick = async (ev) => {
        ev.stopPropagation();
        const b = ev.target.closest('button');
        if (!b) return;
        close();
        if (b.dataset.mute != null) {
          store.update((x) => (x.settings.muteEmotes = !muted));
          return this.ctx.toast(muted ? 'Their emotes are back on' : 'Their emotes are muted');
        }
        const id = b.dataset.emote;
        this.emoteBubble(0, id);
        const err = await this.remote.emote(id);
        if (err && !this.dead) this.ctx.toast(err);
      };
      rk.appendChild(pick);
      setTimeout(() => document.addEventListener('pointerdown', (ev) => !pick.contains(ev.target) && ev.target !== btn && close(), { once: true }), 0);
    };
    this.remote.onEmote = (id) => !this.dead && !store.get().settings.muteEmotes && this.emoteBubble(1, id);
  }
  emoteBubble(side, id) {
    const text = EMOTES.find((x) => x.id === id)?.text;
    const rk = this.el('.rk');
    if (!text || !rk) return;
    rk.querySelector(`.emote-bubble--${side}`)?.remove();
    const b = document.createElement('div');
    b.className = `emote-bubble emote-bubble--${side}`;
    b.textContent = text;
    // by the speaker's own strip: under theirs, above yours (clear of the clock and warnings in the middle)
    const strip = this.el(`[data-strip="${side}"]`);
    if (strip) b.style.top = (side === 1 ? strip.offsetTop + strip.offsetHeight + 4 : strip.offsetTop - 40) + 'px';
    rk.appendChild(b);
    if (side === 1) sfx.tap();
    setTimeout(() => b.remove(), 2800);
  }

  size() {
    const w = Math.min(window.innerWidth, 520);
    const h = window.innerHeight;
    this.cw = Math.floor(Math.max(80, Math.min(124, (w - 36) / 3, (h - 372) / 2.8)));
    this.root.style.setProperty('--lw', this.cw + 'px');
  }

  // Each lane's ground, labelled on the middle line and tinted on the floor.
  renderTerrain() {
    const t = this.state.terrain || [];
    const box = this.el('[data-terrain]');
    if (!t.some((k) => k !== 'field')) return (box.innerHTML = '');
    const ico = { rampart: 'guard', bridge: 'strike', gallery: 'scheme' };
    box.innerHTML = t
      .map((k) => {
        const T = TERRAIN[k];
        if (k === 'field') return '<span></span>';
        const short = { rampart: 'Rampart', bridge: 'Bridge', gallery: 'Gallery', mire: 'Mire' }[k];
        return `<span class="tchip t-${k}" title="${esc(T.name)}: ${esc(T.text)}">${ico[k] ? `<i class="o-${ico[k]}">${icon('i-' + ico[k])}</i>` : '<i>↓</i>'}${short} <b>${k === 'mire' ? '−1 all' : '+2'}</b></span>`;
      })
      .join('');
  }

  who(side) {
    if (side === 0) return { name: store.get().settings.name || 'You', sub: this.spec.mode === 'ladder' ? store.tierName() : this.spec.mySub || '' };
    return { name: this.spec.title || 'Opponent', sub: this.spec.sub || '' };
  }

  renderStrips() {
    const R = this.state.rules;
    for (const side of [0, 1]) {
      const p = this.state.p[side];
      const w = this.who(side);
      const v = this.voiceShown[side];
      const pct = Math.max(0, (100 * v) / R.voice);
      this.el(`[data-strip="${side}"]`).innerHTML = `
        <svg class="init ico ${this.state.initiative === side ? 'on' : ''}" aria-label="Initiative"><use href="#i-initiative"/></svg>
        <div class="rk-who"><div class="rk-name">${esc(w.name)}</div><div class="rk-sub">${esc(w.sub)}</div></div>
        ${R.focus > 0 ? `<div class="res-mini res-mini--focus" title="Focus">${icon('i-focus')}${p.focus}</div>` : ''}
        ${R.reads > 0 ? `<div class="res-mini res-mini--read ${p.reads <= 0 ? 'used' : ''}" title="READ">${icon('i-read')}${p.reads}</div>` : ''}
        ${lastStandActive(this.state, side) && this.state.phase !== 'over' ? `<span class="ls-badge" title="Last Stand: +${R.lastStandPower} Power">Last Stand</span>` : ''}
        ${side === 0 && R.ults > 0 ? `<span class="ult-count ${p.ults > 0 ? '' : 'used'}" title="Ultimate">⚡${p.ults}</span>` : ''}
        <div class="voice ${v <= this.lowVoice() ? 'low' : ''}" data-voice="${side}" title="Voice">
          <div class="voice__bar"><i class="voice__ghost" style="width:${pct}%"></i><i class="voice__fill" style="width:${pct}%"></i></div>
          <b class="voice__n">${Math.max(0, v)}</b>
        </div>
        ${side === 1 ? `<button class="btn-icon" data-sheet aria-label="Octaves and Forfeit" title="Octaves · Forfeit">${icon('u-vault')}</button>` : `<button class="btn-icon fast ${this.baseSpeed > 1 ? 'on' : ''}" data-fast aria-label="Fast mode" title="Fast mode">»</button>`}`;
    }
    this.el('[data-sheet]').onclick = () => this.showSheet();
    this.el('[data-fast]').onclick = () => {
      const fast = !(this.baseSpeed > 1);
      store.update((x) => (x.settings.fast = fast));
      this.baseSpeed = fast ? 2 : 1;
      this.speed = Math.max(this.speed, this.baseSpeed);
      sfx.tap();
      this.renderStrips();
    };
    this.danger();
  }

  // your Voice running low bleeds red into the edges of the screen
  danger() {
    this.el('.rk').classList.toggle('danger', this.voiceShown[0] <= this.lowVoice() && this.voiceShown[0] > 0);
  }
  // "Low" is a third of the starting Voice (10 of 30).
  lowVoice() {
    return Math.max(2, Math.floor(this.state.rules.voice / 3));
  }

  // Voice meter: animate to a new value (ghost bar trails behind).
  setVoice(side, v, { heal = false } = {}) {
    const R = this.state.rules;
    const box = this.el(`[data-voice="${side}"]`);
    if (!box) return;
    const prev = this.voiceShown[side];
    if (v === prev) return;
    this.voiceShown[side] = v;
    const pct = Math.max(0, (100 * v) / R.voice) + '%';
    box.querySelector('.voice__fill').style.width = pct;
    setTimeout(() => box.querySelector('.voice__ghost') && (box.querySelector('.voice__ghost').style.width = pct), heal ? 0 : 450);
    box.querySelector('.voice__n').textContent = Math.max(0, v);
    box.classList.toggle('low', v <= this.lowVoice());
    box.classList.remove('hit', 'heal');
    void box.offsetWidth;
    box.classList.add(heal ? 'heal' : 'hit');
    const d = v - prev;
    if (d) this.float(box, (d > 0 ? '+' : '') + d, heal ? 'fl-heal' : d <= -5 ? 'fl-voice big' : 'fl-voice');
    const bar = box.querySelector('.voice__bar');
    const [x, y] = this.juice.at(bar, Math.max(0.04, Math.min(0.96, v / R.voice)), 0.5);
    if (heal) this.juice.motes(x, y, 'heal', 14);
    else if (d < 0) {
      this.juice.sparks(x, y, 'gold', 10 + Math.min(30, -d * 4), 0.6 + Math.min(0.8, -d / 8));
      if (d <= -5) this.juice.punch(this.el('[data-field]'), Math.min(2, -d / 5));
    }
    this.danger();
  }

  renderOppHand() {
    const p = this.state.p[1];
    const box = this.el('[data-ohand]');
    const known = this.intel || [];
    box.innerHTML =
      p.hand.map((id) => (known.includes(id) || this.spec.openHands ? renderCard(CARDS[id], { width: 30, flat: true }).outerHTML : renderCard(null, { back: true, width: 30 }).outerHTML)).join('') +
      `<span class="rk-reserve">${p.reserve.length} in reserve<br>${p.fallen.length} fallen</span>`;
    this.fitQuit();
  }
  // keep the forfeit flag under the opponent's bar; just the ⚑ when their hand reaches it
  fitQuit() {
    const q = this.el('.quit-btn'), strip = this.el('[data-strip="1"]');
    if (!q || !strip || q.classList.contains('armed')) return;
    q.style.top = strip.offsetTop + strip.offsetHeight + 6 + 'px';
    q.classList.remove('compact');
    const right = Math.max(0, ...[...this.el('[data-ohand]').children].map((e) => e.getBoundingClientRect().right));
    if (right > q.getBoundingClientRect().left - 6) q.classList.add('compact');
  }

  // ---------------------------------------------------------------- board
  laneEl(side, lane) {
    return this.root.querySelector(`.lane[data-side="${side}"][data-lane="${lane}"]`);
  }

  unitDef(u) {
    const c = CARDS[u.id];
    return { ...c, stats: { strike: u.stats.strike + u.buff.strike, guard: u.stats.guard + u.buff.guard, scheme: u.stats.scheme + u.buff.scheme } };
  }

  renderBoard({ fresh = [] } = {}) {
    for (const side of [0, 1]) {
      const row = this.el(`[data-row="${side}"]`);
      row.innerHTML = '';
      for (let l = 0; l < LANES; l++) {
        const u = this.state.p[side].lanes[l];
        const lane = document.createElement('div');
        lane.className = 'lane' + (this.state.terrain?.[l] && this.state.terrain[l] !== 'field' ? ' g-' + this.state.terrain[l] : '');
        lane.dataset.side = side;
        lane.dataset.lane = l;
        if (!u) {
          lane.innerHTML = `<div class="lane__slot"><div class="lane__empty"></div></div>`;
        } else {
          const def = this.unitDef(u);
          const card = renderCard(def, { width: this.cw, flat: true, ...(side === 0 && !this.spec.replay ? lookFor(u.id) : {}) });
          if (u.tags.silenced) card.classList.add('is-silenced');
          const buffed = ORDERS.filter((o) => u.buff[o] !== 0);
          lane.innerHTML = `<div class="lane__slot"></div>
            <div class="lane__hp"><i class="hp__ghost" style="width:${(100 * Math.max(0, u.hp)) / u.maxHp}%"></i><i class="hp__fill" style="width:${(100 * Math.max(0, u.hp)) / u.maxHp}%"></i><span>${Math.max(0, u.hp)}<small>/${u.maxHp}</small></span></div>
            <div class="lane__ward ${u.ward > 0 ? 'on' : ''}">${icon('i-guard')}<b>${u.ward}</b></div>
            ${u.tags.silenced ? `<div class="lane__mute" title="Silenced">✕</div>` : ''}
            ${u.tags.forbid?.length ? `<div class="lane__forbid">${u.tags.forbid.map((o) => `no ${LABEL[o]}`).join(' · ')}</div>` : ''}
            ${buffed.length ? `<div class="lane__buffs">${buffed.map((o) => `<span class="${u.buff[o] > 0 ? 'up' : 'down'}">${u.buff[o] > 0 ? '+' : ''}${u.buff[o]} ${SHORT[o]}</span>`).join('')}</div>` : ''}
            <div class="lane__badge"></div>
            ${this.state.rules.ults > 0 && this.state.p[side].ults > 0 && ultCharged(this.state, u) ? `<div class="lane__charged" title="Ultimate ready">⚡</div>` : ''}
            ${side === 1 && this.habits[u.uid]?.length ? `<div class="lane__habit" title="What this Champion has done">${this.habits[u.uid].slice(-4).map((o) => `<i class="o-${o}">${icon('i-' + o)}</i>`).join('')}</div>` : ''}`;
          lane.querySelector('.lane__slot').appendChild(card);
          if (fresh.includes(u.uid)) {
            card.classList.add('arriving');
            lane.classList.add('arriving');
          }
          pressable(card, () => this.onUnitTap(side, l), () => this.inspect(CARDS[u.id]));
        }
        row.appendChild(lane);
      }
    }
    this.drawBonds();
  }

  // Bond threads: a glowing arc from a Champion to the ally it is powering,
  // with the Power it gives. Arcs over the art; above for left-to-right bonds,
  // below for right-to-left, so two-way bonds read as a pair.
  drawBonds() {
    const field = this.el('[data-field]');
    field.querySelector('.bonds')?.remove();
    // one thread per pair; a two-way bond shows both gifts on one label
    const all = [];
    for (const side of [0, 1])
      for (const b of bondsFor(this.state, CARDS, side)) {
        const [lo, hi] = b.from < b.to ? [b.from, b.to] : [b.to, b.from];
        let t = all.find((x) => x.side === side && x.lo === lo && x.hi === hi);
        if (!t) all.push((t = { side, lo, hi, right: 0, left: 0 }));
        if (b.from === lo) t.right = b.n; // lo gives to hi
        else t.left = b.n;
      }
    if (!all.length) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'bonds');
    field.appendChild(svg);
    requestAnimationFrame(() => {
      const box = field.getBoundingClientRect();
      svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
      let html = '';
      for (const b of all) {
        const A = this.laneEl(b.side, b.lo)?.querySelector('.card'), B = this.laneEl(b.side, b.hi)?.querySelector('.card');
        if (!A || !B) continue;
        const ra = A.getBoundingClientRect(), rb = B.getBoundingClientRect();
        const x1 = ra.left - box.left + ra.width / 2, x2 = rb.left - box.left + rb.width / 2;
        const y1 = ra.top - box.top + ra.height * 0.34, y2 = rb.top - box.top + rb.height * 0.34;
        const bend = -Math.min(34, Math.abs(x2 - x1) * 0.2); // a far bond arcs higher, over the middle card
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 + bend;
        const d = `M${x1},${y1} Q${mx},${my + bend} ${x2},${y2}`;
        const label = b.right && b.left ? (b.right === b.left ? `‹ +${b.right} ›` : `+${b.left} ‹ › +${b.right}`) : b.right ? `+${b.right} ›` : `‹ +${b.left}`;
        const w = 12 + label.length * 5.6;
        html += `<g class="bond ${b.side ? 'bond--opp' : 'bond--me'}">
          <path class="bond__glow" d="${d}"/><path class="bond__line" d="${d}"/>
          ${b.left ? `<circle class="bond__end" cx="${x1}" cy="${y1}" r="3.5"/>` : ''}${b.right ? `<circle class="bond__end" cx="${x2}" cy="${y2}" r="3.5"/>` : ''}
          <g transform="translate(${mx},${my})"><rect x="${-w / 2}" y="-9" width="${w}" height="18" rx="9"/><text y="4">${label}</text></g></g>`;
      }
      svg.innerHTML = html;
    });
  }

  hint(text) {
    // in training the coach does the talking
    this.el('[data-hint]').textContent = this.spec.coach ? '' : text || '';
  }

  // ------------------------------------------------------------- coach
  // Training only: a friendly coach with a speech bubble, a finger that
  // points at the exact thing to tap, a gentle "are you sure?" before a
  // losing move, and cheers after each round. Driven by spec.coach from
  // screens/tutorial.js: { who, intro[], deploy(st, c), command(st, c),
  // check(st, cmd) }, each returning { say, point } (point = CSS selector).
  coachFmt(t) {
    const O = { strike: 'STRIKE', guard: 'GUARD', scheme: 'SCHEME' };
    return esc(t)
      .replace(/\[(strike|guard|scheme)\]/g, (_, o) => `<span class="cw o-${o}">${icon('i-' + o)}${O[o]}</span>`)
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  }
  coachEls() {
    if (this._coach?.isConnected) return this._coach;
    const who = this.spec.coach.who || 'tamsin';
    const face = CARDS[who] && !artFor(CARDS[who]).placeholder ? artFor(CARDS[who]).flat : null;
    const c = document.createElement('div');
    c.className = 'coach';
    c.innerHTML = `${face ? `<img class="coach__face" src="${face}" alt="">` : ''}<div class="coach__b"><div class="coach__t" data-t></div>${this.spec.coach.triangle ? `<div class="coach__tri"><span class="o-strike">${icon('i-strike')}</span>beats<span class="o-scheme">${icon('i-scheme')}</span><i></i><span class="o-scheme">${icon('i-scheme')}</span>beats<span class="o-guard">${icon('i-guard')}</span><i></i><span class="o-guard">${icon('i-guard')}</span>beats<span class="o-strike">${icon('i-strike')}</span></div>` : ''}</div>`;
    this.el('.rk').appendChild(c);
    const f = document.createElement('div');
    f.className = 'coach-finger';
    f.innerHTML = '<svg viewBox="0 0 48 60" aria-hidden="true"><path d="M20 4c3 0 5 2 5 5v17l3-1c3-1 6 1 6 4l1-1c3-1 6 1 6 4v1c2-1 5 1 5 4v10c0 7-6 13-13 13h-6c-5 0-9-3-11-7L6 38c-1-3 0-5 2-6 2-1 5 0 6 2l1 2V9c0-3 2-5 5-5z" fill="#fff4dc" stroke="#1b1307" stroke-width="2.5" stroke-linejoin="round"/></svg>';
    this.el('.rk').appendChild(f);
    this._coach = c;
    this._finger = f;
    return c;
  }
  coachSay(say, point, { tap = false, mood = '' } = {}) {
    if (!this.spec.coach) return;
    const c = this.coachEls();
    if (!say) {
      c.classList.remove('on');
      this._finger.classList.remove('on');
      return;
    }
    const html = this.coachFmt(say) + (tap ? '<span class="coach__tap">Tap to continue ▸</span>' : '');
    const t = c.querySelector('[data-t]');
    if (t.innerHTML !== html) {
      t.innerHTML = html;
      c.classList.remove('pop');
      void c.offsetWidth;
      c.classList.add('pop');
    }
    c.classList.add('on');
    c.classList.toggle('warn', mood === 'warn');
    c.classList.toggle('cheer', mood === 'cheer');
    this.coachPoint(point);
  }
  coachPoint(sel) {
    window.__coachPoint = sel || null; // for tools/ checks: what the finger is on
    const f = this._finger;
    const target = sel ? this.root.querySelector(sel) : null;
    if (!target || !f) return f?.classList.remove('on');
    const host = this.el('.rk').getBoundingClientRect();
    const r = target.getBoundingClientRect();
    const below = r.bottom + 64 < host.bottom; // point up from below, else down from above
    f.style.left = r.left - host.left + r.width / 2 - 20 + 'px';
    f.style.top = (below ? r.bottom - host.top - 8 : r.top - host.top - 56) + 'px';
    f.classList.toggle('down', !below);
    f.classList.add('on');
  }
  coachUpdate(phase, c) {
    const f = this.spec.coach?.[phase];
    if (!f) return;
    const r = f(this.state, c) || {};
    this.coachSay(r.say, r.point);
  }
  // Before a losing move, the coach asks once per round. Returns true to hold the Lock.
  coachCheck(cmd) {
    const f = this.spec.coach?.check;
    if (!f || this.coachWarned === this.state.round) return false;
    const w = f(this.state, cmd);
    if (!w) return false;
    this.coachWarned = this.state.round;
    this.coachSay(w.say, w.point, { mood: 'warn' });
    sfx.error();
    haptic.tick();
    return true;
  }
  coachIntro(steps) {
    return steps.reduce(
      (p, step) =>
        p.then(
          () =>
            new Promise((res) => {
              if (this.dead) return res();
              this.coachSay(step.say, step.point, { tap: true });
              const rk = this.el('.rk');
              const go = () => (rk.removeEventListener('click', go), sfx.tap(), res());
              setTimeout(() => rk.addEventListener('click', go), 350);
            }),
        ),
      Promise.resolve(),
    ).then(() => this.coachSay(null));
  }
  // After each round: say what just happened, in plain words.
  async coachPraise(before) {
    if (!this.spec.coach || this.dead || this.state.phase === 'over') return;
    const them = before[1] - this.state.p[1].voice;
    const me = before[0] - this.state.p[0].voice;
    const pick = (a) => a[(Math.random() * a.length) | 0];
    let say, mood = 'cheer';
    if (them > 0 && me <= 0) say = pick([`BOOM! Their life bar dropped by **${them}**!`, `Great move! That's **${them}** off their life bar!`, `Yes! **-${them}** for them. You're a natural!`]);
    else if (them > 0) say = `A trade! They lost **${them}**, we lost **${me}**.`;
    else if (me > 0) (say = `Ouch, we lost **${me}**. Look at their move, and pick the one that beats it!`), (mood = 'warn');
    else say = pick(['Nobody got hurt that time. Keep going!', 'Blocked! Nobody lost any life.']);
    this.coachSay(say, null, { mood });
    await this.wait(1900);
    this.coachSay(null);
  }
  mid(text) {
    this.el('[data-mid]').textContent = text;
  }

  inspect(card) {
    const m = this.ctx.modal(`<div></div><div class="lore card-bio">${esc(card.bio || '')}</div>`);
    const c = renderCard(card, { size: 'full', width: Math.min(300, window.innerWidth - 50), tilt: true });
    m.el.querySelector('div').replaceWith(c);
  }

  // What you know about this opponent: their habit once you've met them, and
  // how honest their leans have been.
  scouting() {
    const p = this.spec.persona;
    if (!p?.habit) return '';
    const r = store.get().rivals[p.id];
    const met = r && r.w + r.l > 0;
    const tells = r?.tells?.total >= 4 ? ` · leans honest ${Math.round((100 * r.tells.honest) / r.tells.total)}%` : '';
    return `<div class="vs__scout"><b>Scouting</b> ${met ? esc(p.habit.text) : 'Habit unknown. Watch closely.'}${tells}</div>`;
  }

  // Before the first round: who you are facing, and what they have to say.
  versus() {
    const p = this.spec.persona || {};
    const fac = p.faction || majorityFaction(this.spec.theirs);
    const line = this.spec.introLine || p.lines?.intro;
    const v = document.createElement('div');
    v.className = `vs vs--${fac || 'none'}`;
    // a portrait: the persona's avatar, or the painting of the Champion they are
    const face = avatarArt(p.id) || (CARDS[p.id] && !artFor(CARDS[p.id]).placeholder ? artFor(CARDS[p.id]).flat : null);
    const crest = factionArt(fac, 's');
    const me = avatarArt('player', 'xs');
    v.innerHTML = `${crest ? `<img class="vs__crest" src="${crest}" alt="">` : ''}${face ? `<img class="vs__face" src="${face}" alt="">` : ''}<div class="vs__band"><div class="kicker">${esc(this.spec.sub || p.title || '')}</div>
      <div class="vs__name">${esc(this.spec.title || p.name || 'Opponent')}</div>
      ${line ? `<div class="vs__line">“${esc(line)}”</div>` : ''}${this.scouting()}</div><div class="vs__me">${me ? `<img src="${me}" alt="">` : ''}vs ${esc(this.who(0).name)}</div>`;
    this.el('.rk').appendChild(v);
    sfx.banner();
    return new Promise((res) => {
      let done = false;
      const end = () => {
        if (done) return;
        done = true;
        v.classList.add('out');
        setTimeout(() => (v.remove(), res()), 350);
      };
      v.onclick = end;
      setTimeout(end, line ? 2600 : 1400);
    });
  }

  showSheet() {
    const st = this.state;
    const status = (side, id) => {
      const p = st.p[side];
      if (p.fallen.includes(id)) return 'FALLEN';
      if (p.lanes.some((u) => u && u.id === id)) return 'IN PLAY';
      if (side === 0) return p.hand.includes(id) ? 'IN HAND' : 'RESERVE';
      if ((this.intel || []).includes(id)) return 'IN HAND';
      return '';
    };
    const grid = (side) =>
      st.p[side].octave
        .map((id) => {
          const s = status(side, id);
          return `<div style="position:relative" data-inspect="${id}" class="${s === 'FALLEN' ? 'spentcell' : ''}">${renderCard(CARDS[id], { width: 82, flat: true }).outerHTML}${s ? `<span class="badge-sm">${s}</span>` : ''}</div>`;
        })
        .join('');
    const m = this.ctx.modal(`
      <div class="sheet-label">${esc(this.who(1).name)} · Octave</div><div class="sheet-grid">${grid(1)}</div>
      <div class="sheet-label">Your Octave</div><div class="sheet-grid">${grid(0)}</div>
      ${this.canForfeit() ? `<button class="btn btn--ghost forfeit-btn" data-forfeit>Forfeit match</button>` : ''}`);
    m.el.querySelectorAll('.spentcell .card').forEach((c) => c.classList.add('is-spent'));
    // forfeit: a second tap confirms (it counts as a loss)
    const fb = m.el.querySelector('[data-forfeit]');
    if (fb)
      fb.onclick = () => {
        if (!fb.dataset.armed) {
          fb.dataset.armed = '1';
          fb.classList.add('armed');
          fb.textContent = this.remote ? 'Tap again to forfeit · counts as a loss' : 'Tap again to forfeit · counts as a loss';
          return;
        }
        m.close();
        this.forfeitMatch();
      };
    m.el.querySelectorAll('[data-inspect]').forEach((d) => (d.onclick = () => this.inspect(CARDS[d.dataset.inspect])));
  }

  canForfeit() {
    return !this.spec.replay && this.state.phase !== 'over' && !this.forfeited; // any match: life happens
  }
  // Give up: the match ends as a loss. Online, the server records it (the
  // opponent wins); against the AI it ends here and is scored as a defeat.
  async forfeitMatch() {
    if (!this.canForfeit()) return;
    this.forfeited = true;
    this.el('.quit-btn')?.remove();
    this.cmdUI = null;
    this.root.querySelectorAll('.lane__pick, .lane__readpick').forEach((x) => x.remove());
    this.el('[data-dock]').innerHTML = `<div class="waiting">Forfeiting<i></i><i></i><i></i></div>`;
    this.hideClock?.();
    if (this.remote) return this.remote.resign(); // the server's end result finishes the match
    this.state.phase = 'over';
    this.state.winner = 1;
    this.finish();
  }

  // ---------------------------------------------------------------- flow
  async run() {
    this.t0 = Date.now();
    if (!this.spec.replay) battleOn({ mode: this.spec.mode, opp: this.spec.persona?.id || null, at: new Date().toISOString() });
    this.peeks = 0;
    music.play(this.scoreTrack());
    music.preload('victory', 'defeat', 'final');
    await sleep(250);
    if (!this.spec.replay && this.state.round === 1) await this.versus();
    if (this.spec.coach?.intro && !this.spec.replay) await this.coachIntro(this.spec.coach.intro);
    while (!this.dead && this.state.phase !== 'over') {
      const R = this.state.rules;
      const n = this.state.round;
      this.mid(`Round ${n}`);
      sfx.banner();
      const d = deploysAllowed(this.state);
      this.scoreForTension();
      await this.juice.banner(n >= R.rounds ? 'Final Round' : `Round ${n}`, n >= R.rounds ? 'Highest Voice wins' : `Deploy ${d} Champion${d > 1 ? 's' : ''}`);
      if (this.dead) break;
      if (this.state.phase === 'deploy') await this.deployPhase();
      if (this.dead || this.state.phase === 'over') break;
      await this.commandPhase();
    }
    if (!this.dead) await this.finale();
    if (!this.dead) this.finish();
  }

  // Online: your pick, raced against the server moving on without you (the
  // shot clock). Returns the server's result for this step.
  async raceRemote(pickP, kind, send) {
    const resultP = this.remote.next(kind);
    this.showClock();
    const first = await Promise.race([pickP ? pickP.then((v) => ({ mine: v })) : new Promise(() => {}), resultP.then((r) => ({ r }))]);
    if ('mine' in first) {
      await send(first.mine);
      const r = await resultP;
      this.hideClock();
      return r;
    }
    // the clock ran out (the server played for you), or the match ended
    this.cmdUI = null;
    this.root.querySelectorAll('.lane__pick, .lane__readpick').forEach((x) => x.remove());
    this.el('[data-dock]').innerHTML = '';
    if (first.r.kind !== 'end') this.ctx.toast('Time ran out: your move was played for you');
    this.hideClock();
    return first.r;
  }
  // jump to the server's latest view (after a forfeit, or steps missed while away)
  remoteResync() {
    this.state = cloneState(this.remote.view.state);
    this.voiceShown = [this.state.p[0].voice, this.state.p[1].voice];
    this.syncAll();
  }
  // the shot clock, from the server's deadline
  showClock() {
    this.hideClock();
    const el = document.createElement('div');
    el.className = 'pvp-clock';
    this.el('.rk').appendChild(el);
    const tick = () => {
      const v = this.remote?.view;
      const d = v?.deadline;
      const left = d ? Math.max(0, Math.ceil((d - Date.now()) / 1000)) : 0;
      el.textContent = left ? left + 's' : '';
      el.classList.toggle('low', left > 0 && left <= 8);
      // their connection dropped: they forfeit after 60 s away (server: dropCheck)
      const away = v?.oppSeen && !v.over ? v.now - v.oppSeen + (Date.now() - (this.remote.viewAt || Date.now())) : 0;
      let warn = this.el('.pvp-away');
      if (away > 15000) {
        if (!warn) (warn = document.createElement('div')), (warn.className = 'pvp-away'), this.el('.rk').appendChild(warn);
        warn.textContent = `${this.who(1).name} lost connection · they forfeit in ${Math.max(0, Math.ceil((60000 - away) / 1000))}s`;
      } else warn?.remove();
    };
    tick();
    this.clockTimer = setInterval(tick, 500);
  }
  hideClock() {
    clearInterval(this.clockTimer);
    this.el('.pvp-away')?.remove();
    this.el('.pvp-clock')?.remove();
  }

  replayEntry() {
    return this.spec.replay.rounds[this.state.round - 1];
  }

  oppDeploy(opts = {}) {
    if (this.spec.replay) return sleep(300).then(() => this.replayEntry().deploy[1]);
    const scripted = this.spec.script?.deploy?.(this.state);
    if (scripted) return Promise.resolve(scripted);
    return ai('deploy', { matchId: this.matchId, persona: this.spec.persona, seed: this.seed, view: publicView(this.state, 1), side: 1, opts });
  }

  // ---- tells -------------------------------------------------------------
  leansOn() {
    return !this.spec.replay && this.spec.mode !== 'tutorial' && !this.spec.noLeans;
  }
  // The lean each of their Champions shows: its real Order, or (a bluff) the
  // Order that beats it, so answering a bluff walks into it. Margin
  // Champions are practised liars.
  showLeans(cmd) {
    const LOSES_TO = { strike: 'guard', guard: 'scheme', scheme: 'strike' };
    const base = this.spec.persona?.honesty ?? 0.7;
    this.leans = cmd.orders.map((o, l) => {
      const u = this.state.p[1].lanes[l];
      if (!o || !u) return null;
      const h = base - (CARDS[u.id].faction === 'margin' ? 0.15 : 0);
      return Math.random() < h ? o : LOSES_TO[o];
    });
    this.leans.forEach((o, l) => {
      const le = this.laneEl(1, l);
      if (!o || !le) return;
      le.querySelector('.lane__lean')?.remove();
      le.insertAdjacentHTML('beforeend', `<div class="lane__lean o-${o}" title="Leaning ${LABEL[o]}… maybe">${icon('i-' + o)}<b>?</b></div>`);
    });
    if (!this.spec.coach && this.state.round === 1) this.hint('The ? above their heroes is a lean: usually honest, sometimes a bluff');
  }
  // At the reveal: stamp the bluffs, and remember how honest this opponent is.
  judgeLeans(actual) {
    if (!this.leans) return;
    let honest = 0, total = 0;
    this.leans.forEach((o, l) => {
      if (!o || !actual[l]) return;
      total++;
      const lie = o !== actual[l];
      if (!lie) honest++;
      const el = this.laneEl(1, l)?.querySelector('.lane__lean');
      if (el) el.classList.add(lie ? 'bluff' : 'honest'), (el.innerHTML = lie ? 'BLUFF' : '✓');
    });
    const id = this.spec.persona?.id;
    if (total && id && store.PERSONAS.some((p) => p.id === id))
      store.update((s) => {
        const r = (s.rivals[id] ||= { w: 0, l: 0, reads: 0, finals: 0, streak: 0, best: 0, deciders: 0, last: 0 });
        r.tells = { honest: (r.tells?.honest || 0) + honest, total: (r.tells?.total || 0) + total };
      });
    this.leans = null;
  }

  // Their first-placed Champions land face-up in their lanes before you answer.
  async showFaceUp(list) {
    for (const d of list) {
      const le = this.laneEl(1, d.lane);
      const slot = le?.querySelector('.lane__slot');
      if (!slot) continue;
      const c = renderCard(CARDS[d.card], { width: this.cw, flat: true });
      c.classList.add('faceup');
      slot.replaceChildren(c);
      pressable(c, null, () => this.inspect(CARDS[d.card]));
      await this.slamIn(c, 1);
      await sleep(100);
    }
    if (list.length && !this.spec.coach) this.hint('They placed first. Answer them!');
  }
  async oppCommand() {
    if (this.spec.replay) return this.replayEntry().command[1];
    const base = await ai('command', { matchId: this.matchId, persona: this.spec.persona, seed: this.seed, view: publicView(this.state, 1), side: 1 });
    const scripted = this.spec.script?.command?.(this.state, base);
    const cmd = scripted || base;
    return isLegalCommand(this.state, 1, cmd) ? cmd : base;
  }

  // ------------------------------------------------------------- deploy
  async deployPhase() {
    // Counter-deploy: the side without Initiative places first, face-up.
    const order = deployOrder(this.state);
    const aiFirst = !!order && order[0] === 1;
    const youFirst = !!order && order[0] === 0;
    this.hint(this.spec.hints?.deploy?.(this.state) ?? '');
    this.renderOppHand();
    let mine, theirs, rr = null, shownFirst = aiFirst;
    if (this.remote) {
      // online: they may place first (face-up); then you, unless the clock plays for you
      let first = [];
      if (aiFirst) {
        this.el('[data-dock]').innerHTML = `<div class="waiting">They place first<i></i><i></i><i></i></div>`;
        first = await this.remote.firstPlaced();
        if (this.dead) return;
        if (first) await this.showFaceUp(first);
        shownFirst = !!first;
      }
      rr = await this.raceRemote(first ? this.pickDeploys(aiFirst ? { answer: true } : youFirst ? { first: true } : {}) : null, 'deploy', async (list) => {
        this.el('[data-dock]').innerHTML = `<div class="waiting">${youFirst ? 'They answer your placement' : 'Opponent deploying'}<i></i><i></i><i></i></div>`;
        const err = await this.remote.deploy(list);
        if (err) this.ctx.toast(err);
      });
      if (this.dead) return;
      if (rr.kind === 'end' || !rr.lists) return this.remoteResync();
      [mine, theirs] = rr.lists;
    } else if (aiFirst) {
      this.el('[data-ohand]').classList.add('thinking');
      this.el('[data-dock]').innerHTML = `<div class="waiting">They place first<i></i><i></i><i></i></div>`;
      theirs = (await this.oppDeploy({ first: true })) || [];
      this.el('[data-ohand]').classList.remove('thinking');
      if (this.dead) return;
      await this.showFaceUp(theirs);
      mine = await this.pickDeploys({ answer: true });
    } else if (youFirst) {
      mine = await this.pickDeploys({ first: true });
      if (this.dead) return;
      this.el('[data-dock]').innerHTML = `<div class="waiting">They answer your placement<i></i><i></i><i></i></div>`;
      this.el('[data-ohand]').classList.add('thinking');
      theirs = (await this.oppDeploy({ known: mine })) || [];
      this.el('[data-ohand]').classList.remove('thinking');
    } else {
      const oppP = this.oppDeploy();
      this.el('[data-ohand]').classList.add('thinking');
      mine = await this.pickDeploys();
      if (this.dead) return;
      this.el('[data-dock]').innerHTML = `<div class="waiting">Opponent deploying<i></i><i></i><i></i></div>`;
      theirs = await oppP;
      this.el('[data-ohand]').classList.remove('thinking');
    }
    if (this.dead) return;
    this.hint('');
    const lists = [mine, theirs || []];
    // the board the moment both sides reveal, before any On-Reveal effect
    const snap = cloneState(this.state);
    deploy(snap, lists, CARDS, { hypothetical: true, noTriggers: true });
    const before = new Set([0, 1].flatMap((s) => this.state.p[s].lanes.filter(Boolean).map((u) => u.uid)));
    let events;
    if (rr) {
      // online: the server resolved it; our view of the board after is its view
      this.state = cloneState(rr.state || this.remote.view.state);
      events = rr.events || [];
    } else {
      deploy(this.state, lists, CARDS);
      events = this.state.events.slice();
    }
    const fresh = [0, 1].flatMap((s) => snap.p[s].lanes.filter((u) => u && !before.has(u.uid)).map((u) => u.uid));
    const real = this.state;
    this.state = snap;
    this.renderBoard({ fresh });
    this.state = real;
    // yours were already placed face-down: they flip up together; theirs crash in one by one
    const mineIn = [...this.el('[data-row="0"]').querySelectorAll('.card.arriving')];
    const theirsIn = [...this.el('[data-row="1"]').querySelectorAll('.card.arriving')];
    if (mineIn.length) {
      sfx.reveal();
      mineIn.forEach((c) => this.flipUp(c));
      await sleep(360);
    }
    for (const c of theirsIn) {
      // already shown face-up when they placed first
      if (shownFirst) this.flipUp(c);
      else {
        await this.slamIn(c, 1);
        await sleep(120);
      }
    }
    this.root.querySelectorAll('.arriving').forEach((x) => x.classList.remove('arriving'));
    await sleep(fresh.length ? 380 : 200);
    this.resolving = true;
    await this.play(events.filter((e) => e.t !== 'deploy'));
    this.resolving = false;
    this.speed = this.baseSpeed;
    this.syncAll();
  }

  pickDeploys(turn = {}) {
    if (this.spec.replay) {
      this.el('[data-dock]').innerHTML = `<div class="waiting" style="color:var(--gold)">Replay</div>`;
      return sleep(500).then(() => this.replayEntry().deploy[0]);
    }
    return new Promise((resolve) => {
      const P = this.state.p[0];
      const max = deploysAllowed(this.state, 0);
      const placed = []; // { card, lane }
      let sel = null;
      const dock = this.el('[data-dock]');
      const draw = () => {
        const inHand = P.hand.slice();
        for (const d of placed) inHand.splice(inHand.indexOf(d.card), 1);
        const open = (l) => !P.lanes[l] && !placed.some((d) => d.lane === l);
        const place = (l) => {
          placed.push({ card: sel.id, lane: l });
          sel = null;
          haptic.slam();
          draw();
          const c = this.laneEl(0, l).querySelector('.card.pending');
          if (c) this.slamIn(c, 0, { soft: true });
        };
        const canPlace = placed.length < max && [0, 1, 2].some((l) => !P.lanes[l] && !placed.some((d) => d.lane === l));
        dock.innerHTML = `
          <div class="rk-hand" data-hand></div>
          <div class="rk-actions">
            <div class="rk-tip">${turn.first ? '<b class="gold">You place first, face-up</b> · ' : turn.answer ? '<b class="gold">Answer their placement</b> · ' : ''}${!inHand.length ? 'No Champions in hand' : sel ? 'Tap a glowing lane' : canPlace ? `${max - placed.length} to place` : 'Ready'}</div>
            <button class="btn lockbtn" data-go>${placed.length ? `Deploy${placed.length > 1 ? ' both' : ''}` : 'Hold'}</button>
          </div>`;
        const hand = dock.querySelector('[data-hand]');
        inHand.forEach((id, i) => {
          const el = renderCard(CARDS[id], { width: 70, flat: true, ...lookFor(id) });
          el.dataset.card = id;
          if (sel && sel.i === i) el.classList.add('is-selected');
          if (!canPlace) el.classList.add('is-disabled');
          if (this.freshDraw?.includes(id)) el.classList.add('draw-in');
          this.dragCard(el, {
            tap: () => {
              if (!canPlace) return;
              sel = sel && sel.i === i ? null : { i, id };
              sfx.select();
              haptic.tick();
              draw();
            },
            long: () => this.inspect(CARDS[id]),
            // drag straight onto a lane
            start: () => {
              if (!canPlace) return false;
              sel = { i, id };
              for (let l = 0; l < LANES; l++) this.laneEl(0, l).classList.toggle('target', open(l));
              sfx.select();
              return true;
            },
            over: (l) => {
              for (let k = 0; k < LANES; k++) this.laneEl(0, k).classList.toggle('hover', k === l && open(k));
            },
            drop: (l) => {
              if (l != null && open(l)) place(l);
              else {
                sel = null;
                draw();
              }
            },
          });
          hand.appendChild(el);
        });
        this.freshDraw = null;
        // lanes: glow where a selected card can go; show placed (pending) cards
        for (let l = 0; l < LANES; l++) {
          const le = this.laneEl(0, l);
          le.classList.toggle('target', !!sel && !P.lanes[l] && !placed.some((d) => d.lane === l));
          const pend = placed.find((d) => d.lane === l);
          const slot = le.querySelector('.lane__slot');
          if (!P.lanes[l]) {
            slot.innerHTML = '';
            if (pend) {
              const c = renderCard(CARDS[pend.card], { width: this.cw, flat: true, ...lookFor(pend.card) });
              c.classList.add('pending');
              slot.appendChild(c);
            } else slot.innerHTML = '<div class="lane__empty"></div>';
          }
          le.onclick = () => {
            if (P.lanes[l]) return;
            const k = placed.findIndex((d) => d.lane === l);
            if (k >= 0 && !sel) {
              placed.splice(k, 1); // take it back
              sfx.select();
              return draw();
            }
            if (!sel || k >= 0) return;
            place(l);
          };
          le.classList.remove('hover');
        }
        dock.querySelector('[data-go]').onclick = () => {
          for (let l = 0; l < LANES; l++) this.laneEl(0, l).onclick = null;
          this.coachSay(null);
          resolve(placed.slice());
        };
        this.coachUpdate('deploy', { placed: placed.length, max, sel, canPlace, handEmpty: !inHand.length, placedList: placed.slice(), hand: inHand });
      };
      draw();
    });
  }

  // Hand card: tap to select, hold to inspect, or drag it straight onto a lane.
  dragCard(el, h) {
    let st = null, id = null, sx = 0, sy = 0, ghost = null, lane = null, longT = null;
    const laneAt = (x, y) => {
      const hit = document.elementFromPoint(x, y)?.closest?.('.lane[data-side="0"]');
      return hit ? +hit.dataset.lane : null;
    };
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => {
      id = e.pointerId;
      sx = e.clientX;
      sy = e.clientY;
      st = 'down';
      longT = setTimeout(() => {
        if (st !== 'down') return;
        st = 'long';
        h.long?.();
      }, 420);
      try {
        el.setPointerCapture(id);
      } catch {}
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      if (st === 'down' && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) {
        clearTimeout(longT);
        if (h.start?.() === false) return (st = null);
        st = 'drag';
        const r = el.getBoundingClientRect();
        ghost = el.cloneNode(true);
        ghost.classList.remove('is-selected', 'draw-in');
        ghost.classList.add('drag-ghost');
        ghost.style.cssText = `position:fixed;left:0;top:0;width:${r.width}px;--cw:${r.width}px;z-index:60;pointer-events:none;margin:0`;
        document.body.appendChild(ghost);
        el.classList.add('dragging');
      }
      if (st !== 'drag') return;
      const tilt = Math.max(-14, Math.min(14, (e.movementX || 0) * 1.2));
      ghost.style.transform = `translate(${e.clientX - ghost.offsetWidth / 2}px, ${e.clientY - ghost.offsetHeight * 0.65}px) scale(1.2) rotate(${tilt}deg)`;
      const l = laneAt(e.clientX, e.clientY);
      if (l !== lane) {
        lane = l;
        h.over?.(l);
        if (l != null) haptic.tick();
      }
    });
    const end = (e, cancel) => {
      if (e.pointerId !== id) return;
      clearTimeout(longT);
      const was = st;
      st = null;
      id = null;
      if (was === 'drag') {
        ghost?.remove();
        ghost = null;
        el.classList.remove('dragging');
        h.over?.(null);
        const l = lane;
        lane = null;
        h.drop?.(cancel ? null : l);
      } else if (was === 'down' && !cancel) h.tap?.();
    };
    el.addEventListener('pointerup', (e) => end(e, false));
    el.addEventListener('pointercancel', (e) => end(e, true));
  }

  kindOf(side, lane) {
    return CARDS[this.state.p[side].lanes[lane]?.id]?.faction || 'gold';
  }

  // A Champion crashes onto the table: falls in, squashes, dust and a thud.
  async slamIn(c, side, { soft = false } = {}) {
    if (!c) return;
    const le = c.closest('.lane');
    c.classList.remove('arriving');
    const dy = side === 1 ? -this.cw * 1.3 : -this.cw * 0.45;
    const rot = (Math.random() * 2 - 1) * (soft ? 5 : 10);
    const dur = soft ? 280 : 400;
    c.animate(
      [
        { transform: `translateY(${dy}px) scale(${soft ? 1.35 : 1.8}) rotate(${rot}deg)`, opacity: 0, filter: 'brightness(2)' },
        { transform: `translateY(${dy * 0.35}px) scale(${soft ? 1.15 : 1.35}) rotate(${rot * 0.4}deg)`, opacity: 1, offset: 0.5 },
        { transform: 'translateY(0) scale(1.06, 0.92) rotate(0)', filter: 'brightness(1.7)', offset: 0.72 },
        { transform: 'translateY(0) scale(0.98, 1.03)', offset: 0.86 },
        { transform: 'none', filter: 'none' },
      ],
      { duration: dur, easing: 'cubic-bezier(.6,0,.9,.5)' },
    );
    await sleep(dur * 0.7);
    if (this.dead) return;
    le?.classList.remove('arriving');
    const [x, y] = this.juice.at(c, 0.5, 0.95);
    const [cx, cy] = this.juice.at(c);
    const l = le ? +le.dataset.lane : 0;
    this.juice.dust(x, y, soft ? 12 : 26);
    this.juice.ring(x, y, soft ? 'gold' : this.kindOf(side, l), soft ? 70 : 120, { squash: 0.3, size: soft ? 2 : 4 });
    if (!soft) this.juice.sparks(cx, cy, this.kindOf(side, l), 18, 0.7);
    if (soft) sfx.deploy();
    else sfx.slam();
    this.shake(soft ? 1.5 : 5);
    if (!soft) this.juice.punch(this.el('[data-field]'), 0.8);
    haptic.slam();
    await sleep(dur * 0.3);
  }

  flipUp(c) {
    c.classList.remove('arriving');
    c.closest('.lane')?.classList.remove('arriving');
    c.animate(
      [
        { transform: 'perspective(600px) rotateY(85deg) scale(1.1)', filter: 'brightness(2.4)' },
        { transform: 'perspective(600px) rotateY(0) scale(1.08)', filter: 'brightness(1.6)', offset: 0.55 },
        { transform: 'none', filter: 'none' },
      ],
      { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' },
    );
    const [x, y] = this.juice.at(c);
    this.juice.ring(x, y, 'gold', 80, { squash: 1, size: 2 });
    this.juice.motes(x, y, 'gold', 10);
  }

  onUnitTap(side, lane) {
    if (this.cmdUI) this.cmdUI(side, lane);
  }

  // ------------------------------------------------------------- command
  async commandPhase() {
    crumb('round ' + this.state.round + ' command');
    const oppP = this.remote ? null : this.oppCommand();
    // their heroes lean toward a move before you lock (most leans are honest)
    if (!this.remote && this.leansOn()) this.showLeans(await oppP);
    this.hint(this.spec.hints?.command?.(this.state) ?? '');
    const dock = this.el('[data-dock]');
    let mine, theirs, rr = null;
    if (this.remote) {
      rr = await this.raceRemote(this.pickCommand(), 'command', async (cmd) => {
        sfx.lock();
        haptic.lock();
        dock.innerHTML = `<div class="waiting">Locked · waiting for them<i></i><i></i><i></i></div>`;
        const err = await this.remote.command(cmd);
        if (err) this.ctx.toast(err);
      });
      if (this.dead) return;
      if (rr.kind === 'end' || !rr.cmds) return this.remoteResync();
      [mine, theirs] = rr.cmds;
    } else {
      mine = await this.pickCommand();
      if (this.dead) return;
      sfx.lock();
      haptic.lock();
      this.hint('');
      dock.innerHTML = `<div class="waiting">Locked · waiting<i></i><i></i><i></i></div>`;
      theirs = await oppP;
    }
    this.hint('');
    if (this.dead) return;
    await sleep(200);
    sfx.oppLock();
    dock.innerHTML = `<div class="waiting" style="color:var(--gold)">Both locked</div>`;
    const rk = this.el('.rk');
    rk.classList.add('is-hush');
    sfx.anticipation();
    await sleep(420);
    rk.classList.remove('is-hush');
    await this.clash();

    const before = cloneState(this.state);
    const prevHand = this.state.p[0].hand.slice();
    let events;
    if (rr) {
      this.state = cloneState(rr.state || this.remote.view.state);
      events = rr.events || [];
    } else {
      command(this.state, [mine, theirs], CARDS);
      events = this.state.events.slice();
    }
    this.tally(before, events);
    const voicesBefore = [before.p[0].voice, before.p[1].voice];
    this.coachSay(null);
    // the DOM still shows the pre-round board; playback is presentation only
    this.resolving = true;
    await this.play(events);
    this.resolving = false;
    this.speed = this.baseSpeed;
    if (!this.spec.replay && !this.remote) ai('observe', { matchId: this.matchId, before, side: 1, oppCmd: mine });
    // habit tracker: what each of their Champions has done, by Champion
    before.p[1].lanes.forEach((u, l) => u && theirs.orders[l] && (this.habits[u.uid] ||= []).push(theirs.orders[l]));
    this.freshDraw = this.state.p[0].hand.filter((id) => !prevHand.includes(id));
    this.syncAll();
    this.scoreForTension();
    await this.coachPraise(voicesBefore);
    if (!this.spec.coach && !this.spec.replay && this.state.phase !== 'over') this.recap(events);
    await sleep(250);
  }

  // Round recap: one line per lane saying what happened and why, so a round
  // where nothing landed teaches something. Tap to close; it also fades on its own.
  recap(events) {
    this.el('.recap')?.remove();
    const O = { strike: 'Strike', guard: 'Guard', scheme: 'Scheme' };
    const tag = (o) => (o ? `<b class="o-${o}">${O[o]}</b>` : '');
    const lines = [];
    for (const e of events.filter((x) => x.t === 'lane')) {
      const [mine, theirs] = e.units;
      const [me, them] = e.outcome;
      const took = e.voiceDmg[0], dealt = e.voiceDmg[1];
      const hitThem = e.unitDmg[1], hitMe = e.unitDmg[0];
      let txt;
      if (!mine && !theirs) continue;
      if (!mine) txt = took ? `Empty lane: their ${tag(theirs)} hit your Voice for <b class="bad">${took}</b>` : `Empty lane: their ${tag(theirs)} ${theirs === 'guard' ? 'raised a shield' : 'did nothing'}`;
      else if (!theirs) txt = dealt ? `Your ${tag(mine)} went straight to their Voice: <b class="good">${dealt}</b>` : `Your ${tag(mine)} had nobody to hit${mine === 'guard' ? ', so it raised a shield' : ''}`;
      else if (me === 'read') txt = `They READ your ${tag(mine)}: it fizzled`;
      else if (them === 'read') txt = `Your READ was right: their ${tag(theirs)} fizzled${hitThem || dealt ? `, you hit for <b class="good">${hitThem || dealt}</b>` : ''}`;
      else if (me === 'beaten') txt = `Their ${tag(theirs)} beat your ${tag(mine)}${took || hitMe ? `: you took <b class="bad">${took || hitMe}</b>` : ''}`;
      else if (them === 'beaten') txt = `Your ${tag(mine)} beat their ${tag(theirs)}${dealt || hitThem ? `: <b class="good">${dealt || hitThem}</b> damage` : ''}`;
      else txt = `${tag(mine)} vs ${tag(theirs)}: you dealt <b class="good">${dealt + hitThem}</b>, took <b class="bad">${took + hitMe}</b>`;
      lines.push(`<div><span class="recap__lane">${e.lane + 1}</span>${txt}</div>`);
    }
    if (!lines.length) return;
    const box = document.createElement('div');
    box.className = 'recap';
    box.innerHTML = `<div class="kicker">Round ${this.state.round - 1} · what happened</div>${lines.join('')}`;
    box.onclick = () => box.remove();
    this.el('.rk').appendChild(box);
    setTimeout(() => box.isConnected && box.classList.add('recap--out'), this.baseSpeed > 1 ? 4500 : 6500);
    setTimeout(() => box.remove(), this.baseSpeed > 1 ? 5000 : 7000);
  }

  // Card history: what each of your Champions did this round (kills, damage,
  // READs), credited to the Champion standing in that lane.
  tally(before, events) {
    const F = (this.feats ||= {});
    const lanes = [0, 1].map((s) => before.p[s].lanes.map((u) => u?.id || null));
    const f = (id) => (F[id] ||= { kills: 0, dealt: 0, best: 0, reads: 0 });
    for (const e of events) {
      if (e.t === 'move') [lanes[e.side][e.from], lanes[e.side][e.to]] = [lanes[e.side][e.to], lanes[e.side][e.from]];
      else if (e.t === 'hit' && e.side === 1 && lanes[0][e.lane] && (e.from === 'strike' || e.from === 'riposte')) {
        const x = f(lanes[0][e.lane]);
        const n = e.n - (e.warded || 0);
        x.dealt += n;
        x.best = Math.max(x.best, n);
      } else if (e.t === 'fall') {
        if (e.side === 1 && lanes[0][e.lane]) f(lanes[0][e.lane]).kills++;
        lanes[e.side][e.lane] = null;
      } else if (e.t === 'read' && e.side === 0 && e.hit && lanes[0][e.lane]) f(lanes[0][e.lane]).reads++;
    }
  }

  // Both locked: the two sides slam together across the middle line.
  async clash() {
    if (this.dead) return;
    const midEl = this.el('.rk-mid');
    const [x, y] = this.juice.at(midEl);
    sfx.clash();
    haptic.slam();
    this.shake(6);
    this.juice.punch(this.el('[data-field]'), 1.6);
    this.juice.sparks(x - this.juice.w * 0.18, y, 'strike', 26, 1.1);
    this.juice.sparks(x + this.juice.w * 0.18, y, 'guard', 26, 1.1);
    this.juice.ring(x, y, 'gold', this.juice.w * 0.55, { squash: 0.18, size: 5, ttl: 0.6 });
    this.el('[data-row="0"]').animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-14px)', offset: 0.3 }, { transform: 'none' }], { duration: 340, easing: 'cubic-bezier(.2,.8,.2,1)' });
    this.el('[data-row="1"]').animate([{ transform: 'translateY(0)' }, { transform: 'translateY(14px)', offset: 0.3 }, { transform: 'none' }], { duration: 340, easing: 'cubic-bezier(.2,.8,.2,1)' });
    await this.juice.callout('Clash', 'gold', { ms: 800, y: y / this.juice.h });
  }

  syncAll() {
    this.voiceShown = [this.state.p[0].voice, this.state.p[1].voice];
    this.renderStrips();
    this.renderBoard();
    this.renderOppHand();
  }

  // The "what if" panel: one of my Orders against each enemy answer.
  peek(u, l, order, opts) {
    this.el('.peek')?.remove();
    if (!u) return;
    this.peeks++;
    const st = this.state;
    const rows = previewOrder(st, CARDS, 0, l, order, opts);
    const foe = st.p[1].lanes[l];
    const name = (x) => esc(CARDS[x.id].name.split(/[ ,]/)[0]);
    const say = (row) => {
      const { r, hp } = row;
      const bits = [];
      const me = r.out[0], them = r.out[1];
      const koThem = foe && r.unitDmg[1] >= hp[1], koMe = r.unitDmg[0] >= hp[0];
      if (me === 'beaten') bits.push(`<span class="bad">${LABEL[row.their]} beats ${LABEL[order]}</span>`);
      else if (me === 'strike') bits.push(koThem ? `<span class="good">you fell ${name(foe)}</span>` + (r.spill[1] ? ` +${r.spill[1]} spill` : '') : `you hit ${name(foe)} for ${r.unitDmg[1]}`);
      else if (me === 'strikeVoice' || me === 'scheme') bits.push(`<span class="good">${r.voiceDmg[1]} to their Voice</span>`);
      else if (me === 'riposte') bits.push(koThem ? `<span class="good">riposte fells ${name(foe)}</span>` : `riposte ${r.unitDmg[1]}`);
      else if (me === 'mend') bits.push(`mend ${r.mend[0]}`);
      else if (me === 'ward') bits.push(`ward ${r.ward[0]}`);
      else if (me === 'rally') bits.push(`+${r.rally[0]} Voice`);
      if (them === 'strike') bits.push(koMe ? `<span class="bad">you fall</span>` : `you take ${r.unitDmg[0]}`);
      else if (them === 'scheme' || them === 'strikeVoice') bits.push(`<span class="bad">you lose ${r.voiceDmg[0]} Voice</span>`);
      else if (them === 'riposte') bits.push(koMe ? `<span class="bad">riposte fells you</span>` : `<span class="bad">riposte hits you ${r.unitDmg[0]}</span>`);
      else if (them === 'read') bits.push(`<span class="good">they're read</span>`);
      else if (them === 'mend' && r.mend[1]) bits.push(`they mend ${r.mend[1]}`);
      // verdict: Voice swing, then body damage, then falls
      const v = r.voiceDmg[1] - r.voiceDmg[0] + (r.unitDmg[1] - r.unitDmg[0]) * 0.5 + (koThem ? 4 : 0) - (koMe ? 4 : 0);
      const tag = v > 0.5 ? ['win', 'WIN'] : v < -0.5 ? ['lose', 'LOSE'] : ['even', 'EVEN'];
      return `<div class="peek__row ${tag[0]}">
        <span class="peek__vs">${row.their ? `<i class="o-${row.their}">${icon('i-' + row.their)}<b>${row.theirPower}</b></i>` : '<i>—</i>'}</span>
        <span class="peek__say">${bits.join(' · ') || 'nothing happens'}</span>
        <em>${tag[1]}</em></div>`;
    };
    const box = document.createElement('div');
    box.className = 'peek';
    box.innerHTML = `<div class="peek__head"><i class="o-${order}">${icon('i-' + order)}</i> ${esc(CARDS[u.id].name)} ${LABEL[order].toUpperCase()}S at <b>${rows[0]?.power ?? 0}</b></div>
      <div class="peek__sub">${foe ? `If ${esc(CARDS[foe.id].name)} answers with…` : 'No one opposite — it goes straight through'}</div>
      ${rows.map(say).join('')}`;
    this.root.querySelector('.rk').appendChild(box);
  }

  pickCommand() {
    if (this.spec.replay) return sleep(700).then(() => this.replayEntry().command[0]);
    return new Promise((resolve) => {
      const st = this.state;
      const P = st.p[0];
      const R = st.rules;
      const cmd = { orders: P.lanes.map(() => null), focus: null, read: null, ult: null };
      let mode = null; // 'focus' | 'read' | 'ult'
      const canUlt = R.ults > 0 && P.ults > 0 && P.lanes.some((u) => ultCharged(st, u));
      let readLane = null;
      const canFocus = R.focus > 0 && P.focus > 0 && !P.noFocusRound;
      const readLanes = [0, 1, 2].filter((l) => P.lanes[l] && st.p[1].lanes[l]);
      const canRead = R.reads > 0 && P.reads > 0 && !P.noReadRound && readLanes.length > 0;
      // auto-order Champions with nobody opposite? No: every order is a choice.
      const dock = this.el('[data-dock]');
      const drawLanes = () => {
        for (let l = 0; l < LANES; l++) {
          const u = P.lanes[l];
          const le = this.laneEl(0, l);
          le.querySelector('.lane__pick')?.remove();
          le.classList.toggle('focused', cmd.focus === l);
          le.classList.toggle('ulted', cmd.ult === l);
          le.classList.toggle('target', (mode === 'focus' && !!u) || (mode === 'ult' && ultCharged(st, u)));
          if (!u) continue;
          const ok = allowedOrders(st, 0, l);
          const pick = document.createElement('div');
          pick.className = 'lane__pick';
          pick.innerHTML = ORDERS.map((o) => {
            // the real number: stats, abilities, ground, Focus, Last Stand, Ultimate
            const pw = powerFor(st, CARDS, u, l, o, { focus: cmd.focus === l, ult: cmd.ult === l });
            return `<button class="op o-${o} ${cmd.orders[l] === o ? 'sel' : ''}" data-o="${o}" ${ok.includes(o) ? '' : 'disabled'}>${icon('i-' + o)}<b>${pw}</b></button>`;
          }).join('');
          pick.querySelectorAll('[data-o]').forEach((b) => {
            // hold an Order to see how it plays against each enemy answer
            let held = null, peeked = false;
            const up = () => {
              clearTimeout(held);
              if (peeked) setTimeout(() => this.peek(null), 60);
            };
            b.onpointerdown = () => {
              peeked = false;
              held = setTimeout(() => {
                peeked = true;
                haptic.tick();
                this.peek(u, l, b.dataset.o, { focus: cmd.focus === l, ult: cmd.ult === l, read: cmd.read?.lane === l ? cmd.read.order : null });
              }, 380);
            };
            b.onpointerup = b.onpointerleave = b.onpointercancel = up;
            b.oncontextmenu = (e) => e.preventDefault();
            b.onclick = (e) => {
                e.stopPropagation();
                if (peeked) return (peeked = false);
                cmd.orders[l] = b.dataset.o;
                sfx.order(b.dataset.o);
                haptic.tick();
                drawAll();
              };
          });
          le.appendChild(pick);
        }
        for (let l = 0; l < LANES; l++) {
          const le = this.laneEl(1, l);
          le.classList.toggle('target', mode === 'read' && readLanes.includes(l));
          le.classList.toggle('read-on', cmd.read?.lane === l);
          le.querySelector('.lane__readpick')?.remove();
          if (mode === 'read' && readLane === l) {
            const rp = document.createElement('div');
            rp.className = 'lane__readpick';
            rp.innerHTML = `<label>They'll</label>` + ORDERS.map((o) => `<button class="o-${o}" data-r="${o}">${icon('i-' + o)}</button>`).join('');
            rp.querySelectorAll('[data-r]').forEach(
              (b) =>
                (b.onclick = (e) => {
                  e.stopPropagation();
                  cmd.read = { lane: l, order: b.dataset.r };
                  mode = null;
                  readLane = null;
                  sfx.readArm();
                  haptic.tick();
                  drawAll();
                }),
            );
            le.appendChild(rp);
          }
          const badge = le.querySelector('.lane__badge');
          if (badge) {
            badge.className = 'lane__badge' + (cmd.read?.lane === l ? ` guess o-${cmd.read.order} on` : '');
            badge.innerHTML = cmd.read?.lane === l ? icon('i-' + cmd.read.order) : '';
          }
        }
      };
      const ready = () => P.lanes.every((u, l) => !u || cmd.orders[l]);
      const drawDock = () => {
        const n = P.lanes.filter(Boolean).length;
        dock.innerHTML = `
          <div class="rk-tip">${mode === 'ult' ? 'Tap a ⚡ charged Champion: +' + R.ultPower + ', and its Order can’t be beaten or read' : mode === 'focus' ? 'Tap one of your Champions to Focus it (+' + R.focusPower + ')' : mode === 'read' ? 'Tap an enemy facing one of yours, then call its Order' : !n ? 'You have no Champions in play' : ready() ? 'Lock when ready' : 'Give every Champion an Order <span class="rk-tip__hint">· hold one to preview</span>'}</div>
          <div class="toggles">
            <button class="tog tog--focus ${cmd.focus != null || mode === 'focus' ? 'on' : ''}" data-focus ${canFocus && n ? '' : 'disabled'}>${icon('i-focus')}Focus ${P.focus}</button>
            <button class="tog tog--read ${cmd.read || mode === 'read' ? 'on' : ''}" data-read ${canRead ? '' : 'disabled'}>${icon('i-read')}${cmd.read ? LABEL[cmd.read.order] + '?' : 'READ'}</button>
            ${R.ults > 0 ? `<button class="tog tog--ult ${cmd.ult != null || mode === 'ult' ? 'on' : ''}" data-ult ${canUlt ? '' : 'disabled'}>⚡ULT</button>` : ''}
            <button class="btn lockbtn" data-lock ${ready() ? '' : 'disabled'}>Lock</button>
          </div>`;
        dock.querySelector('[data-focus]').onclick = () => {
          if (cmd.focus != null) cmd.focus = null;
          else mode = mode === 'focus' ? null : 'focus';
          sfx.focus(mode === 'focus');
          drawAll();
        };
        dock.querySelector('[data-ult]')?.addEventListener('click', () => {
          if (cmd.ult != null) cmd.ult = null;
          else mode = mode === 'ult' ? null : 'ult';
          sfx.focus(mode === 'ult');
          drawAll();
        });
        dock.querySelector('[data-read]').onclick = () => {
          if (cmd.read) cmd.read = null;
          else mode = mode === 'read' ? null : 'read';
          readLane = null;
          if (mode === 'read') sfx.readArm();
          drawAll();
        };
        dock.querySelector('[data-lock]').onclick = () => {
          if (!ready()) return;
          if (this.coachCheck(cmd)) return; // the coach says "are you sure?" once
          this.coachSay(null);
          this.cmdUI = null;
          for (let l = 0; l < LANES; l++) {
            this.laneEl(0, l).querySelector('.lane__pick')?.remove();
            this.laneEl(0, l).classList.remove('target', 'focused');
            this.laneEl(1, l).classList.remove('target');
            this.laneEl(1, l).querySelector('.lane__readpick')?.remove();
          }
          resolve({ orders: cmd.orders.slice(), focus: cmd.focus, read: cmd.read, ult: cmd.ult });
        };
      };
      const drawAll = () => {
        drawLanes();
        drawDock();
        this.coachUpdate('command', { cmd, mode, readLane });
      };
      this.cmdUI = (side, l) => {
        if (mode === 'ult' && side === 0 && ultCharged(st, P.lanes[l])) {
          cmd.ult = l;
          mode = null;
          sfx.clash();
          haptic.slam();
          drawAll();
        } else if (mode === 'focus' && side === 0 && P.lanes[l]) {
          cmd.focus = l;
          mode = null;
          sfx.focus(true);
          haptic.tick();
          drawAll();
        } else if (mode === 'read' && side === 1 && readLanes.includes(l)) {
          readLane = l;
          drawAll();
        }
      };
      // tapping an empty part of a lane works too
      for (let l = 0; l < LANES; l++) {
        this.laneEl(0, l).onclick = () => this.cmdUI?.(0, l);
        this.laneEl(1, l).onclick = () => this.cmdUI?.(1, l);
      }
      drawAll();
    });
  }

  // ------------------------------------------------------------- staging
  wait(ms) {
    return sleep(ms / this.speed);
  }

  cardIn(side, lane) {
    return this.laneEl(side, lane)?.querySelector('.card');
  }

  float(anchor, text, cls) {
    if (!anchor) return;
    const f = document.createElement('div');
    f.className = `fl ${cls}`;
    f.textContent = text;
    const r = anchor.getBoundingClientRect();
    const host = this.el('.rk').getBoundingClientRect();
    f.style.left = r.left - host.left + r.width / 2 + 'px';
    f.style.top = r.top - host.top + r.height * 0.38 + 'px';
    this.el('.rk').appendChild(f);
    setTimeout(() => f.remove(), 1300);
  }

  shake(power) {
    if (document.getElementById('app')?.classList.contains('lite')) return;
    const rk = this.el('.rk');
    rk.style.setProperty('--sh', Math.min(9, 2 + power * 0.7) + 'px');
    rk.classList.remove('shake');
    void rk.offsetWidth;
    rk.classList.add('shake');
  }

  banner(side, lane, name, text) {
    const b = document.createElement('div');
    b.className = 'ab-banner ' + (side === 0 ? 'me' : 'opp');
    b.innerHTML = `<b>${esc(name)}</b>${text ? `<span>${esc(text)}</span>` : ''}`;
    const le = this.laneEl(side, lane);
    (le || this.el('[data-field]')).appendChild(b);
    setTimeout(() => b.remove(), 1500 / this.speed);
  }

  bolt(fromEl, toEl, cls) {
    if (!fromEl || !toEl) return;
    const host = this.el('.rk').getBoundingClientRect();
    const a = fromEl.getBoundingClientRect();
    const b = toEl.getBoundingClientRect();
    const x1 = a.left + a.width / 2 - host.left, y1 = a.top + a.height / 2 - host.top;
    const x2 = b.left + b.width / 2 - host.left, y2 = b.top + b.height / 2 - host.top;
    const len = Math.hypot(x2 - x1, y2 - y1);
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const el = document.createElement('div');
    el.className = `bolt ${cls}`;
    el.style.cssText = `left:${x1}px;top:${y1}px;width:${len}px;transform:rotate(${ang}rad)`;
    this.el('.rk').appendChild(el);
    setTimeout(() => el.remove(), 700);
  }

  // Attacker winds up, then rushes across the gap and stays at the point of
  // contact until the hit lands; retreat() brings it home.
  dash(side, lane, { share = 1, riposte = false } = {}) {
    const c = this.cardIn(side, lane);
    if (!c) return;
    const t = this.cardIn(1 - side, lane);
    const dir = side === 0 ? -1 : 1;
    const a = c.getBoundingClientRect();
    let dist;
    if (t) {
      const b = t.getBoundingClientRect();
      const gap = Math.abs(b.top + b.height / 2 - (a.top + a.height / 2));
      dist = Math.max(10, (gap - a.height * 0.82) * share);
    } else dist = this.cw * 0.7;
    if (riposte) dist *= 0.8;
    const dy = dir * dist;
    const le = this.laneEl(side, lane);
    if (le) le.style.zIndex = 12;
    const back = -dir * (riposte ? 6 : 16);
    const anim = c.animate(
      [
        { transform: 'translateY(0) scale(1) rotate(0)' },
        { transform: `translateY(${back}px) scale(1.07) rotate(${dir * -2}deg)`, offset: 0.55, easing: 'cubic-bezier(.7,0,1,.6)' },
        { transform: `translateY(${dy}px) scale(1.14) rotate(0)` },
      ],
      { duration: (riposte ? 260 : 330) / this.speed, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' },
    );
    (this.returns ||= []).push({ c, anim, dy, le });
  }

  async retreat() {
    const r = this.returns || [];
    this.returns = [];
    if (!r.length) return;
    for (const { c, anim, dy, le } of r) {
      if (!c.isConnected) continue;
      c.animate([{ transform: `translateY(${dy}px) scale(1.14)` }, { transform: 'none' }], { duration: 280 / this.speed, easing: 'cubic-bezier(.2,.8,.2,1)' });
      anim.cancel();
      setTimeout(() => le && (le.style.zIndex = ''), 280);
    }
    await this.wait(110);
  }

  // The blow lands: flash, hit-stop, sparks at the point of contact, knockback.
  async impact(e) {
    const { side, lane, n, warded = 0, from } = e;
    const le = this.laneEl(side, lane);
    const c = this.cardIn(side, lane);
    if (!le) return;
    const kind = from === 'riposte' ? 'guard' : from === 'strike' || from === 'riposte' ? 'strike' : from === 'execute' ? 'strike' : 'scheme';
    const real = n - warded;
    const k = Math.min(1.6, 0.6 + n * 0.1);
    if (c) {
      // contact is on the edge facing the attacker
      const [x, y] = this.juice.at(c, 0.5, from === 'strike' || from === 'riposte' ? (side === 1 ? 0.88 : 0.12) : 0.5);
      c.animate([{ filter: 'brightness(3) saturate(0)' }, { filter: 'brightness(3) saturate(0)', offset: 0.6 }, { filter: 'none' }], { duration: 160 });
      this.juice.sparks(x, y, kind, 18 + Math.min(40, n * 5), k);
      this.juice.ring(x, y, kind, 50 + n * 10, { squash: 0.5, size: 3 + n * 0.3 });
      if (warded) this.juice.sparks(x, y, 'guard', 16, 0.7);
      sfx.hit?.(n);
      haptic.slam();
      // hit-stop: everything holds for a beat on contact
      await sleep(Math.min(140, 50 + n * 12) / this.speed);
      const push = (side === 0 ? 1 : -1) * (6 + Math.min(18, n * 2));
      c.animate(
        [{ transform: `translateY(${push}px) rotate(${push * 0.3}deg) scale(0.96)` }, { transform: `translateY(${-push * 0.25}px)`, offset: 0.55 }, { transform: 'none' }],
        { duration: 340 / this.speed, easing: 'cubic-bezier(.2,.8,.2,1)' },
      );
      const sl = document.createElement('i');
      sl.className = 'slash' + (kind === 'guard' ? ' slash--guard' : kind === 'scheme' ? ' slash--scheme' : '');
      le.querySelector('.lane__slot').appendChild(sl);
      setTimeout(() => sl.remove(), 450);
    }
    if (warded) this.float(le.querySelector('.lane__ward') || c, `◈ ${warded}`, 'fl-ward');
    if (warded && e.ward === 0) {
      this.float(c || le, 'SHIELD BREAK', 'fl-break');
      sfx.shatter();
    }
    if (real > 0) this.float(c || le, '-' + real, real >= 8 ? 'fl-dmg huge' : real >= 5 ? 'fl-dmg big' : 'fl-dmg');
    this.shake(n);
    if (real >= 5) this.juice.punch(this.el('[data-field]'), Math.min(2, real / 5));
  }

  setHp(side, lane, hp, max) {
    const le = this.laneEl(side, lane);
    if (!le) return;
    const pct = (100 * Math.max(0, hp)) / max + '%';
    const fill = le.querySelector('.hp__fill'), ghost = le.querySelector('.hp__ghost'), num = le.querySelector('.lane__hp span');
    if (fill) fill.style.width = pct;
    if (ghost) setTimeout(() => (ghost.style.width = pct), 420);
    if (num) num.innerHTML = `${Math.max(0, hp)}<small>/${max}</small>`;
  }

  setWard(side, lane, ward) {
    const w = this.laneEl(side, lane)?.querySelector('.lane__ward');
    if (!w) return;
    w.querySelector('b').textContent = ward;
    w.classList.toggle('on', ward > 0);
  }

  // Plays an engine event list with presentation. The engine has already
  // resolved; this.state holds the board the events start from.
  async play(events) {
    const falls = events.filter((e) => e.t === 'fall');
    this.ko = { n: falls.length, sides: new Set(falls.map((f) => f.side)), shown: false };
    for (const e of events) {
      if (this.dead) return;
      crumb(`${e.t} r${this.state.round}${e.lane != null ? ' l' + e.lane : ''}${e.side != null ? ' s' + e.side : ''}${e.n != null ? ' n' + e.n : ''}`);
      if (e.t !== 'hit') await this.retreat();
      switch (e.t) {
        case 'orders': {
          sfx.reveal();
          haptic.slam();
          this.judgeLeans(e.orders[1]);
          for (let l = 0; l < LANES; l++)
            for (const side of [1, 0]) {
              const o = e.orders[side][l];
              const b = o && this.laneEl(side, l)?.querySelector('.lane__badge');
              if (!b) continue;
              b.className = `lane__badge o-${o} on`;
              b.innerHTML = icon('i-' + o);
              if (e.focus[side] === l) b.classList.add('focus');
              const [x, y] = this.juice.at(b);
              this.juice.ring(x, y, o, 44, { squash: 1, size: 2, ttl: 0.4 });
              this.juice.sparks(x, y, o, 8, 0.4);
              await this.wait(70);
            }
          await this.wait(480);
          break;
        }
        case 'lastStand': {
          const mine = e.sides.includes(0), theirs = e.sides.includes(1);
          sfx.clash();
          this.shake(6);
          this.el('.rk').classList.add('ls-flash');
          setTimeout(() => this.el('.rk')?.classList.remove('ls-flash'), 900);
          await this.juice.callout('Last Stand', 'strike', { ms: 1000, sub: e.final ? `Final round · everyone +${this.state.rules.lastStandPower}` : mine && theirs ? `Both sides +${this.state.rules.lastStandPower}` : mine ? `Your heroes +${this.state.rules.lastStandPower}` : `Their heroes +${this.state.rules.lastStandPower}` });
          break;
        }
        case 'ult': {
          const c = this.cardIn(e.side, e.lane);
          this.flash();
          sfx.knockout();
          haptic.slam();
          if (c) {
            const [x, y] = this.juice.at(c);
            this.juice.sparks(x, y, 'gold', 60, 1.4);
            this.juice.ring(x, y, 'gold', 180, { squash: 1, size: 5 });
            c.animate([{ transform: 'scale(1)', filter: 'brightness(1)' }, { transform: 'scale(1.18)', filter: 'brightness(2.2)', offset: 0.4 }, { transform: 'scale(1)', filter: 'brightness(1.2)' }], { duration: 700 / this.speed });
            this.laneEl(e.side, e.lane)?.classList.add('ulted');
          }
          await this.juice.callout('Ultimate', 'gold', { ms: 1000, sub: CARDS[e.card].name });
          break;
        }
        case 'read': {
          await this.readMoment(e);
          if (e.hit) {
            const b = this.laneEl(1 - e.side, e.lane)?.querySelector('.lane__badge');
            b?.classList.add('broken');
          }
          break;
        }
        case 'lane':
          await this.stageLane(e);
          break;
        case 'hit': {
          await this.impact(e);
          this.setHp(e.side, e.lane, e.hp, e.max);
          this.setWard(e.side, e.lane, e.ward);
          if (e.spill) {
            await this.wait(140);
            const c = this.cardIn(e.side, e.lane);
            this.float(c, 'OVERKILL', 'fl-over');
            this.bolt(c, this.el(`[data-voice="${e.side}"]`), 'b-strike');
            await this.wait(200);
            this.setVoice(e.side, this.voiceShown[e.side] - e.spill);
          }
          await this.wait(e.from === 'ability' || e.from === 'execute' ? 460 : 240);
          break;
        }
        case 'mend':
          this.setHp(e.side, e.lane, e.hp, e.max);
          if (this.cardIn(e.side, e.lane)) this.juice.motes(...this.juice.at(this.cardIn(e.side, e.lane)), 'heal', 16);
          this.float(this.cardIn(e.side, e.lane), '+' + e.n, 'fl-heal');
          await this.wait(300);
          break;
        case 'ward': {
          const le = this.laneEl(e.side, e.lane);
          const wc = this.cardIn(e.side, e.lane);
          if (wc) {
            const [x, y] = this.juice.at(wc);
            this.juice.motes(x, y, 'guard', 22);
            this.juice.ring(x, y, 'guard', 70, { squash: 1.2, size: 3 });
          }
          const w = le?.querySelector('.lane__ward');
          if (w) {
            w.querySelector('b').textContent = e.total;
            w.classList.add('on', 'pop');
            setTimeout(() => w.classList.remove('pop'), 500);
          }
          const sh = document.createElement('i');
          sh.className = 'shieldfx';
          le?.querySelector('.lane__slot')?.appendChild(sh);
          setTimeout(() => sh.remove(), 700);
          sfx.shield?.();
          await this.wait(360);
          break;
        }
        case 'voice':
          this.setVoice(e.side, e.voice);
          if (e.src === 'ability') {
            sfx.hit?.(e.n);
            this.shake(e.n);
            await this.wait(420);
          }
          break;
        case 'voiceHeal':
          this.setVoice(e.side, e.voice, { heal: true });
          sfx.heal?.();
          await this.wait(420);
          break;
        case 'fall':
          await this.fall(e.side, e.lane);
          break;
        case 'ability':
          this.banner(e.side, e.lane, e.name, e.hook === 'fall' ? 'Last Words' : e.hook === 'reveal' ? '' : '');
          sfx.select();
          await this.wait(620);
          break;
        case 'buff': {
          const c = this.cardIn(e.side, e.lane);
          this.float(c, `${e.n > 0 ? '+' : ''}${e.n} ${SHORT[e.stat]}`, e.n > 0 ? 'fl-buff' : 'fl-debuff');
          await this.wait(260);
          break;
        }
        case 'forbid': {
          const le = this.laneEl(e.side, e.lane);
          const f = document.createElement('div');
          f.className = 'lane__forbid';
          f.textContent = `no ${LABEL[e.order]}`;
          le?.appendChild(f);
          await this.wait(360);
          break;
        }
        case 'silence': {
          const c = this.cardIn(e.side, e.lane);
          c?.classList.add('is-silenced');
          this.float(c, 'SILENCED', 'fl-silence');
          await this.wait(420);
          break;
        }
        case 'focus':
          this.float(this.el(`[data-strip="${e.side}"] .res-mini--focus`) || this.el(`[data-strip="${e.side}"]`), `${e.n > 0 ? '+' : ''}${e.n} Focus`, 'fl-focus');
          await this.wait(300);
          break;
        case 'gainRead':
          this.float(this.el(`[data-strip="${e.side}"]`), '+ READ', 'fl-read');
          await this.wait(300);
          break;
        case 'noFocus':
          this.banner(e.side, 1, e.side === 0 ? 'No Focus for you this round' : 'They cannot Focus this round', '');
          await this.wait(400);
          break;
        case 'noRead':
          this.banner(e.side, 1, e.side === 0 ? 'You cannot READ this round' : 'They cannot READ this round', '');
          await this.wait(400);
          break;
        case 'intel':
          if (e.side === 0) {
            this.intel = [...new Set([...(this.intel || []), ...e.cards])];
            this.renderOppHand();
            this.banner(1, 1, 'Seen in their hand', e.cards.map((id) => CARDS[id].name).join(', '));
            await this.wait(900);
          }
          break;
        case 'revive':
          this.banner(e.side, 1, `${CARDS[e.card].name} returns`, 'back to hand');
          await this.wait(700);
          break;
        case 'move': {
          // slide the whole lane stack to its new lane
          const a = this.laneEl(e.side, e.from), b = this.laneEl(e.side, e.to);
          if (a && b) {
            const moved = [...a.children];
            const empty = [...b.children];
            b.replaceChildren(...moved);
            a.replaceChildren(...empty);
            b.animate([{ transform: `translateX(${(e.from - e.to) * 100}%)` }, { transform: 'none' }], { duration: 380 / this.speed, easing: 'cubic-bezier(.2,.8,.2,1)' });
          }
          await this.wait(400);
          break;
        }
        default:
          break;
      }
    }
    await this.retreat();
  }

  // One lane's exchange: attackers rush their targets, bolts fly into Voices.
  async stageLane(e) {
    const l = e.lane;
    for (const side of [0, 1]) this.laneEl(side, l)?.classList.add('spot');
    const out = e.outcome;
    for (const side of [0, 1]) {
      if (out[side] !== 'beaten') continue;
      this.laneEl(side, l)?.querySelector('.lane__badge')?.classList.add('broken');
      this.cardIn(side, l)?.classList.add('beaten');
    }
    const melee = [0, 1].filter((s) => out[s] === 'strike' || out[s] === 'riposte');
    const ranged = [0, 1].filter((s) => out[s] === 'scheme' || out[s] === 'strikeVoice');
    if (out.includes('beaten')) sfx.clashLose();
    if (!melee.length && !ranged.length) {
      await this.wait(out.includes('beaten') ? 380 : 200);
      return this.unspot(l);
    }
    sfx.windup();
    const both = melee.length === 2;
    for (const s of melee) this.dash(s, l, { share: both ? 0.5 : 1, riposte: out[s] === 'riposte' });
    for (const s of ranged) {
      const c = this.cardIn(s, l);
      if (!c) continue;
      const dir = s === 0 ? -1 : 1;
      c.animate(
        [{ transform: 'none' }, { transform: `translateY(${-dir * 8}px) scale(1.06)`, offset: 0.4 }, { transform: `translateY(${dir * 14}px) scale(1.1)`, offset: 0.7 }, { transform: 'none' }],
        { duration: 520 / this.speed, easing: 'cubic-bezier(.3,0,.3,1)' },
      );
      const [x, y] = this.juice.at(c);
      this.juice.motes(x, y, out[s] === 'scheme' ? 'scheme' : 'strike', 14);
    }
    await this.wait(melee.length ? (melee.every((s) => out[s] === 'riposte') ? 260 : 330) : 240);
    if (both) {
      // two strikes meet in the middle
      const [x, y] = this.juice.at(this.cardIn(0, l), 0.5, 0);
      this.juice.sparks(x, y - 6, 'gold', 30, 1.2);
      this.juice.ring(x, y - 6, 'gold', 110, { squash: 0.25, size: 4 });
      this.shake(4);
    }
    for (const s of ranged) {
      const c = this.cardIn(s, l);
      const target = this.el(`[data-voice="${1 - s}"]`);
      this.bolt(c, target, out[s] === 'scheme' ? 'b-scheme' : 'b-strike');
      const dmg = e.voiceDmg[1 - s] - e.spill[1 - s];
      setTimeout(() => {
        if (this.dead) return;
        // the engine's aggregated 'voice' event follows; show this lane's share now
        this.setVoice(1 - s, this.voiceShown[1 - s] - dmg);
        this.shake(dmg * 0.8);
        sfx.hit?.(dmg);
        haptic.slam();
      }, 260 / this.speed);
    }
    if (ranged.length) await this.wait(420);
    this.unspot(l);
  }

  unspot(l) {
    for (const side of [0, 1]) setTimeout(() => this.laneEl(side, l)?.classList.remove('spot'), 500);
  }

  async fall(side, lane) {
    const c = this.cardIn(side, lane);
    sfx.shatter();
    haptic.slam();
    if (c) {
      this.juice.shatter(c, side === 0 ? 'strike' : this.kindOf(side, lane));
      c.style.visibility = 'hidden';
      this.shake(7);
      this.juice.punch(this.el('[data-field]'), 1.5);
    }
    const le = this.laneEl(side, lane);
    le?.querySelectorAll('.lane__hp,.lane__ward,.lane__badge,.lane__buffs,.lane__forbid,.lane__mute').forEach((x) => x.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' }));
    if (this.ko && !this.ko.shown) {
      this.ko.shown = true;
      const n = this.ko.n;
      const word = n >= 3 ? 'Triple KO' : n === 2 ? 'Double KO' : 'Knockout';
      const theirs = !this.ko.sides.has(0);
      sfx.knockout();
      await this.wait(160);
      await this.juice.callout(word, theirs ? 'gold' : this.ko.sides.has(1) ? 'gold' : 'strike', { ms: 900, sub: theirs ? '' : !this.ko.sides.has(1) ? 'You lost a Champion' : '' });
    } else await this.wait(480);
    const slot = le?.querySelector('.lane__slot');
    if (slot) slot.innerHTML = '<div class="lane__empty"></div>';
    le?.querySelectorAll('.lane__hp,.lane__ward,.lane__badge,.lane__buffs,.lane__forbid,.lane__mute').forEach((x) => x.remove());
  }

  // The match is decided: the loser's Voice breaks apart.
  async finale() {
    const st = this.state;
    if (st.winner == null) return;
    const loser = 1 - st.winner;
    const box = this.el(`[data-voice="${loser}"]`);
    const end = st.events.find((x) => x.t === 'end');
    await sleep(300);
    if (this.dead) return;
    if (box) {
      box.classList.add('broken');
      const bar = box.querySelector('.voice__bar');
      for (let i = 0; i < 4; i++) {
        const [x, y] = this.juice.at(bar, 0.1 + i * 0.27, 0.5);
        this.juice.sparks(x, y, loser === 0 ? 'strike' : 'gold', 24, 1.1);
      }
      const [x, y] = this.juice.at(bar);
      this.juice.ring(x, y, 'gold', this.juice.w * 0.5, { squash: 0.2, size: 5, ttl: 0.8 });
    }
    sfx.knockout();
    haptic.slam();
    this.shake(9);
    this.juice.punch(this.el('[data-field]'), 2);
    const byTime = end?.by === 'voice';
    await this.juice.callout(byTime ? 'Time' : 'Silenced', st.winner === 0 ? 'gold' : 'strike', {
      ms: 1300,
      sub: byTime ? (st.winner === 0 ? 'Your Voice holds' : 'Their Voice holds') : st.winner === 0 ? 'Their Voice breaks' : 'Your Voice breaks',
    });
    await sleep(500);
  }

  async readMoment(e) {
    const mine = e.side === 0;
    if (e.hit) {
      sfx.readHit();
      haptic.read();
      this.flash();
      await this.moment('read', 'READ ✓', mine ? `You called ${e.order.toUpperCase()}` : `They called your ${e.order.toUpperCase()}`, 1050);
    } else {
      sfx.misread();
      haptic.misread();
      await this.moment('misread', 'MISREAD', mine ? `You called ${e.order.toUpperCase()}` : `They called ${e.order.toUpperCase()}`, 900);
    }
  }

  async moment(kind, word, sub = '', ms = 950) {
    const m = document.createElement('div');
    m.className = `moment moment--${kind}`;
    m.innerHTML = `<div class="moment__word">${esc(word)}${sub ? `<span class="moment__sub">${esc(sub)}</span>` : ''}</div>`;
    this.el('.rk').appendChild(m);
    await sleep(ms);
    m.remove();
  }

  flash() {
    const f = document.createElement('div');
    f.className = 'flash';
    this.el('.rk').appendChild(f);
    setTimeout(() => f.remove(), 380);
  }

  replay(spec) {
    import('../core/session.js').then(({ setBattle }) => {
      setBattle({ ...spec, onEnd: null, rematch: false });
      this.ctx.go('battle', { t: Date.now() });
    });
  }

  // ------------------------------------------------------------- finish
  revealSpoils(box, sp) {
    const card = CARDS[sp.cardId];
    const big = sp.rarity === 'legendary' || sp.rarity === 'mythic';
    box.innerHTML = `<div class="kicker">Spoils</div><div class="spoils__card" data-c></div>
      <div class="spoils__name"></div><div class="spoils__left">${sp.left} card${sp.left === 1 ? '' : 's'} left in today’s Spoils</div>`;
    const holder = box.querySelector('[data-c]');
    holder.appendChild(renderCard(null, { back: true, width: 96 }));
    setTimeout(() => sfx.clue(sp.rarity), 500);
    setTimeout(() => {
      if (this.dead) return;
      crumb('end spoils ' + sp.rarity);
      const front = renderCard(card, { width: 96, flat: true });
      front.classList.add('spoils-flip', 'r-' + sp.rarity);
      holder.replaceChildren(front);
      box.querySelector('.spoils__name').innerHTML = `<b class="rar-${sp.rarity}">${esc(card.name)}</b> · ${sp.rarity}${sp.isNew ? ' <span class="tag tag--new">New</span>' : ''}`;
      if (!(big && music.sting('reveal'))) sfx.rarity(sp.rarity);
      haptic.slam();
      const [x, y] = this.juice.at(front);
      const lite = !!store.get().settings.lite; // iPhone: the flip and the sound, not the fireworks
      this.juice.sparks(x, y, 'gold', lite ? 12 : big ? 70 : 24, big ? 1.4 : 0.8);
      if (!lite) this.juice.ring(x, y, 'gold', big ? 200 : 90, { squash: 1, size: big ? 5 : 3 });
      if (big) {
        if (!lite) this.flash(), this.shake(8);
        this.juice.callout(sp.rarity, 'gold', { ms: 1400, y: 0.3 });
      }
      front.onclick = () => this.inspect(card);
    }, big ? 1500 : 900);
  }

  // The opponent gets the last word, if they have one.
  resultLine(won, clutch) {
    const L = this.spec.persona?.lines;
    const who = esc(this.spec.title || this.spec.persona?.name || '');
    if (this.forfeited) return 'You forfeited. It counts as a loss.';
    if (this.remote?.view?.by === 'resign') return won ? `${who} forfeited. The win is yours.` : 'You forfeited. It counts as a loss.';
    if (this.remote?.view?.by === 'disconnect') return won ? `${who} lost connection for over a minute. The win is yours.` : 'You were disconnected for over a minute, so the match was forfeited.';
    if (this.remote?.view?.by === 'timeout') return won ? `${who} stopped answering. The win is yours.` : 'You ran out of time too many times.';
    if (won && this.spec.winLine) return esc(this.spec.winLine);
    if (!won && this.spec.loseLine) return esc(this.spec.loseLine);
    if (L) return `<span class="speaker-line">${who}</span> “${esc(won ? L.lose : L.win)}”`;
    return esc(won ? (clutch ? 'Won from the brink.' : 'Their Voice falls silent.') : 'Your Voice falls silent. The Accord records every loss.');
  }

  // The match's own track: a boss, the opponent's faction arena, or battle.
  scoreTrack() {
    if (this.spec.music) return this.spec.music;
    const fac = this.spec.persona?.faction;
    if (this.spec.mode !== 'tutorial' && ['crown', 'quiet', 'hour', 'margin', 'vigil'].includes(fac)) return fac;
    return 'battle';
  }

  // The last round, or a Voice near silence, gets the final-round track.
  // Boss fights keep their own score to the end.
  scoreForTension() {
    const st = this.state;
    if (st.phase === 'over' || this.spec.music === 'boss') return;
    const low = this.lowVoice();
    if (st.round >= st.rules.rounds || st.p[0].voice <= low || st.p[1].voice <= low) music.play('final', { fade: 1 });
  }

  async finish() {
    if (this.finished) return; // a forfeit can end the match while the loop still waits
    this.finished = true;
    this.el('.quit-btn')?.remove();
    const st = this.state;
    // the victory or defeat sting plays over a silenced score (the season's
    // last chapter plays the Firstfall finale instead)
    if (this.spec.finale && st.winner === 0) music.play('finale', { fade: 0.6 });
    else music.stop(0.6);
    const won = st.winner === 0;
    const me = st.p[0];
    if (this.spec.replay) {
      const r = document.createElement('div');
      r.className = 'result';
      r.innerHTML = `<div class="kicker">Replay</div><div class="result__title ${won ? 'win' : 'lose'}">${won ? 'VICTORY' : 'DEFEAT'}</div>
        <div class="row" style="width:100%;max-width:360px;gap:10px"><button class="btn btn--ghost grow" data-again>Watch again</button><button class="btn grow" data-continue>Done</button></div>`;
      this.el('.rk').appendChild(r);
      r.querySelector('[data-continue]').onclick = () => this.ctx.go('home');
      r.querySelector('[data-again]').onclick = () => this.replay(this.spec);
      return;
    }
    this.log(false);
    const clutch = won && me.voice <= this.lowVoice(); // won from the brink
    const readsUsed = me.stats.readsUsed;
    const readsHit = me.stats.readsHit;
    const kills = me.stats.kills;
    const rewards = [];
    // Champions that took the field this match
    const fought = [...new Set(st.history.flatMap((h) => (h.deploy?.[0] || []).map((d) => d.card)))];
    store.update((s) => {
      s.stats.matches++;
      if (won) s.stats.wins++;
      s.stats.readsUsed += readsUsed;
      s.stats.readsHit += readsHit;
      if (clutch) s.stats.finals++;
      store.bumpObjective('matches');
      if (won) store.bumpObjective('wins');
      if (readsHit) store.bumpObjective('readsHit', readsHit);
      if (clutch) store.bumpObjective('finals');
      if (kills) store.bumpObjective('kills', kills);
      // Claims
      if (FEATURES.claims && won && s.pledge) {
        const n = this.spec.mine.filter((id) => CARDS[id].faction === s.pledge).length;
        if (n >= 4) {
          s.claims[s.pledge] += clutch ? 2 : 1;
          rewards.push(['Claim points', `+${clutch ? 2 : 1} ${s.pledge}`]);
        }
      }
    });
    crumb('end saved');
    // What this match pays, and what it adds to each copy's history, comes from
    // the vault (the server, when signed in): engine/economy.js matchEnd.
    const unitHp = Object.fromEntries(me.lanes.filter(Boolean).map((u) => [u.id, u.hp]));
    let res = { rewards: [], spoils: null };
    if (!this.spec.noRewards) {
      try {
        res = (await vault.act('matchEnd', {
          mode: this.spec.mode,
          won,
          clutch,
          fought,
          feats: this.feats || {},
          fell: me.fallen,
          endHp: unitHp,
          opp: this.spec.title || 'an opponent',
          kicker: this.spec.resultKicker,
          persona: this.spec.persona?.id,
          skill: this.spec.persona?.skill,
          round: st.round,
          chapter: this.spec.chapter,
          final: !!this.spec.final, // the last training battle
          noSpoils: !!this.spec.noSpoils,
          match: this.remote?.id, // online: the server checks the real result
        })) || res;
      } catch (e) {
        res = { rewards: [['Rewards', e.message]], spoils: null };
      }
    }
    if (this.dead) return;
    rewards.unshift(...res.rewards);
    crumb('end rewarded');
    // Alliance chest: a win counts (online wins count double)
    if (won && this.spec.mode !== 'tutorial') import('../core/cloud.js').then((c) => c.contribute(this.remote ? 'pvp' : 'battle'));
    const extra = this.spec.onEnd?.({ won, finalWin: clutch, state: st, readsHit }) || [];
    rewards.push(...extra);
    const spoils = res.spoils;
    if (won) haptic.win();
    crumb('end sting ' + (won ? 'victory' : 'defeat'));
    if (!(this.spec.finale && won) && !music.sting(won ? 'victory' : 'defeat')) won ? sfx.matchWin() : sfx.matchLose();
    const r = document.createElement('div');
    r.className = 'result';
    const resultArt = uiArt(won ? 'victory' : 'defeat', true);
    if (resultArt) r.style.backgroundImage = `linear-gradient(rgba(4,4,7,0.72), rgba(4,4,7,0.82)), url("${resultArt}")`;
    r.innerHTML = `
      <div class="kicker">${esc(this.spec.resultKicker || (this.spec.mode === 'ladder' ? store.tierName() : ''))}</div>
      <div class="result__title ${won ? 'win' : 'lose'}">${won ? 'VICTORY' : 'DEFEAT'}</div>
      <div class="lore" style="text-align:center;max-width:320px">${this.resultLine(won, clutch)}</div>
      ${me.voice === st.p[1].voice && !this.forfeited && !this.remote?.view?.by?.match(/resign|timeout|disconnect/) ? `<div class="muted" style="text-align:center;font-size:13px;max-width:320px">A tie on Voice goes to whoever holds <b>Initiative</b> (the ▶ by a name). ${st.initiative === 0 ? 'You' : esc(this.spec.title || 'They')} had it.</div>` : ''}
      ${spoils ? '<div class="spoils" data-spoils></div>' : ''}
      <div class="result__stats">
        <div><b>${Math.max(0, me.voice)}–${Math.max(0, st.p[1].voice)}</b><span>Voice</span></div>
        <div><b>${kills}</b><span>Felled</span></div>
        <div><b>${readsHit}/${readsUsed}</b><span>READs</span></div>
      </div>
      ${rewards.length ? `<div class="result__rewards">${rewards.map(([a, b]) => `<div><span>${esc(a)}</span><b class="gold">${esc(b)}</b></div>`).join('')}</div>` : ''}
      ${this.remote ? '' : '<button class="btn btn--sm btn--ghost" data-replay style="min-width:160px">Watch replay</button>'}
      <div class="row" style="width:100%;max-width:360px;gap:10px">
        ${this.spec.rematch !== false ? '<button class="btn btn--ghost grow" data-rematch>Rematch</button>' : ''}
        <button class="btn grow" data-continue>${esc(this.spec.continueLabel || 'Continue')}</button>
      </div>`;
    this.el('.rk').appendChild(r);
    this.el('.rk').classList.add('ended');
    crumb('end result shown');
    // once the result covers it, the board underneath stops costing memory
    setTimeout(() => this.el('.rk')?.classList.add('covered'), 700);
    if (spoils) this.revealSpoils(r.querySelector('[data-spoils]'), spoils);
    r.querySelector('[data-continue]').onclick = () => (this.spec.onContinue ? this.spec.onContinue(this.ctx) : this.ctx.go('home'));
    r.querySelector('[data-replay]')?.addEventListener('click', () => this.replay({ ...this.spec, replay: { seed: this.seed, rounds: st.history.map((h) => ({ deploy: h.deploy, command: h.command || [null, null] })) } }));
    r.querySelector('[data-rematch]')?.addEventListener('click', (e) => {
      if (this.spec.onRematch) return this.spec.onRematch(this.ctx, e.currentTarget);
      import('../core/session.js').then(({ setBattle }) => {
        setBattle({ ...this.spec });
        this.ctx.go('play', { t: Date.now() });
        setTimeout(() => this.ctx.go('battle', { t: Date.now() }), 0);
      });
    });
  }
}
