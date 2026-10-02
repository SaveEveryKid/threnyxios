// Guest play end to end in a real browser (docs/18-guest-play.md): the landing,
// skipping into a real Duel, the guest limit, saving the profile (and a failed
// save), coming back, a friend's Duel link, expired links.
// Usage: bash tools/build-site.sh && (cd site && python3 -m http.server 8091) &
//        node sim/browser/guest-flows.mjs
import { browser, page, open, text, fake, shot, ok, done, tappable, BASE } from './lib.mjs';

// ---- A + B: a stranger from Facebook, impatient: landing → Skip → a real Duel, no account
{
  const p = await page();
  await open(p);
  const t = await text(p);
  ok(/Outthink them/i.test(t) && /Learn to Duel/i.test(t) && /Skip training/i.test(t) && /Sign in/i.test(t), 'landing: Learn to Duel, Skip training, Sign in');
  ok(!/Create (free )?account/i.test(t), 'landing: no registration in the way');
  ok(!(await fake(p)).db.vaults.length && !Object.keys((await fake(p)).users).length, 'nobody is created just for visiting');
  await shot(p, 'landing');
  const tp = await tappable(p);
  ok(!tp.length, 'landing: every control on screen, big enough' + (tp.length ? ' — ' + tp.join('; ') : ''));
  await p.click('[data-skip]');
  await p.waitForTimeout(400);
  ok(/Jump straight into a Duel/i.test(await text(p, '.modal')), 'skip asks one short question');
  await shot(p, 'skip');
  await p.click('.modal [data-yes]');
  await p.waitForSelector('.dl', { timeout: 15000 }).catch(() => {});
  ok(await p.locator('.dl').count(), 'Play now drops them into a real Duel');
  const f = await fake(p);
  const guestId = Object.keys(f.users).find((id) => id.startsWith('guest'));
  ok(guestId && f.users[guestId].is_anonymous, 'they are a guest player now (a real player, no account)');
  const v = f.db.vaults.find((x) => x.user_id === guestId);
  ok(v && Object.keys(v.data.profile.copies).length >= 16, 'their starter Champions are on the server');
  ok(v.data.econ.guest?.starts?.length === 1, 'the Duel was started on their guest allowance');
  const ev = f.db.funnel_events.map((e) => e.name);
  ok(['visitor_landing', 'training_skipped', 'guest_created', 'guest_duel_started'].every((n) => ev.includes(n)), 'funnel: ' + [...new Set(ev)].join(', '));
  await shot(p, 'guest-duel');
  ok(!/likely win|best move|recommended/i.test(await text(p, '.dl')), 'no predictions in the Duel');
  // finish by forfeiting
  await p.click('[data-quit]'); await p.waitForTimeout(150); await p.click('[data-quit]');
  await p.waitForSelector('.result', { timeout: 15000 });
  await p.waitForTimeout(1500);
  ok(/Save profile/i.test(await text(p, '.result')), 'result: a gentle Save profile option, not a wall');
  await shot(p, 'guest-result');
  await p.click('.result [data-continue]');
  await p.waitForTimeout(1500);
  ok(/Save your profile/i.test(await text(p)) && !/remaining|\d+:\d\d/i.test(await text(p, '.guest-save')), 'home: a save banner, no countdown');
  await shot(p, 'guest-home');
  // ---- D: they leave and come back: still the same guest, no training again
  await p.reload(); await p.waitForTimeout(1200); await p.locator('.splash').click().catch(() => {}); await p.waitForTimeout(2000);
  ok(/#\/home|#\/$|^[^#]*$/.test(p.url()) && !(await p.locator('.landing').count()) && /Save your profile/i.test(await text(p)), 'after a refresh: the same guest, straight back home');
  // ---- C: the limit: the next Duel asks them to save
  await p.evaluate((id) => { const v = window.__fake.db.vaults.find((x) => x.user_id === id); v.data.econ.guest.duels = 5; v.data.econ.guest.starts = []; window.__fake.persist(); }, guestId);
  await p.evaluate(() => (location.hash = '#/play'));
  await p.waitForTimeout(1500);
  await p.click('[data-ladder]');
  await p.waitForTimeout(2500);
  const gate = await text(p);
  ok(/Save your THRENYX profile/i.test(gate) && /Champions in your collection/i.test(gate), 'after the free Duels: SAVE YOUR THRENYX PROFILE, with what they’d keep');
  ok(!(await p.locator('.dl').count()), 'and no new Duel started');
  await shot(p, 'gate');
  const copiesBefore = JSON.stringify((await fake(p)).db.vaults.find((x) => x.user_id === guestId).data.profile.copies);
  // a failed save: nothing lost, a way to try again
  await p.evaluate(() => (window.__fake.cfg.failConvert = true));
  await p.click('[data-save]');
  await p.waitForTimeout(400);
  await p.fill('.modal [data-user]', 'Skipper_7');
  await p.fill('.modal [data-pass]', 'goodpassword');
  await shot(p, 'save-modal');
  await p.click('.modal [data-go]');
  await p.waitForTimeout(1500);
  ok(/couldn.t save|network down/i.test(await text(p, '.modal')), 'a failed save says so, and keeps them where they were');
  ok(JSON.stringify((await fake(p)).db.vaults.find((x) => x.user_id === guestId).data.profile.copies) === copiesBefore, 'nothing lost on a failed save');
  await p.evaluate(() => (window.__fake.cfg.failConvert = false));
  await p.click('.modal [data-go]');
  await p.waitForTimeout(2500);
  const f2 = await fake(p);
  ok(f2.users[guestId].app_metadata?.threnyx_account && f2.users[guestId].email === 'skipper_7@players.test', 'the same player is now a saved profile');
  ok(JSON.stringify(f2.db.vaults.find((x) => x.user_id === guestId).data.profile.copies) === copiesBefore, 'every Champion is still theirs');
  ok(/#\/play/.test(p.url()), 'saving from the gate takes them back to Battle');
  await p.click('[data-ladder]');
  await p.waitForTimeout(2500);
  ok(await p.locator('.dl').count(), 'and the next Duel just starts');
  ok(!p.errs.length, 'no errors: ' + p.errs.slice(0, 3).join(' | '));
  await p.context().close();
}

// ---- E: a friend's link
async function seedHost(p, { code = 'ABC234', old = false } = {}) {
  await p.goto(BASE + 'client/legal/terms.html');
  await p.evaluate(({ code, old }) => {
    const users = { 'user-byron': { id: 'user-byron', email: 'byron@players.test', password: 'x', is_anonymous: false, app_metadata: {}, user_metadata: { username: 'Byron' }, created_at: new Date().toISOString() } };
    const at = new Date(Date.now() - (old ? 30 : 0) * 3600000).toISOString();
    const db = { pvp_matches: [{ id: 'm-' + code, a: 'user-byron', b: null, code, status: 'open', version: 0, created_at: at, updated_at: at, data: { host: { user_id: 'user-byron', name: 'Byron', rating: 1000, deck: ['odo', 'ossian', 'pip', 'ione', 'mote', 'dunstan', 'tamsin', 'anselm'] } } }], pvp_profiles: [{ user_id: 'user-byron', name: 'Byron', rating: 1000, wins: 0, losses: 0 }] };
    localStorage.setItem('fake.users', JSON.stringify(users));
    localStorage.setItem('fake.db', JSON.stringify(db));
  }, { code, old });
}
{
  const p = await page({ w: 375, h: 667 });
  await seedHost(p);
  await open(p, BASE + '?duel=abc234');
  ok(/#\/duel\?code=ABC234/.test(p.url()), 'the link opens the invitation (the address keeps it, for a refresh)');
  const t = await text(p);
  ok(/Byron challenged you to a Duel/i.test(t) && /Accept Duel/i.test(t), 'BYRON CHALLENGED YOU TO A DUEL · Accept Duel');
  ok(/60-second training/i.test(t), 'new players can take a 60-second lesson, but don’t have to');
  await shot(p, 'invite');
  await p.reload(); await p.waitForTimeout(1200); await p.locator('.splash').click().catch(() => {}); await p.waitForTimeout(1800);
  ok(/Byron challenged you/i.test(await text(p)), 'a refresh comes back to the same invitation');
  await p.click('[data-accept]');
  await p.waitForTimeout(500);
  ok(/Pick a name/i.test(await text(p, '[data-msg]')), 'they’re asked for a name first');
  await p.fill('[data-name]', 'Pal');
  await p.locator('[data-name]').focus();
  await shot(p, 'invite-name');
  await p.click('[data-accept]');
  await p.waitForSelector('.dl', { timeout: 15000 }).catch(() => {});
  ok(await p.locator('.dl').count(), 'Accept → straight into the Duel against Byron, no account, no code');
  const f = await fake(p);
  const g = Object.values(f.users).find((u) => u.is_anonymous);
  ok(g && f.db.pvp_matches.find((m) => m.id === 'm-ABC234').b === g.id, 'the guest joined Byron’s match');
  ok(f.db.pvp_profiles.find((x) => x.user_id === g.id)?.name === 'Pal' && f.db.pvp_profiles.find((x) => x.user_id === g.id)?.guest, 'as “Pal”, marked as a guest');
  ok(/Byron/.test(await text(p, '.dl')), 'Byron is across the table');
  await shot(p, 'invite-duel');
  ok(['friend_invite_opened', 'guest_created', 'friend_invite_accepted'].every((n) => f.db.funnel_events.some((e) => e.name === n)), 'funnel: invite opened → guest → accepted');
  ok(!p.errs.length, 'no errors: ' + p.errs.slice(0, 3).join(' | '));
  await p.context().close();
}
{
  const p = await page();
  await seedHost(p, { code: 'OLD234', old: true });
  await open(p, BASE + '?duel=OLD234');
  const t = await text(p);
  ok(/This Duel invitation has expired/i.test(t) && /Start training/i.test(t) && /Play THRENYX/i.test(t), 'an old link: THIS DUEL INVITATION HAS EXPIRED, with ways to play');
  await shot(p, 'expired');
  await open(p, BASE + '?duel=ZZZZZZ');
  ok(/expired/i.test(await text(p)), 'a made-up code: the same friendly page, never a blank one');
  await p.context().close();
}

// ---- a guest past the limit still gets their friend's Duel; Ranked asks to save first
{
  const p = await page();
  await open(p);
  await p.click('[data-skip]'); await p.waitForTimeout(300); await p.click('.modal [data-yes]');
  await p.waitForSelector('.dl', { timeout: 15000 });
  await p.click('[data-quit]'); await p.waitForTimeout(150); await p.click('[data-quit]');
  await p.waitForSelector('.result', { timeout: 15000 });
  const gid = Object.keys((await fake(p)).users).find((id) => id.startsWith('guest'));
  await p.evaluate((id) => {
    const f = window.__fake;
    const v = f.db.vaults.find((x) => x.user_id === id);
    v.data.econ.guest.duels = 5; v.data.econ.guest.starts = [];
    f.users['user-byron'] = { id: 'user-byron', email: 'byron@players.test', password: 'x', is_anonymous: false, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
    f.db.pvp_matches.push({ id: 'm-LATE23', a: 'user-byron', b: null, code: 'LATE23', status: 'open', version: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), data: { host: { user_id: 'user-byron', name: 'Byron', rating: 1000, deck: ['odo', 'ossian', 'pip', 'ione', 'mote', 'dunstan', 'tamsin', 'anselm'] } } });
    f.persist();
  }, gid);
  await p.evaluate(() => (location.hash = '#/online'));
  await p.waitForTimeout(1500);
  ok(/Ranked needs a saved profile/i.test(await text(p)), 'a guest reaching for Ranked: “Ranked needs a saved profile”');
  await open(p, BASE + '?duel=LATE23');
  await p.fill('[data-name]', 'Late');
  await p.click('[data-accept]');
  await p.waitForSelector('.dl', { timeout: 15000 }).catch(() => {});
  ok(await p.locator('.dl').count(), 'past the guest limit, a friend’s invitation still plays (the Duel they were sent)');
  ok(!p.errs.length, 'no errors: ' + p.errs.slice(0, 3).join(' | '));
  await p.context().close();
}

// ---- an existing player who lands on the guest page signs in, and nothing is made for them
{
  const p = await page();
  await p.goto(BASE + 'client/legal/terms.html');
  await p.evaluate(() => localStorage.setItem('fake.users', JSON.stringify({ 'user-old': { id: 'user-old', email: 'oldhand@players.idea.byrongreen2012.workers.dev', password: 'hunter2hunter2', is_anonymous: false, app_metadata: {}, user_metadata: { username: 'Oldhand' }, created_at: new Date().toISOString() } })));
  await open(p);
  await p.click('[data-signin]');
  await p.waitForTimeout(300);
  await p.fill('.modal [data-login]', 'Oldhand');
  await p.fill('.modal [data-pass]', 'hunter2hunter2');
  await p.click('.modal form button');
  await p.waitForTimeout(2500);
  const f = await fake(p);
  ok(!Object.keys(f.users).some((id) => id.startsWith('guest')), 'signing in from the landing makes no guest');
  ok(f.db.vaults.some((v) => v.user_id === 'user-old'), 'they’re in their own account');
  ok(!p.errs.length, 'no errors: ' + p.errs.slice(0, 3).join(' | '));
  await p.context().close();
}

// ---- learn to duel: training starts with no account, and the guest arrives at the first real Duel
{
  const p = await page();
  await open(p);
  await p.click('[data-learn]');
  await p.waitForTimeout(600);
  ok(await p.locator('.scene').count(), 'Learn to Duel starts training at once');
  ok(!Object.keys((await fake(p)).users).length, 'training needs no player at all');
  await p.context().close();
}
const bad = done();
await browser.close();
process.exit(bad ? 1 : 0);
