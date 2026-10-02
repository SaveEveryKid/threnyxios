// THRENYX client entry: shell, router, global UI helpers.
import { installIcons, icon } from './ui/icons.js';
import { initAudio, setSound, sfx } from './core/audio.js';
import { setHaptics } from './core/haptics.js';
import { setMotion, requestSensors } from './core/motion.js';
import * as store from './core/store.js';
import { artReady, uiArt } from './art/index.js';
import { hasBattle, peekBattle, takeBattle } from './core/session.js';
import * as music from './core/music.js';
import { splash } from './ui/splash.js';
import { forgetOffscreen } from './ui/card.js';
import { packText } from '../../engine/goals.js';
import * as cloud from './core/cloud.js';
import './ui/install.js'; // catch the browser's install offer from the start
import { startCrumbs, screenIs } from './core/crumbs.js';
import { rememberRef, guestStart } from './core/vault.js';
import { track } from './core/funnel.js';
import { VERSION } from './version.js';
import * as notify from './core/notify.js';

const SCREENS = {
  home: () => import('./screens/home.js'),
  battle: () => import('./screens/duel.js'),
  play: () => import('./screens/play.js'),
  packs: () => import('./screens/packs.js'),
  vault: () => import('./screens/vault.js'),
  octave: () => import('./screens/octave.js'),
  daily: () => import('./screens/daily.js'),
  draft: () => import('./screens/draft.js'),
  story: () => import('./screens/story.js'),
  codex: () => import('./screens/codex.js'),
  more: () => import('./screens/more.js'),
  rivals: () => import('./screens/rivals.js'),
  trade: () => import('./screens/trade.js'),
  tutorial: () => import('./screens/tutorial.js'),
  road: () => import('./screens/road.js'),
  puzzle: () => import('./screens/puzzle.js'),
  shop: () => import('./screens/shop.js'),
  online: () => import('./screens/online.js'),
  alliance: () => import('./screens/alliance.js'),
  oktober: () => import('./screens/oktober.js'),
  rules: () => import('./screens/rules.js'),
  welcome: () => import('./screens/welcome.js'),
  duel: () => import('./screens/challenge.js'),
  save: () => import('./screens/save.js'),
  invite: () => import('./screens/invite.js'),
  world: () => import('./screens/world.js'),
  friends: () => import('./screens/friends.js'),
};
const NAV = [
  ['home', 'u-vault', 'Home'],
  ['play', 'u-battle', 'Battle'],
  ['packs', 'u-pack', 'Packs'],
  ['vault', 'u-vault', 'Vault'],
  ['more', 'i-read', 'More'],
];
const FULLSCREEN = new Set(['battle', 'draft']);
// which ui/ background each screen uses (default: its own name)
const SCREEN_ART = { play: 'home', road: 'story', puzzle: 'daily', shop: 'packs', oktober: 'oktober', rules: 'codex', world: 'codex', friends: 'home' };

const app = document.getElementById('app');
let current = null;
let cleanup = null;

export function go(name, params = {}) {
  const q = new URLSearchParams(params).toString();
  location.hash = '#/' + name + (q ? '?' + q : '');
}

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '') || 'home';
  const [name, q] = h.split('?');
  return { name: SCREENS[name] ? name : 'home', params: Object.fromEntries(new URLSearchParams(q || '')) };
}

export function toast(text) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  app.appendChild(t);
  setTimeout(() => t.remove(), 2700);
}

export function modal(html, { onClose, closable = true } = {}) {
  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = (closable ? `<button class="modal__close" aria-label="Close">${icon('u-close')}</button>` : '') + html;
  const close = () => {
    m.remove();
    onClose?.();
  };
  m.querySelector('.modal__close')?.addEventListener('click', close);
  // tapping the dark space around the content closes it too
  if (closable) m.addEventListener('click', (e) => e.target === m && close());
  app.appendChild(m);
  return { el: m, close };
}

function topbar() {
  const s = store.get();
  const t = Object.values(s.profile.tickets).reduce((a, b) => a + b, 0) + s.free.charges;
  return `<div class="topbar"><div class="brand">THRENYX</div>
    <span class="res res--tickets" title="Pack Tickets"><i></i>${t}</span>
    <span class="res res--embers" title="Embers"><i></i>${s.profile.embers}</span>
    <a class="res res--chimes" title="Chimes · open the Shop" href="#/shop"><i></i>${s.profile.chimes}</a></div>`;
}

function nav(active) {
  const s = store.get();
  const packDot = s.free.charges > 0 || Object.values(s.profile.tickets).some((n) => n > 0);
  return `<nav class="nav">${NAV.map(
    ([id, ic, label]) =>
      `<a href="#/${id}" class="${active === id ? 'on' : ''}">${icon(ic)}<span>${label}</span>${(id === 'packs' && packDot) || (id === 'home' && notify.waiting()) ? '<i class="dot"></i>' : ''}</a>`,
  ).join('')}</nav>`;
}

// Until training is finished, the tutorial (and its battles) is the whole game.
const training = () => store.get().onboard !== 'done';

export function refreshChrome() {
  if (!current || FULLSCREEN.has(current) || current === 'welcome' || training()) return;
  app.querySelector('.topbar')?.remove();
  app.querySelector('.nav')?.remove();
  app.insertAdjacentHTML('beforeend', topbar() + nav(navFor(current)));
}
const navFor = (n) => ({ world: 'home', octave: 'vault', daily: 'home', story: 'home', codex: 'more', rivals: 'more', trade: 'more' })[n] || n;

// Which track each screen plays (battles choose their own).
const SCORE = { world: 'codex', tutorial: 'training', packs: 'pack', trade: 'trade', story: 'story', daily: 'daily', draft: 'draft', codex: 'codex', road: 'story', puzzle: 'daily', shop: 'pack' };
function scoreFor(name) {
  // lighter effects (iPhone): one score under every menu. Each track change
  // loads a new track, and phones kill pages that keep doing it.
  if (store.get().settings.lite && name !== 'tutorial') return 'main';
  if (SCORE[name]) return SCORE[name];
  // the Hush: for the first forty-one minutes after midnight, home falls quiet
  const d = new Date();
  if (name === 'home' && d.getHours() === 0 && d.getMinutes() < 41) return 'hush';
  return 'main';
}

// Playing needs a free account (the collection lives on the server). Until the
// first sign-in check is done, wait for it (briefly, in case it's slow).
async function signedIn() {
  if (!cloud.enabled) return false;
  await Promise.race([cloud.ready, new Promise((r) => setTimeout(r, 6000))]);
  return !!cloud.currentUser();
}

// screens anyone can open; screens a guest saves their profile for; screens that work during training
const OPEN = new Set(['rules', 'world', 'duel']);
const ACCOUNT_ONLY = new Set(['online', 'alliance', 'invite', 'friends']);
const TRAINING_OK = new Set(['tutorial', 'world', 'duel', 'save']);

async function route() {
  let { name, params } = parseHash();
  // a training lesson's battle is local (no rewards, nothing on the server), so it
  // plays signed in or not, like the rest of training
  const lesson = training() && name === 'battle' && hasBattle();
  // the Rules, the story of the world and a friend's Duel invitation are for
  // everyone, signed in or not (the invitation makes a guest when it's accepted)
  if (!OPEN.has(name) && !lesson && !(await signedIn())) {
    name = 'welcome';
    params = {};
  } else if (name === 'welcome') name = 'home';
  // a guest (docs/18-guest-play.md): Ranked, Alliances and invite rewards need a saved profile
  if (cloud.isGuest() && ACCOUNT_ONLY.has(name)) {
    params = { why: name };
    name = 'save';
  }
  // a guest's Duel: the allowance is checked as it starts (never during it)
  if (name === 'battle' && hasBattle() && cloud.isGuest()) {
    const spec = peekBattle();
    if (!spec.remote && spec.mode !== 'tutorial' && !spec.noRewards) {
      const g = await guestStart();
      if (!g.ok) {
        takeBattle();
        history.replaceState(null, '', '#/save?why=limit');
        name = 'save';
        params = { why: 'limit' };
      } else track('guest_duel_started', { mode: String(spec.mode || 'duel').slice(0, 20) });
    }
  }
  if (training() && !TRAINING_OK.has(name) && !(name === 'battle' && hasBattle())) {
    history.replaceState(null, '', '#/tutorial');
    name = 'tutorial';
    params = {};
  }
  screenIs(name);
  store.tickFree();
  if (cleanup) {
    try {
      cleanup();
    } catch (e) {
      console.error(e);
    }
    cleanup = null;
  }
  current = name;
  for (const c of [...app.children]) if (!c.classList.contains('splash')) c.remove(); // the splash stays over the first screen
  forgetOffscreen(); // the old screen's cards are gone: let them be freed
  // the score: battles choose their own; training has its march; the rest, the main theme
  if (name !== 'battle') music.play(scoreFor(name));
  // painted screen background when delivered (battle sets its own arena)
  const bg = uiArt(SCREEN_ART[name] || name, true); // dimmed behind the screen, so the small copy
  app.classList.toggle('has-bg', !!bg && name !== 'battle');
  app.style.setProperty('--screen-bg', bg && name !== 'battle' ? `url("${bg}")` : 'none');
  const root = document.createElement('div');
  root.className = 'screen' + (FULLSCREEN.has(name) ? ' screen--full' : '');
  try {
    const mod = await SCREENS[name]();
    if (current !== name) return;
    app.appendChild(root);
    if (!FULLSCREEN.has(name) && name !== 'welcome' && !training()) app.insertAdjacentHTML('beforeend', topbar() + nav(navFor(name)));
    cleanup = (await mod.render(root, params, { go, toast, modal, refreshChrome })) || null;
    // a screen that is still empty a few seconds later is broken: say so instead of showing nothing
    if (!['tutorial', 'battle', 'draft'].includes(name))
      setTimeout(() => current === name && root.isConnected && !root.childElementCount && !root.textContent.trim() && showFailure(root, name, new Error(`The ${name} screen drew nothing`)), 3000);
  } catch (e) {
    // never a blank screen: say what broke, and offer a way out
    console.error('screen', name, e);
    // a stale cached file from an older version (common right after an update):
    // reload once to fetch the current version before showing an error
    if (/import|module|binding|fetch/i.test(String(e?.message)) && !sessionStorage.getItem('threnyx.reloaded')) {
      try {
        sessionStorage.setItem('threnyx.reloaded', '1');
      } catch {}
      return location.reload();
    }
    if (!root.isConnected) app.appendChild(root);
    showFailure(root, name, e);
  }
}

const escHtml = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function showFailure(root, name, e) {
  const msg = String(e?.stack || e?.message || e).split('\n').slice(0, 4).join('\n');
  root.innerHTML = `<div class="kicker">Something went wrong</div><div class="h1" style="font-size:24px">This screen didn’t load</div>
    <div class="muted" style="font-size:14px;margin:6px 0 10px">Send a screenshot of this to the developer.</div>
    <pre class="panel" style="white-space:pre-wrap;font-size:11px;padding:10px;user-select:text;-webkit-user-select:text">${escHtml(name + ' · ' + VERSION + '\n' + msg)}</pre>
    <button class="btn" data-reload style="margin-top:10px">Reload the game</button>`;
  root.querySelector('[data-reload]').onclick = () => location.reload();
}

// any error outside a screen's own drawing: show it once, so it can be reported
let shownError = false;
function reportError(e) {
  if (shownError) return;
  shownError = true;
  const m = String(e?.reason?.message || e?.message || e?.reason || e || 'unknown error').slice(0, 160);
  setTimeout(() => toast('Error: ' + m), 300);
}
addEventListener('error', (e) => e.message && !/ResizeObserver/.test(e.message) && reportError(e));
addEventListener('unhandledrejection', reportError);

function boot() {
  installIcons();
  const s = store.load();
  // the last session was killed mid-play: lighter effects from now on
  const crash = startCrumbs();
  if (crash && !s.settings.lite) {
    store.update((x) => (x.settings.lite = true));
    setTimeout(() => toast('The game restarted in the middle of a match. Lighter effects are on (More → Settings).'), 1200);
  }
  // iPhone Safari runs out of graphics memory on the full battle effects, so
  // phones start on lighter effects (More → Settings turns them back up)
  // (an iPhone on "Request Desktop Site" says it is a Mac, but a Mac has no touchscreen)
  const iOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 0);
  if (store.get().settings.lite === undefined && iOS) store.update((x) => (x.settings.lite = true));
  app.classList.toggle('lite', !!store.get().settings.lite);
  console.info('THRENYX', VERSION);
  setSound(s.settings.sound);
  setHaptics(s.settings.haptics);
  setMotion(s.settings.motion ?? true);
  music.setMusic(s.settings.music ?? true);
  // Audio can only start after a gesture.
  const unlock = () => {
    initAudio();
    music.unlock();
    window.removeEventListener('pointerdown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  // iOS only grants motion sensors from a completed tap (click, not
  // pointerdown), so the first taps anywhere ask until it's live or refused.
  const askMotion = async () => {
    if (!(store.get().settings.motion ?? true)) return;
    const st = await requestSensors();
    if (st === 'live' || st === 'denied' || st === 'unsupported' || st === 'pending') window.removeEventListener('click', askMotion);
  };
  window.addEventListener('click', askMotion);
  document.addEventListener('click', (e) => {
    if (e.target.closest('.nav a')) sfx.nav();
  });
  window.addEventListener('hashchange', route);
  store.onChange(() => refreshChrome());
  artReady.then(() => {
    // the full Firstfall on the first launch of the day, a short one after
    const day = store.dayKey();
    const full = store.get().splashDay !== day && !matchMedia('(prefers-reduced-motion: reduce)').matches && !/[?&]duel=|#\/duel/.test(location.href); // an invitation gets the short one
    splash(app, { full }).then(() => {
      sfx.title();
      store.update((x) => (x.splashDay = day));
    });
    // a friend's Duel link (threnyxtcg.com/?duel=CODE): straight to the invitation, and the
    // address keeps pointing at it (a refresh comes back to the same invitation)
    const duel = new URLSearchParams(location.search).get('duel');
    if (duel) {
      const code = duel.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      const ref = new URLSearchParams(location.search).get('ref');
      history.replaceState(null, '', location.pathname + (ref ? `?ref=${encodeURIComponent(ref)}` : '') + `#/duel?code=${code}`);
    }
    // a friend link (threnyxtcg.com/?friend=CODE): add them once there's a saved profile
    const friend = new URLSearchParams(location.search).get('friend');
    if (friend && !duel) {
      import('./screens/friends.js').then((f) => f.rememberFriendCode(friend));
      history.replaceState(null, '', location.pathname + '#/friends');
    }
    route(); // the first screen loads underneath
    // trade offers, friend requests and messages: a banner, a dot on Home, the app-icon number
    notify.onChange(() => refreshChrome());
    cloud.onUser((u) => (u && !cloud.isGuest(u) ? notify.start({ go }) : notify.stop()));
    // accounts: a save loaded from the cloud replaces this device's, so redraw
    // an invite link (threnyxtcg.com/?ref=CODE): keep the code for after sign-in, tidy the address
    const ref = new URLSearchParams(location.search).get('ref');
    if (ref) (rememberRef(ref), history.replaceState(null, '', location.pathname + location.hash));
    // a first visit (no player yet): the top of the funnel
    cloud.ready.then(() => !cloud.currentUser() && track('visitor_landing', { invite: !!duel }, { oncePerSession: true }));
    cloud.init({
      onLoaded: () => {
        toast('Progress loaded from your account');
        if (location.hash.startsWith('#/tutorial')) go('home');
        else route();
      },
      onPurchase: (got) => {
        toast(`Thank you! ${got.map((p) => p.name).join(', ')} added.`);
        refreshChrome();
      },
      onChange: () => (location.hash.startsWith('#/tutorial') && store.get().onboard === 'done' ? go('home') : route()),
      onRecovery: () => import('./ui/account.js').then((a) => a.openSetPassword({ go, toast, modal, refreshChrome }, { recovery: true })),
      onEventPacks: (got) => {
        const n = got.reduce((a, g) => a + g.packs, 0);
        toast(`Oktoberfest reward: +${n} Oktoberfest Pack${n > 1 ? 's' : ''} · open ${n > 1 ? 'them' : 'it'} in Packs`);
        refreshChrome();
      },
      onReferral: (got) => {
        if (got.claimed) return toast(got.claimed.message);
        const parts = [];
        if (got.referrals?.newly) parts.push(`${got.referrals.newly} friend${got.referrals.newly > 1 ? 's' : ''} you invited now count${got.referrals.newly > 1 ? '' : 's'}: ${packText(got.referrals.packs)}`);
        if (got.welcome) parts.push(`Welcome gift from your invite: ${packText(got.welcome)}`);
        if (parts.length) toast(parts.join(' · '));
        refreshChrome();
      },
      onAward: (won) => {
        // a tournament prize: the one-of-one, shown full size
        const c = won[0];
        import('./ui/card.js').then(({ renderCard }) => {
          const m = modal(`<div class="kicker" style="text-align:center">${c.event} Champion</div><div class="h-display" style="text-align:center;font-size:26px;margin:4px 0 12px">${c.name} is yours</div><div data-card style="display:flex;justify-content:center"></div><div class="lore" style="text-align:center;margin-top:12px">One copy, ever. Your win is written into its history.</div>`);
          import('../../engine/cards/index.js').then(({ CARDS }) => m.el.querySelector('[data-card]').appendChild(renderCard(CARDS[c.id], { size: 'full', width: Math.min(300, innerWidth - 40), tilt: true })));
        });
        refreshChrome();
      },
      onAlliance: (paid) => {
        toast(`Alliance chest: ${paid.map((p) => packText(p.reward)).join(' · ')}`);
        refreshChrome();
      },
    });
  });
}
boot();
