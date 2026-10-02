// THRENYX friends and trading, inside the economy function (it owns the vaults).
// docs/19-friends-trading.md. The rules live in engine/social.js.
//
// Safety, in short:
//   - no typed text: a message is the id of a preset, checked against PRESETS;
//   - friends only by friend code or from someone you've played: no name search;
//   - a block (either way) ends the friendship, messages, offers and trades;
//   - guests can't use any of it;
//   - an offer can't be changed once sent, and you can't ask for something for nothing;
//   - every trade is checked again when it happens, and both vaults change together.
import { CARDS } from '../../../engine/cards/index.js';
import { PRESET, SOCIAL, TRADE, tradeBlock, sideProblem, sealOf, copyView, copyTag, meetsWant, swapVaults, copyLock } from '../../../engine/social.js';
import { isGuestUser } from '../../../engine/guest.js';

const HOUR = 3600000;
const DAY = 24 * HOUR;
const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const iso = (t = Date.now()) => new Date(t).toISOString();
const isId = (x: unknown) => typeof x === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(x);
const ids = (x: unknown) => (Array.isArray(x) ? x.filter((c) => typeof c === 'string').slice(0, TRADE.maxSide + 1) : []);

export function socialApi({ admin, load, Oops, pick }: any) {
  // ---- who's who ----------------------------------------------------------------------
  async function names(list: string[]) {
    const out = new Map<string, string>();
    const want = [...new Set(list.filter(Boolean))];
    if (!want.length) return out;
    const { data } = await admin.from('pvp_profiles').select('user_id, name').in('user_id', want);
    for (const r of data ?? []) out.set(r.user_id, r.name);
    for (const id of want) {
      if (out.has(id)) continue;
      const n = (await load(id))?.data?.profile?.name;
      out.set(id, n && n !== 'You' ? n : 'Player');
    }
    return out;
  }
  const nameOf = async (id: string) => (await names([id])).get(id) || 'Player';

  async function userOf(id: string) {
    try {
      const { data } = await admin.auth.admin.getUserById(id);
      return data?.user ?? null;
    } catch {
      return null;
    }
  }

  // blocked either way: the set of everyone this player has blocked or been blocked by
  async function blockSet(uid: string) {
    const [{ data: a }, { data: b }] = await Promise.all([admin.from('player_blocks').select('blocked').eq('blocker', uid), admin.from('player_blocks').select('blocker').eq('blocked', uid)]);
    return new Set<string>([...(a ?? []).map((r: any) => r.blocked), ...(b ?? []).map((r: any) => r.blocker)]);
  }
  const blocked = async (uid: string, other: string) => (await blockSet(uid)).has(other);

  async function rel(uid: string, other: string) {
    const { data } = await admin.from('friends').select('status').eq('user_id', uid).eq('friend_id', other).maybeSingle();
    return (data?.status as string) ?? null;
  }
  async function mustBeFriends(uid: string, other: string) {
    if (!isId(other) || (await rel(uid, other)) !== 'friends') throw new Oops('You’re not friends with that player.', 403);
    if (await blocked(uid, other)) throw new Oops('You’re not friends with that player.', 403);
  }

  // ---- friend codes ---------------------------------------------------------------------
  async function myCode(uid: string) {
    const { data } = await admin.from('friend_codes').select('code').eq('user_id', uid).maybeSingle();
    if (data) return data.code as string;
    for (let i = 0; i < 6; i++) {
      const code = Array.from(crypto.getRandomValues(new Uint8Array(8)), (x) => CODE_ABC[x % 32]).join('');
      const { error } = await admin.from('friend_codes').insert({ user_id: uid, code });
      if (!error) return code;
      const { data: again } = await admin.from('friend_codes').select('code').eq('user_id', uid).maybeSingle();
      if (again) return again.code as string;
    }
    throw new Oops('Busy, try again.', 409);
  }

  // ---- friends ----------------------------------------------------------------------------
  // who this player takes friend requests from ('anyone' | 'played' | 'none')
  async function allowOf(id: string) {
    const { data } = await admin.from('friend_codes').select('allow').eq('user_id', id).maybeSingle();
    return (data?.allow as string) || 'anyone';
  }
  // two players who've really played each other lately
  const playedTogether = async (uid: string, other: string) => (await recentIds(uid)).has(other);

  async function addFriend(uid: string, body: any) {
    let other: string | null = null;
    let played = false;
    if (body.code) {
      const code = String(body.code).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
      const { data } = await admin.from('friend_codes').select('user_id').eq('code', code).maybeSingle();
      if (!data) throw new Oops('No one has that friend code. Check it and try again.');
      other = data.user_id;
    } else if (typeof body.match === 'string' && body.match) {
      // straight from a match you just played: the match says who they are
      const { data: m } = await admin.from('pvp_matches').select('a, b, echo:data->echo').eq('id', body.match).maybeSingle();
      if (!m || (m.a !== uid && m.b !== uid) || m.echo || !m.a || !m.b) throw new Oops('You can only add someone you played.');
      other = m.a === uid ? m.b : m.a;
      played = true;
    } else if (isId(body.id)) {
      // without a code: only someone you've played recently
      other = body.id;
      if (!(await playedTogether(uid, other!))) throw new Oops('Ask them for their friend code.');
      played = true;
    }
    if (!other) throw new Oops('Enter a friend code.');
    if (other === uid) throw new Oops('That’s your own friend code. Share it with a friend.');
    if (await blocked(uid, other)) throw new Oops('You can’t add that player.');
    if (isGuestUser(await userOf(other))) throw new Oops('That player hasn’t saved their profile yet.');
    const now = await rel(uid, other);
    if (now === 'friends') return { ok: true, already: true };
    if (now === 'incoming') return acceptFriend(uid, other); // they asked first: that's a yes
    if (now === 'outgoing') return { ok: true, pending: true };
    if (now === 'declined') {
      const { data: d } = await admin.from('friends').select('updated_at').eq('user_id', uid).eq('friend_id', other).maybeSingle();
      if (Date.now() - Date.parse(d?.updated_at ?? 0) < 7 * DAY) throw new Oops('They didn’t accept your last request. You can ask again in a few days.');
      await admin.from('friends').delete().eq('user_id', uid).eq('friend_id', other);
    }
    // what they've chosen: requests from anyone, only people they've played, or nobody
    const allow = await allowOf(other);
    if (allow === 'none' || (allow === 'played' && !(played || (await playedTogether(uid, other))))) throw new Oops('That player isn’t taking friend requests right now.');
    const { data: mine } = await admin.from('friends').select('friend_id, status').eq('user_id', uid);
    if ((mine ?? []).filter((r: any) => r.status === 'friends').length >= SOCIAL.maxFriends) throw new Oops(`You have ${SOCIAL.maxFriends} friends, the most there can be.`);
    if ((mine ?? []).filter((r: any) => r.status === 'outgoing').length >= SOCIAL.maxPendingOut) throw new Oops('Wait for some of your friend requests to be answered first.');
    const at = iso();
    const { error } = await admin.from('friends').insert([
      { user_id: uid, friend_id: other, status: 'outgoing', created_at: at, updated_at: at },
      { user_id: other, friend_id: uid, status: 'incoming', created_at: at, updated_at: at },
    ]);
    if (error && !/duplicate/i.test(error.message)) throw new Oops(error.message, 500);
    return { ok: true, pending: true, name: await nameOf(other) };
  }

  // say no to a request: it leaves their list, and they can't ask again for a week
  async function decline(uid: string, other: string) {
    if ((await rel(uid, other)) !== 'incoming') return unfriend(uid, other);
    await admin.from('friends').delete().eq('user_id', uid).eq('friend_id', other);
    await admin.from('friends').update({ status: 'declined', updated_at: iso() }).eq('user_id', other).eq('friend_id', uid);
  }

  // who can send me requests, and a fresh friend code (the old one stops working)
  async function settings(uid: string, body: any) {
    const code = await myCode(uid);
    if (['anyone', 'played', 'none'].includes(body.allow)) await admin.from('friend_codes').update({ allow: body.allow }).eq('user_id', uid);
    if (body.newCode) {
      for (let i = 0; i < 6; i++) {
        const fresh = Array.from(crypto.getRandomValues(new Uint8Array(8)), (x) => CODE_ABC[x % 32]).join('');
        const { data: taken } = await admin.from('friend_codes').select('user_id').eq('code', fresh).maybeSingle();
        if (taken) continue;
        await admin.from('friend_codes').update({ code: fresh }).eq('user_id', uid);
        break;
      }
    }
    const { data } = await admin.from('friend_codes').select('code, allow').eq('user_id', uid).maybeSingle();
    return { code: data?.code ?? code, allow: data?.allow ?? 'anyone' };
  }

  async function acceptFriend(uid: string, other: string) {
    if ((await rel(uid, other)) !== 'incoming') throw new Oops('That request isn’t there any more.');
    if (await blocked(uid, other)) throw new Oops('You can’t add that player.');
    const { data: mine } = await admin.from('friends').select('friend_id').eq('user_id', uid).eq('status', 'friends');
    if ((mine ?? []).length >= SOCIAL.maxFriends) throw new Oops(`You have ${SOCIAL.maxFriends} friends, the most there can be.`);
    const at = iso();
    await admin.from('friends').update({ status: 'friends', updated_at: at }).eq('user_id', uid).eq('friend_id', other);
    await admin.from('friends').update({ status: 'friends', updated_at: at }).eq('user_id', other).eq('friend_id', uid);
    return { ok: true, friends: true };
  }

  async function unfriend(uid: string, other: string) {
    await admin.from('friends').delete().eq('user_id', uid).eq('friend_id', other);
    await admin.from('friends').delete().eq('user_id', other).eq('friend_id', uid);
    // open offers between them go too
    for (const [a, b] of [[uid, other], [other, uid]]) await admin.from('trade_offers').update({ status: 'cancelled', reason: 'unfriended', decided_at: iso() }).eq('from_id', a).eq('to_id', b).eq('status', 'open');
  }

  async function block(uid: string, other: string) {
    if (!isId(other) || other === uid) throw new Oops('No such player.');
    await admin.from('player_blocks').upsert({ blocker: uid, blocked: other, created_at: iso() }, { onConflict: 'blocker,blocked', ignoreDuplicates: true });
    await unfriend(uid, other);
    // their offers on my posts, and mine on theirs
    for (const [a, b] of [[uid, other], [other, uid]]) await admin.from('trade_offers').update({ status: 'cancelled', reason: 'blocked', decided_at: iso() }).eq('from_id', a).eq('to_id', b).eq('status', 'open');
    return { ok: true };
  }

  // people this player has played online lately (friendly or ranked; not Echoes)
  async function recentIds(uid: string) {
    const since = iso(Date.now() - SOCIAL.recentDays * DAY);
    const { data } = await admin.from('pvp_matches').select('a, b, echo:data->echo, created_at').or(`a.eq.${uid},b.eq.${uid}`).gte('created_at', since).order('created_at', { ascending: false }).limit(60);
    const out = new Set<string>();
    for (const m of data ?? []) {
      if (m.echo) continue;
      const other = m.a === uid ? m.b : m.a;
      if (other && other !== uid) out.add(other);
    }
    return out;
  }

  async function status(user: any) {
    const uid = user.id;
    const [code, { data: rows }, bl, recent, { data: unread }] = await Promise.all([
      myCode(uid),
      admin.from('friends').select('friend_id, status, created_at, updated_at').eq('user_id', uid),
      blockSet(uid),
      recentIds(uid),
      admin.from('friend_messages').select('from_id, preset, created_at').eq('to_id', uid).is('read_at', null).order('created_at', { ascending: false }).limit(200),
    ]);
    const live = (rows ?? []).filter((r: any) => !bl.has(r.friend_id) && r.status !== 'declined');
    const known = new Set(live.map((r: any) => r.friend_id));
    const recentList = [...recent].filter((id) => !known.has(id) && !bl.has(id)).slice(0, 12);
    const { data: myBlocks } = await admin.from('player_blocks').select('blocked').eq('blocker', uid);
    const n = await names([...live.map((r: any) => r.friend_id), ...recentList, ...(myBlocks ?? []).map((r: any) => r.blocked)]);
    const unreadBy = new Map<string, number>();
    for (const m of unread ?? []) unreadBy.set(m.from_id, (unreadBy.get(m.from_id) ?? 0) + 1);
    const person = (r: any) => ({ id: r.friend_id, name: n.get(r.friend_id) || 'Player', since: r.updated_at || r.created_at, unread: unreadBy.get(r.friend_id) ?? 0 });
    const friends = live.filter((r: any) => r.status === 'friends').map(person).sort((a: any, b: any) => b.unread - a.unread || a.name.localeCompare(b.name));
    // recent opponents who are guests can't be friends
    const recentPeople = [];
    for (const id of recentList) if (!isGuestUser(await userOf(id))) recentPeople.push({ id, name: n.get(id) || 'Player' });
    return {
      code,
      allow: await allowOf(uid),
      friends,
      incoming: live.filter((r: any) => r.status === 'incoming').map(person),
      outgoing: live.filter((r: any) => r.status === 'outgoing').map(person),
      recent: recentPeople.slice(0, 8),
      blocked: (myBlocks ?? []).map((r: any) => ({ id: r.blocked, name: n.get(r.blocked) || 'Player' })),
      ...(await ping(uid)),
    };
  }

  // the little numbers on Home (requests, unread messages, offers waiting) and the
  // newest of each, so the game can say "Bob sent you a trade offer" once
  async function ping(uid: string) {
    const bl = await blockSet(uid);
    const since = iso(Date.now() - 2 * DAY);
    const [{ data: req }, { data: msg }, { data: off }, { data: t1 }, { data: t2 }] = await Promise.all([
      admin.from('friends').select('friend_id, created_at').eq('user_id', uid).eq('status', 'incoming'),
      admin.from('friend_messages').select('from_id, preset, created_at').eq('to_id', uid).is('read_at', null).order('created_at', { ascending: false }).limit(200),
      admin.from('trade_offers').select('id, from_id, counter_of, created_at').eq('to_id', uid).eq('status', 'open').order('created_at', { ascending: false }),
      // trades someone else completed with you: your offer accepted (you're `a`), or your post taken (you're `b`, no offer)
      admin.from('trade_log').select('b, offer_id, created_at').eq('a', uid).gte('created_at', since).order('created_at', { ascending: false }).limit(5),
      admin.from('trade_log').select('a, offer_id, listing_id, created_at').eq('b', uid).gte('created_at', since).order('created_at', { ascending: false }).limit(5),
    ]);
    const done = [
      ...(t1 ?? []).filter((t: any) => t.offer_id).map((t: any) => ({ other: t.b, at: t.created_at })),
      ...(t2 ?? []).filter((t: any) => !t.offer_id && t.listing_id).map((t: any) => ({ other: t.a, at: t.created_at })),
    ].sort((x, y) => (x.at < y.at ? 1 : -1));
    const fresh = (r: any) => Date.now() - Date.parse(r.created_at) < TRADE.offerHours * HOUR;
    const requests = (req ?? []).filter((r: any) => !bl.has(r.friend_id));
    const unread = (msg ?? []).filter((r: any) => !bl.has(r.from_id));
    const offers = (off ?? []).filter((r: any) => !bl.has(r.from_id) && fresh(r));
    const newest = (list: any[], k: string) => list.reduce((x: any, r: any) => (!x || r[k] > x[k] ? r : x), null);
    const nr = newest(requests, 'created_at');
    const nm = unread[0];
    const no = offers[0];
    const nd = done[0];
    const n = await names([nr?.friend_id, nm?.from_id, no?.from_id, nd?.other].filter(Boolean));
    return {
      requests: requests.length,
      unread: unread.length,
      offers: offers.length,
      latest: {
        request: nr ? { name: n.get(nr.friend_id) || 'Player', at: nr.created_at } : null,
        message: nm ? { id: nm.from_id, name: n.get(nm.from_id) || 'Player', preset: nm.preset, at: nm.created_at } : null,
        offer: no ? { name: n.get(no.from_id) || 'Player', counter: !!no.counter_of, at: no.created_at } : null,
        traded: nd ? { name: n.get(nd.other) || 'Player', at: nd.at } : null,
      },
    };
  }

  // ---- messages (presets only) -----------------------------------------------------------
  async function messages(uid: string, other: string) {
    await mustBeFriends(uid, other);
    const [{ data: a }, { data: b }] = await Promise.all([
      admin.from('friend_messages').select('id, from_id, preset, code, created_at').eq('from_id', uid).eq('to_id', other).order('created_at', { ascending: false }).limit(SOCIAL.msgKeep),
      admin.from('friend_messages').select('id, from_id, preset, code, created_at, read_at').eq('from_id', other).eq('to_id', uid).order('created_at', { ascending: false }).limit(SOCIAL.msgKeep),
    ]);
    if ((b ?? []).some((m: any) => !m.read_at)) await admin.from('friend_messages').update({ read_at: iso() }).eq('from_id', other).eq('to_id', uid).is('read_at', null);
    const list = [...(a ?? []), ...(b ?? [])]
      .filter((m: any) => PRESET[m.preset])
      .sort((x: any, y: any) => (x.created_at < y.created_at ? -1 : 1))
      .slice(-SOCIAL.msgKeep)
      .map((m: any) => ({ id: m.id, mine: m.from_id === uid, preset: m.preset, code: m.code ?? null, at: m.created_at }));
    return { messages: list, name: await nameOf(other) };
  }

  async function send(uid: string, body: any) {
    const other = String(body.id ?? '');
    await mustBeFriends(uid, other);
    const p = PRESET[String(body.preset ?? '')];
    if (!p) throw new Oops('Pick a message from the list.');
    let code: string | null = null;
    if (p.code) {
      // "Wanna Duel?" carries the sender's own open challenge
      code = String(body.code ?? '').toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(code)) throw new Oops('Make a Duel invitation first.');
      const { data: m } = await admin.from('pvp_matches').select('id').eq('code', code).eq('status', 'open').eq('a', uid).maybeSingle();
      if (!m) throw new Oops('That Duel invitation has expired. Make a new one.');
    }
    const hourAgo = iso(Date.now() - HOUR);
    const { data: lately } = await admin.from('friend_messages').select('to_id, created_at').eq('from_id', uid).gte('created_at', hourAgo).order('created_at', { ascending: false }).limit(SOCIAL.msgPerHour + 1);
    if ((lately ?? []).length >= SOCIAL.msgPerHour) throw new Oops('That’s a lot of messages. Take a break and try again soon.', 429);
    const last = (lately ?? []).find((m: any) => m.to_id === other);
    if (last && Date.now() - Date.parse(last.created_at) < SOCIAL.msgGapMs) throw new Oops('One moment…', 429);
    const { error } = await admin.from('friend_messages').insert({ from_id: uid, to_id: other, preset: p.id, code, created_at: iso() });
    if (error) throw new Oops(error.message, 500);
    // old messages fall away (30 days)
    await admin.from('friend_messages').delete().eq('from_id', uid).eq('to_id', other).lt('created_at', iso(Date.now() - 30 * DAY));
    return messages(uid, other);
  }

  // ---- looking at a friend's Vault -------------------------------------------------------
  async function friendVault(uid: string, other: string) {
    await mustBeFriends(uid, other);
    const v = (await load(other))?.data;
    if (!v) throw new Oops('Their Vault is empty.');
    const now = Date.now();
    const copies = Object.values(v.profile?.items ?? {})
      .filter((it: any) => CARDS[it.cardId])
      .map((it: any) => ({ ...copyView(it), lock: copyLock(it, now) ? 'new' : null }));
    return { name: await nameOf(other), copies, ascension: v.profile?.ascension ?? {} };
  }

  // the other side's Vault, for a counter-offer to an offer they sent you
  async function counterView(uid: string, id: string) {
    const { data: o } = await admin.from('trade_offers').select('*').eq('id', String(id)).maybeSingle();
    if (!o || o.to_id !== uid || o.status !== 'open') throw new Oops('That offer has closed.');
    if (await blocked(uid, o.from_id)) throw new Oops('That offer has closed.');
    const v = (await load(o.from_id))?.data;
    const now = Date.now();
    const copies = Object.values(v?.profile?.items ?? {})
      .filter((it: any) => CARDS[it.cardId])
      .map((it: any) => ({ ...copyView(it), lock: copyLock(it, now) ? 'new' : null }));
    return { name: await nameOf(o.from_id), copies };
  }

  // ---- trading -------------------------------------------------------------------------------
  async function tradesToday(id: string) {
    const since = iso(Date.now() - DAY);
    const [{ data: a }, { data: b }] = await Promise.all([admin.from('trade_log').select('id').eq('a', id).gte('created_at', since), admin.from('trade_log').select('id').eq('b', id).gte('created_at', since)]);
    return (a ?? []).length + (b ?? []).length;
  }
  async function canTrade(user: any, vault: any) {
    if (isGuestUser(user)) return 'Save your profile to trade.';
    return tradeBlock({ createdAt: user?.created_at, vault, tradesToday: await tradesToday(user.id), now: Date.now() });
  }
  // what a trader can see about their own trading (the requirement still to meet)
  async function tradeState(user: any) {
    const v = (await load(user.id))?.data;
    return { block: await canTrade(user, v), today: await tradesToday(user.id), daily: TRADE.dailyTrades };
  }

  // The trade: A (`from`) gives `give`, B (`to`) gives `get`. Checked again from
  // scratch, then both vaults are written together (trade_swap) or not at all.
  async function execute(from: string, to: string, give: string[], get: string[], { offerId = null, listingId = null, actor }: any) {
    const [ua, ub] = await Promise.all([userOf(from), userOf(to)]);
    const [na, nb] = await Promise.all([nameOf(from), nameOf(to)]);
    const other = actor === from ? to : from;
    for (let i = 0; i < 5; i++) {
      const [ra, rb] = await Promise.all([load(from), load(to)]);
      if (!ra || !rb) throw new Oops('That trade can’t happen any more.', 409);
      const whyA = await canTrade(ua, ra.data);
      const whyB = await canTrade(ub, rb.data);
      if (actor === from ? whyA : whyB) throw new Oops((actor === from ? whyA : whyB)!, 409);
      if (actor === from ? whyB : whyA) throw Object.assign(new Oops('They can’t trade right now. Try again later.', 409), { gone: false });
      const now = Date.now();
      const pa = sideProblem(ra.data, give, now);
      const pb = sideProblem(rb.data, get, now);
      const mineBad = actor === from ? pa : pb;
      const theirsBad = actor === from ? pb : pa;
      if (mineBad) throw Object.assign(new Oops(mineBad, 409), { gone: true });
      if (theirsBad) throw Object.assign(new Oops('Those cards aren’t available any more.', 409), { gone: true });
      const items = [...give.map((c) => ra.data.profile.items[c]), ...get.map((c) => rb.data.profile.items[c])];
      const seal = sealOf(items);
      const poor = (ra.data.profile.embers ?? 0) < seal ? from : (rb.data.profile.embers ?? 0) < seal ? to : null;
      if (poor) throw new Oops(poor === actor ? `The Trade Seal costs ${seal} Embers each. You have ${poor === from ? ra.data.profile.embers : rb.data.profile.embers}.` : `They need ${seal} Embers for the Trade Seal first.`, 409);
      const out = swapVaults(ra.data, rb.data, give, get, { now, seal, nameA: na, nameB: nb });
      const { data: ok, error } = await admin.rpc('trade_swap', { p_a: from, p_a_ver: ra.version, p_a_data: out.a, p_b: to, p_b_ver: rb.version, p_b_data: out.b });
      if (error && !/changed/i.test(error.message)) throw new Oops(error.message, 500);
      if (error || ok !== true) continue; // someone's vault changed meanwhile: read again
      const gaveA = give.map((c) => copyTag(ra.data.profile.items[c]));
      const gaveB = get.map((c) => copyTag(rb.data.profile.items[c]));
      await admin.from('trade_log').insert({ a: from, b: to, a_gave: gaveA, b_gave: gaveB, seal, offer_id: offerId, listing_id: listingId, created_at: iso(now) });
      await tidyAfter(from, give, to, get);
      const mine = actor === from ? out.a : out.b;
      return { ok: true, seal, gave: actor === from ? gaveA : gaveB, got: actor === from ? gaveB : gaveA, with: other === from ? na : nb, vault: pick(mine) };
    }
    throw new Oops('Busy, try again.', 409);
  }

  // copies that just moved: posts and offers that still name them can't happen now
  async function tidyAfter(a: string, aIds: string[], b: string, bIds: string[]) {
    for (const [uid, moved] of [[a, aIds], [b, bIds]] as [string, string[]][]) {
      if (!moved.length) continue;
      const gone = new Set(moved);
      const { data: posts } = await admin.from('trade_listings').select('id, have').eq('user_id', uid).eq('status', 'open');
      for (const p of posts ?? []) if ((p.have ?? []).some((t: any) => gone.has(t.copyId))) await admin.from('trade_listings').update({ status: 'done', closed_at: iso() }).eq('id', p.id).eq('status', 'open');
      const [{ data: out }, { data: inc }] = await Promise.all([
        admin.from('trade_offers').select('id, give').eq('from_id', uid).eq('status', 'open'),
        admin.from('trade_offers').select('id, get').eq('to_id', uid).eq('status', 'open'),
      ]);
      for (const o of out ?? []) if ((o.give ?? []).some((t: any) => gone.has(t.copyId))) await admin.from('trade_offers').update({ status: 'failed', reason: 'traded', decided_at: iso() }).eq('id', o.id).eq('status', 'open');
      for (const o of inc ?? []) if ((o.get ?? []).some((t: any) => gone.has(t.copyId))) await admin.from('trade_offers').update({ status: 'failed', reason: 'traded', decided_at: iso() }).eq('id', o.id).eq('status', 'open');
    }
  }

  // an offer, to a friend or on a Trade Board post
  async function offer(user: any, body: any) {
    const uid = user.id;
    const give = ids(body.give);
    const get = ids(body.get);
    if (!give.length) throw new Oops('Add at least one of your cards to the offer.');
    let to = String(body.to ?? '');
    let listing: any = null;
    let counterOf: any = null;
    if (body.counter) {
      // a counter-offer: answers an offer made to you, so it goes back to its sender
      const { data: o } = await admin.from('trade_offers').select('*').eq('id', String(body.counter)).maybeSingle();
      if (!o || o.to_id !== uid || o.status !== 'open' || Date.now() - Date.parse(o.created_at) >= TRADE.offerHours * HOUR) throw new Oops('That offer has closed.');
      counterOf = o;
      to = o.from_id;
    } else if (body.listing) {
      const { data } = await admin.from('trade_listings').select('*').eq('id', String(body.listing)).maybeSingle();
      if (!data || data.status !== 'open') throw new Oops('That post is gone.');
      listing = data;
      to = data.user_id;
      // an offer on a post asks for everything in it
      const want = (data.have ?? []).map((t: any) => t.copyId);
      if (get.length !== want.length || get.some((c) => !want.includes(c))) throw new Oops('That offer doesn’t work.');
    } else await mustBeFriends(uid, to);
    if (to === uid) throw new Oops('That’s your own post.');
    if (await blocked(uid, to)) throw new Oops('You can’t trade with that player.');
    const me = (await load(uid))?.data;
    const why = await canTrade(user, me);
    if (why) throw new Oops(why, 403);
    const p1 = sideProblem(me, give, Date.now());
    if (p1) throw new Oops(p1);
    const them = (await load(to))?.data;
    if (!them || sideProblem(them, get, Date.now())) throw new Oops('Those cards aren’t available any more.');
    const { data: open } = await admin.from('trade_offers').select('id, to_id, listing_id, created_at').eq('from_id', uid).eq('status', 'open');
    const live = (open ?? []).filter((o: any) => Date.now() - Date.parse(o.created_at) < TRADE.offerHours * HOUR);
    if (live.length >= TRADE.maxOffersOut) throw new Oops(`You have ${TRADE.maxOffersOut} offers waiting. Cancel one or wait for answers.`);
    // a new offer to the same person (or post) replaces the old one
    for (const o of live) if (o.to_id === to && (counterOf || (o.listing_id ?? null) === (listing?.id ?? null))) await admin.from('trade_offers').update({ status: 'cancelled', reason: 'replaced', decided_at: iso() }).eq('id', o.id).eq('status', 'open');
    const giveT = give.map((c) => copyTag(me.profile.items[c]));
    const getT = get.map((c) => copyTag(them.profile.items[c]));
    const seal = sealOf([...give.map((c) => me.profile.items[c]), ...get.map((c) => them.profile.items[c])]);
    const { data: row, error } = await admin.from('trade_offers').insert({ from_id: uid, to_id: to, give: giveT, get: getT, listing_id: listing?.id ?? counterOf?.listing_id ?? null, counter_of: counterOf?.id ?? null, seal, status: 'open', created_at: iso() }).select('id').single();
    if (error) throw new Oops(error.message, 500);
    // the offer it answers is settled by the counter
    if (counterOf) await admin.from('trade_offers').update({ status: 'countered', decided_at: iso() }).eq('id', counterOf.id).eq('status', 'open');
    return { ok: true, id: row.id, seal };
  }

  async function respond(user: any, body: any) {
    const uid = user.id;
    const { data: o } = await admin.from('trade_offers').select('*').eq('id', String(body.id ?? '')).maybeSingle();
    if (!o || o.to_id !== uid) throw new Oops('That offer isn’t there any more.');
    if (o.status !== 'open' || Date.now() - Date.parse(o.created_at) >= TRADE.offerHours * HOUR) throw new Oops('That offer has closed.');
    if (!body.accept) {
      await admin.from('trade_offers').update({ status: 'declined', decided_at: iso() }).eq('id', o.id).eq('status', 'open');
      return { ok: true, declined: true };
    }
    if (await blocked(uid, o.from_id)) throw new Oops('You can’t trade with that player.');
    if (!o.listing_id && !o.counter_of && (await rel(uid, o.from_id)) !== 'friends') throw new Oops('You’re not friends with that player any more.');
    // claim the offer first, so two taps (or two devices) can't run it twice
    const { data: took } = await admin.from('trade_offers').update({ status: 'done', decided_at: iso() }).eq('id', o.id).eq('status', 'open').select('id');
    if (!took?.length) throw new Oops('That offer has closed.');
    try {
      const r = await execute(o.from_id, uid, o.give.map((t: any) => t.copyId), o.get.map((t: any) => t.copyId), { offerId: o.id, listingId: o.listing_id, actor: uid });
      return r; // a post whose cards moved closes itself (tidyAfter)
    } catch (e) {
      // it didn't happen: the offer stays open unless it can never happen now
      await admin.from('trade_offers').update((e as any).gone ? { status: 'failed', reason: (e as Error).message.slice(0, 120) } : { status: 'open', decided_at: null }).eq('id', o.id);
      throw e;
    }
  }

  async function cancelOffer(uid: string, id: string) {
    const { data } = await admin.from('trade_offers').update({ status: 'cancelled', decided_at: iso() }).eq('id', String(id)).eq('from_id', uid).eq('status', 'open').select('id');
    return { ok: true, cancelled: !!data?.length };
  }

  const offerOut = (o: any, n: Map<string, string>, uid: string) => ({
    id: o.id,
    mine: o.from_id === uid,
    with: n.get(o.from_id === uid ? o.to_id : o.from_id) || 'Player',
    withId: o.from_id === uid ? o.to_id : o.from_id,
    give: o.give,
    get: o.get,
    seal: o.seal,
    listing: o.listing_id,
    counter: !!o.counter_of,
    status: o.status,
    reason: o.reason,
    at: o.created_at,
    until: Date.parse(o.created_at) + TRADE.offerHours * HOUR,
  });

  async function trades(user: any) {
    const uid = user.id;
    const bl = await blockSet(uid);
    const [{ data: inc }, { data: out }, { data: la }, { data: lb }, { data: posts }] = await Promise.all([
      admin.from('trade_offers').select('*').eq('to_id', uid).order('created_at', { ascending: false }).limit(40),
      admin.from('trade_offers').select('*').eq('from_id', uid).order('created_at', { ascending: false }).limit(40),
      admin.from('trade_log').select('*').eq('a', uid).order('created_at', { ascending: false }).limit(10),
      admin.from('trade_log').select('*').eq('b', uid).order('created_at', { ascending: false }).limit(10),
      admin.from('trade_listings').select('*').eq('user_id', uid).eq('status', 'open').order('created_at', { ascending: false }),
    ]);
    const now = Date.now();
    // offers past their time close quietly
    for (const o of [...(inc ?? []), ...(out ?? [])])
      if (o.status === 'open' && now - Date.parse(o.created_at) >= TRADE.offerHours * HOUR) {
        o.status = 'expired';
        await admin.from('trade_offers').update({ status: 'expired', decided_at: iso() }).eq('id', o.id).eq('status', 'open');
      }
    const people = [...(inc ?? []).map((o: any) => o.from_id), ...(out ?? []).map((o: any) => o.to_id), ...(la ?? []).map((t: any) => t.b), ...(lb ?? []).map((t: any) => t.a)];
    const n = await names(people);
    // the Legacy of the copies on the other side of offers waiting on me
    const views: Record<string, any> = {};
    for (const o of (inc ?? []).filter((x: any) => x.status === 'open' && !bl.has(x.from_id)).slice(0, 12)) {
      const v = (await load(o.from_id))?.data;
      for (const t of o.give) if (v?.profile?.items?.[t.copyId]) views[t.copyId] = copyView(v.profile.items[t.copyId]);
    }
    for (const o of (out ?? []).filter((x: any) => x.status === 'open').slice(0, 12)) {
      const v = (await load(o.to_id))?.data;
      for (const t of o.get) if (v?.profile?.items?.[t.copyId]) views[t.copyId] = copyView(v.profile.items[t.copyId]);
    }
    const history = [...(la ?? []), ...(lb ?? [])]
      .sort((x: any, y: any) => (x.created_at < y.created_at ? 1 : -1))
      .slice(0, 10)
      .map((t: any) => ({ at: t.created_at, with: n.get(t.a === uid ? t.b : t.a) || 'Player', gave: t.a === uid ? t.a_gave : t.b_gave, got: t.a === uid ? t.b_gave : t.a_gave, seal: t.seal }));
    return {
      incoming: (inc ?? []).filter((o: any) => o.status === 'open' && !bl.has(o.from_id)).map((o: any) => offerOut(o, n, uid)),
      outgoing: (out ?? []).filter((o: any) => o.status === 'open').map((o: any) => offerOut(o, n, uid)),
      closed: [...(inc ?? []), ...(out ?? [])].filter((o: any) => o.status !== 'open' && o.status !== 'done' && now - Date.parse(o.decided_at || o.created_at) < 3 * DAY).slice(0, 10).map((o: any) => offerOut(o, n, uid)),
      posts: (posts ?? []).map(postOut),
      history,
      views,
      ...(await tradeState(user)),
    };
  }

  // ---- the Trade Board -----------------------------------------------------------------------
  const postOut = (p: any) => ({ id: p.id, by: p.user_id, name: p.name, have: p.have, want: p.want, at: p.created_at, until: Date.parse(p.created_at) + TRADE.listingDays * DAY });

  async function board(user: any, body: any) {
    const uid = user.id;
    const bl = await blockSet(uid);
    let q = admin.from('trade_listings').select('*').eq('status', 'open');
    const card = typeof body.card === 'string' && CARDS[body.card] ? body.card : null;
    if (card) q = q.ilike('cards', `%${card}%`);
    const { data } = await q.order('created_at', { ascending: false }).limit(80);
    const now = Date.now();
    const out = [];
    for (const p of data ?? []) {
      if (now - Date.parse(p.created_at) >= TRADE.listingDays * DAY) {
        await admin.from('trade_listings').update({ status: 'expired', closed_at: iso() }).eq('id', p.id).eq('status', 'open');
        continue;
      }
      if (bl.has(p.user_id)) continue;
      // card search: the id is in `cards` as a whole word
      if (card && !` ${p.cards} `.includes(` ${card} `)) continue;
      out.push(postOut(p));
    }
    return { posts: out.filter((p) => p.by !== uid).slice(0, 60), mine: out.filter((p) => p.by === uid), ...(await tradeState(user)) };
  }

  // one post up close: the Legacy of what's on offer
  async function postView(uid: string, id: string) {
    const { data: p } = await admin.from('trade_listings').select('*').eq('id', String(id)).maybeSingle();
    if (!p || p.status !== 'open' || (await blocked(uid, p.user_id))) throw new Oops('That post is gone.');
    const v = (await load(p.user_id))?.data;
    const copies = (p.have ?? []).map((t: any) => copyView(v?.profile?.items?.[t.copyId]) ?? { ...t, gone: true });
    return { post: postOut(p), copies };
  }

  async function post(user: any, body: any) {
    const uid = user.id;
    const have = ids(body.have);
    const want = (Array.isArray(body.want) ? body.want : []).filter((c: any) => typeof c === 'string' && CARDS[c]);
    if (!have.length || have.length > TRADE.maxHave) throw new Oops(`Put 1 to ${TRADE.maxHave} of your cards up.`);
    if (want.length > TRADE.maxWant) throw new Oops(`Ask for up to ${TRADE.maxWant} cards.`);
    const me = (await load(uid))?.data;
    const why = await canTrade(user, me);
    if (why) throw new Oops(why, 403);
    const p1 = sideProblem(me, have, Date.now());
    if (p1) throw new Oops(p1);
    const { data: open } = await admin.from('trade_listings').select('id, created_at').eq('user_id', uid).eq('status', 'open');
    if ((open ?? []).filter((p: any) => Date.now() - Date.parse(p.created_at) < TRADE.listingDays * DAY).length >= TRADE.maxListings) throw new Oops(`You have ${TRADE.maxListings} posts up. Take one down first.`);
    const tags = have.map((c) => copyTag(me.profile.items[c]));
    const { data: row, error } = await admin
      .from('trade_listings')
      .insert({ user_id: uid, name: await nameOf(uid), have: tags, want, cards: [...new Set([...tags.map((t) => t.cardId), ...want])].join(' '), status: 'open', created_at: iso() })
      .select('id')
      .single();
    if (error) throw new Oops(error.message, 500);
    return { ok: true, id: row.id };
  }

  async function unpost(uid: string, id: string) {
    await admin.from('trade_listings').update({ status: 'cancelled', closed_at: iso() }).eq('id', String(id)).eq('user_id', uid).eq('status', 'open');
    // offers on it close with it
    await admin.from('trade_offers').update({ status: 'cancelled', reason: 'post removed', decided_at: iso() }).eq('listing_id', String(id)).eq('status', 'open');
    return { ok: true };
  }

  // take a post as it stands: give exactly the cards it asks for
  async function take(user: any, body: any) {
    const uid = user.id;
    const { data: p } = await admin.from('trade_listings').select('*').eq('id', String(body.id ?? '')).maybeSingle();
    if (!p || p.status !== 'open' || Date.now() - Date.parse(p.created_at) >= TRADE.listingDays * DAY) throw new Oops('That post is gone.');
    if (p.user_id === uid) throw new Oops('That’s your own post.');
    if (!p.want?.length) throw new Oops('Make them an offer instead.');
    if (await blocked(uid, p.user_id)) throw new Oops('That post is gone.');
    const give = ids(body.give);
    const me = (await load(uid))?.data;
    const items = give.map((c) => me?.profile?.items?.[c]);
    if (items.some((x) => !x) || !meetsWant(p.want, items)) throw new Oops('Give one copy of each card they asked for.');
    let r;
    try {
      r = await execute(uid, p.user_id, give, p.have.map((t: any) => t.copyId), { listingId: p.id, actor: uid });
    } catch (e) {
      if ((e as Error).message === 'Those cards aren’t available any more.') await admin.from('trade_listings').update({ status: 'cancelled', closed_at: iso() }).eq('id', p.id).eq('status', 'open');
      throw e;
    }
    await admin.from('trade_listings').update({ status: 'done', closed_at: iso() }).eq('id', p.id).eq('status', 'open');
    return r;
  }

  // ---- the action ------------------------------------------------------------------------------
  return async function social(user: any, body: any) {
    if (isGuestUser(user)) throw new Oops('Save your profile to add friends and trade.', 403);
    const uid = user.id;
    const id = String(body.id ?? '');
    switch (String(body.op ?? '')) {
      case 'status': return status(user);
      case 'ping': return ping(uid);
      case 'add': return addFriend(uid, body);
      case 'accept': return acceptFriend(uid, id);
      case 'decline': await decline(uid, id); return { ok: true };
      case 'remove': await unfriend(uid, id); return { ok: true };
      case 'settings': return settings(uid, body);
      case 'block': return block(uid, id);
      case 'unblock': await admin.from('player_blocks').delete().eq('blocker', uid).eq('blocked', id); return { ok: true };
      case 'messages': return messages(uid, id);
      case 'send': return send(uid, body);
      case 'vault': return friendVault(uid, id);
      case 'trades': return trades(user);
      case 'offer': return offer(user, body);
      case 'respond': return respond(user, body);
      case 'cancel': return cancelOffer(uid, id);
      case 'counterView': return counterView(uid, id);
      case 'board': return board(user, body);
      case 'postView': return postView(uid, id);
      case 'post': return post(user, body);
      case 'unpost': return unpost(uid, id);
      case 'take': return take(user, body);
    }
    throw new Oops('Unknown action.');
  };
}
