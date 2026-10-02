// ONE-OF-ONE cards: they exist in CARDS (so they can be owned, shown and played)
// but never in LIST, so no pack, Spoils, Draft, Trade Hall stock, deck builder
// for the AI or crafting can ever make one. The server grants each one exactly
// once (economy function: tournament awards).
export default [
  {
    id: 'eighthBell', name: 'The Eighth Bell', title: 'Who Rings Once', rarity: 'mythic', faction: 'vigil',
    cls: 'Herald', alignment: 'Heroic', traits: ['Unsung'],
    r: [4, 5, 5, 6],
    kit: { name: 'Rings Once', reveal: [{ op: 'dmg', n: 2, to: 'opposite' }], power: [{ n: 1, per: 'fallen', max: 2 }], fall: [{ op: 'heal', n: 2, to: 'voice' }] },
    bio: 'In the old calendar October was the eighth month, and every duelist carries an Octave of eight. The Eighth Bell is the one that rings only once a year, for the last one standing. Her armour was taken piece by piece from all five houses, because the bell belongs to none of them.',
    flavor: 'Everyone hears the first seven. Only one of you will hear me.',
    award: 'Oktoberfest 2026',
  },
];
