// ALLIANCE — the Hall: your banner, members and roles, and the weekly chest
// every kind of player fills (docs/08 §7). No chat: players can't message each
// other here (removed 2 Oct 2026: it couldn't be moderated for children). The rules live in
// the database (supabase/alliances.sql); this screen reads and asks.
import * as store from '../core/store.js';
import * as cloud from '../core/cloud.js';
import * as vault from '../core/vault.js';
import { factionArt } from '../art/index.js';
import { openSignIn } from '../ui/account.js';
import { esc } from '../ui/card.js';
import { sfx } from '../core/audio.js';
import { givePacks, packText } from '../../../engine/goals.js';
import { textProblem } from '../../../engine/text-filter.js';

const FACTIONS = { crown: 'Ashen Crown', quiet: 'The Quiet', hour: 'Hourwrights', margin: 'The Margin', vigil: 'The Vigil' };
const TIERS = [
  { tier: 1, need: 60, reward: { standard: 1 } },
  { tier: 2, need: 180, reward: { standard: 2 } },
  { tier: 3, need: 360, reward: { faction: 1 } },
];
const ROLE = { leader: 'Leader', officer: 'Officer', member: 'Member' };

export async function render(root, params, ctx) {
  if (!cloud.enabled) {
    root.innerHTML = `<div class="kicker">Alliance</div><div class="h1">Coming soon</div><div class="muted">Alliances need the game's server, which isn't switched on yet.</div>`;
    return;
  }
  if (!cloud.currentUser()) {
    root.innerHTML = `<div class="kicker">Alliance</div><div class="h1">Band together</div>
      <div class="lore" style="margin:6px 0 14px">Up to 30 players under one banner, filling a weekly chest that every kind of player helps with. Sign in to join or found one.</div>
      <button class="btn btn--big" data-signin>Sign in</button>`;
    root.querySelector('[data-signin]').onclick = () => openSignIn(ctx);
    return;
  }
  const sb = await cloud.client();
  const uid = cloud.currentUser().id;
  const player = store.get().settings.name || 'Player';
  const fail = (e) => ctx.toast(e?.message || String(e));

  async function load() {
    const { data: me } = await sb.from('alliance_members').select('*').eq('user_id', uid).maybeSingle();
    if (!me) return lobby();
    const [{ data: a }, { data: members }, { data: chest }] = await Promise.all([
      sb.from('alliances').select('*').eq('id', me.alliance_id).single(),
      sb.from('alliance_members').select('*').eq('alliance_id', me.alliance_id).order('joined_at'),
      sb.rpc('alliance_chest'),
    ]);
    hall(me, a, members || [], chest);
  }

  // ---- not in an Alliance: find one or found one ---------------------------------
  async function lobby(q = '') {
    let query = sb.from('alliances').select('*').order('member_count', { ascending: false }).limit(30);
    if (q) query = query.ilike('name', `%${q}%`);
    const { data: list } = await query;
    root.innerHTML = `
      <div class="kicker">Alliance</div><div class="h1">Find your banner</div>
      <div class="lore" style="margin:4px 0 12px">Join one to share a weekly chest: wins, Daily Reads and Long Road clears all fill it, and everyone who helps gets the rewards.</div>
      <div class="row" style="gap:8px"><input data-q value="${esc(q)}" placeholder="Search by name" style="flex:1;min-width:0;min-height:40px;padding:0 10px;background:rgba(255,255,255,.05);border:0;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);color:var(--bone);font:inherit;font-size:16px"><button class="btn btn--sm btn--ghost" data-search>Search</button></div>
      <div class="al-list">${(list || []).map((a) => `<div class="al-row panel"><img src="${factionArt(a.faction) || ''}" alt=""><div class="grow"><b>${esc(a.name)}</b><span>${esc(a.motto || FACTIONS[a.faction])}</span></div><span class="muted">${a.member_count}/30</span><button class="btn btn--sm" data-join="${a.id}" ${a.member_count >= 30 ? 'disabled' : ''}>Join</button></div>`).join('') || '<div class="muted" style="margin:10px 0">No Alliances yet. Found the first.</div>'}</div>
      <div class="panel" style="margin-top:14px">
        <div class="kicker">Found an Alliance</div>
        <input data-name maxlength="24" placeholder="Name (3–24 letters)" class="al-input">
        <input data-motto maxlength="80" placeholder="Motto (optional)" class="al-input">
        <div class="row" style="gap:6px;flex-wrap:wrap;margin:8px 0">${Object.entries(FACTIONS).map(([f, n], i) => `<label class="al-fac"><input type="radio" name="fac" value="${f}" ${i === 0 ? 'checked' : ''}><span style="color:var(--${f})">${esc(n)}</span></label>`).join('')}</div>
        <button class="btn" data-found>Found it</button>
      </div>`;
    root.querySelector('[data-search]').onclick = () => lobby(root.querySelector('[data-q]').value.trim());
    root.querySelectorAll('[data-join]').forEach((b) => (b.onclick = async () => {
      const { error } = await sb.rpc('join_alliance', { p_id: b.dataset.join, p_player: player });
      if (error) return fail(error);
      sfx.reward();
      load();
    }));
    root.querySelector('[data-found]').onclick = async () => {
      const name = root.querySelector('[data-name]').value.trim();
      if (name.length < 3) return ctx.toast('Names need at least 3 letters');
      // the server checks too; this just says so at once
      const why = textProblem(name) || textProblem(root.querySelector('[data-motto]').value);
      if (why) return ctx.toast(why);
      const { error } = await sb.rpc('create_alliance', { p_name: name, p_motto: root.querySelector('[data-motto]').value, p_faction: root.querySelector('input[name=fac]:checked').value, p_player: player });
      if (error) return fail(error);
      sfx.reward();
      load();
    };
  }

  // ---- the Hall ---------------------------------------------------------------
  function hall(me, a, members, chest) {
    const pts = chest?.points || 0, max = TIERS.at(-1).need;
    const claimed = new Set(chest?.claimed || []);
    const canManage = (m) => m.user_id !== uid && (me.role === 'leader' || (me.role === 'officer' && m.role === 'member'));
    root.innerHTML = `
      <div class="al-banner" style="--fc:var(--${a.faction})"><img src="${factionArt(a.faction, 's') || ''}" alt=""><div><div class="kicker">${esc(FACTIONS[a.faction])} · ${a.member_count}/30</div><div class="h1" style="font-size:26px">${esc(a.name)}</div><div class="lore">${esc(a.motto)}</div></div></div>
      <div class="panel" style="margin-top:12px">
        <div class="row"><div class="kicker grow">This week's chest</div><span class="muted" style="font-size:12px">you gave ${chest?.mine || 0}</span></div>
        <div class="season" style="margin-top:14px"><div class="season__bar"><i style="width:${Math.min(100, (100 * pts) / max)}%"></i></div>
          ${TIERS.map((t) => `<div class="season__step ${pts >= t.need ? 'on' : ''}" style="left:${(100 * t.need) / max}%"><b>${t.tier}</b><span>${packText(t.reward).replace('+', '')}</span></div>`).join('')}</div>
        <div class="muted" style="font-size:12px;margin-top:34px">${pts} points · wins 1 (online 2), Daily Read 3, Long Road clear 5</div>
        <div class="row" style="gap:6px;margin-top:8px;flex-wrap:wrap">${TIERS.filter((t) => pts >= t.need).map((t) => `<button class="btn btn--sm ${claimed.has(t.tier) ? 'btn--ghost' : ''}" data-claim="${t.tier}" ${claimed.has(t.tier) ? 'disabled' : ''}>${claimed.has(t.tier) ? 'Claimed' : 'Claim'} · ${packText(t.reward)}</button>`).join('')}</div>
      </div>
      <div class="panel" style="margin-top:12px">
        <div class="kicker">Members</div>
        ${members.map((m) => `<div class="objective"><span class="grow">${esc(m.name)}${m.user_id === uid ? ' <span class="muted">(you)</span>' : ''}</span><span class="al-role r-${m.role}">${ROLE[m.role]}</span>
          ${canManage(m) ? `<button class="btn btn--sm btn--ghost" data-manage="${m.user_id}" data-role="${m.role}">…</button>` : ''}</div>`).join('')}
      </div>
      <button class="btn btn--sm btn--ghost" data-leave style="margin-top:14px">${me.role === 'leader' && members.length > 1 ? 'Leave (an Officer takes over)' : 'Leave Alliance'}</button>`;
    root.querySelectorAll('[data-claim]').forEach((b) => (b.onclick = async () => {
      const { data, error } = await sb.rpc('claim_alliance_chest', { p_tier: +b.dataset.claim });
      if (error) return fail(error);
      // the server pays the claimed tier into your vault (on this device until it's set up)
      if (vault.onServer()) await vault.sync();
      else store.update((s) => givePacks(s.profile, data));
      sfx.reward();
      ctx.toast(`Chest: ${packText(data)}`);
      ctx.refreshChrome?.();
      load();
    }));
    root.querySelectorAll('[data-manage]').forEach((b) => (b.onclick = () => {
      const id = b.dataset.manage, role = b.dataset.role;
      const m = ctx.modal(`<div class="kicker">Member</div><div class="stack" style="gap:8px;margin-top:10px">
        ${me.role === 'leader' ? (role === 'officer' ? '<button class="btn btn--sm" data-r="member">Make Member</button>' : '<button class="btn btn--sm" data-r="officer">Make Officer</button>') + '<button class="btn btn--sm btn--ghost" data-r="leader">Hand over leadership</button>' : ''}
        <button class="btn btn--sm btn--ghost" data-kick>Remove from Alliance</button></div>`);
      m.el.querySelectorAll('[data-r]').forEach((x) => (x.onclick = async () => {
        const { error } = await sb.rpc('set_alliance_role', { p_user: id, p_role: x.dataset.r });
        m.close();
        if (error) return fail(error);
        load();
      }));
      m.el.querySelector('[data-kick]').onclick = async () => {
        const { error } = await sb.rpc('kick_alliance_member', { p_user: id });
        m.close();
        if (error) return fail(error);
        load();
      };
    }));
    let armed = false;
    root.querySelector('[data-leave]').onclick = async (e) => {
      if (!armed) {
        armed = true;
        e.currentTarget.textContent = 'Tap again to leave';
        return;
      }
      const { error } = await sb.rpc('leave_alliance');
      if (error) return fail(error);
      load();
    };
  }

  root.innerHTML = `<div class="kicker">Alliance</div><div class="h1">Loading…</div>`;
  try {
    await load();
  } catch (e) {
    root.innerHTML = `<div class="kicker">Alliance</div><div class="h1">Can’t connect</div><div class="muted">${esc(e.message)}</div>`;
  }
}
