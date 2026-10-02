# THRENYX: the rules

The same text as the in-game Rules screen (More → Rules). Made from `engine/rules-text.js` by `node tools/rules-md.mjs`; edit that file, not this one.

## How to play

### A match in 60 seconds
*8 duels, one Champion against one. Bring the other side’s Voice to 0.*

- Each player has **20 Voice** (your life, the bell) and a deck of 8 Champions, called an **Octave**. You hold 3; the rest wait in your **Reserve**.
- **Both hands are face up.** You always see what they could send, and they see yours.
- A match is up to **8 duels**. In each duel one player **Leads**: they send a Champion first. The other **Answers**: they see it, then send one of theirs.
- The Lead fights with its **Strike**, the Answer with its **Guard**. The higher number wins the duel.
- The winner’s **Wound** (the blood drop) comes off the loser’s Voice. The losing Champion loses **Health** (its hearts, not your Voice) equal to the margin +1; a Champion at 0 Health **Falls**, and any extra spills into the Voice. A tie hurts both Champions by 1.
- Survivors go to the bottom of your Reserve, and both players draw back up to 3.
- **Who Leads next:** whoever lost the duel. Falling behind gives you the stronger seat.
- **The final duel counts double**: its Voice damage is ×2, so no match is over until it’s over.
- **You win** if the other side’s Voice hits 0, or with the higher Voice after duel 8.

> Tip: Before you commit, the guide shows the numbers against each of their Champions (abilities, Bonds and Focus included). Who wins is yours to read. Watch their Focus and READ: when they glow, they can still use them on you.

### Focus and READ
*Two ways to swing a duel, each with limited uses.*

- **Focus** (2 per match): +2 to your Champion for one duel. The Answer adds it with its pick; the Lead adds it **last**, after seeing the Answer.
- **READ** (1 per match): when you Lead and see their Answer, switch your Champion for another from your hand. Now they’re the ones surprised.
- Some abilities give you an extra READ, block one, or stop Focus. Hold a card to read what it does.

### Bonds: deck styles
*4 Champions of one style in your Octave fight harder together.*

- Every Champion has one or two **styles** (shown on the card), from what it is and what its ability does.
- Put **4 or more** Champions of one style in your Octave and they **Bond**: each of them gets the bonus below in every duel it fights (a Champion with two Bonds gets the better one).
- **Knights** (Sworn swords who fight better side by side): +1; Legendaries and Mythics +1 Leading, +2 Answering.
- **Silencers** (Take away their best number and their abilities): +1; Legendaries and Mythics +1 Leading, +2 Answering.
- **The Unsung** (The forgotten, who matter more the more of them there are): +1; Legendaries and Mythics +1 Leading, +2 Answering.
- **The Sleepless** (They will not stay down): +1; Legendaries and Mythics +1 Leading, +2 Answering.
- **Last Words** (Every fall feeds the next fight): +0 Leading, +1 Answering; Legendaries and Mythics +1.
- **Clockwork** (Machines and their makers): +0 Leading, +1 Answering; Legendaries and Mythics +1.
- **The Court** (Royals, their spies and their knives): +1; Legendaries and Mythics +1 Leading, +2 Answering.
- **Children** (Small, brave, and never alone): +1; Legendaries and Mythics +1 Leading, +2 Answering.
- **Readers** (Extra READs, and payoffs for using them): +1; Legendaries and Mythics +1 Leading, +2 Answering.
- **Focus** (More Focus, and Champions that love it): +1; Legendaries and Mythics +1 Leading, +2 Answering.
- **Wardens** (Shields and healing: win the long game): +1 Leading, +2 Answering; Legendaries and Mythics +2.
- **Momentum** (Hit first, keep hitting, come back from behind): +1; Legendaries and Mythics +1 Leading, +2 Answering.
- **One Mythic per Octave** (at most 1).
- In the Octave builder, **Pick for me** offers your strongest builds, each around a different style. In a match, a gold +number on a card is its Bond bonus.

> Tip: Commons count toward a Bond just like rarer cards: a Bond of commons beats a pile of unrelated rares more often than you’d think.

### Abilities
*Every Champion has one. They work in the duel it fights.*

- **When Leading** / **when Answering**: only in a duel where this Champion Leads or Answers.
- **The enemy it duels**: the Champion it is fighting this duel.
- **Your Champions still to fight**: the ones in your hand and Reserve.
- Ability names light up during the duel, and the guide lists which ones will trigger before you commit.

### Forfeits, clocks and disconnects
*You can always forfeit. Online, the clock and your connection count.*

- **Forfeit any match, any mode**: tap **⚑ Forfeit** (top right), then tap again to confirm. It counts as a loss. Life happens.
- **Online move clock:** 30 seconds for each turn (Lead, Answer, Focus/READ). If time runs out, a simple move is played for you: your biggest number, no Focus. Run out 3 times in a row and you forfeit.
- **Disconnects:** online, if the game doesn’t hear from you for **60 seconds**, you forfeit. Switching to another app counts, because phones pause the game. Your opponent sees a countdown.
- **Emotes:** online against a real player, tap 💬 on the left edge for a quick phrase (Good luck, Well played…). One every few seconds. Not a fan? **Mute** is in the same menu. Echoes don’t chat.

### Invite friends and sharing
*Share once for 120 Chimes. Friends who really play earn you packs, up to 10.*

- **Share bonus:** on **More → Invite friends**, tap **Share on Facebook** (or More ways…) and get **120 Chimes**, one time per account.
- **Your invite code:** every account has one. Send your link; a friend can also type the code on the same screen in their first 7 days.
- **Your friend gets** +1 Standard Pack once they finish training.
- **A friend counts** when they've played 5 Duels and saved their profile.
- **You get** +1 Standard Pack for each friend who counts, plus +1 Collector Pack at 3, +1 Collector Pack at 5, +2 Collector Packs at 10. Rewards stop at 10 friends; your count keeps going.
- One code per player, never your own, and two friends can't invite each other.

### Friends
*Duel, trade and send quick messages. No typed chat: every message comes from a set list.*

- **Add a friend** with their friend code (or their friend link), from **People you played** on the Friends screen, or with **Add as a friend** on the results of an online match. Up to 100 friends.
- **Messages** are picked from a list (“Wanna Duel?”, “Check that trade I sent.”, “Good game!”…). Nobody can type to you, and nothing typed is ever sent.
- **Wanna Duel?** sends your friend a Duel invitation with an Accept button. It works for 24 hours.
- **Who can send you requests:** anyone with your code, only people you've played, or no one. Change it any time on the Friends screen. Gave your code to the wrong person? Get a new one and the old one stops working.
- **Say no, remove or block:** a request you decline can't be sent again for a week. **Block** ends the friendship, messages, offers and Trade Board posts between you, and they can't ask again.
- Friends need a saved profile.

### Trading
*Trade cards with friends, or with anyone on the Trade Board. Every card's history goes with it.*

- **With a friend:** open their page and tap **Trade**. Pick what you want from their Vault (**Confirm selection**), pick what you'll give (**Confirm selection**), check the whole trade, then **Confirm trade**. They accept, decline or counter.
- **Your active Octave stays put:** a card in the Octave you're using can't be traded (a spare copy of it can). Any other card can, even your only copy. Swap a card out of your Octave to trade it.
- **The Trade Board:** post up to 3 of your cards and up to 3 cards you want. Anyone who has what you want can **Trade now**; posts that want nothing take offers instead. Posts stay up 7 days, 10 at a time.
- **Offers** can't be changed once sent (send a new one, or they counter) and close after 72 hours. You can't ask for cards without offering something.
- **Counter:** any offer you get can be accepted, declined or countered. Counter opens the offer turned around, ready to change: add or take away cards on either side and send it back. They can counter again.
- **Who can trade:** anyone with a saved profile. No waiting, no daily limit, no fee: trade as much as you like, and new cards trade straight away.
- **You'll be told** when an offer or counter-offer arrives, when someone accepts your trade, and when someone takes your post: a banner in the game, a dot on Home, and the number on the app icon if THRENYX is on your home screen.
- Only cards can be traded: never Chimes, Embers or Pack Tickets. Trades are final. Buying or selling cards for real money is against the Terms.

### Rewards and daily limits
*Ranked online always pays. AI matches pay 10 times a day. Story chapters pay once.*

- **Ranked online (real people): no daily limit.** First win of the day: a Collector Pack Ticket. Every win: +20 Embers. Every 3 wins in a row: a Pack Ticket.
- **Matches against the AI** (Ladder, Rivals, Anomaly, Echoes, friendly games) pay **10 times a day**. After that they still count for your rank and your cards’ histories, but pay nothing until tomorrow.
- **Story:** each chapter pays its reward once, the first time you win it.
- **Spoils:** win and you take a card from your opponent, 5 times a day (Embers after that). A loss gives a few Embers.
- **Weekly season:** wins this week fill a track: 3 wins, 1 Pack Ticket; 6 wins, 100 Embers; 10 wins, 2 Pack Tickets; 15 wins, 3 Pack Tickets + 150 Embers + a Firstfall Pack.
- Draft pays up to 8 times a day and the Long Road up to 4. Days reset at midnight UTC (7 pm Central, 6 pm in winter).

## Modes

### Story: Firstfall
*Ten chapters. Each one teaches one idea and pays its reward once.*

- Play the chapters in order; winning one unlocks the next.
- Each chapter pays its reward the **first time you win it**. Replays are for fun and pay nothing.
- Some chapters change the rules for that battle; the chapter tells you how before it starts.

### Ladder
*Climb seven ranks against the game’s duelists.*

- Ranks, lowest to highest: Initiate, Chorister, Cantor, Arbiter, Warden, Paragon, Threnodist. Each rank has 5 divisions (V up to I).
- A win earns a **Note**; 4 Notes move you up a division. A win with your Voice at 6 or less earns a bonus Note.
- A loss costs a Note. Below Arbiter a loss never drops you a division, and you can never drop a whole rank.
- Reaching a new rank pays packs, once each. Ladder matches are AI matches: past the daily limit of 10 your rank still moves, but rewards wait until tomorrow.

### Online: Ranked
*Real people near your rating. The only mode that always pays.*

- Tap **Find a match**. You’re paired with the waiting player closest to your rating, using your active Octave.
- Your Octave must be 8 Champions you own (the server checks).
- Win and your rating goes up; lose and it goes down. The bigger the upset, the bigger the swing.
- Rewards have no daily limit (see Rewards). Ranked matches also score Oktoberfest points in October.
- Move clocks and the 60-second disconnect rule apply.

### Online: Echoes
*No one searching? Duel the saved Octave of a real player.*

- An **Echo** is the Octave a real player last used online, played by the game’s strongest AI. It’s always labelled “Echo of …”.
- Pick **Duel an Echo now**, or keep searching: after 8 seconds an Echo is offered, and at 30 seconds one starts for you. A real player who searches first is still matched with you.
- Echoes count for **half** the usual rating change, and their rewards share the daily AI limit of 10.

### Online: Challenge a friend
*Make a code, send it, play.*

- Tap **Make a code**, then tap the code to copy it and send it to a friend. They enter it and tap **Join**.
- Friendly matches don’t score Oktoberfest points. Their rewards share the daily AI limit.
- After the match, both tap **Rematch** to go again.

### Online: Voice chat
*Talk to the other player during an online match. Optional, live, never recorded.*

- Voice chat is for **adults (18+) only**. Set it up in **More → Voice chat**: your birth month and year (asked once), then the check for the kind you want.
- **Friend Voice**: in Friend Challenges. Needs a quick card check (credit or debit, not prepaid, no charge).
- **Ranked Voice**: with players you’re matched with. Needs a one-time ID check and the Season Pass.
- Both players must have voice on. Then tap **JOIN VOICE** in the match; your microphone is only used after that tap. Never with Echoes.
- In the voice menu: turn your mic off, mute them, leave, **report** or **block**. Blocking ends voice at once and hides their chat.
- Voice never affects the match: if it drops, keep playing and tap **REJOIN VOICE** when you like. It ends when the match ends.

### Rivals
*Play the same duelist three times and they become your Rival.*

- Each of the game’s duelists has habits and tells. Play one 3 times and they become a **Rival**, with your record kept.
- Rematch your Rivals from the Battle screen. Rival matches are AI matches.

### Anomaly (weekly)
*One strange rule for the whole week.*

- Each week brings a new rule twist, shown on the Battle screen.
- Win 3 Anomaly matches in a week for a Faction Pack. Anomaly matches are AI matches.

### Draft
*Pure skill: build a deck from a shared pool.*

- 18 Champions are laid out face up. Each player bans one, then you take turns picking (snake order) until both have 8.
- Your collection doesn’t matter: everyone drafts from the same pool.
- Then you battle with what you drafted. A win pays 2 Pack Tickets, a loss 1, up to 8 times a day.

### The Long Road
*A run of 9 stops with 3 lives and the Archivist at the end.*

- Walk a road of 9 stops: duels, tougher Champion duels, campfires and shrines.
- Win a duel to choose a reward: a new Champion, an upgrade, or a **relic** that bends the rules for the rest of the run.
- You have **3 lives**. A loss costs one, and you walk on without a reward.
- The last stop is **the Archivist**: much stronger, but you can retry while you have lives. Runs pay Embers per stop and tickets for reaching the end, up to 4 runs a day.

### Alliances
*Team up. Play together to fill a weekly chest.*

- Found or join an Alliance (sign-in needed). Members share a **weekly chest**. There’s no chat.
- Points: a win 1 (online win 2), clearing the Long Road 5.
- As the chest fills, each tier unlocks packs for every member, once per week.

## Tournament

### Oktoberfest tournament
*Qualify all October. Top 8 play over Halloween weekend. The winner gets a one-of-one card.*

- **The prize:** The Eighth Bell, a card with only **one copy, ever**. It will never be reprinted or sold. The winner can keep it or trade it in the game, and its history follows it to every owner.
- It plays as a **Mythic** of the Vigil, as strong as the other Mythics and no stronger: a trophy, not an advantage. It arrives in the winner’s Vault automatically when the finals end.
- **Free to enter:** sign in and play ranked online matches. Buying things doesn’t help.
- **Qualifying (Oct 1–30, US Central):** every ranked match scores. **Win +3, loss +1.** An Echo win is +1, up to 3 a day.
- The same opponent only scores 3 times a day. Friendly code matches don’t score.
- **Oktoberfest Packs for everyone:** reach 10 points (1 pack), 25 points (1 pack), 50 points (2 packs), 100 points (3 packs). Each has 5 cards, all foil, with at least one Epic or better. They’re only earned this month and never sold.
- **The Oktoberfest Set:** 1 in 25 Oktoberfest Packs holds a bonus card, one of five Champions (Cassius Thorne, The Unrung, Hourbell, Vega Sorn, Caska Vell) in an autumn version you can’t get any other way. Same Power, much rarer look. Collect all five.
- **The top 8 on the board** when qualifying closes are the finalists. Ties: more wins, then whoever got there first.
- **Finals (Sat Oct 31 – Sun Nov 1):** finalists play each other, and only each other, **whenever they’re free**. There are no set match times.
- Everyone starts the finals at **1000**. Win and your finals rating goes up; lose and it goes down. Two finalists count 4 matches against each other.
- **Play at least 3 finals matches** to be eligible to win.
- **Highest finals rating at the end wins.** Ties: more finals wins, then the higher seed.
- **All 8 finalists** earn the Oktoberfest Finalist card back, theirs to keep.
- Cheating, swapping wins with friends or using two accounts gets you removed. Full details are in the Official Rules.
