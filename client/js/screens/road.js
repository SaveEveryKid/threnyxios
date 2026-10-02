// THE LONG ROAD — the run screen: the road map, the rewards after each duel,
// and the tally at the end. Run logic lives in engine/road.js.
import * as store from '../core/store.js';
import * as vault from '../core/vault.js';
import { CARDS } from '../../../engine/cards/index.js';
import { newRun, choose, afterDuel, visit, take, playerMods, enemyMods, runRewards, RELICS, FLOORS, LIVES } from '../../../engine/road.js';
import { personaOctave } from '../core/opponents.js';
import { setBattle } from '../core/session.js';
import { renderCard, esc } from '../ui/card.js';
import { icon } from '../ui/icons.js';
import { sfx } from '../core/audio.js';
import { recordRival } from './play.js';

const KIND = {
  fight: { name: 'Duel', ico: 'i-strike', text: 'A duel on the road. Win to choose a reward.' },
  elite: { name: 'Champion Duel', ico: 'i-focus', text: 'A stronger foe (+1 to every stat, +1 Focus). Better rewards.' },
  rest: { name: 'Campfire', ico: 'i-health', text: 'Recover a life, or temper one Champion (+1 to every stat, +2 health).' },
  shrine: { name: 'Shrine', ico: 'i-read', text: 'Take one of two relics.' },
  boss: { name: 'The Archivist', ico: 's-quiet', text: 'The end of the road. +6 Voice, +1 to every stat, an extra READ and Ultimate. Lose and you may try again while you have lives.' },
};
const STAT = { strike: 'STRIKE', guard: 'GUARD', scheme: 'SCHEME', hp: 'health' };
const persona = (id) => store.PERSONAS.find((p) => p.id === id) || store.PERSONAS[0];
const first = (id) => esc(CARDS[id].name);
const upText = (b) => Object.entries(b || {}).filter(([, n]) => n).map(([k, n]) => `+${n} ${k === 'hp' ? '♥' : STAT[k].slice(0, 3)}`).join(' ');

export function render(root, params, ctx) {
  const draw = () => {
    const s = store.get();
    const run = s.road;
    if (!run) return drawIntro(s);
    if (run.done) return drawEnd(s, run);
    root.innerHTML = `
      <div class="row"><div class="grow"><div class="kicker">The Long Road</div>
        <div class="h1" style="font-size:24px">Stop ${Math.min(run.floor + 1, FLOORS)} of ${FLOORS}</div></div>
        <div class="road-lives" title="Lives">${Array.from({ length: LIVES }, (_, i) => `<i class="${i < run.lives ? 'on' : ''}">♥</i>`).join('')}</div></div>
      ${run.relics.length ? `<div class="road-relics">${run.relics.map((r) => `<span class="road-relic" title="${esc(RELICS[r].text)}"><b>${esc(RELICS[r].name)}</b> ${esc(RELICS[r].text)}</span>`).join('')}</div>` : ''}
      <div data-body></div>
      <div class="kicker" style="margin-top:14px">Your road Octave</div>
      <div class="road-deck" data-deck></div>
      <button class="btn btn--sm btn--ghost" data-quit style="margin-top:14px">Abandon run</button>`;
    const deck = root.querySelector('[data-deck]');
    for (const id of run.deck) {
      const cell = document.createElement('div');
      cell.className = 'road-card';
      cell.appendChild(renderCard(buffed(id, run), { width: 70, flat: true }));
      const up = upText(run.buffs[id]);
      if (up) cell.insertAdjacentHTML('beforeend', `<em>${up}</em>`);
      deck.appendChild(cell);
    }
    root.querySelector('[data-quit]').onclick = () => {
      const m = ctx.modal(`<div class="h-display" style="font-size:22px">Abandon the road?</div><div class="muted" style="margin:8px 0 14px">You keep what the stops so far have earned.</div><button class="btn" data-yes>Abandon</button>`);
      m.el.querySelector('[data-yes]').onclick = () => {
        m.close?.();
        store.update((x) => (x.road.done = 'abandoned'));
        draw();
      };
    };
    const body = root.querySelector('[data-body]');
    if (run.pending) drawRewards(body, run);
    else drawMap(body, run);
  };

  // cards on the road carry their upgrades
  const buffed = (id, run) => {
    const c = CARDS[id], b = run.buffs[id] || {};
    return { ...c, hp: c.hp + (b.hp || 0), stats: { strike: c.stats.strike + (b.strike || 0), guard: c.stats.guard + (b.guard || 0), scheme: c.stats.scheme + (b.scheme || 0) } };
  };

  const drawIntro = (s) => {
    const best = s.roadBest || { floor: 0, clears: 0 };
    root.innerHTML = `<div class="kicker">Single player</div><div class="h1">The Long Road</div>
      <div class="lore" style="margin:6px 0 12px">Nine stops between you and the Archivist. At each one, choose your way: a duel, a harder duel, a campfire or a shrine. Every win lets you take a new Champion, sharpen one you carry, or claim a relic that bends the rules for the rest of the run.</div>
      <div class="panel" style="margin-bottom:12px">
        <div class="objective"><span class="grow">Lives</span><b>${LIVES}</b></div>
        <div class="objective"><span class="grow">You start with</span><b>Your active Octave</b></div>
        <div class="objective"><span class="grow">Best run</span><b>${best.clears ? `${best.clears} clear${best.clears > 1 ? 's' : ''}` : best.floor ? `Stop ${best.floor}` : '—'}</b></div>
        <div class="objective"><span class="grow">Beating the Archivist</span><b class="gold">3 Tickets + Collector + Firstfall</b></div>
      </div>
      <button class="btn btn--big" data-start>Set out</button>`;
    root.querySelector('[data-start]').onclick = () => {
      sfx.select();
      store.update((x) => (x.road = newRun(x.octaves[x.active].cards)));
      draw();
    };
  };

  const drawMap = (body, run) => {
    // the road runs bottom (start) to top (the Archivist)
    const rows = run.map
      .map((opts, f) => {
        const past = f < run.floor, now = f === run.floor;
        return `<div class="road-floor ${past ? 'past' : now ? 'now' : 'ahead'}">
          <span class="road-floor__n">${f + 1}</span>
          ${opts.map((n, i) => `<button class="road-node k-${n.kind} ${past && run.path[f] === i ? 'taken' : ''}" data-node="${i}" ${now ? '' : 'disabled'}>
            ${icon(KIND[n.kind].ico)}<b>${KIND[n.kind].name}</b>${n.kind === 'fight' || n.kind === 'elite' ? `<small>${esc(persona(n.persona).name)}</small>` : ''}</button>`).join('')}
        </div>`;
      })
      .reverse()
      .join('');
    body.innerHTML = `<div class="road-map">${rows}</div>`;
    body.querySelector('.road-floor.now')?.scrollIntoView({ block: 'nearest' });
    body.querySelectorAll('.road-floor.now [data-node]').forEach(
      (b) =>
        (b.onclick = () => {
          const node = run.map[run.floor][+b.dataset.node];
          const m = ctx.modal(`<div class="kicker">Stop ${run.floor + 1}</div><div class="h-display" style="font-size:24px;margin:4px 0">${KIND[node.kind].name}</div>
            <div class="muted" style="margin-bottom:14px">${KIND[node.kind].text}${node.persona && node.kind !== 'rest' && node.kind !== 'shrine' ? `<br><br>Opponent: <b>${esc(persona(node.persona).name)}</b> · ${esc(persona(node.persona).title)}` : ''}</div>
            <button class="btn" data-go>${node.kind === 'rest' || node.kind === 'shrine' ? 'Go there' : 'Fight'}</button>`);
          m.el.querySelector('[data-go]').onclick = () => {
            m.close?.();
            sfx.select();
            store.update((x) => {
              choose(x.road, +b.dataset.node);
              if (node.kind === 'rest' || node.kind === 'shrine') visit(x.road);
            });
            if (node.kind === 'rest' || node.kind === 'shrine') draw();
            else fight(node);
          };
        }),
    );
  };

  const fight = (node) => {
    const run = store.get().road;
    const p = persona(node.persona);
    const theirs = personaOctave(p);
    const floor = run.floor;
    setBattle({
      mode: 'road',
      mine: run.deck.slice(),
      theirs,
      persona: p,
      title: p.name,
      sub: `The Long Road · ${KIND[node.kind].name}`,
      mods: [playerMods(run), enemyMods(node, floor, theirs)],
      music: node.kind === 'boss' ? 'boss' : undefined,
      resultKicker: `The Long Road · Stop ${floor + 1}`,
      rematch: false,
      continueLabel: 'Back to the road',
      onEnd: ({ won, finalWin, readsHit }) => {
        const out = [];
        store.update((s) => {
          afterDuel(s.road, won, CARDS);
          recordRival(s, p, { won, finalWin, readsHit });
          if (s.road.done === 'victory') out.push(['The Long Road', 'Cleared!']);
          else if (!won) out.push(['Lives left', String(s.road.lives)]);
          else out.push(['Reward', 'Choose one on the road']);
        });
        return out;
      },
      onContinue: (c) => c.go('road'),
    });
    ctx.go('battle', { t: Date.now() });
  };

  const drawRewards = (body, run) => {
    const label = (c) => {
      if (c.type === 'hero') return { k: 'New Champion', t: esc(CARDS[c.id].name), d: `Joins your road Octave in place of one you choose.`, card: c.id };
      if (c.type === 'upgrade') return { k: 'Upgrade', t: `${first(c.id)} +${c.n} ${STAT[c.stat]}`, d: 'For the rest of the run.', card: c.id };
      if (c.type === 'temper') return { k: 'Temper', t: `${first(c.id)}: +1 to every stat, +2 health`, d: 'Sit by the fire and sharpen a blade.', card: c.id };
      if (c.type === 'relic') return { k: 'Relic', t: esc(RELICS[c.id].name), d: esc(RELICS[c.id].text) };
      return { k: 'Rest', t: 'Recover a life', d: run.lives >= LIVES ? 'You are already at full lives.' : `Back to ${run.lives + 1} lives.` };
    };
    body.innerHTML = `<div class="kicker" style="margin-top:12px">${run.at?.kind === 'rest' ? 'The campfire' : run.at?.kind === 'shrine' ? 'The shrine' : 'Your reward'} · choose one</div>
      <div class="road-rewards">${run.pending
        .map((c, i) => {
          const L = label(c);
          return `<button class="road-reward panel" data-take="${i}"><div class="road-reward__art" data-art="${i}"></div><div><div class="kicker">${L.k}</div><b>${L.t}</b><span>${L.d}</span></div></button>`;
        })
        .join('')}</div>`;
    run.pending.forEach((c, i) => {
      const L = label(c);
      if (L.card) body.querySelector(`[data-art="${i}"]`).appendChild(renderCard(c.type === 'hero' ? CARDS[c.id] : buffed(c.id, run), { width: 56, flat: true }));
      else body.querySelector(`[data-art="${i}"]`).innerHTML = icon(c.type === 'relic' ? 'i-read' : 'i-health');
    });
    body.querySelectorAll('[data-take]').forEach(
      (b) =>
        (b.onclick = () => {
          const i = +b.dataset.take;
          const c = run.pending[i];
          if (c.type !== 'hero') {
            sfx.select();
            store.update((x) => take(x.road, i));
            return draw();
          }
          // a new hero replaces one you carry
          const m = ctx.modal(`<div class="kicker">${esc(CARDS[c.id].name)} joins you</div><div class="h-display" style="font-size:20px;margin:4px 0 10px">Who stays behind?</div><div class="road-swap" data-swap></div>`);
          const box = m.el.querySelector('[data-swap]');
          for (const id of run.deck) {
            const cell = document.createElement('button');
            cell.className = 'road-swap__cell';
            cell.appendChild(renderCard(buffed(id, run), { width: 70, flat: true }));
            if (run.buffs[id]) cell.insertAdjacentHTML('beforeend', `<em>loses ${upText(run.buffs[id])}</em>`);
            cell.onclick = () => {
              m.close?.();
              sfx.select();
              store.update((x) => take(x.road, i, id));
              draw();
            };
            box.appendChild(cell);
          }
        }),
    );
  };

  const drawEnd = (s, run) => {
    const pay = runRewards(run);
    if (!run.paid) {
      // the vault pays the run (bounded to what the road can pay)
      vault.act('roadEnd', { floor: run.floor, wins: run.wins, done: run.done }).catch((e) => ctx.toast(e.message));
      store.update((x) => {
        x.road.paid = true;
        const b = (x.roadBest ||= { floor: 0, clears: 0 });
        b.floor = Math.max(b.floor, run.floor + (run.done === 'victory' ? 1 : 0));
        if (run.done === 'victory') (b.clears++, import('../core/cloud.js').then((c) => c.contribute('road')));
      });
    }
    const won = run.done === 'victory';
    root.innerHTML = `<div class="kicker">The Long Road</div>
      <div class="h1 ${won ? 'gold' : ''}">${won ? 'The Archivist falls' : run.done === 'abandoned' ? 'You turn back' : 'Fallen on the road'}</div>
      <div class="lore" style="margin:6px 0 12px">${won ? 'The last page closes. For once, the road remembers you.' : `You reached stop ${run.floor + 1} of ${FLOORS}.`}</div>
      <div class="panel">
        <div class="objective"><span class="grow">Duels won</span><b>${run.wins}</b></div>
        <div class="objective"><span class="grow">Relics carried</span><b>${run.relics.length}</b></div>
        <div class="objective"><span class="grow">Embers</span><b class="gold">+${pay.embers}</b></div>
        ${pay.tickets ? `<div class="objective"><span class="grow">Pack Tickets</span><b class="gold">+${pay.tickets}</b></div>` : ''}
        ${pay.collector ? `<div class="objective"><span class="grow">Collector + Firstfall Packs</span><b class="gold">+${pay.collector} · +${pay.event}</b></div>` : ''}
      </div>
      <div class="road-deck" data-deck style="margin-top:12px"></div>
      <button class="btn btn--big" data-new style="margin-top:14px">New run</button>`;
    const deck = root.querySelector('[data-deck]');
    for (const id of run.deck) deck.appendChild(renderCard(buffed(id, run), { width: 70, flat: true }));
    root.querySelector('[data-new]').onclick = () => {
      store.update((x) => (x.road = null));
      draw();
    };
  };

  draw();
}
