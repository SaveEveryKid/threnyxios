// LIVE VOICE — one voice chat in one online match (docs/17-voice-chat.md).
// Audio only, through Cloudflare Realtime; the voice server (supabase/functions/
// voice) decides who may talk and brokers every step, so the game never holds a
// key or the other player's address. Kept apart from the match itself: if voice
// fails, the match goes on exactly as before.
//
// iPhone notes: the microphone is asked for only when JOIN is tapped, and that
// same tap starts the <audio> element the other player plays through (one
// element, reused; never Web Audio). Music ducking is a state, not a sum
// (core/audio.js setVoiceDuck). One automatic recovery if the microphone or the
// connection drops, then "VOICE AUDIO INTERRUPTED · REJOIN VOICE".
import * as cloud from '../core/cloud.js';
import { setVoiceDuck } from '../core/audio.js';
import * as store from '../core/store.js';

export const voiceServer = {
  async call(action, body = {}) {
    const c = await cloud.client();
    if (!c) throw new Error('Voice chat needs a connection.');
    const { data, error } = await c.functions.invoke('voice', { body: { action, ...body } });
    if (error) {
      if (error.name === 'FunctionsFetchError' || error.name === 'FunctionsRelayError') throw new Error('Voice chat isn’t answering right now.');
      let msg = error.message, j = null;
      try {
        j = await error.context.json();
        msg = j.error || msg;
      } catch {}
      const e = new Error(msg);
      e.data = j;
      throw e;
    }
    return data;
  },
  async listen(matchId, fn) {
    const c = await cloud.client();
    if (!c) return () => {};
    const ch = c.channel('voice-' + matchId).on('postgres_changes', { event: '*', schema: 'public', table: 'voice_pings', filter: `match_id=eq.${matchId}` }, () => fn()).subscribe();
    return () => c.removeChannel(ch);
  },
};

// the one element the other player's voice plays through, reused match to match
let remoteEl = null;
function remoteAudio() {
  if (!remoteEl) {
    remoteEl = document.createElement('audio');
    remoteEl.autoplay = true;
    remoteEl.setAttribute('playsinline', '');
    remoteEl.className = 'vc-remote-audio';
    remoteEl.style.display = 'none';
    document.body.appendChild(remoteEl);
  }
  return remoteEl;
}

const CONSTRAINTS = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }, video: false };
const ICE = [{ urls: 'stun:stun.cloudflare.com:3478' }];

/**
 * States: 'checking' → 'off' (offered, not joined) | 'locked' (not for you, with
 * a reason) | 'none' (not in this match) → 'joining' → 'waiting' (the other
 * player isn't in) → 'live' → 'needs_tap' | 'interrupted' | 'error' → 'ended'.
 */
export class VoiceSession {
  constructor({ matchId, server = voiceServer, onChange = () => {}, media = navigator.mediaDevices, RTC = globalThis.RTCPeerConnection }) {
    Object.assign(this, { matchId, server, onChange, media, RTC });
    this.state = 'checking';
    this.reason = null;
    this.micOn = true;
    this.peerMuted = false;
    this.peer = { joined: false, mic: false, at: null };
    this.pulledAt = null;
    this.iBlocked = false;
    this.recovered = false;
    this.dead = false;
    this.abort = new AbortController();
  }
  set(state, extra = {}) {
    if (this.dead && state !== 'ended') return;
    Object.assign(this, extra);
    this.state = state;
    this.onChange(this);
  }
  track(name, meta) {
    this.server.call('event', { name, match: this.matchId, meta }).catch(() => {});
  }
  async start() {
    this.unlisten = await this.server.listen(this.matchId, () => this.refresh()).catch(() => () => {});
    this.poll = setInterval(() => this.refresh(), 10000);
    await this.refresh();
    if (this.state === 'off') this.track('voice_offered');
    return this;
  }
  // what the server says now; joins the other player's audio when they come in
  async refresh() {
    if (this.dead || this.refreshing) return;
    this.refreshing = true;
    try {
      const p = await this.server.call('policy', { match: this.matchId });
      if (this.dead) return;
      this.iBlocked = !!p.iBlocked;
      this.kind = p.kind;
      if (!p.available) {
        const wasIn = this.pc;
        this.teardown();
        if (wasIn) this.track('voice_locked_by_policy');
        return this.set(p.mine?.ok || p.mine?.reason === 'not_voice_match' ? 'none' : 'locked', { reason: p.mine?.reason ?? null, peer: { joined: false, mic: false, at: null } });
      }
      this.peer = p.peer || { joined: false, mic: false, at: null };
      if (!this.pc) return this.set(this.state === 'joining' ? 'joining' : 'off', { reason: null });
      if (!p.joined) {
        // the server ended our side (a block, the match ending): leave quietly
        this.teardown();
        return this.set('off');
      }
      if (this.peer.joined && this.peer.at !== this.pulledAt) await this.pull();
      else if (!this.peer.joined) {
        this.pulledAt = null;
        if (this.state === 'live') this.set('waiting');
        else this.onChange(this);
      } else this.onChange(this);
    } catch (e) {
      console.warn('voice refresh', e.message);
    } finally {
      this.refreshing = false;
    }
  }

  /** JOIN VOICE (call from the tap itself: it unlocks audio playback on iPhone). */
  async join() {
    if (this.dead || this.pc || this.state === 'joining') return;
    const el = remoteAudio();
    // the tap unlocks playback now; the stream arrives later
    el.muted = this.peerMuted;
    el.play().catch(() => {});
    this.set('joining');
    this.track('voice_join_clicked');
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'play-and-record';
    } catch {}
    try {
      this.track('mic_permission_requested');
      this.mic = await this.media.getUserMedia(CONSTRAINTS);
      this.track('mic_permission_granted');
    } catch (e) {
      this.track('mic_permission_denied', { code: String(e.name || 'error').slice(0, 32) });
      this.resetSession();
      return this.set('error', { reason: e.name === 'NotAllowedError' ? 'mic_denied' : 'mic_failed' });
    }
    if (this.dead) return this.stopMic();
    const t = this.mic.getAudioTracks()[0];
    t.enabled = this.micOn;
    try {
      const s = t.getSettings?.() || {};
      this.track('voice_constraints', { echo: !!s.echoCancellation, noise: !!s.noiseSuppression, agc: !!s.autoGainControl });
    } catch {}
    await this.connect(t);
  }
  async connect(t) {
    this.track('voice_connection_started');
    const t0 = performance.now();
    try {
      const pc = (this.pc = new this.RTC({ iceServers: ICE, bundlePolicy: 'max-bundle' }));
      this.sender = pc.addTransceiver(t, { direction: 'sendonly' });
      const sig = this.abort.signal;
      pc.addEventListener('track', (e) => this.play(e.track), { signal: sig });
      pc.addEventListener('connectionstatechange', () => this.onConn(pc), { signal: sig });
      this.watchMic(t);
      await pc.setLocalDescription(await pc.createOffer());
      const r = await this.server.call('join', { match: this.matchId, offer: pc.localDescription.sdp, mid: this.sender.mid });
      if (this.dead || this.pc !== pc) return;
      await pc.setRemoteDescription({ type: 'answer', sdp: r.answer });
      this.peer = r.peer || this.peer;
      setVoiceDuck(true, { music: store.get().settings.voiceDuck !== false });
      this.track('voice_connection_success', { ms: Math.round(performance.now() - t0) });
      this.set('waiting');
      if (this.peer.joined) await this.refresh();
    } catch (e) {
      this.track('voice_connection_failure', { code: String(e.data?.mine?.reason || e.name || 'error').slice(0, 32) });
      const why = e.data?.mine?.reason;
      this.teardown();
      this.set(why ? 'locked' : 'error', { reason: why || 'connect_failed', message: e.message });
    }
  }
  // the relay offers the other player's audio; answer it
  async pull() {
    const pc = this.pc;
    const at = this.peer.at;
    const r = await this.server.call('pull', { match: this.matchId });
    if (this.dead || this.pc !== pc || r.waiting) return;
    await pc.setRemoteDescription({ type: 'offer', sdp: r.offer });
    await pc.setLocalDescription(await pc.createAnswer());
    await this.server.call('renegotiate', { match: this.matchId, answer: pc.localDescription.sdp });
    this.pulledAt = at;
  }
  play(track) {
    const el = remoteAudio();
    el.srcObject = new MediaStream([track]);
    el.muted = this.peerMuted;
    const sig = this.abort.signal;
    // something outside the game paused it (a call, another app): ask for a tap
    el.addEventListener('pause', () => !this.dead && this.pc && this.state === 'live' && this.set('needs_tap'), { signal: sig });
    el.play().then(() => {
      if (this.dead) return;
      if (this.state !== 'live') this.track('both_players_connected');
      this.set('live');
    }).catch(() => this.set('needs_tap'));
  }
  /** TAP TO ENABLE VOICE AUDIO */
  async tapToPlay() {
    const el = remoteAudio();
    try {
      await el.play();
      this.set(this.peer.joined ? 'live' : 'waiting');
    } catch {
      this.set('needs_tap');
    }
  }
  watchMic(t) {
    const sig = this.abort.signal;
    // iOS ends the microphone track when a call or Siri takes the audio
    t.addEventListener('ended', () => this.recover('mic_ended'), { signal: sig });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || this.dead || !this.pc) return;
      if (this.mic?.getAudioTracks()[0]?.readyState === 'ended') return this.recover('mic_ended');
      const el = remoteAudio();
      if (el.srcObject && el.paused) el.play().catch(() => this.set('needs_tap'));
    }, { signal: sig });
  }
  onConn(pc) {
    if (this.dead || this.pc !== pc) return;
    if (pc.connectionState === 'failed') this.recover('ice_failed');
    if (pc.connectionState === 'disconnected') this.track('voice_disconnected');
  }
  // one automatic try: a fresh microphone into the same connection, or a fresh
  // connection; after that it's the player's call (REJOIN VOICE)
  async recover(why) {
    if (this.dead || !this.pc) return;
    if (this.recovered) {
      this.teardown();
      return this.set('interrupted', { reason: why });
    }
    this.recovered = true;
    try {
      if (why === 'mic_ended') {
        const fresh = await this.media.getUserMedia(CONSTRAINTS);
        const t = fresh.getAudioTracks()[0];
        t.enabled = this.micOn;
        await this.sender.sender.replaceTrack(t);
        this.stopMic();
        this.mic = fresh;
        this.watchMic(t);
      } else {
        const t = this.mic?.getAudioTracks()[0];
        if (!t || t.readyState === 'ended') throw new Error('no mic');
        this.closePc();
        this.pulledAt = null;
        await this.connect(t);
        if (!this.pc) throw new Error('reconnect failed');
      }
      this.track('voice_recovered', { why });
    } catch {
      this.teardown();
      this.set('interrupted', { reason: why });
    }
  }
  /** REJOIN VOICE (a tap) */
  async rejoin() {
    this.teardown();
    this.recovered = false;
    this.set('off');
    await this.join();
  }

  setMic(on) {
    this.micOn = !!on;
    const t = this.mic?.getAudioTracks()[0];
    if (t) t.enabled = this.micOn; // instant, on this phone
    this.server.call('mic', { match: this.matchId, on: this.micOn }).catch(() => {});
    this.track('self_muted', { on: !this.micOn });
    this.onChange(this);
  }
  setPeerMuted(on) {
    this.peerMuted = !!on;
    remoteAudio().muted = this.peerMuted; // instant, on this phone
    this.track('opponent_muted', { on: this.peerMuted });
    this.onChange(this);
  }
  async leave() {
    const was = !!this.pc;
    this.teardown();
    this.recovered = false;
    if (was) this.server.call('leave', { match: this.matchId }).catch(() => {});
    this.track('voice_left');
    this.set('off');
  }

  // ---- cleanup -------------------------------------------------------------------
  stopMic() {
    for (const t of this.mic?.getTracks() || []) t.stop();
    this.mic = null;
  }
  closePc() {
    this.abort.abort();
    this.abort = new AbortController();
    try {
      this.pc?.close();
    } catch {}
    this.pc = null;
    this.sender = null;
  }
  resetSession() {
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'auto';
    } catch {}
  }
  // everything this voice chat holds, released
  teardown() {
    const had = !!(this.pc || this.mic);
    this.closePc();
    this.stopMic();
    this.pulledAt = null;
    const el = remoteEl;
    if (el) {
      el.pause();
      el.srcObject = null;
    }
    if (had) {
      setVoiceDuck(false);
      this.resetSession();
    }
  }
  /** The match is over or the screen is closing. Safe to call more than once. */
  destroy() {
    if (this.dead) return;
    const was = !!this.pc;
    this.dead = true;
    clearInterval(this.poll);
    this.unlisten?.();
    this.teardown();
    if (was) this.server.call('leave', { match: this.matchId }).catch(() => {});
    this.state = 'ended';
    this.onChange(this);
  }
}
