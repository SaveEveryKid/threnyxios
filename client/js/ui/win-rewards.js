// What online wins pay (engine/economy.js WIN_REWARD), and how many of today's
// AI-match rewards are left (AI_REWARDS_PER_DAY).
import { WIN_REWARD, AI_REWARDS_PER_DAY } from '../../../engine/economy.js';
import { dayKey } from '../core/store.js';

export const aiRewardsLeft = (econ = {}) => (econ.day === dayKey() ? Math.max(0, AI_REWARDS_PER_DAY - (econ.ai || 0)) : AI_REWARDS_PER_DAY);

export function aiRewardsLine(econ) {
  const left = aiRewardsLeft(econ);
  return left ? `AI matches pay ${left} more time${left === 1 ? '' : 's'} today` : 'AI rewards used for today · ranked online always pays';
}

export function winRewardsPanel(econ = {}) {
  const today = econ.pvpDay === dayKey();
  const streak = econ.pvpStreak || 0;
  return `<div class="panel" style="margin-top:12px">
    <div class="kicker">Ranked rewards · no daily limit</div>
    <div class="objective ${today ? 'done' : ''}"><i class="chk"></i><span class="grow">First win today</span><b class="gold">${today ? 'Earned' : 'Collector Pack Ticket'}</b></div>
    <div class="objective"><span class="grow">Every win</span><b class="gold">+${WIN_REWARD.embers} Embers</b></div>
    <div class="objective"><span class="grow">${WIN_REWARD.streakEvery} wins in a row <span class="pips" style="display:inline-flex;vertical-align:middle;margin-left:6px">${Array.from({ length: WIN_REWARD.streakEvery }, (_, i) => `<i class="pip ${i < streak % WIN_REWARD.streakEvery ? 'on' : ''}"></i>`).join('')}</span></span><b class="gold">Pack Ticket</b></div>
    <div class="muted" style="font-size:12px;margin-top:8px">Echoes are AI: they pay within the daily AI limit. ${aiRewardsLine(econ)}.</div>
  </div>`;
}
