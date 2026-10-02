// WHAT IS THRENYX? — the story of the world itself, not the game: why there's
// no war (and why everyone is still fighting one), who the five factions are
// and why they believe what they believe, why certain Champions are bound to
// each other, and the night the star fell. Opened from the top of Home.
//
// Written from docs/03-world-bible.md, docs/04-character-bible.md and
// docs/lore/. It tells what the people of Threnyx know and argue about; the
// SEALED truths in those docs stay sealed (the seasons reveal them).
import * as store from '../core/store.js';
import { esc } from '../ui/card.js';
import { sfx } from '../core/audio.js';
import { factionArt, uiArt } from '../art/index.js';

export const WORLD_VERSION = 1; // bump when the story grows, to show it as new on Home

const CHAPTERS = [
  {
    id: 'song',
    art: 'world-song',
    title: 'The World Is a Song',
    body: `
<p class="w-drop">Everything in Threnyx is singing.</p>
<p>Not in a poet's way. In Threnyx it is simply true. Every person, every river, every city, every promise has a note, and all of those notes together make one enormous piece of music that has been playing since before anyone can remember. The people of Threnyx call it <b>the Threnody</b>, which is an old word for a song you sing at a funeral.</p>
<p>Nobody knows who is singing it, or who it is for.</p>
<p>The stars are notes too: long, held notes hung in the sky, the oldest in the song. When you are born, your note begins. When you die, people say you have <i>fallen silent</i>. And the worst thing that can happen to anyone is not death. It is to be <b>unsung</b>: cut out of the song so completely that the world forgets you were ever there. Your friends forget your face. Your name fades off the page. Even your enemies can't remember why they hated you.</p>
<p>A few people can hear their own note. They are called the <b>Attuned</b>, and with training they can <i>push</i> it: strike harder than a body should, hold their ground against impossible force, or play the one note that makes an enemy's plan sound wrong. Pushing always costs something. Breath, sleep, memories, years. The Attuned who push too hard become strange.</p>
<p>The greatest of them become <b>Champions</b>.</p>`,
  },
  {
    id: 'hush',
    art: 'world-hush',
    title: 'The Silence at Midnight',
    body: `
<p>More than a century ago, scholars noticed something that had never happened before. At midnight, for exactly one second, the song stopped.</p>
<p>Total silence. No wind, no heartbeat, no bells. Then the music came back as if nothing had happened.</p>
<p>They called it <b>the Hush</b>. The next year it lasted two seconds. Then a minute. Then four. In the Hush, nobody is Attuned. Nothing can be pushed. Things that live in the silence come out and walk around, and the people who have seen them don't like to say what they look like.</p>
<p>A faith grew up around the Hush, sworn to sing straight through it, every night, so that whoever is singing the world is never singing alone. They built a lighthouse city and lit it, and it has not gone dark since. They are the Vigil.</p>
<p>The Hush has never stopped growing. On the night this story begins, it lasts <b>forty-one minutes</b>.</p>`,
  },
  {
    id: 'empire',
    art: 'world-empire',
    title: 'Twelve Cities, One Throne',
    body: `
<p>Long ago the land was twelve cities, each built around a <i>tuning stone</i>, a rock that hums. Each city's identity was its pitch. You could tell where a stranger came from by the note under their voice.</p>
<p>Then the <b>Vantaine</b> family of Solenne united eleven of the twelve into an empire called the Choir-Throne. It was rich and beautiful and very proud. The twelfth city, far to the north, refused to join. It kept its own note and its own king, and for three hundred years the empire couldn't make it bend.</p>
<p>Meanwhile, in the canal city of Carillon, clockmakers made a discovery that changed everything. They learned to draw <i>hours of life</i> out of a person's note and seal them inside a bell. An hour taken this way could heal a wound, power a machine, or be sold. They called it <b>tolling</b>. The rich began to buy years and live for centuries. The poor began to sell them. The clockmakers became the empire's bankers, and then something more than bankers. They are the Hourwrights.</p>`,
  },
  {
    id: 'unsinging',
    art: 'world-unsinging',
    title: 'The Night a City Was Unsung',
    body: `
<p>Twenty-one years ago, the empire finally marched on the twelfth city. It was called the War of the Last Verse, and the Hourwrights sold weapons to both sides.</p>
<p>The most terrible thing they sold was the <b>Stilling Fork</b>: a tuning fork the height of a cathedral, with three tines, built to cancel one single note in the Threnody. Absolutely, and forever.</p>
<p>On a frozen night in the last winter of the war, someone struck the Fork against the twelfth city.</p>
<p>And the city was <b>unsung</b>. Its streets, its towers, its people, its name, all of it was cut out of the song. Not destroyed. <i>Erased.</i> Every map in the world now shows white space where it stood. Everyone who ever knew someone from there forgot them in the same instant. Today, nobody alive can tell you the city's name. That white space is called <b>the Blank</b>. If you walk into it, you start to forget things, first names, then faces, then why you came.</p>
<p>The Fork was designed so that its note would never come back. It came back. The <b>Recoil</b> rolled down the Fork's note like a wave and burned Solenne, the shining capital of the empire, to ash in a single night. The palace, the cathedral, the court, the city. The Empress, <b>Maelis Vantaine</b>, vanished in the fire and was never found.</p>
<!--art:world-recoil-->
<p>Ash still falls on Solenne today. Twenty-one years later. Every day, in the same pattern, like a phrase of music being repeated. No one knows why.</p>
<p>And no one agrees on what happened. The Crown says the twelfth city was building a Fork of its own and the Crown struck first to save everyone. The Vigil says the city sang a false note and the song corrected itself. A stolen Hourwright ledger says the Empress signed the order to fire, but it is dated the day <i>after</i> she disappeared. The people of the Margin say the city wasn't taken at all: it chose to walk out of the song, so the empire could never have it.</p>
<p>Two of the Fork's three tines were found in the ashes. <b>The third has never been found.</b></p>`,
  },
  {
    id: 'accord',
    art: 'world-accord',
    title: 'Why There Is No War',
    body: `
<p>After the fire came the <b>Grey Years</b>. No empire, no law, warlords on every road, famine everywhere. Families traded their children's years for bread.</p>
<p>And everyone was terrified, because everyone now knew a weapon existed that could erase a whole people from the world, and that a third of it was still out there somewhere.</p>
<p>So the survivors did something no one had ever done. They met in Coda, a neutral city on a sea so still that sound will not cross it, and they outlawed war.</p>
<p>The <b>Accord of the Octave</b> says: no army may be raised. No siege may be laid. No city may be burned. Every dispute in the world, over land, debt, murder, a throne, anything, must be settled by a <b>Clash</b>: a duel between two teams of eight Champions, called <b>Octaves</b>, fought until one side's Voice falls silent. A Clash is binding. Whatever the winner was fighting for, they get. No Clash may be fought in the Hush.</p>
<p>A Champion fights for whoever holds their <b>Writ</b>, a contract that can be bought, sold, inherited, gifted or won. Every Writ carries its own history: everyone who ever held it, every Clash it was carried into. In the nineteen years since the Accord, a Champion's Writ has become the most valuable thing a person can own.</p>
<p>So when people ask why there is a war in Threnyx, the honest answer is: <b>there isn't one</b>. There hasn't been a battle in nineteen years. And yet every faction is still fighting the War of the Last Verse, one Clash at a time, in arenas instead of fields. Thrones change hands in duels. Debts are settled in duels. Murders are answered in duels. The fighting never stopped. It just learned to follow rules.</p>
<p>A new order was founded to judge the Clashes and enforce the Accord. They took vows of silence. They keep the two surviving tines of the Fork locked in their vaults. They are the Quiet.</p>
<p>One more thing about the Accord. It was sealed by eight hands. <b>Only seven signers are written down.</b> Everyone who was in the room swears they remember every person there. No one can say who pressed the eighth seal.</p>`,
  },
  {
    id: 'factions',
    art: 'world-seats',
    title: 'The Five Seats',
    intro: `<p>Five powers signed the Accord, and five powers still Clash under it. Each of them is a different answer to the same question: <i>what do you do after the worst night in the world?</i> Each of them is right about something. And each of them is cracked down the middle.</p>`,
    factions: [
      { f: 'crown', name: 'The Ashen Crown', motto: 'Duty outlives the realm.', text: `What is left of the Vantaine court lives in exile in <b>Cinderhold</b>, a fortress built from black glass that formed when Solenne burned. They have been in mourning for twenty-one years. Every night the names of the dead are read aloud, and every morning the courtiers smear fresh ash across their mouths in the shape of a hand. They are ruled by the Empress's daughter, <b>Aurelle Vantaine</b>, the Ash Regent, who has never lost a Clash she chose to fight. <br><br><b>Why they fight:</b> to win back the Ashfields and end the mourning. <b>The crack:</b> half the court wants the empire back, by Clash if possible and by the Fork if not. The other half believes the empire is dead and should be allowed to rest.` },
      { f: 'quiet', name: 'The Quiet', motto: 'Judgment is silent.', text: `In the Stillhouse at Coda, a hall of black stone so dead to sound you cannot hear your own footsteps, the Quiet judge every Clash of record in the world. They take vows of silence, wear bells with the clappers pulled out, and say nothing. Their Champions, the <b>Silencers</b>, hunt down anyone who breaks the Accord. Their leader is a robed, hooded figure with burned hands whose face no one has seen, called <b>the First Silence</b>. <br><br><b>Why they fight:</b> to keep the Accord alive, because without it the world goes back to fire. <b>The crack:</b> the Quiet are supposed to be neutral. They hold two-thirds of a doomsday weapon. People are starting to ask whose side they are really on.` },
      { f: 'hour', name: 'The Hourwrights', motto: 'Everything has a price. Especially time.', text: `Carillon is a city of canals and ten thousand bells, and every bell holds an hour sold out of somebody's life. The Hourwrights built the Stilling Fork, and now they bank the Accord itself. Their Guildmaster, <b>Ottavio Brask</b>, is a hundred and forty years old and wears eleven ticking clocks sewn into his coat: hours he has bought and is living on. <br><br><b>Why they fight:</b> for money, for contracts, for leverage, and they want receipts. <b>The crack:</b> the <b>Unwound</b>, freed hour-debtors who smash tolling bells at night and give the years back to the people they were taken from. Their leader is Ottavio's own son.` },
      { f: 'margin', name: 'The Margin', motto: 'What is forgotten is free.', text: `Along the edge of the Blank, scaffold towns called <b>Scrawl</b>, <b>Rulings</b> and <b>Last Legible</b> hang over the white fog, lit by violet lamps, the only light that works there. The Margin is home to the half-forgotten, the runaways, the heretics, and the people who walked into the Blank on purpose and came back changed. Some of them you forget within minutes of meeting. Their most feared figure is <b>the Hollow King</b>, a king whose left side looks like a blank page, who wears a crown with an empty setting, and who remembers only one thing: that he once had a name, and someone took it. <br><br><b>Why they fight:</b> to be left alone, and to never be owned again. <b>The crack:</b> do they want to remember the lost city, or stay free of it forever?` },
      { f: 'vigil', name: 'The Vigil', motto: 'Sing, so the Voice is not alone.', text: `Lanternfast is a lighthouse city built in a spiral, and it has not been dark in more than a century. The Vigil believe the song must never stop, so they never stop singing. Their knights carry lanterns, paint open eyes on their eyelids, and stay awake through the Hush for years at a time. Ten years before the Unsinging they prophesied the world would end when the Hush reached thirty minutes. It reached thirty minutes. The world didn't end. The Vigil that survived that night came out harder, and angrier. <br><br><b>Why they fight:</b> to end the Hush before it ends the world. <b>The crack:</b> the <b>Cantors</b> would end the Hush at any cost, even burning the Margin. The <b>Lanterns</b> would rather protect people from the Hush than prove a doctrine.` },
    ],
  },
  {
    id: 'bonds',
    art: 'world-bonds',
    title: 'The Ties That Bind',
    body: `
<p>There is one more thing to understand about a world made of music. <b>Notes that belong together make each other louder.</b></p>
<p>Two bells tuned alike will ring each other from across a room. Two blades forged to the same pitch hum together when they cross, and spectators at a Clash say they can <i>hear</i> who's winning. It is the same with people. When Champions who share a nature, an oath, or a cause stand in the same Octave, their notes reinforce each other, and every one of them fights harder. In Threnyx this is called <b>resonance</b>, and it is why a well-built Octave is more than eight people.</p>
<ul class="w-list">
<li><b>Knights</b> swore their oaths on the same note, and an oath rings louder with another sworn sword beside it.</li>
<li><b>The Unsung</b> are the half-erased. Alone, the world forgets them. Together they remember each other, and the more of them there are, the harder they are to forget.</li>
<li><b>The Sleepless</b> have stayed awake through so many Hushes that their notes no longer know how to stop. Knock one down and the others sing them back up.</li>
<li><b>The Spent</b>, the fallen, feed the living. The Crown reads its dead aloud every night for a reason: in Threnyx, a note that falls silent passes its strength to the ones who loved it. Every fall feeds the next fight.</li>
<li><b>Children</b> have the simplest, clearest notes of anyone. Small, brave, and loudest when they're never alone.</li>
<li><b>Machines and their makers</b> run on the same tolled hours, ticking in time.</li>
<li><b>The Court</b>, the royals with their spies and knives, play the oldest counterpoint in the world: a crown and the shadow behind it.</li>
<li><b>Silencers</b> are trained to hear the note an enemy is about to play, and stop it before it sounds.</li>
</ul>
<p>And some bonds are older and stranger than any style. These are written on the Champions themselves:</p>
<ul class="w-list">
<li><b>Aurelle Vantaine and Caska Vell</b> were in love at sixteen. Then came the war, and the fire. Caska still wears the ash-grey cord Aurelle tied around her wrist. Now one leads the Crown and the other carries a Vigil lantern, on opposite sides of the biggest Clash in nineteen years.</li>
<li><b>Sir Hadric Moor</b> taught Aurelle to fight. He is sixty-one, his shield is studded with the melted badges of every knight he outlived, and his squire is <b>Tamsin Ashby</b>, twelve years old, who carries the last ember of Solenne in a lantern.</li>
<li><b>Dask Holloway</b> was the twelfth city's only knight to survive, because he was outside the walls that night. He remembers nothing but his oath. He serves the Hollow King, and doesn't know why it feels right.</li>
<li><b>Tock</b> is a clockwork soldier built for a war that ended nineteen years ago, still waiting for orders from an army that no longer exists. He runs on hours of life that <b>Sabine Orrow</b>, a surgeon, buys for him one by one.</li>
<li><b>Vega Sorn</b> maps streets in the Blank that nobody is building but that get finished anyway. Her sister <b>Nyx</b> walked into the Blank and came back impossible to remember. Vega writes her sister down every hour, so she doesn't forget her.</li>
<li><b>Ottavio Brask and Imre Vask</b>: a father who sells time, and a son who took his mother's name and swore to give it all back. Neither will lose to the other.</li>
</ul>`,
  },
  {
    id: 'firstfall',
    art: 'world-firstfall',
    title: 'Firstfall',
    body: `
<p>Nineteen years after the Accord, on a night when the Hush ran to forty-one minutes, something happened that had never happened in all of recorded history.</p>
<p><b>A star fell.</b></p>
<p>One of the held notes of the sky, a star that had hung there since the song began, went out, and came down, burning, into the middle of the Blank. Nobody holding a map can find the place where it landed. The people of the Margin can. They call the star that fell <i>the Twelfth Note</i>.</p>
<p>And something walked out of it.</p>
<!--art:world-lirae-->
<p>She looks like a young woman made of light that moves like sound: when she walks, her outline ripples like a plucked string. Her feet never quite touch the ground. Her eyes stay closed. She can hear the next note of every person near her, what they are about to do, what they are afraid of. She calls herself <b>Lirae</b>. She doesn't understand that people lie.</p>
<p>Everyone wants her. The Crown wants her kept quiet. The Hourwrights want to toll her, to cut a star into hours and sell them. The Vigil believe she is the answer to more than a century of prayer. The Quiet claim anything that falls from the sky. And the Hollow King believes, with everything left in him, that she is holding his name.</p>
<p>The Accord has a rule for this, written eighteen years before anything ever fell: <i>a thing that falls from the sky belongs to the Meridian, until claimed by Clash.</i> Nobody remembers who wrote it. It is there anyway.</p>
<p>So the greatest contest since the Accord has begun: <b>the Firstfall Claims</b>. Every faction is gathering Champions. Every Writ is suddenly worth a fortune. Every Clash counts.</p>
<p>And you hold Writs.</p>`,
  },
  {
    id: 'questions',
    art: 'world-questions',
    title: 'What Nobody Knows',
    body: `
<p>The people of Threnyx argue about these every night. The answers are out there, scattered across Champions' stories, Codex documents and seasons still to come.</p>
<ul class="w-list w-list--q">
<li>Who struck the Stilling Fork?</li>
<li>Why did the Recoil burn Solenne, when the Fork was built never to come back?</li>
<li>Where is the third tine?</li>
<li>Who pressed the eighth seal on the Accord, and why can nobody remember?</li>
<li>Why does ash still fall on Solenne, in the same pattern, every day?</li>
<li>In the Vantaine gallery at Cinderhold there is an empty portrait frame. Nobody remembers hanging it. Aurelle forbids anyone to take it down, and can't say why.</li>
<li>Who is the First Silence, under the hood?</li>
<li>Who was the Hollow King, before?</li>
<li>What happens if someone sings Lirae's note all the way through?</li>
</ul>
<p class="lore" style="margin-top:14px">Listen closely. Threnyx is still singing.</p>`,
  },
];

export function render(root, params, ctx) {
  const training = store.get().onboard !== 'done'; // a new player came from the training screen
  const facHtml = (c) => `${c.intro || ''}<div class="w-facs">${c.factions.map((x) => `
    <div class="w-fac" style="--fc:var(--${x.f})">
      <div class="w-fac__head">${factionArt(x.f, 's') ? `<img src="${factionArt(x.f, 's')}" alt="">` : ''}<div><b>${esc(x.name)}</b><span>“${esc(x.motto)}”</span></div></div>
      <p>${x.text}</p>
    </div>`).join('')}</div>`;
  // a painting, if it has been delivered (art/THRENYX_ART_WORLD.md); nothing if not
  const pic = (key, cls = '') => (uiArt(key) ? `<img class="w-art ${cls}" src="${uiArt(key)}" alt="" loading="lazy" decoding="async">` : '');
  const withArt = (html) => html.replace(/<!--art:([\w-]+)-->/g, (_, k) => pic(k, 'w-art--inline'));
  root.innerHTML = `
    <div class="world">
      ${pic('world-hero', 'w-art--hero')}
      <div class="kicker">The story of the world</div>
      <div class="h1">What is Threnyx?</div>
      <div class="lore" style="margin:4px 0 12px">Before the cards, before the Clash: the song, the fire, and the star that fell.</div>
      <nav class="w-toc">${CHAPTERS.map((c, i) => `<button data-jump="${c.id}"><em>${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'][i]}</em>${esc(c.title)}</button>`).join('')}</nav>
      ${CHAPTERS.map((c, i) => `
        <section class="w-ch" id="w-${c.id}">
          ${c.art ? pic(c.art) : ''}
          <div class="kicker">Chapter ${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'][i]}</div>
          <h2 class="w-title">${esc(c.title)}</h2>
          ${c.factions ? facHtml(c) : withArt(c.body)}
        </section>`).join('')}
      <div class="w-end">${training
        ? '<button class="btn btn--big" data-to="tutorial">Back to training</button>'
        : `<button class="btn btn--big" data-to="story">Play the Story</button>
        <button class="btn btn--ghost" data-to="codex" style="width:100%;margin-top:10px">Read the Codex</button>
        <button class="btn btn--ghost" data-to="home" style="width:100%;margin-top:10px">Back to Home</button>`}
      </div>
    </div>`;
  root.querySelectorAll('[data-jump]').forEach((b) => (b.onclick = () => {
    sfx.nav();
    root.querySelector('#w-' + b.dataset.jump)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  root.querySelectorAll('[data-to]').forEach((b) => (b.onclick = () => (sfx.select(), ctx.go(b.dataset.to))));
  // read: Home stops calling it new
  if ((store.get().worldSeen || 0) < WORLD_VERSION) store.update((s) => (s.worldSeen = WORLD_VERSION));
}
