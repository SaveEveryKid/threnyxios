// Voice soak test: 50 rounds of join → hear the other player → leave, in a real
// browser (Chromium, fake microphone), through the game's own VoiceSession.
// A local "relay" (a second RTCPeerConnection in the page) stands in for
// Cloudflare Realtime and answers the same way: the game offers its microphone,
// the relay later offers the other player's audio and the game answers.
// Checks after every round and at the end: no microphone left on, no
// connection left open, the music back at full level, the audio element empty.
// Usage: serve game/site (python3 -m http.server 8091 in site/), then
//   node sim/voice-soak.mjs [rounds] [url]
let pw;
try { pw = (await import('playwright')).default; } catch { pw = (await import('/opt/node22/lib/node_modules/playwright/index.js')).default; }

const ROUNDS = +(process.argv[2] || 50);
const URL = process.argv[3] || 'http://localhost:8091/';
const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await pw.chromium.launch({ executablePath: exe, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto(URL);
await page.waitForTimeout(800);

const out = await page.evaluate(async (ROUNDS) => {
  // the built site tags imports with ?v=<build>: use the same copies the game does
  const v = ((await (await fetch('./client/js/main.js')).text()).match(/\?v=[\w.-]+/) || [''])[0];
  const { VoiceSession } = await import('./client/js/voice/session.js' + v);
  const audio = await import('./client/js/core/audio.js' + v);
  audio.initAudio();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 6000) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) return false; await wait(20); } return true; };

  // everything the game opens is counted
  const open = new Set();
  class CountedPC extends RTCPeerConnection {
    constructor(c) { super(c); open.add(this); }
    close() { open.delete(this); super.close(); }
  }
  const mics = [];
  const media = { getUserMedia: async (c) => { const s = await navigator.mediaDevices.getUserMedia(c); mics.push(...s.getTracks()); return s; } };

  // the other player: a tone, sent by the relay
  const ac = new AudioContext();
  const osc = ac.createOscillator(), dest = ac.createMediaStreamDestination();
  osc.connect(dest);
  osc.start();
  const theirTrack = dest.stream.getAudioTracks()[0];

  function relayServer() {
    const r = { pc: null, peerAt: 'p1', events: [] };
    r.server = {
      listen: async () => () => {},
      call: async (action, body) => {
        if (action === 'event') return void r.events.push(body.name);
        if (action === 'policy') return { available: true, mine: { ok: true, reason: null }, kind: 'friend', iBlocked: false, joined: !!r.pc, peer: { joined: true, mic: true, at: r.peerAt } };
        if (action === 'join') {
          r.pc = new RTCPeerConnection();
          await r.pc.setRemoteDescription({ type: 'offer', sdp: body.offer });
          await r.pc.setLocalDescription(await r.pc.createAnswer());
          return { answer: r.pc.localDescription.sdp, peer: { joined: true, mic: true, at: r.peerAt } };
        }
        if (action === 'pull') {
          r.pc.addTransceiver(theirTrack, { direction: 'sendonly' });
          await r.pc.setLocalDescription(await r.pc.createOffer());
          return { offer: r.pc.localDescription.sdp, renegotiate: true, mid: '1' };
        }
        if (action === 'renegotiate') return void (await r.pc.setRemoteDescription({ type: 'answer', sdp: body.answer })), { ok: true };
        if (action === 'leave') { r.pc?.close(); r.pc = null; return { ok: true }; }
        return { ok: true };
      },
    };
    return r;
  }

  const fails = [];
  const times = [];
  for (let i = 0; i < ROUNDS; i++) {
    const relay = relayServer();
    const s = new VoiceSession({ matchId: 'soak-' + i, server: relay.server, RTC: CountedPC, media });
    await s.start();
    if (s.state !== 'off') fails.push(`round ${i}: offered state was ${s.state}`);
    const t0 = performance.now();
    await s.join();
    const live = await until(() => s.state === 'live');
    times.push(performance.now() - t0);
    const el = document.querySelector('.vc-remote-audio');
    if (!live) fails.push(`round ${i}: never went live (${s.state} ${s.reason || ''})`);
    else {
      const tr = el?.srcObject?.getAudioTracks()[0];
      if (!tr || tr.readyState !== 'live' || el.paused) fails.push(`round ${i}: the other player isn't playing`);
      if (audio.voiceDuckState().target.music !== 0.25) fails.push(`round ${i}: music not ducked`);
    }
    // instant local mutes
    s.setMic(false);
    if (mics.at(-1).enabled) fails.push(`round ${i}: mic still on after mute`);
    s.setPeerMuted(true);
    if (!el.muted) fails.push(`round ${i}: they weren't muted`);
    s.setPeerMuted(false);
    s.setMic(true);
    // once: the microphone drops (iOS: a phone call) and comes back by itself
    if (i === 3) {
      const before = mics.length;
      mics.at(-1).dispatchEvent(new Event('ended'));
      await until(() => mics.length > before);
      await wait(100);
      if (s.state !== 'live' || !relay.events.includes('voice_recovered')) fails.push(`round ${i}: didn't recover the microphone (${s.state})`);
    }
    // half the rounds leave first, half just close the screen
    if (i % 2) await s.leave();
    s.destroy();
    s.destroy(); // twice is safe
    await wait(30);
    if (open.size) fails.push(`round ${i}: ${open.size} connection(s) left open`);
    if (mics.some((t) => t.readyState !== 'ended')) fails.push(`round ${i}: a microphone was left on`);
    if (el.srcObject) fails.push(`round ${i}: the audio element still holds a stream`);
    if (relay.pc) fails.push(`round ${i}: the relay was never told we left`);
    if (audio.voiceDuckState().target.music !== 1) fails.push(`round ${i}: music not restored`);
  }
  await wait(700);
  const duck = audio.voiceDuckState();
  if (Math.abs(duck.music - 1) > 0.01) fails.push(`music level ended at ${duck.music}`);
  if (Math.abs(duck.sfx - 0.8) > 0.01) fails.push(`effects level ended at ${duck.sfx}`);
  times.sort((a, b) => a - b);
  return { fails, rounds: ROUNDS, mics: mics.length, median: Math.round(times[times.length >> 1]), worst: Math.round(times.at(-1)), duck };
}, ROUNDS);

await browser.close();
console.log(`${out.rounds} rounds · ${out.mics} microphones opened, all closed · join → hearing them: median ${out.median} ms, worst ${out.worst} ms`);
console.log(`end levels: music ${out.duck.music.toFixed(2)}, effects ${out.duck.sfx.toFixed(2)}`);
if (out.fails.length) {
  console.error('✗ ' + out.fails.slice(0, 20).join('\n✗ '));
  process.exit(1);
}
console.log('✓ voice soak: no leaks, levels restored');
