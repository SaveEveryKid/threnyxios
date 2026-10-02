// LIVE VOICE — what the player sees: the voice chip in an online match, its
// sheet (mic, mute them, leave, report, block), the safety notice, the report
// form and Settings → Voice. The session itself is ./session.js.
import { icon } from '../ui/icons.js';
import { esc } from '../ui/card.js';
import { REASON_TEXT, NOTICE_VERSION } from '../../../engine/voice-policy.js';
import { sfx } from '../core/audio.js';
import { VoiceSession, voiceServer } from './session.js';
import * as store from '../core/store.js';

export const REPORT_CATEGORIES = [
  ['harassment', 'Harassment or bullying'],
  ['hate', 'Hate or abusive language'],
  ['sexual', 'Sexual content'],
  ['threats', 'Threats'],
  ['personal_info', 'Sharing or asking for personal info'],
  ['spam', 'Spam or disruptive'],
  ['other', 'Something else'],
];

export const NOTICE_HTML = `
  <div class="kicker">Voice chat</div><div class="h-display" style="font-size:22px;margin:4px 0 10px">Before you talk</div>
  <ul class="vc-notice">
    <li>Voice chat is <b>live and not recorded</b>. Nobody, us included, can play it back.</li>
    <li>Only join when you want to. Your microphone is only used after you tap <b>JOIN VOICE</b>, and you can turn it off at any time.</li>
    <li>Never share your real name, address, school, phone number or socials.</li>
    <li>You can <b>mute</b> the other player instantly, <b>leave</b>, <b>block</b> (it ends voice at once) or <b>report</b> them.</li>
    <li>Reports are read by a person. Breaking the rules can lose voice chat or the account.</li>
  </ul>`;

/** The safety notice; resolves true if accepted (and records it on the server). */
export function showNotice(ctx) {
  return new Promise((resolve) => {
    let done = false;
    const m = ctx.modal(`${NOTICE_HTML}<button class="btn" data-ok style="width:100%;margin-top:12px">I understand</button>`, { onClose: () => !done && resolve(false) });
    m.el.querySelector('[data-ok]').onclick = async () => {
      done = true;
      m.close();
      resolve(true);
    };
  });
}

/** Report the other player in a match (voice or not). */
export function openReport(ctx, matchId, name, { onBlocked } = {}) {
  const m = ctx.modal(`<div class="kicker">Report</div><div class="h-display" style="font-size:22px;margin:4px 0 10px">${esc(name)}</div>
    <div class="vc-cats">${REPORT_CATEGORIES.map(([id, t]) => `<label class="objective"><input type="radio" name="vc-cat" value="${id}"><span class="grow">${esc(t)}</span></label>`).join('')}</div>
    <textarea data-note maxlength="500" placeholder="What happened? (optional)" class="vc-note"></textarea>
    <label class="objective"><input type="checkbox" data-block checked><span class="grow">Also block ${esc(name)}</span></label>
    <div class="muted" style="font-size:12px;margin:6px 0 10px">Voice chat isn't recorded, so a person reviews your report with the match details. ${esc(name)} isn't told who reported them.</div>
    <button class="btn" data-send style="width:100%" disabled>Send report</button>`);
  const send = m.el.querySelector('[data-send]');
  m.el.querySelectorAll('[name=vc-cat]').forEach((r) => (r.onchange = () => (send.disabled = false)));
  send.onclick = async () => {
    const category = m.el.querySelector('[name=vc-cat]:checked')?.value;
    const block = m.el.querySelector('[data-block]').checked;
    send.disabled = true;
    try {
      await voiceServer.call('report', { match: matchId, category, note: m.el.querySelector('[data-note]').value.trim() || null, block });
      m.close();
      ctx.toast(block ? `Reported and blocked. Thanks for telling us.` : 'Reported. Thanks for telling us.');
      if (block) onBlocked?.();
    } catch (e) {
      send.disabled = false;
      ctx.toast(e.message);
    }
  };
}

export async function blockPlayer(ctx, matchId, name, onBlocked) {
  try {
    await voiceServer.call('block', { match: matchId });
    ctx.toast(`${name} is blocked. You won't hear or see their chat again.`);
    onBlocked?.();
  } catch (e) {
    ctx.toast(e.message);
  }
}

const LABEL = {
  off: 'JOIN VOICE',
  joining: 'CONNECTING…',
  waiting: 'VOICE · WAITING',
  live: 'VOICE ON',
  needs_tap: 'TAP TO ENABLE VOICE AUDIO',
  interrupted: 'VOICE AUDIO INTERRUPTED · REJOIN VOICE',
  error: 'VOICE · TRY AGAIN',
  locked: 'VOICE',
};
const SETUP = new Set(['age_unknown', 'card', 'id', 'pass', 'setting']);
const ERRORS = {
  mic_denied: 'Microphone access is off for THRENYX. On iPhone: Settings → Safari (or the THRENYX app) → Microphone → Allow, then try again.',
  mic_failed: 'Your microphone couldn’t start. Close other apps using it and try again.',
  connect_failed: 'Voice couldn’t connect. Your match is fine; try again in a moment.',
};

/**
 * The voice chip in an online match. Returns { session, destroy }. Never throws:
 * if voice can't start, the chip just doesn't appear.
 */
export function mountVoice(dl, { matchId, name, ctx, onBlocked }) {
  const chip = document.createElement('button');
  chip.className = 'vc-chip';
  chip.hidden = true;
  dl.appendChild(chip);
  let sheet = null;
  const closeSheet = () => {
    sheet?.remove();
    sheet = null;
  };
  const session = new VoiceSession({ matchId, onChange: (s) => draw(s) });
  function draw(s) {
    if (s.state === 'ended' || s.state === 'none' || s.state === 'checking' || (s.state === 'locked' && !SETUP.has(s.reason))) {
      chip.hidden = true;
      closeSheet();
      return;
    }
    chip.hidden = false;
    chip.dataset.state = s.state;
    const live = s.state === 'live' || s.state === 'waiting';
    const label = s.state === 'waiting' ? `VOICE · WAITING FOR ${name.toUpperCase()}` : s.state === 'live' && s.peer && !s.peer.mic ? `VOICE ON · ${name.toUpperCase()} MUTED` : LABEL[s.state] || 'VOICE';
    chip.innerHTML = `${icon(live && !s.micOn ? 'i-mic-off' : 'i-mic')}<span>${esc(label)}</span>`;
    chip.setAttribute('aria-label', label);
    if (sheet) fillSheet(s);
  }
  chip.onclick = (e) => {
    e.stopPropagation();
    const s = session;
    sfx.tap();
    if (s.state === 'off') return s.join(); // the tap itself: microphone + audio unlock
    if (s.state === 'needs_tap') return s.tapToPlay();
    if (s.state === 'interrupted') return s.rejoin();
    if (s.state === 'error' && s.reason !== 'mic_denied') return s.rejoin();
    if (sheet) return closeSheet();
    sheet = document.createElement('div');
    sheet.className = 'vc-sheet';
    sheet.onclick = (ev) => ev.stopPropagation();
    dl.appendChild(sheet);
    fillSheet(s);
    setTimeout(() => document.addEventListener('pointerdown', function away(ev) {
      if (!sheet || sheet.contains(ev.target) || ev.target.closest('.vc-chip')) return sheet && document.addEventListener('pointerdown', away, { once: true });
      closeSheet();
    }, { once: true }), 0);
  };
  function fillSheet(s) {
    if (s.state === 'locked') {
      sheet.innerHTML = `<div class="vc-sheet__t">Voice chat</div><p>${esc(REASON_TEXT[s.reason] || 'Voice chat isn’t available.')}</p>
        <button class="btn btn--sm" data-setup>Set up voice chat</button>`;
      sheet.querySelector('[data-setup]').onclick = () => {
        closeSheet();
        ctx.go('more', { voice: 'setup' });
      };
      return;
    }
    if (s.state === 'error') {
      sheet.innerHTML = `<div class="vc-sheet__t">Voice chat</div><p>${esc(ERRORS[s.reason] || s.message || ERRORS.connect_failed)}</p><button class="btn btn--sm" data-retry>Try again</button>`;
      sheet.querySelector('[data-retry]').onclick = () => (closeSheet(), s.rejoin());
      return;
    }
    const peer = s.peer?.joined ? (s.peer.mic ? `${esc(name)} is in voice` : `${esc(name)} is in voice (mic off)`) : `Waiting for ${esc(name)} to join…`;
    sheet.innerHTML = `<div class="vc-sheet__t">Voice chat</div><p class="muted">${peer}</p>
      <button class="vc-row" data-mic>${icon(s.micOn ? 'i-mic' : 'i-mic-off')}<span>${s.micOn ? 'Turn my mic off' : 'Turn my mic on'}</span></button>
      <button class="vc-row" data-peer>${icon('i-speaker')}<span>${s.peerMuted ? `Unmute ${esc(name)}` : `Mute ${esc(name)}`}</span></button>
      <button class="vc-row" data-leave><span>Leave voice</span></button>
      <div class="vc-sheet__sep"></div>
      <button class="vc-row vc-row--warn" data-report><span>Report ${esc(name)}</span></button>
      <button class="vc-row vc-row--warn" data-block><span>Block ${esc(name)}</span></button>`;
    sheet.querySelector('[data-mic]').onclick = () => s.setMic(!s.micOn);
    sheet.querySelector('[data-peer]').onclick = () => s.setPeerMuted(!s.peerMuted);
    sheet.querySelector('[data-leave]').onclick = () => (closeSheet(), s.leave());
    sheet.querySelector('[data-report]').onclick = () => (closeSheet(), openReport(ctx, matchId, name, { onBlocked: () => (s.refresh(), onBlocked?.()) }));
    const blk = sheet.querySelector('[data-block]');
    blk.onclick = () => {
      if (!blk.classList.contains('armed')) {
        blk.classList.add('armed');
        blk.querySelector('span').textContent = `Tap again to block ${name}`;
        return;
      }
      closeSheet();
      s.teardown();
      blockPlayer(ctx, matchId, name, () => (s.refresh(), onBlocked?.()));
    };
  }
  session.start().catch(() => (chip.hidden = true));
  return {
    session,
    destroy() {
      closeSheet();
      session.destroy();
      chip.remove();
    },
  };
}

// ---- Settings → Voice ----------------------------------------------------------------
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function voiceSettingsHtml() {
  return `<div class="panel vc-settings" style="margin-top:14px" data-voice-settings id="voice">
    <div class="kicker">Voice chat</div><div class="muted" style="font-size:13px;margin-top:6px">Loading…</div></div>`;
}

/** Fills the Voice panel in Settings; `params.voice` comes back from a Stripe check. */
export async function bindVoiceSettings(root, ctx, params = {}) {
  const box = root.querySelector('[data-voice-settings]');
  if (!box) return;
  const say = (html) => (box.innerHTML = `<div class="kicker">Voice chat</div>${html}`);
  // a guest saves their profile first
  const cloud = await import('../core/cloud.js');
  if (cloud.isGuest()) {
    say(`<div class="muted" style="font-size:13px;margin:6px 0 8px">${esc(REASON_TEXT.account)}</div><button class="btn btn--sm" data-save>Save profile</button>`);
    box.querySelector('[data-save]').onclick = () => import('../ui/save-profile.js').then((m) => m.openSaveProfile(ctx, { why: 'voice' }));
    return;
  }
  let st;
  try {
    if (params.voice === 'card') st = await voiceServer.call('card_confirm');
    else if (params.voice === 'id') st = await voiceServer.call('id_confirm');
    else st = await voiceServer.call('status');
  } catch (e) {
    return say(`<div class="muted" style="font-size:13px;margin-top:6px">${esc(/sign in/i.test(e.message) ? 'Sign in to use voice chat.' : 'Voice chat settings aren’t available right now.')}</div>`);
  }
  if (params.voice === 'card') ctx.toast(st.card.ok ? 'Card checked. Friend Voice is unlocked.' : st.pending ? 'The card check is still going through.' : st.card.prepaid ? 'Prepaid cards can’t be used for the check.' : 'The card check didn’t finish.');
  if (params.voice === 'id') ctx.toast(st.id ? 'ID checked. Thanks!' : st.pending ? 'Your ID check is still being reviewed.' : st.failed ? 'The ID check didn’t go through.' : 'Ranked Voice isn’t available on this account.');
  if (params.voice) history.replaceState(null, '', location.pathname + '#/more');
  const back = params.voice;
  delete params.voice; // a re-render of Settings doesn't confirm twice
  if (back === 'setup') box.scrollIntoView({ block: 'start' });
  draw(st);

  function draw(st) {
    const duck = store.get().settings.voiceDuck !== false;
    if (!st.flags.voice) return say(`<div class="muted" style="font-size:13px;margin-top:6px">Voice chat is switched off right now.</div>`);
    if (!st.ageSet) {
      const y = new Date().getFullYear();
      say(`<div class="muted" style="font-size:13px;margin:6px 0 8px">Talk to the other player during online matches. First, when were you born? You can only set this once.</div>
        <div class="row" style="gap:8px"><select data-month class="vc-select"><option value="">Month</option>${MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')}</select>
        <select data-year class="vc-select"><option value="">Year</option>${Array.from({ length: 100 }, (_, i) => y - i).map((v) => `<option>${v}</option>`).join('')}</select>
        <button class="btn btn--sm" data-age disabled>Save</button></div>`);
      const ok = () => (box.querySelector('[data-age]').disabled = !(box.querySelector('[data-month]').value && box.querySelector('[data-year]').value));
      box.querySelector('[data-month]').onchange = ok;
      box.querySelector('[data-year]').onchange = ok;
      box.querySelector('[data-age]').onclick = async () => {
        try {
          draw(await voiceServer.call('set_age', { month: +box.querySelector('[data-month]').value, year: +box.querySelector('[data-year]').value }));
        } catch (e) {
          ctx.toast(e.message);
        }
      };
      return;
    }
    // a declared minor (or a restricted account): one quiet line, no ways around it
    if (st.friend.reason === 'age' || st.friend.reason === 'restricted') {
      return say(`<div class="muted" style="font-size:13px;margin-top:6px">${esc(REASON_TEXT[st.friend.reason])}</div>`);
    }
    const friendNeeds = !st.card.ok;
    const rankedNeeds = [!st.id && 'id', !st.pass && 'pass'].filter(Boolean);
    say(`
      <label class="objective"><span class="grow">Friend Voice<small>Talk in Friend Challenges, with people you sent your code to.${friendNeeds ? ' Needs a quick card check (credit or debit, no charge).' : ''}</small></span>
        <input type="checkbox" data-pref="friend" ${st.prefs.friend ? 'checked' : ''} ${friendNeeds || !st.flags.friend ? 'disabled' : ''}></label>
      ${friendNeeds ? `<button class="btn btn--sm btn--ghost" data-card>${st.card.prepaid ? 'Try a different card' : 'Check a card'}</button>` : ''}
      <label class="objective"><span class="grow">Ranked Voice<small>Talk with players you're matched with. Needs a one-time ID check (18+) and the Season Pass.</small></span>
        <input type="checkbox" data-pref="ranked" ${st.prefs.ranked ? 'checked' : ''} ${rankedNeeds.length || !st.flags.ranked ? 'disabled' : ''}></label>
      ${rankedNeeds.includes('id') ? `<button class="btn btn--sm btn--ghost" data-id>Check my ID</button>` : ''}
      ${rankedNeeds.includes('pass') ? `<button class="btn btn--sm btn--ghost" data-pass>Get the Season Pass</button>` : ''}
      <label class="objective"><span class="grow">Reduce music during voice chat</span><input type="checkbox" data-duck ${duck ? 'checked' : ''}></label>
      <button class="btn btn--sm btn--ghost" data-blocks>Blocked players</button>
      <button class="btn btn--sm btn--ghost" data-notice>Voice chat safety</button>
      ${st.ready.audio ? '' : '<div class="muted" style="font-size:12px;margin-top:8px">Voice chat is still being set up on our side. Your settings are saved.</div>'}`);
    box.querySelectorAll('[data-pref]').forEach((c) => (c.onchange = async () => {
      const on = c.checked;
      let notice;
      if (on && !st.notice.accepted) {
        if (!(await showNotice(ctx))) return (c.checked = false);
        notice = NOTICE_VERSION;
      }
      try {
        draw((st = await voiceServer.call('prefs', { [c.dataset.pref]: on, notice })));
      } catch (e) {
        c.checked = !on;
        ctx.toast(e.message);
      }
    }));
    const go = async (action, label) => {
      try {
        const r = await voiceServer.call(action, { returnTo: location.origin + location.pathname });
        location.href = r.url;
      } catch (e) {
        ctx.toast(e.message || `${label} isn't available right now.`);
      }
    };
    box.querySelector('[data-card]')?.addEventListener('click', () => go('card_start', 'The card check'));
    box.querySelector('[data-id]')?.addEventListener('click', () => {
      const m = ctx.modal(`<div class="kicker">ID check</div><div class="h-display" style="font-size:22px;margin:4px 0 10px">Once, for Ranked Voice</div>
        <div class="lore" style="font-size:14px;line-height:1.5">Our payments partner Stripe checks a photo ID and a selfie. We only keep the answer: 18 or over, or not. Stripe is asked to delete the images and details once it's done. Stripe's privacy policy applies to the check.</div>
        <button class="btn" data-go style="width:100%;margin-top:12px">Start the ID check</button>`);
      m.el.querySelector('[data-go]').onclick = () => (m.close(), go('id_start', 'The ID check'));
    });
    box.querySelector('[data-pass]')?.addEventListener('click', () => ctx.go('shop'));
    box.querySelector('[data-duck]').onchange = (e) => store.update((x) => (x.settings.voiceDuck = e.target.checked));
    box.querySelector('[data-notice]').onclick = () => ctx.modal(NOTICE_HTML);
    box.querySelector('[data-blocks]').onclick = () => blocksModal(ctx);
  }
}

async function blocksModal(ctx) {
  const m = ctx.modal(`<div class="kicker">Voice chat</div><div class="h-display" style="font-size:22px;margin:4px 0 10px">Blocked players</div><div data-list class="muted">Loading…</div>`);
  const list = m.el.querySelector('[data-list]');
  const fill = async () => {
    try {
      const { blocks } = await voiceServer.call('blocks');
      list.innerHTML = blocks.length ? blocks.map((b) => `<div class="objective"><span class="grow">${esc(b.name)}</span><button class="btn btn--sm btn--ghost" data-unblock="${esc(b.user)}">Unblock</button></div>`).join('') : 'Nobody. Block someone from a match (voice or chat menu).';
      list.querySelectorAll('[data-unblock]').forEach((b) => (b.onclick = async () => {
        await voiceServer.call('unblock', { user: b.dataset.unblock }).catch((e) => ctx.toast(e.message));
        fill();
      }));
    } catch (e) {
      list.textContent = e.message;
    }
  };
  fill();
}
