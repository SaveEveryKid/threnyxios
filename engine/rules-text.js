// THE RULES, in plain words: one entry per topic and per mode. The Rules
// screen (client/js/screens/rules.js) and docs/RULES.md (tools/rules-md.mjs)
// are both made from this, and the numbers come from the game's own settings,
// so the rules can't drift from what the game does.
import { DEFAULT_RULES as R } from './battle.js';
import { DUEL_RULES as D, CLUTCH_AT } from './duel.js';
import { ARCHETYPES, BOND_AT, BOND_POWER } from './archetypes.js';
import ARCH_TUNE from './data/arch-tune.js';
import { MYTHIC_MAX } from './deckbuild.js';
import { CLOCK, FORFEIT_AFTER, DROP_AFTER } from './pvp.js';
import { OKTOBER } from './oktober.js';
import { TRADE, SOCIAL } from './social.js';
import { AI_REWARDS_PER_DAY, WIN_REWARD, LIMITS, TIERS, DRAFT_REWARD } from './economy.js';
import { SEASON, ANOMALY_WINS } from './goals.js';
import { SPOILS_PER_DAY } from './collection.js';
import { FLOORS } from './road.js';
import { REFERRAL, SHARE_CHIMES } from './referral.js';
import { packText } from './goals.js';

const s = (n) => (n === 1 ? '' : 's');

export const RULE_GROUPS = [
  { id: 'basics', title: 'How to play' },
  { id: 'modes', title: 'Modes' },
  { id: 'events', title: 'Tournament' },
];

export const RULES = [
  // ---- how to play ------------------------------------------------------------
  {
    id: 'match', group: 'basics', title: 'A match in 60 seconds',
    summary: `${D.duels} duels, one Champion against one. Bring the other side’s Voice to 0.`,
    rules: [
      `Each player has <b>${D.voice} Voice</b> (your life, the bell) and a deck of 8 Champions, called an <b>Octave</b>. You hold ${D.hand}; the rest wait in your <b>Reserve</b>.`,
      `<b>Both hands are face up.</b> You always see what they could send, and they see yours.`,
      `A match is up to <b>${D.duels} duels</b>. In each duel one player <b>Leads</b>: they send a Champion first. The other <b>Answers</b>: they see it, then send one of theirs.`,
      `The Lead fights with its <b>Strike</b>, the Answer with its <b>Guard</b>. The higher number wins the duel.`,
      `The winner’s <b>Wound</b> (the blood drop) comes off the loser’s Voice. The losing Champion loses <b>Health</b> (its hearts, not your Voice) equal to the margin +1; a Champion at 0 Health <b>Falls</b>, and any extra spills into the Voice. A tie hurts both Champions by 1.`,
      `Survivors go to the bottom of your Reserve, and both players draw back up to ${D.hand}.`,
      `<b>Who Leads next:</b> whoever lost the duel. Falling behind gives you the stronger seat.`,
      `<b>The final duel counts double</b>: its Voice damage is ×2, so no match is over until it’s over.`,
      `<b>You win</b> if the other side’s Voice hits 0, or with the higher Voice after duel ${D.duels}.`,
    ],
    tip: 'Before you commit, the guide shows the numbers against each of their Champions (abilities, Bonds and Focus included). Who wins is yours to read. Watch their Focus and READ: when they glow, they can still use them on you.',
  },
  {
    id: 'tools', group: 'basics', title: 'Focus and READ',
    summary: 'Two ways to swing a duel, each with limited uses.',
    rules: [
      `<b>Focus</b> (${D.focus} per match): +${D.focusPower} to your Champion for one duel. The Answer adds it with its pick; the Lead adds it <b>last</b>, after seeing the Answer.`,
      `<b>READ</b> (${D.reads} per match): when you Lead and see their Answer, switch your Champion for another from your hand. Now they’re the ones surprised.`,
      `Some abilities give you an extra READ, block one, or stop Focus. Hold a card to read what it does.`,
    ],
  },
  {
    id: 'bonds', group: 'basics', title: 'Bonds: deck styles',
    summary: `${BOND_AT} Champions of one style in your Octave fight harder together.`,
    rules: [
      `Every Champion has one or two <b>styles</b> (shown on the card), from what it is and what its ability does.`,
      `Put <b>${BOND_AT} or more</b> Champions of one style in your Octave and they <b>Bond</b>: each of them gets the bonus below in every duel it fights (a Champion with two Bonds gets the better one).`,
      ...ARCHETYPES.map((a) => {
        const t = ARCH_TUNE[a.id] || 0;
        const at = (r) => { const v = Math.max(0, BOND_POWER[r] + t); return [Math.floor(v), Math.floor(v + 0.5)]; };
        const fmt = ([l, an]) => (l === an ? `+${l}` : `+${l} Leading, +${an} Answering`);
        const lo = fmt(at('common')), hi = fmt(at('legendary'));
        return `<b>${a.name}</b> (${a.text.replace(/\.$/, '')}): ${lo === hi ? lo : `${lo}; Legendaries and Mythics ${hi}`}.`;
      }),
      `<b>One Mythic per Octave</b> (at most ${MYTHIC_MAX}).`,
      `In the Octave builder, <b>Pick for me</b> offers your strongest builds, each around a different style. In a match, a gold +number on a card is its Bond bonus.`,
    ],
    tip: 'Commons count toward a Bond just like rarer cards: a Bond of commons beats a pile of unrelated rares more often than you’d think.',
  },
  {
    id: 'abilities', group: 'basics', title: 'Abilities',
    summary: 'Every Champion has one. They work in the duel it fights.',
    rules: [
      `<b>When Leading</b> / <b>when Answering</b>: only in a duel where this Champion Leads or Answers.`,
      `<b>The enemy it duels</b>: the Champion it is fighting this duel.`,
      `<b>Your Champions still to fight</b>: the ones in your hand and Reserve.`,
      `Ability names light up during the duel, and the guide lists which ones will trigger before you commit.`,
    ],
  },
  {
    id: 'leaving', group: 'basics', title: 'Forfeits, clocks and disconnects',
    summary: 'You can always forfeit. Online, the clock and your connection count.',
    rules: [
      `<b>Forfeit any match, any mode</b>: tap <b>⚑ Forfeit</b> (top right), then tap again to confirm. It counts as a loss. Life happens.`,
      `<b>Online move clock:</b> ${CLOCK.move / 1000} seconds for each turn (Lead, Answer, Focus/READ). If time runs out, a simple move is played for you: your biggest number, no Focus. Run out ${FORFEIT_AFTER} times in a row and you forfeit.`,
      `<b>Disconnects:</b> online, if the game doesn’t hear from you for <b>${DROP_AFTER / 1000} seconds</b>, you forfeit. Switching to another app counts, because phones pause the game. Your opponent sees a countdown.`,
      `<b>Emotes:</b> online against a real player, tap 💬 on the left edge for a quick phrase (Good luck, Well played…). One every few seconds. Not a fan? <b>Mute</b> is in the same menu. Echoes don’t chat.`,
    ],
  },
  {
    id: 'invite', group: 'basics', title: 'Invite friends and sharing',
    summary: `Share once for ${SHARE_CHIMES} Chimes. Friends who really play earn you packs, up to ${REFERRAL.cap}.`,
    rules: [
      `<b>Share bonus:</b> on <b>More → Invite friends</b>, tap <b>Share on Facebook</b> (or More ways…) and get <b>${SHARE_CHIMES} Chimes</b>, one time per account.`,
      `<b>Your invite code:</b> every account has one. Send your link; a friend can also type the code on the same screen in their first ${REFERRAL.enterDays} days.`,
      `<b>Your friend gets</b> ${packText(REFERRAL.welcome)} once they finish training.`,
      `<b>A friend counts</b> when they've played ${REFERRAL.duels} Duels and saved their profile.`,
      `<b>You get</b> ${packText(REFERRAL.perFriend)} for each friend who counts, plus ${REFERRAL.milestones.map((m) => `${packText(m.packs)} at ${m.at}`).join(', ')}. Rewards stop at ${REFERRAL.cap} friends; your count keeps going.`,
      `One code per player, never your own, and two friends can't invite each other.`,
    ],
  },
  {
    id: 'friends', group: 'basics', title: 'Friends',
    summary: 'Duel, trade and send quick messages. No typed chat: every message comes from a set list.',
    rules: [
      `<b>Add a friend</b> with their friend code (or their friend link), from <b>People you played</b> on the Friends screen, or with <b>Add as a friend</b> on the results of an online match. Up to ${SOCIAL.maxFriends} friends.`,
      `<b>Messages</b> are picked from a list (“Wanna Duel?”, “Check that trade I sent.”, “Good game!”…). Nobody can type to you, and nothing typed is ever sent.`,
      `<b>Wanna Duel?</b> sends your friend a Duel invitation with an Accept button. It works for 24 hours.`,
      `<b>Who can send you requests:</b> anyone with your code, only people you've played, or no one. Change it any time on the Friends screen. Gave your code to the wrong person? Get a new one and the old one stops working.`,
      `<b>Say no, remove or block:</b> a request you decline can't be sent again for a week. <b>Block</b> ends the friendship, messages, offers and Trade Board posts between you, and they can't ask again.`,
      `Friends need a saved profile.`,
    ],
  },
  {
    id: 'trading', group: 'basics', title: 'Trading',
    summary: `Trade cards with friends, or with anyone on the Trade Board. Every card's history goes with it.`,
    rules: [
      `<b>With a friend:</b> open their page and tap <b>Trade</b>. Pick what you want from their Vault (<b>Confirm selection</b>), pick what you'll give (<b>Confirm selection</b>), check the whole trade, then <b>Confirm trade</b>. They accept, decline or counter.`,
      `<b>Your active Octave stays put:</b> a card in the Octave you're using can't be traded (a spare copy of it can). Any other card can, even your only copy. Swap a card out of your Octave to trade it.`,
      `<b>The Trade Board:</b> post up to ${TRADE.maxHave} of your cards and up to ${TRADE.maxWant} cards you want. Anyone who has what you want can <b>Trade now</b>; posts that want nothing take offers instead. Posts stay up ${TRADE.listingDays} days, ${TRADE.maxListings} at a time.`,
      `<b>Offers</b> can't be changed once sent (send a new one, or they counter) and close after ${TRADE.offerHours} hours. You can't ask for cards without offering something.`,
      `<b>Counter:</b> any offer you get can be accepted, declined or countered. Counter opens the offer turned around, ready to change: add or take away cards on either side and send it back. They can counter again.`,
      `<b>Who can trade:</b> anyone with a saved profile. No waiting, no daily limit, no fee: trade as much as you like, and new cards trade straight away.`,
      `<b>You'll be told</b> when an offer or counter-offer arrives, when someone accepts your trade, and when someone takes your post: a banner in the game, a dot on Home, and the number on the app icon if THRENYX is on your home screen.`,
      `Only cards can be traded: never Chimes, Embers or Pack Tickets. Trades are final. Buying or selling cards for real money is against the Terms.`,
    ],
  },
  {
    id: 'rewards', group: 'basics', title: 'Rewards and daily limits',
    summary: `Ranked online always pays. AI matches pay ${AI_REWARDS_PER_DAY} times a day. Story chapters pay once.`,
    rules: [
      `<b>Ranked online (real people): no daily limit.</b> First win of the day: a Collector Pack Ticket. Every win: +${WIN_REWARD.embers} Embers. Every ${WIN_REWARD.streakEvery} wins in a row: a Pack Ticket.`,
      `<b>Matches against the AI</b> (Ladder, Rivals, Anomaly, Echoes, friendly games) pay <b>${AI_REWARDS_PER_DAY} times a day</b>. After that they still count for your rank and your cards’ histories, but pay nothing until tomorrow.`,
      `<b>Story:</b> each chapter pays its reward once, the first time you win it.`,
      `<b>Spoils:</b> win and you take a card from your opponent, ${SPOILS_PER_DAY} times a day (Embers after that). A loss gives a few Embers.`,
      `<b>Weekly season:</b> wins this week fill a track: ${SEASON.map((x) => `${x.wins} wins, ${x.text}`).join('; ')}.`,
      `Draft pays up to ${LIMITS.draftsPerDay} times a day and the Long Road up to ${LIMITS.roadPerDay}. Days reset at midnight UTC (7 pm Central, 6 pm in winter).`,
    ],
  },

  // ---- modes -------------------------------------------------------------------
  {
    id: 'story', group: 'modes', title: 'Story: Firstfall',
    summary: 'Ten chapters. Each one teaches one idea and pays its reward once.',
    rules: [
      `Play the chapters in order; winning one unlocks the next.`,
      `Each chapter pays its reward the <b>first time you win it</b>. Replays are for fun and pay nothing.`,
      `Some chapters change the rules for that battle; the chapter tells you how before it starts.`,
    ],
  },
  {
    id: 'ladder', group: 'modes', title: 'Ladder',
    summary: 'Climb seven ranks against the game’s duelists.',
    rules: [
      `Ranks, lowest to highest: ${TIERS.join(', ')}. Each rank has 5 divisions (V up to I).`,
      `A win earns a <b>Note</b>; 4 Notes move you up a division. A win with your Voice at ${CLUTCH_AT} or less earns a bonus Note.`,
      `A loss costs a Note. Below ${TIERS[3]} a loss never drops you a division, and you can never drop a whole rank.`,
      `Reaching a new rank pays packs, once each. Ladder matches are AI matches: past the daily limit of ${AI_REWARDS_PER_DAY} your rank still moves, but rewards wait until tomorrow.`,
    ],
  },
  {
    id: 'ranked', group: 'modes', title: 'Online: Ranked',
    summary: 'Real people near your rating. The only mode that always pays.',
    rules: [
      `Tap <b>Find a match</b>. You’re paired with the waiting player closest to your rating, using your active Octave.`,
      `Your Octave must be 8 Champions you own (the server checks).`,
      `Win and your rating goes up; lose and it goes down. The bigger the upset, the bigger the swing.`,
      `Rewards have no daily limit (see Rewards). Ranked matches also score Oktoberfest points in October.`,
      `Move clocks and the ${DROP_AFTER / 1000}-second disconnect rule apply.`,
    ],
  },
  {
    id: 'echoes', group: 'modes', title: 'Online: Echoes',
    summary: 'No one searching? Duel the saved Octave of a real player.',
    rules: [
      `An <b>Echo</b> is the Octave a real player last used online, played by the game’s strongest AI. It’s always labelled “Echo of …”.`,
      `Pick <b>Duel an Echo now</b>, or keep searching: after 8 seconds an Echo is offered, and at 30 seconds one starts for you. A real player who searches first is still matched with you.`,
      `Echoes count for <b>half</b> the usual rating change, and their rewards share the daily AI limit of ${AI_REWARDS_PER_DAY}.`,
    ],
  },
  {
    id: 'friendly', group: 'modes', title: 'Online: Challenge a friend',
    summary: 'Make a code, send it, play.',
    rules: [
      `Tap <b>Make a code</b>, then tap the code to copy it and send it to a friend. They enter it and tap <b>Join</b>.`,
      `Friendly matches don’t score Oktoberfest points. Their rewards share the daily AI limit.`,
      `After the match, both tap <b>Rematch</b> to go again.`,
    ],
  },
  {
    id: 'voicechat', group: 'modes', title: 'Online: Voice chat',
    summary: 'Talk to the other player during an online match. Optional, live, never recorded.',
    rules: [
      `Voice chat is for <b>adults (18+) only</b>. Set it up in <b>More → Voice chat</b>: your birth month and year (asked once), then the check for the kind you want.`,
      `<b>Friend Voice</b>: in Friend Challenges. Needs a quick card check (credit or debit, not prepaid, no charge).`,
      `<b>Ranked Voice</b>: with players you’re matched with. Needs a one-time ID check and the Season Pass.`,
      `Both players must have voice on. Then tap <b>JOIN VOICE</b> in the match; your microphone is only used after that tap. Never with Echoes.`,
      `In the voice menu: turn your mic off, mute them, leave, <b>report</b> or <b>block</b>. Blocking ends voice at once and hides their chat.`,
      `Voice never affects the match: if it drops, keep playing and tap <b>REJOIN VOICE</b> when you like. It ends when the match ends.`,
    ],
  },
  {
    id: 'rivals', group: 'modes', title: 'Rivals',
    summary: 'Play the same duelist three times and they become your Rival.',
    rules: [
      `Each of the game’s duelists has habits and tells. Play one 3 times and they become a <b>Rival</b>, with your record kept.`,
      `Rematch your Rivals from the Battle screen. Rival matches are AI matches.`,
    ],
  },
  {
    id: 'anomaly', group: 'modes', title: 'Anomaly (weekly)',
    summary: 'One strange rule for the whole week.',
    rules: [
      `Each week brings a new rule twist, shown on the Battle screen.`,
      `Win ${ANOMALY_WINS} Anomaly matches in a week for a Faction Pack. Anomaly matches are AI matches.`,
    ],
  },
  {
    id: 'draft', group: 'modes', title: 'Draft',
    summary: 'Pure skill: build a deck from a shared pool.',
    rules: [
      `18 Champions are laid out face up. Each player bans one, then you take turns picking (snake order) until both have 8.`,
      `Your collection doesn’t matter: everyone drafts from the same pool.`,
      `Then you battle with what you drafted. A win pays ${DRAFT_REWARD.won} Pack Tickets, a loss ${DRAFT_REWARD.lost}, up to ${LIMITS.draftsPerDay} times a day.`,
    ],
  },
  {
    id: 'road', group: 'modes', title: 'The Long Road',
    summary: `A run of ${FLOORS} stops with 3 lives and the Archivist at the end.`,
    rules: [
      `Walk a road of ${FLOORS} stops: duels, tougher Champion duels, campfires and shrines.`,
      `Win a duel to choose a reward: a new Champion, an upgrade, or a <b>relic</b> that bends the rules for the rest of the run.`,
      `You have <b>3 lives</b>. A loss costs one, and you walk on without a reward.`,
      `The last stop is <b>the Archivist</b>: much stronger, but you can retry while you have lives. Runs pay Embers per stop and tickets for reaching the end, up to ${LIMITS.roadPerDay} runs a day.`,
    ],
  },
  {
    id: 'alliance', group: 'modes', title: 'Alliances',
    summary: 'Team up. Play together to fill a weekly chest.',
    rules: [
      `Found or join an Alliance (sign-in needed). Members share a <b>weekly chest</b>. There’s no chat.`,
      `Points: a win 1 (online win 2), clearing the Long Road 5.`,
      `As the chest fills, each tier unlocks packs for every member, once per week.`,
    ],
  },

  // ---- tournament ------------------------------------------------------------------
  {
    id: 'oktober', group: 'events', title: 'Oktoberfest tournament',
    summary: 'Qualify all October. Top 8 play over Halloween weekend. The winner gets a one-of-one card.',
    rules: [
      `<b>The prize:</b> The Eighth Bell, a card with only <b>one copy, ever</b>. It will never be reprinted or sold. The winner can keep it or trade it in the game, and its history follows it to every owner.`,
      `It plays as a <b>Mythic</b> of the Vigil, as strong as the other Mythics and no stronger: a trophy, not an advantage. It arrives in the winner’s Vault automatically when the finals end.`,
      `<b>Free to enter:</b> sign in and play ranked online matches. Buying things doesn’t help.`,
      `<b>Qualifying (Oct 1–30, US Central):</b> every ranked match scores. <b>Win +${OKTOBER.points.win}, loss +${OKTOBER.points.loss}.</b> An Echo win is +${OKTOBER.points.echoWin}, up to ${OKTOBER.echoPointsPerDay} a day.`,
      `The same opponent only scores ${OKTOBER.sameOpponentPerDay} times a day. Friendly code matches don’t score.`,
      `<b>Oktoberfest Packs for everyone:</b> reach ${OKTOBER.packs.map((m) => `${m.at} points (${m.n} pack${m.n > 1 ? 's' : ''})`).join(', ')}. Each has 5 cards, all foil, with at least one Epic or better. They’re only earned this month and never sold.`,
      `<b>The Oktoberfest Set:</b> 1 in 25 Oktoberfest Packs holds a bonus card, one of five Champions (Cassius Thorne, The Unrung, Hourbell, Vega Sorn, Caska Vell) in an autumn version you can’t get any other way. Same Power, much rarer look. Collect all five.`,
      `<b>The top ${OKTOBER.finalists} on the board</b> when qualifying closes are the finalists. Ties: more wins, then whoever got there first.`,
      `<b>Finals (Sat Oct 31 – Sun Nov 1):</b> finalists play each other, and only each other, <b>whenever they’re free</b>. There are no set match times.`,
      `Everyone starts the finals at <b>${OKTOBER.finals.start}</b>. Win and your finals rating goes up; lose and it goes down. Two finalists count ${OKTOBER.finals.perPair} matches against each other.`,
      `<b>Play at least ${OKTOBER.finals.minMatches} finals matches</b> to be eligible to win.`,
      `<b>Highest finals rating at the end wins.</b> Ties: more finals wins, then the higher seed.`,
      `<b>All ${OKTOBER.finalists} finalists</b> earn the Oktoberfest Finalist card back, theirs to keep.`,
      `Cheating, swapping wins with friends or using two accounts gets you removed. Full details are in the Official Rules.`,
    ],
  },
];
