import * as store from '../core/store.js';
import { icon } from '../ui/icons.js';
import { setSound } from '../core/audio.js';
import { setMusic } from '../core/music.js';
import { setHaptics } from '../core/haptics.js';
import { setMotion, requestSensors, motionState, motionReduced } from '../core/motion.js';
import { esc } from '../ui/card.js';
import * as playlog from '../core/playlog.js';
import { crashes } from '../core/crumbs.js';
import { VERSION } from '../version.js';
import { legalLinks } from '../ui/legal.js';
import { accountHtml, bindAccount } from '../ui/account.js';
import { voiceSettingsHtml, bindVoiceSettings } from '../voice/ui.js';
import { textProblem } from '../../../engine/text-filter.js';

export function render(root, params, ctx) {
  const s = store.get();
  root.innerHTML = `
    <div class="kicker">More</div><div class="h1">The Meridian</div>
    <div class="tiles" style="margin-top:10px">
      <button class="tile panel" data-to="trade">${icon('u-pack')}<b>Trade</b><span>The Trade Hall</span></button>
      <button class="tile panel" data-to="alliance">${icon('s-vigil')}<b>Alliance</b><span>Weekly chest</span></button>
      <button class="tile panel" data-to="rivals">${icon('u-battle')}<b>Rivals</b><span>${Object.keys(s.rivals).length} opponents met</span></button>
      <button class="tile panel" data-to="rules">${icon('i-read')}<b>Rules</b><span>Every mode, plain words</span></button>
      <button class="tile panel" data-replay>${icon('i-focus')}<b>Replay training</b><span>Lessons · practice Duel</span></button>
      <button class="tile panel" data-to="invite">${icon('u-pack')}<b>Invite friends</b><span>Packs for you both</span></button>
      <button class="tile panel" data-to="codex">${icon('s-quiet')}<b>Codex</b><span>What actually happened?</span></button>
      <button class="tile panel" data-to="story">${icon('s-vigil')}<b>Story</b><span>Firstfall chapters</span></button>
      <button class="tile panel" data-to="draft">${icon('i-focus')}<b>Draft</b><span>Pure skill</span></button>
    </div>
    <div class="panel" style="margin-top:14px" data-account>
      <div class="kicker" style="margin-bottom:8px">Account</div>${accountHtml()}
    </div>
    <div class="panel" style="margin-top:14px">
      <div class="kicker">Profile</div>
      <div class="row" style="margin-top:8px"><input data-name value="${esc(s.settings.name)}" maxlength="18" style="flex:1;min-height:44px;padding:0 12px;background:rgba(255,255,255,.05);border:0;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);color:var(--bone);font:inherit;font-size:16px"><button class="btn btn--sm" data-savename>Save</button></div>
      <div class="dr-facts" style="margin-top:10px">
        <div><b>${s.stats.matches}</b>Matches</div><div><b>${s.stats.wins}</b>Wins</div><div><b>${s.stats.readsHit}/${s.stats.readsUsed}</b>READs</div>
      </div>
    </div>
    <div class="panel" style="margin-top:14px">
      <div class="kicker">Settings</div>
      <label class="objective"><span class="grow">Sound</span><input type="checkbox" data-sound ${s.settings.sound ? 'checked' : ''}></label>
      <label class="objective"><span class="grow">Music</span><input type="checkbox" data-music ${(s.settings.music ?? true) ? 'checked' : ''}></label>
      <label class="objective"><span class="grow">Haptics</span><input type="checkbox" data-haptics ${s.settings.haptics ? 'checked' : ''}></label>
      <label class="objective"><span class="grow">Card motion<small data-motion-note style="display:block;color:var(--muted);font-size:12px">${motionNote()}</small></span><input type="checkbox" data-motion ${(s.settings.motion ?? true) ? 'checked' : ''}></label>
      <label class="objective"><span class="grow">Lighter effects<small style="display:block;color:var(--muted);font-size:12px">Fewer particles, no screen shake or glows. Turns on by itself if the game ever restarts mid-play.</small></span><input type="checkbox" data-lite ${s.settings.lite ? 'checked' : ''}></label>
      <button class="btn btn--sm btn--ghost" data-playtest style="margin-top:12px">Playtest report · ${playlog.entries().length} matches</button>
      <button class="btn btn--sm btn--ghost" data-reset style="margin-top:12px">Reset save</button>
      <div class="muted" style="font-size:12px;margin-top:14px">${legalLinks()}</div>
      <div class="muted" style="font-size:11px;margin-top:10px;letter-spacing:.06em">Version ${esc(VERSION)}</div>
    </div>
    ${voiceSettingsHtml()}`;
  bindVoiceSettings(root, ctx, params).catch(() => {});
  root.querySelectorAll('[data-to]').forEach((b) => (b.onclick = () => ctx.go(b.dataset.to)));
  root.querySelector('[data-replay]').onclick = () => ctx.go('tutorial', { replay: 1 });
  root.querySelector('[data-playtest]').onclick = () => playtest(ctx);
  root.querySelector('[data-lite]').onchange = (e) => {
    store.update((x) => (x.settings.lite = e.target.checked));
    document.getElementById('app').classList.toggle('lite', e.target.checked);
  };
  bindAccount(root, ctx, () => render(root, params, ctx));
  root.querySelector('[data-savename]').onclick = () => {
    const v = root.querySelector('[data-name]').value.trim().slice(0, 18) || 'You';
    // other players see this name online (the server filters it too)
    const why = textProblem(v);
    if (why) return ctx.toast(why);
    store.update((x) => {
      x.settings.name = v;
      x.profile.name = v;
    });
    ctx.toast('Saved');
  };
  root.querySelector('[data-sound]').onchange = (e) => {
    store.update((x) => (x.settings.sound = e.target.checked));
    setSound(e.target.checked);
  };
  root.querySelector('[data-music]').onchange = (e) => {
    store.update((x) => (x.settings.music = e.target.checked));
    setMusic(e.target.checked);
  };
  root.querySelector('[data-haptics]').onchange = (e) => {
    store.update((x) => (x.settings.haptics = e.target.checked));
    setHaptics(e.target.checked);
  };
  root.querySelector('[data-motion]').onchange = async (e) => {
    const on = e.target.checked;
    store.update((x) => (x.settings.motion = on));
    setMotion(on);
    if (on) await requestSensors(); // this tap is the gesture iOS needs
    root.querySelector('[data-motion-note]').textContent = motionNote();
  };
  let armed = false;
  root.querySelector('[data-reset]').onclick = (e) => {
    if (!armed) {
      armed = true;
      e.currentTarget.textContent = 'Tap again to erase everything';
      return;
    }
    store.resetSave();
    ctx.go('home');
    location.reload();
  };
}

function motionNote() {
  const m = motionState();
  if (motionReduced()) return 'Reduced motion is on for this device: premium cards stay still';
  if (!m.enabled) return 'Premium cards stay still';
  if (m.status === 'live') return 'Tilt your phone to move the light on premium cards';
  if (m.status === 'denied') return 'Motion access was declined: drag a card to move its light';
  return 'Premium cards follow your phone’s tilt, or your finger';
}

// Playtest report: the summary, plus the raw log to copy or save.
function playtest(ctx) {
  const list = playlog.entries();
  const m = ctx.modal(`<div class="kicker">Playtest report</div><div class="h-display" style="font-size:22px;margin:4px 0 10px">This device</div>
    ${crashes().length ? `<div class="objective"><span class="grow">Unexpected restarts</span><b>${crashes().length}</b></div><div class="muted" style="font-size:11px;margin-bottom:6px">Last one (${esc(crashes().at(-1).screen || 'battle')}), final steps: ${esc(crashes().at(-1).trail.slice(-6).map((c) => c[1]).join(' → '))}</div>` : ''}
    <div class="pt-rows">${playlog.report(list).map(([a, b]) => `<div class="objective"><span class="grow">${esc(a)}</span><b>${esc(b)}</b></div>`).join('')}</div>
    <div class="row" style="gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn btn--sm" data-copy>Copy JSON</button><button class="btn btn--sm btn--ghost" data-save>Download</button><button class="btn btn--sm btn--ghost" data-clear>Clear log</button></div>
    <textarea data-raw readonly hidden style="width:100%;height:120px;margin-top:10px;background:#0b0a10;color:var(--bone);border:0;font:11px/1.3 monospace"></textarea>`);
  const json = JSON.stringify({ exported: new Date().toISOString(), version: VERSION, crashes: crashes(), matches: list }, null, 1);
  m.el.querySelector('[data-copy]').onclick = async () => {
    try {
      await navigator.clipboard.writeText(json);
      ctx.toast('Copied ' + list.length + ' matches');
    } catch {
      // clipboard refused: show the text to select by hand
      const t = m.el.querySelector('[data-raw]');
      t.hidden = false;
      t.value = json;
      t.select();
    }
  };
  m.el.querySelector('[data-save]').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = `threnyx-playtest-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  m.el.querySelector('[data-clear]').onclick = () => {
    playlog.clear();
    m.close();
    ctx.toast('Log cleared');
  };
}
