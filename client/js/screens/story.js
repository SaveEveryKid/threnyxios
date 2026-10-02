// STORY — the Firstfall chapters. Each one leans on one idea, and its Story
// Clash is built to let it land. (Rules are taught first, in screens/tutorial.js.)
import * as store from '../core/store.js';
import { setBattle } from '../core/session.js';
import { CARDS } from '../../../engine/cards/index.js';
import { allowedOrders } from '../../../engine/battle.js';
import { esc } from '../ui/card.js';
import { sfx } from '../core/audio.js';
import { storyArt } from '../art/index.js';
import * as music from '../core/music.js';

const P = (speaker, text) => ({ speaker, text });
const HUSH = { id: 'hush', name: 'A Shape in the Hush', title: '???', skill: 0.1, bias: { order: 'strike', p: 0.5 }, faction: 'margin' };
// "Near silence": either Voice is low enough that the next exchanges decide it.
const nearSilence = (st) => st.p[0].voice <= 12 || st.p[1].voice <= 12;

export const CHAPTERS = [
  {
    title: 'The Fall', teaches: 'Deploy → Order → Reveal',
    panels: [
      P('', '<em>Cinderhold. The rampart. Midnight.</em>'),
      P('Tamsin', '"Sir Hadric. Sir Hadric, the sky—"'),
      P('Hadric', '"I see it, girl."'),
      P('', '<em>A star moves. Stars do not move.</em>'),
      P('', '<em>Across the Meridian, a clockmaker stops every clock in the room. A child in Lanternfast stops singing for the first time in her life. In the Margin, a man with half a face looks up — and smiles.</em>'),
      P('Hadric', '"Something is on the wall. Tamsin — your lantern. Stay behind me."'),
    ],
    battle: () => ({
      mine: ['tamsin', 'hadric', 'pip', 'garrick', 'wynn', 'nan', 'sera', 'joss'],
      theirs: ['inklings', 'smudge', 'grael', 'corbel', 'verity', 'mote', 'fenwick', 'dask'],
      persona: HUSH, title: 'A Shape in the Hush', sub: 'Chapter I',
      tutorial: { noFocus: true, noRead: true }, initiative: 0,
      hints: {
        deploy: (st) => (st.round === 1 ? 'Tap a Champion, then a glowing lane. Two this round.' : st.p[0].lanes.some((u) => !u) ? 'An empty lane lets their Champion hit your Voice. Fill it.' : ''),
        command: (st) => (st.round <= 2 ? 'STRIKE beats SCHEME · SCHEME beats GUARD · GUARD beats STRIKE' : st.round === 3 ? 'STRIKE hits the Champion opposite. SCHEME hits their Voice. GUARD shields, and punishes a STRIKE.' : ''),
      },
    }),
    after: 'clash2',
  },
  {
    title: 'Into the Blank', teaches: 'Lanes, Voice and the fallen',
    panels: [
      P('', '<em>The crater. White fog. Something in the centre is humming.</em>'),
      P('Vega', '"Don\'t touch her."'),
      P('Nyx', '"I wasn\'t going to touch her. I was going to take her."'),
      P('Lirae', '<em>(eyes closed)</em> "You\'re both afraid. You\'re afraid in the same key."'),
      P('', '<em>Behind them, bells on crossbow bolts. Maren Solt\'s hunters have arrived.</em>'),
    ],
    battle: () => ({
      mine: null, theirs: ['maren', 'tamar', 'marta', 'horne', 'lina', 'teodor', 'anselm', 'ottilie'],
      persona: { id: 'maren', name: 'Maren Solt', title: 'Hush-Hunter', skill: 0.3, bias: { order: 'strike', p: 0.3 } }, title: 'Maren Solt', sub: 'Chapter II',
      tutorial: { noFocus: true, noRead: true },
      hints: {
        deploy: (st) => (st.round === 1 ? 'Your Octave: 3 in hand, the rest in Reserve. You draw one each round.' : st.round === 2 ? 'Champions stay until they fall. A fallen Champion does not return.' : ''),
        command: (st) => (st.round === 1 ? 'Their Voice is the bar at the top. Bring it to zero.' : st.round === 2 ? 'Both Octaves are public. Tap the vault icon to see what they could still play.' : ''),
      },
    }),
    after: 'clash3',
  },
  {
    title: 'The Claims', teaches: 'Focus',
    panels: [
      P('', '<em>Coda. The Stillhouse. Nobody\'s footsteps make a sound.</em>'),
      P('', '<em>The First Silence rings a bell with no clapper. Once.</em>'),
      P('Oriel Dane', '"CLAIMS."'),
      P('', '<em>Aurelle Vantaine and Caska Vell see each other across the Stillhouse floor for the first time in twenty-one years. Neither speaks.</em>'),
    ],
    battle: () => ({
      mine: null, theirs: ['oriel', 'doran', 'dunstan', 'tallis', 'hester', 'aria', 'osric', 'gorm'],
      persona: { id: 'oriel', name: 'Oriel Dane', title: 'Arbiter-Primus', skill: 0.45, bias: { order: 'guard', p: 0.2 } }, title: 'Oriel Dane', sub: 'Chapter III',
      tutorial: { noRead: true },
      hints: {
        command: (st) => (st.round === 1 ? 'FOCUS adds +2 Power to one Champion. You have 3 for the whole match.' : st.p[0].focus === 0 ? '' : st.round === 3 ? 'Holding Focus for the end is a strategy. So is spending it early.' : ''),
      },
    }),
    after: 'clash4', unlock: 'focus',
  },
  {
    title: 'First Blood of the Accord', teaches: 'READ',
    panels: [
      P('', '<em>The Margin. Night. A scaffold-town is burning.</em>'),
      P('', '<em>Corvin Vantaine did not file a Claim. He rode into the Blank with the Cinder Widow, looking for the girl.</em>'),
      P('Dask', '"This bridge is held."'),
      P('Corvin', '"By one man? How very Crown of you."'),
      P('', '<em>Corvin always strikes when he is one win from victory. Everyone knows it. Everyone forgets it.</em>'),
    ],
    battle: () => ({
      mine: null, theirs: ['corvin', 'widow', 'rhosyn', 'bastian', 'sera', 'pip', 'joss', 'hollis'],
      persona: { id: 'corvin', name: 'Corvin Vantaine', title: 'The Pale Prince', skill: 0.55, bias: { order: 'strike', p: 0.25 } }, title: 'Corvin Vantaine', sub: 'Chapter IV',
      script: {
        // Near the end, Corvin always STRIKES. Everyone knows it. Everyone forgets it.
        command: (st, base) => {
          if (!nearSilence(st)) return null;
          const orders = st.p[1].lanes.map((u, l) => (u ? (allowedOrders(st, 1, l).includes('strike') ? 'strike' : base.orders[l]) : null));
          return { ...base, orders, read: null };
        },
      },
      hints: {
        command: (st) =>
          nearSilence(st) && st.p[0].reads > 0 ? 'A Voice is failing. What does Corvin always do? READ him.' : st.round === 1 ? 'READ: tap READ, then an enemy facing one of yours, and call its Order. Right: its Order is cancelled and you get +3. Wrong: −2.' : '',
      },
      winLine: 'I knew you were going to do that.',
    }),
    after: 'done', unlock: 'read',
  },
  {
    title: "Iver's Choice", teaches: 'Shields and Initiative',
    panels: [
      P('', '<em>The Quiet send a Silencer to arrest the Regent\'s brother. They send Iver Hale.</em>'),
      P('Hadric', '"Iver."'),
      P('Iver', '"You remembered it."'),
      P('Hadric', '"I never forgot it. I stopped saying it."'),
    ],
    battle: () => ({ mine: null, theirs: ['iver', 'senna', 'veyra', 'doran', 'lucan', 'gorm', 'dunstan', 'ossian'], persona: { id: 'iver', name: 'Iver Hale', title: 'The Turned Knight', skill: 0.65, bias: { order: 'guard', p: 0.25 } }, title: 'Iver Hale', sub: 'Chapter V' }),
  },
  {
    title: 'The Singing', teaches: 'Winning without resources',
    panels: [
      P('', '<em>Lirae begins to hum. Everyone who hears her remembers something that never happened to them.</em>'),
      P('Absolom', '"Carry her to Lanternfast. The world will hear her."'),
      P('Caska', '"No."'),
      P('', '<em>Sister Morrow takes Caska\'s lantern. For the first time in twenty years, the flame goes out.</em>'),
    ],
    battle: () => ({ mine: null, theirs: ['morrow', 'absolom', 'horne', 'procession', 'sleeplessChoir', 'lina', 'tobin', 'bess'], persona: { id: 'morrow', name: 'Sister Morrow', title: 'Hymn of Ash', skill: 0.7, bias: { order: 'strike', p: 0.2 } }, title: 'Sister Morrow', sub: 'Chapter VI', config: { focus: 0 } }),
  },
  {
    title: 'The Empty Portrait', teaches: 'Reading yourself',
    panels: [
      P('', '<em>Cinderhold. The Vantaine gallery. One frame has never held a painting.</em>'),
      P('', '<em>For one heartbeat, Aurelle sees a face in it: a man, older than her, with her mother\'s eyes.</em>'),
      P('Aurelle', '"Burn it."'),
      P('Old Nan', '"No, my lady. I don\'t think I will."'),
    ],
    battle: () => {
      const oct = store.get().octaves[store.get().active].cards;
      return { mine: null, theirs: oct.slice(), persona: { id: 'mirror', name: 'Your Memory', title: 'A mirror of your Octave', skill: 0.8, bias: null }, title: 'Your Memory', sub: 'Chapter VII' };
    },
  },
  {
    title: 'The Hush Lengthens', teaches: 'The Focus economy',
    panels: [
      P('', '<em>Carillon. Ottavio Brask is buying every tolled hour in the city.</em>'),
      P('Imre', '"You kept her drawings."'),
      P('Brask', '"I kept everything of hers, boy. That is what love is."'),
    ],
    battle: () => ({ mine: null, theirs: ['brask', 'amaranth', 'hesper', 'silas', 'debtHounds', 'twelveHanded', 'pellPim', 'hourbell'], persona: { id: 'brask', name: 'Ottavio Brask', title: 'The Tollmaster', skill: 0.85, bias: null }, title: 'Ottavio Brask', sub: 'Chapter VIII' }),
  },
  {
    title: 'SOMETHING HAS ARRIVED', teaches: 'The Rest',
    panels: [
      P('', '<em>At midnight, the Hush does not end.</em>'),
      P('', '<em>Forty-one minutes. Forty-two. Then it does not stop at all.</em>'),
      P('', '<em>Something walks out of the crater: a tall absence shaped like a person, made of the silence between notes.</em>'),
      P('', '<em>For the first time since the war, the Champions of every faction stand side by side.</em>'),
    ],
    battle: () => ({ mine: null, theirs: ['unrung', 'firstSilence', 'hollowKing', 'thessaly', 'blot', 'inklings', 'sable', 'veyra'], persona: { id: 'rest', name: 'The Rest', title: 'SOMETHING HAS ARRIVED', skill: 0.95, bias: null }, title: 'The Rest', sub: 'Chapter IX', config: { reads: 0 }, music: 'boss' }),
    sceneMusic: 'hush',
  },
  {
    title: 'Firstfall', teaches: 'Everything',
    panels: [
      P('', '<em>The Rest falls. In the silence afterward, Lirae opens her eyes for the first time.</em>'),
      P('', '<em>She walks to the edge of the Blank, past Aurelle, to the Hollow King — and says something no one hears.</em>'),
      P('', '<em>Aurelle looks at the Hollow King. The Hollow King looks at Aurelle.</em>'),
      P('', '<em>Both of them are crying. Neither of them knows why.</em>'),
    ],
    battle: () => ({ mine: null, theirs: ['aurelle', 'hadric', 'orla', 'brannoc', 'rhosyn', 'mira', 'cassius', 'seraphine'], persona: { id: 'aurelle', name: 'Aurelle Vantaine', title: 'The Ash Regent', skill: 1, bias: null }, title: 'Aurelle Vantaine', sub: 'Chapter X', music: 'boss', finale: true }),
  },
];

function playScene(ch, ctx, then) {
  const app = document.getElementById('app');
  const sc = document.createElement('div');
  sc.className = 'scene';
  const art = storyArt(CHAPTERS.indexOf(ch) + 1);
  if (art) sc.style.backgroundImage = `linear-gradient(to bottom, rgba(5,5,7,0) 35%, rgba(5,5,7,0.85) 62%, #050507 80%), url("${art}")`;
  let i = 0;
  const show = () => {
    const p = ch.panels[i];
    sc.innerHTML = `<div class="kicker" style="margin-bottom:auto;padding-top:20px">Chapter ${CHAPTERS.indexOf(ch) + 1} · ${esc(ch.title)}</div>
      <div class="scene__panel">${p.speaker ? `<span class="speaker">${esc(p.speaker)}</span>` : ''}${p.text}</div>
      <div class="scene__tap">Tap to continue</div>`;
    sfx.tap();
  };
  sc.onclick = () => {
    i++;
    if (i >= ch.panels.length) {
      sc.remove();
      then();
    } else show();
  };
  show();
  app.appendChild(sc);
}

export function startChapter(n, ctx) {
  const ch = CHAPTERS[n];
  if (ch.sceneMusic) music.play(ch.sceneMusic);
  playScene(ch, ctx, () => {
    const s = store.get();
    const b = ch.battle();
    const mine = b.mine || s.octaves[s.active].cards;
    setBattle({
      mode: 'story', chapter: n, ...b, mine, resultKicker: `Chapter ${n + 1} · ${ch.title}`, rematch: false,
      // the chapter's reward (engine/economy.js STORY_REWARDS) comes with the match result
      onEnd: ({ won }) => {
        const out = [];
        if (!won || !ch.unlock || store.get().unlock[ch.unlock]) return out;
        store.update((st) => (st.unlock[ch.unlock] = true));
        out.push(['Unlocked', ch.unlock === 'focus' ? 'Focus' : 'READ']);
        return out;
      },
      continueLabel: 'Continue',
      onContinue: (c) => c.go('story'),
      loseLine: 'The chapter waits for you. Try again.',
    });
    ctx.go('battle', { t: Date.now() });
  });
}

export function render(root, params, ctx) {
  const s = store.get();
  root.innerHTML = `<div class="kicker">Season I</div><div class="h1">Firstfall</div>
    <div class="lore" style="margin:4px 0 14px">A star has fallen into the Blank. Everyone wants what walked out of it.<br><span class="muted" style="font-size:13px;font-style:normal">Each chapter pays its reward the first time you clear it.</span></div>
    <div class="stack" data-list></div>`;
  const list = root.querySelector('[data-list]');
  CHAPTERS.forEach((ch, i) => {
    const locked = i > s.story.chapter;
    const done = i < s.story.chapter;
    const el = document.createElement('button');
    el.className = `chapter panel ${locked ? 'locked' : ''}`;
    el.style.cssText = 'border:0;color:inherit;text-align:left;cursor:pointer';
    el.innerHTML = `<div class="chapter__no">${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][i]}</div>
      <div class="grow"><div class="h-display" style="font-size:18px">${esc(ch.title)}</div><div class="muted" style="font-size:13px;margin-top:4px">${done ? 'Completed · replay' : locked ? 'Locked' : 'Teaches: ' + esc(ch.teaches)}</div></div>
      ${!locked && !done ? '<span class="tag tag--new">Next</span>' : ''}`;
    if (!locked) el.onclick = () => startChapter(i, ctx);
    list.appendChild(el);
  });
}
