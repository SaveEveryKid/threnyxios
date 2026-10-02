// INVITE FRIENDS — your code and link, friends you've brought in and how close
// each is to counting, the rewards, and the one-time share bonus. The server
// (economy function, op 'referral') decides who counts; this only shows it.
import * as vault from '../core/vault.js';
import * as cloud from '../core/cloud.js';
import { esc } from '../ui/card.js';
import { copyText } from '../ui/copy.js';
import { packText } from '../../../engine/goals.js';
import { REFERRAL, SHARE_CHIMES } from '../../../engine/referral.js';

const linkFor = (code) => `${location.origin}${location.pathname.replace(/[^/]*$/, '')}?ref=${code}`;
const shareText = (code) => `Come play THRENYX with me: a dark-fantasy card game you play in your browser. Use my invite code ${code} for a free Pack Ticket.`;
const bar = (n, of, label) => `<div class="inv-bar"><span>${label}</span><i><b style="width:${Math.min(100, (100 * n) / of)}%"></b></i><em>${Math.min(n, of)}/${of}</em></div>`;

export async function render(root, params, ctx) {
  root.innerHTML = `
    <div class="kicker">Friends</div><div class="h1">Invite friends</div>
    <div class="lore" style="margin:4px 0 12px">Bring friends into the Reckoning. When they've really played, you both get packs.</div>
    <div data-body><div class="panel muted" style="text-align:center;padding:24px">Loading…</div></div>`;
  const body = root.querySelector('[data-body]');
  let st;
  try {
    await cloud.ready;
    st = await vault.referral('status');
  } catch (e) {
    body.innerHTML = `<div class="panel" style="padding:18px"><b>Invites aren't open yet</b><div class="muted" style="margin-top:6px">${esc(/Sign in/.test(e.message) ? 'Sign in to get your invite code.' : 'Check back soon.')}</div></div>`;
    return;
  }
  if (st.got?.newly || st.welcome) ctx.refreshChrome?.();
  const link = linkFor(st.code);
  const paying = Math.min(st.counted, REFERRAL.cap);
  const tiers = Array.from({ length: REFERRAL.cap }, (_, i) => i + 1)
    .filter((n) => n === 1 || REFERRAL.milestones.some((m) => m.at === n))
    .map((n) => {
      const extra = REFERRAL.milestones.find((m) => m.at === n);
      return `<div class="inv-tier ${st.counted >= n ? 'done' : ''}"><b>${n}</b><span>${n === 1 ? `Each friend: ${packText(REFERRAL.perFriend)}` : `Bonus: ${packText(extra.packs)}`}</span>${st.counted >= n ? '<em>✓</em>' : ''}</div>`;
    })
    .join('');
  body.innerHTML = `
    <div class="panel panel--gold inv-share">
      <div class="kicker">Share THRENYX</div>
      <div class="inv-share__head"><b>+${SHARE_CHIMES} Chimes</b><span>${st.shared ? 'Claimed ✓ · thanks for sharing' : 'One time · a Standard Pack’s worth'}</span></div>
      <div class="inv-share__btns">
        <button class="btn btn--sm inv-fb" data-fb>Share on Facebook</button>
        ${navigator.share ? '<button class="btn btn--sm btn--ghost" data-share>More ways…</button>' : ''}
      </div>
    </div>

    <div class="panel" style="margin-top:14px;padding:14px">
      <div class="kicker">Your invite code</div>
      <button class="code-copy" data-copy style="margin-top:8px;width:100%"><b>${esc(st.code)}</b><span>Tap to copy your invite link</span></button>
      <div class="muted" style="font-size:12px;margin-top:8px;word-break:break-all">${esc(link)}</div>
    </div>

    <div class="panel" style="margin-top:14px;padding:14px">
      <div class="row"><div class="kicker grow">Friends who count</div><b class="gold">${paying}/${REFERRAL.cap}</b></div>
      ${st.friends.length ? st.friends.map((f) => `
        <div class="inv-friend">
          <div class="row"><b class="grow">${esc(f.name)}</b>${f.counted ? '<span class="gold">Counts ✓</span>' : '<span class="muted">Playing…</span>'}</div>
          ${f.counted ? '' : bar(Math.min(f.duels || 0, REFERRAL.duels), REFERRAL.duels, 'Duels played') + (f.guest ? '<div class="muted" style="font-size:12px;margin-top:4px">Still playing as a guest: they count once they save their profile.</div>' : '')}
        </div>`).join('') : '<div class="muted" style="font-size:14px;margin-top:6px">No one yet. Send your link to a friend.</div>'}
      ${st.counted > REFERRAL.cap ? `<div class="muted" style="font-size:12px;margin-top:8px">${st.counted} friends count. Rewards stop at ${REFERRAL.cap}, but your count keeps going.</div>` : ''}
    </div>

    <div class="panel" style="margin-top:14px;padding:14px">
      <div class="kicker" style="margin-bottom:6px">Rewards</div>
      ${tiers}
      <div class="inv-tier"><b>You</b><span>Your friend: ${packText(REFERRAL.welcome)} when they finish training</span></div>
    </div>

    <div class="panel" style="margin-top:14px;padding:14px;font-size:14px;line-height:1.5">
      <div class="kicker" style="margin-bottom:6px">When a friend counts</div>
      They join with your link or code, play <b>${REFERRAL.duels} Duels</b> and save their profile. That's it: you get a pack, and Collector Packs at ${REFERRAL.milestones.map((m) => m.at).join(', ').replace(/, (\d+)$/, ' and $1')} friends (up to ${REFERRAL.cap} friends). Codes can be entered in an account's first ${REFERRAL.enterDays} days.
    </div>

    ${st.canEnter ? `
    <div class="panel" style="margin-top:14px;padding:14px">
      <div class="kicker">Got a friend's code?</div>
      <div class="row" style="gap:8px;margin-top:8px">
        <input data-code maxlength="12" placeholder="CODE" autocapitalize="characters" class="inv-input">
        <button class="btn btn--sm" data-enter>Add</button>
      </div>
    </div>` : st.joinedWithCode ? '<div class="muted" style="font-size:13px;margin-top:12px;text-align:center">You joined with a friend’s code.</div>' : ''}`;

  root.querySelector('[data-copy]').onclick = async () => ctx.toast((await copyText(link)) ? 'Invite link copied' : link);

  // the share bonus: paid when you open a share (we can't see what you post)
  const bonus = async () => {
    if (st.shared) return;
    try {
      const r = await vault.act('shareBonus');
      st.shared = true;
      if (r?.chimes) {
        ctx.toast(`+${r.chimes} Chimes · thanks for sharing!`);
        ctx.refreshChrome?.();
        const head = root.querySelector('.inv-share__head span');
        if (head) head.textContent = 'Claimed ✓ · thanks for sharing';
      }
    } catch (e) {
      ctx.toast(e.message);
    }
  };
  // On phones the Facebook app takes over facebook.com links and drops the
  // "share this" part, so phones use the share menu (Facebook is in it) and
  // pay only when the share goes through. Computers use Facebook's share page.
  const phone = matchMedia('(pointer: coarse)').matches && !!navigator.share;
  root.querySelector('[data-fb]').onclick = async () => {
    if (phone) {
      ctx.toast('Pick Facebook in the share menu');
      try {
        await navigator.share({ url: link }); // just the link: Facebook ignores text
        bonus();
      } catch {} // closed without sharing
      return;
    }
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`, '_blank', 'noopener');
    bonus();
  };
  root.querySelector('[data-share]')?.addEventListener('click', async () => {
    try {
      await navigator.share({ title: 'THRENYX', text: shareText(st.code), url: link });
      bonus();
    } catch {} // closed without sharing
  });
  root.querySelector('[data-enter]')?.addEventListener('click', async (e) => {
    const code = root.querySelector('[data-code]').value.trim();
    if (!code) return;
    e.target.disabled = true;
    try {
      await vault.referral('enter', { code });
      ctx.toast('Code added. Finish training for your welcome Pack Ticket.');
      render(root, params, ctx);
    } catch (err) {
      ctx.toast(err.message);
      e.target.disabled = false;
    }
  });
}
