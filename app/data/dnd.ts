import type { Character, Weapon, AdventureScenario, BossFight } from "~/types"; // Import BossFight type

export const RACES = [
  'Human', 'Elf', 'Dwarf', 'Halfling', 'Dragonborn', 'Gnome', 'Half-Elf', 'Half-Orc', 'Tiefling', 'Aasimar', 'Genasi', 'Goliath', 'Kenku', 'Lizardfolk', 'Tabaxi', 'Tortle', 'Warforged', 'Drow'
];

export const RACE_DESCRIPTIONS: Record<string, string> = {
  Human: "Humans are the most adaptable and ambitious people among the common races, known for their diverse cultures and boundless drive.",
  Elf: "Elves are a magical people of otherworldly grace, living in harmony with the natural world and possessing keen senses and a long lifespan.",
  Dwarf: "Dwarves are stout, hardy folk known for their skill in mining, stonework, and craftsmanship, often dwelling in mountain halls.",
  Halfling: "Halflings are small, nimble, and good-natured folk who prefer the comforts of home and hearth, known for their luck and hospitality.",
  Dragonborn: "Dragonborn are proud, draconic humanoids who combine the best attributes of dragons and humans, often driven by a strong sense of honor.",
  Gnome: "Gnomes are small, inventive folk with a love for nature, magic, and all things mechanical, known for their boundless curiosity and humor.",
  'Half-Elf': "Half-elves combine the best of both human and elf worlds, possessing human ambition and elven grace, often finding themselves at home in two cultures.",
  'Half-Orc': "Half-orcs are a blend of human and orc, often struggling with their dual nature, possessing great strength and a fierce spirit.",
  Tiefling: "A tiefling is a fictional humanoid race in the fantasy role-playing game Dungeons & Dragons, characterized by their infernal or fiendish heritage. They typically have distinctive physical traits such as horns, tails, pointed teeth, and eyes with solid colors. Due to their fiendish bloodline, they are often seen as mistrusted by society but possess inherent magical abilities and resistance to fire damage. Appearance: Tieflings are derived from human bloodlines and have a variety of infernal-influenced features, including horns, a long tail, and eyes that are solid black, red, white, gold, or silver. Their skin can range from shades of red to more human-like tones. Heritage: Their fiendish ancestry is the result of ancient pacts, curses, or interspecies breeding with beings from the Lower Planes, such as demons or devils. Abilities: Tieflings often have innate magical abilities, including the power to cast spells and resistance to fire damage. Social Perception: Due to their appearance and heritage, tieflings frequently face prejudice and distrust from other races. Culture: They lack a unified culture and often live as outcasts or in minority groups within human cities. Some may embrace their heritage, while others strive to be good and overcome societal biases.",
  Aasimar: "Aasimars are humanoids with a touch of celestial power, often serving as beacons of hope and justice, guided by divine visions.",
  Genasi: "Genasi are humanoids infused with the power of the elemental planes, each type reflecting a different element (air, earth, fire, water).",
  Goliath: "Goliaths are towering, stone-skinned humanoids from mountainous regions, known for their strength, endurance, and competitive nature.",
  Kenku: "Kenku are flightless, bird-like humanoids who lack a voice of their own, communicating through mimicry and possessing a knack for forgery.",
  Lizardfolk: "Lizardfolk are reptilian humanoids from swamps and jungles, known for their pragmatic and emotionless approach to survival.",
  Tabaxi: "Tabaxi are feline humanoids driven by curiosity and a love for exploration, often seeking out new experiences and rare artifacts.",
  Tortle: "Tortles are humanoid turtles with natural armor, known for their peaceful nature, wanderlust, and strong sense of community.",
  Warforged: "Warforged are sentient constructs created for war, now seeking purpose and identity in a world that no longer needs their original function.",
  Drow: "Drow, or dark elves, are a subrace of elves from the Dungeons & Dragons fantasy roleplaying game, characterized by dark skin (often gray, purple, or black), white or pale hair, and a subterranean home in the Underdark. They are known for their cruel, intelligent, and cunning society, which is typically matriarchal and deeply devoted to the evil spider goddess Lolth. Many drow are portrayed as villains, but some tales feature individuals who defy their evil upbringing to become heroes. Key characteristics: Appearance: Dark skin (ranging from gray to black or purple) and white or pale hair are their most distinguishing features. They are often depicted with red, pale blue, or violet eyes. Society: Drow society is notoriously treacherous, cunning, and often matriarchal, with females holding positions of power over males. This structure is often upheld by the worship of Lolth, who encourages infighting for her own amusement. Home: They live in the Underdark, a vast network of caverns and tunnels deep beneath the surface, where they are masters of their environment. Abilities: Drow are intelligent, skilled in magic and alchemy, and are adapted to the dark. They are often portrayed as powerful magic-users who are weak in direct sunlight. Morality: While drow culture is steeped in cruelty and sadism, not all drow are evil. Some become adventurers who reject their heritage, while others remain evil, using adventuring to gain power. Origin: According to lore, the drow were once surface-dwelling elves who were corrupted and driven underground for opposing the elven gods and following Lolth. This event, known as 'the descent,' is often the source of their conflict with surface elves.",
};

export const CLASSES = [
  'Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard', 'Artificer', 'Arcane Trickster (Rogue/Wizard)'
];

export const CLASS_DESCRIPTIONS: Record<string, string> = {
  Barbarian: "A fierce warrior of primitive background who can enter a battle rage.",
  Bard: "An inspiring magician whose music and words are used to great effect.",
  Cleric: "A priestly champion who wields divine magic in service of a higher power.",
  Druid: "A priest of the Old Faith, wielding the powers of nature and adopting animal forms.",
  Fighter: "A master of martial combat, skilled with a variety of weapons and armor.",
  Monk: "A master of martial arts, harnessing the power of ki for extraordinary feats.",
  Paladin: "A holy warrior bound by a sacred oath, combining martial prowess with divine magic.",
  Ranger: "A warrior who uses martial prowess and nature magic to combat threats on the fringes of civilization.",
  Rogue: "A scoundrel who uses stealth and trickery to overcome obstacles and enemies.",
  Sorcerer: "A spellcaster who draws on inherent magic from a mysterious bloodline.",
  Warlock: "A wielder of magic that is derived from a bargain with an otherworldly entity.",
  Wizard: "A scholarly magic-user capable of manipulating the fabric of reality with spells.",
  Artificer: "A master of invention and magical craftsmanship, creating wondrous devices and infusing objects with arcane power.",
  'Arcane Trickster (Rogue/Wizard)': "A rogue who uses arcane magic to augment their stealth, trickery, and combat abilities.",
};

export const WIZARD_SCHOOLS = [
  'Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation'
];

export const WIZARD_SCHOOL_DESCRIPTIONS: Record<string, { description: string; benefits: string[]; downsides: string[] }> = {
  Abjuration: {
    description: "Protective magic, like shields and wards.",
    benefits: [
      "Gain an extra spell of your specialty school each day.",
      "Receive a bonus on checks to learn spells from that school.",
      "In some editions and with specific subclasses, gain additional abilities related to your chosen school."
    ],
    downsides: [
      "You are unable to learn or cast spells from two other schools, which are your 'prohibited schools'.",
      "You cannot change your specialization or prohibited schools after you choose them at 1st level."
    ]
  },
  Conjuration: {
    description: "Spells that summon creatures or objects from other places.",
    benefits: [
      "Gain an extra spell of your specialty school each day.",
      "Receive a bonus on checks to learn spells from that school.",
      "In some editions and with specific subclasses, gain additional abilities related to your chosen school."
    ],
    downsides: [
      "You are unable to learn or cast spells from two other schools, which are your 'prohibited schools'.",
      "You cannot change your specialization or prohibited schools after you choose them at 1st level."
    ]
  },
  Divination: {
    description: "Spells that provide information, such as scrying or detecting thoughts.",
    benefits: [
      "Gain an extra spell of your specialty school each day.",
      "Receive a bonus on checks to learn spells from that school.",
      "In some editions and with specific subclasses, gain additional abilities related to your chosen school."
    ],
    downsides: [
      "You are unable to learn or cast spells from two other schools, which are your 'prohibited schools'.",
      "You cannot change your specialization or prohibited schools after you choose them at 1st level."
    ]
  },
  Enchantment: {
    description: "Spells that influence the minds of others.",
    benefits: [
      "Gain an extra spell of your specialty school each day.",
      "Receive a bonus on checks to learn spells from that school.",
      "In some editions and with specific subclasses, gain additional abilities related to your chosen school."
    ],
    downsides: [
      "You are unable to learn or cast spells from two other schools, which are your 'prohibited schools'.",
      "You cannot change your specialization or prohibited schools after you choose them at 1st level."
    ]
  },
  Evocation: {
    description: "Spells that manipulate energy, often causing destructive effects like fireballs.",
    benefits: [
      "Gain an extra spell of your specialty school each day.",
      "Receive a bonus on checks to learn spells from that school.",
      "In some editions and with specific subclasses, gain additional abilities related to your chosen school."
    ],
    downsides: [
      "You are unable to learn or cast spells from two other schools, which are your 'prohibited schools'.",
      "You cannot change your specialization or prohibited schools after you choose them at 1st level."
    ]
  },
  Illusion: {
    description: "Spells that alter perception to create false images or sounds.",
    benefits: [
      "Gain an extra spell of your specialty school each day.",
      "Receive a bonus on checks to learn spells from that school.",
      "In some editions and with specific subclasses, gain additional abilities related to your chosen school."
    ],
    downsides: [
      "You are unable to learn or cast spells from two other schools, which are your 'prohibited schools'.",
      "You cannot change your specialization or prohibited schools after you choose them at 1st level."
    ]
  },
  Necromancy: {
    description: "Spells that manipulate life and death.",
    benefits: [
      "Gain an extra spell of your specialty school each day.",
      "Receive a bonus on checks to learn spells from that school.",
      "In some editions and with specific subclasses, gain additional abilities related to your chosen school."
    ],
    downsides: [
      "You are unable to learn or cast spells from two other schools, which are your 'prohibited schools'.",
      "You cannot change your specialization or prohibited schools after you choose them at 1st level."
    ]
  },
  Transmutation: {
    description: "Spells that change the properties of a creature or object.",
    benefits: [
      "Gain an extra spell of your specialty school each day.",
      "Receive a bonus on checks to learn spells from that school.",
      "In some editions and with specific subclasses, gain additional abilities related to your chosen school."
    ],
    downsides: [
      "You are unable to learn or cast spells from two other schools, which are your 'prohibited schools'.",
      "You cannot change your specialization or prohibited schools after you choose them at 1st level."
    ]
  },
};

export const INVENTORY_ITEMS = [
  'Backpack', 'Bedroll', 'Rope (50 ft)', 'Torch', 'Rations (1 day)', 'Waterskin', 'Flint and Steel', 'Healing Potion', 'Spellbook', 'Arcane Focus', 'Holy Symbol', 'Thieves\' Tools', 'Component Pouch', 'Quiver (20 arrows)', 'Crossbow Bolts (20)', 'Shield', 'Leather Armor', 'Chain Mail', 'Plate Armor', 'Studded Leather Armor'
];

export const CANTRIPS: Record<string, string[]> = {
  Wizard: ['Fire Bolt', 'Light', 'Mage Hand', 'Minor Illusion', 'Ray of Frost', 'Shocking Grasp'],
  Sorcerer: ['Fire Bolt', 'Light', 'Mage Hand', 'Minor Illusion', 'Ray of Frost', 'Shocking Grasp', 'Thaumaturgy'],
  Cleric: ['Guidance', 'Light', 'Sacred Flame', 'Spare the Dying', 'Thaumaturgy'],
  Bard: ['Light', 'Mage Hand', 'Minor Illusion', 'Vicious Mockery'],
  Druid: ['Druidcraft', 'Guidance', 'Poison Spray', 'Produce Flame', 'Shillelagh'],
  Warlock: ['Eldritch Blast', 'Mage Hand', 'Minor Illusion', 'Prestidigitation', 'Toll the Dead'],
  Artificer: ['Booming Blade', 'Green-Flame Blade', 'Light', 'Mage Hand', 'Thorn Whip'],
  Fighter: [], 
  Barbarian: [],
  Monk: [],
  Paladin: [],
  Ranger: [],
  'Arcane Trickster (Rogue/Wizard)': ['Mage Hand', 'Minor Illusion', 'Prestidigitation', 'Ray of Frost', 'Shocking Grasp', 'Toll the Dead'], 
};

export const LEVEL_1_SPELLS: Record<string, string[]> = {
  Wizard: ['Magic Missile', 'Shield', 'Detect Magic', 'Burning Hands', 'Chromatic Orb', 'Thunderwave'],
  Sorcerer: ['Magic Missile', 'Shield', 'Burning Hands', 'Chromatic Orb', 'Thunderwave', 'Blur'],
  Cleric: ['Cure Wounds', 'Bless', 'Guiding Bolt', 'Healing Word', 'Shield of Faith'],
  Bard: ['Charm Person', 'Cure Wounds', 'Dissonant Whispers', 'Healing Word', 'Faerie Fire'],
  Druid: ['Cure Wounds', 'Entangle', 'Faerie Fire', 'Healing Word', 'Thunderwave'],
  Warlock: ['Armor of Agathys', 'Charm Person', 'Comprehend Languages', 'Hellish Rebuke', 'Hex'],
  Artificer: ['Cure Wounds', 'Faerie Fire', 'Longstrider', 'Sanctuary'],
  Fighter: [],
  Barbarian: [],
  Monk: [],
  Paladin: ['Divine Favor', 'Shield of Faith'],
  Ranger: ['Hunter\'s Mark'],
  Rogue: [], 
  'Arcane Trickster (Rogue/Wizard)': ['Mage Hand Legerdemain', 'Disguise Self', 'Silent Image', 'Charm Person', 'Magic Missile', 'Shield', 'Detect Magic', 'Sleep'], 
};

export const LEVEL_2_SPELLS: Record<string, string[]> = {
  Wizard: ['Invisibility', 'Misty Step', 'Mirror Image', 'Scorching Ray', 'Hold Person', 'Web'],
  Sorcerer: ['Invisibility', 'Misty Step', 'Mirror Image', 'Scorching Ray', 'Hold Person', 'Suggestion'],
  Cleric: ['Lesser Restoration', 'Spiritual Weapon', 'Aid', 'Hold Person', 'Silence'],
  Bard: ['Suggestion', 'Invisibility', 'Mirror Image', 'Hold Person', 'Shatter'],
  Druid: ['Moonbeam', 'Pass Without Trace', 'Spike Growth', 'Barkskin', 'Heat Metal'],
  Warlock: ['Darkness', 'Hold Person', 'Misty Step', 'Suggestion', 'Mirror Image'],
  Artificer: ['Aid', 'Blur', 'Darkness', 'Heat Metal', 'Levitate'],
  Fighter: [],
  Barbarian: [],
  Monk: [],
  Paladin: ['Aid', 'Branding Smite', 'Find Steed', 'Zone of Truth'],
  Ranger: ['Pass Without Trace', 'Spike Growth', 'Silence', 'Beast Sense'],
  Rogue: [], 
  'Arcane Trickster (Rogue/Wizard)': ['Mirror Image', 'Misty Step', 'Suggestion', 'Invisibility', 'Hold Person', 'Web'], 
};


export const TRAITS = [
  'I am always polite and respectful.',
  'I am a fierce protector of my friends.',
  'I have a quick wit and a sharp tongue.',
  'I am haunted by a past mistake.',
  'I am always optimistic, even in dire situations.',
  'I am quiet and observant, preferring to listen.',
  'I am quick to anger and slow to forgive.',
  'I am deeply compassionate to those suffering.',
  'I am driven by a thirst for knowledge.',
  'I am a natural leader, inspiring others.',
];

export const IDEALS = [
  'Redemption: Power should heal, not corrupt.',
  'Justice: Laws exist to protect the innocent.',
  'Charity: It is everyones responsibility to care for the less fortunate.',
  'Creativity: The world is a canvas for my imagination.',
  'Freedom: Everyone should be free to pursue their own destiny.',
  'Knowledge: The path to power and self-improvement is through knowledge.',
  'Might: The strong should rule the weak.',
  'Self-Sacrifice: I will lay down my life for those I protect.',
  'Tradition: The old ways are the best ways.',
  'Discovery: The world is full of mysteries waiting to be uncovered.',
];

export const BONDS = [
  'I would die to protect my family.',
  'My loyalty to my guild is unwavering.',
  'I seek to avenge a fallen comrade.',
  'I have a sacred duty to protect a holy site.',
  'I am bound by a promise to a powerful entity.',
  'I owe my life to the person who saved me.',
  'I am searching for an ancient artifact.',
  'My home is my sanctuary, and I will defend it.',
  'I am dedicated to a specific deity or philosophy.',
  'I have a rival who constantly pushes me to be better.',
];

export const FLAWS = [
  'I am easily swayed by flattery.',
  'I have a tendency to act before thinking.',
  'I am secretly afraid of heights.',
  'I am too trusting of strangers.',
  'I have a gambling problem.',
  'I am haunted by the infernal whispers of my bloodline.',
  'I am arrogant and believe I am always right.',
  'I struggle with a deep-seated prejudice.',
  'I am prone to fits of rage.',
  'I value wealth above all else.',
];

export const FIGHT_STYLES = [
  'Dueling', 'Defense', 'Great Weapon Fighting', 'Protection', 'Archery', 'Two-Weapon Fighting'
];

export const ARMOR_TYPES = [
  'None', 'Light Armor', 'Medium Armor', 'Heavy Armor', 'Shield'
];

export const SKILLS = [
  'Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception', 'History', 'Insight', 'Intimidation', 'Investigation', 'Medicine', 'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion', 'Sleight of Hand', 'Stealth', 'Survival'
];

export const SAVING_THROWS = [
  'Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'
];

export const MELEE_WEAPONS: Weapon[] = [
  { name: 'Unarmed Strike', attackBonus: '+0', damage: '1d1', damageAttribute: 'Strength', special: 'Melee' },
  { name: 'Dagger', attackBonus: '+4', damage: '1d4 piercing', damageAttribute: 'Dexterity', special: 'Finesse, Light, Thrown (range 20/60)' },
  { name: 'Shortsword', attackBonus: '+4', damage: '1d6 piercing', damageAttribute: 'Dexterity', special: 'Finesse, Light' },
  { name: 'Longsword', attackBonus: '+3', damage: '1d8 slashing', damageAttribute: 'Strength', special: 'Versatile (1d10)' },
  { name: 'Greatsword', attackBonus: '+3', damage: '2d6 slashing', damageAttribute: 'Strength', special: 'Heavy, Two-Handed' },
  { name: 'Handaxe', attackBonus: '+3', damage: '1d6 slashing', damageAttribute: 'Strength', special: 'Light, Thrown (range 20/60)' },
  { name: 'Quarterstaff', attackBonus: '+2', damage: '1d6 bludgeoning', damageAttribute: 'Strength', special: 'Versatile (1d8)' },
  { name: 'Scimitar', attackBonus: '+4', damage: '1d6 slashing', damageAttribute: 'Dexterity', special: 'Finesse, Light' },
  { name: 'Warhammer', attackBonus: '+3', damage: '1d8 bludgeoning', damageAttribute: 'Strength', special: 'Versatile (1d10)' },
  { name: 'Rapier', attackBonus: '+4', damage: '1d8 piercing', damageAttribute: 'Dexterity', special: 'Finesse' },
  { name: 'Light Hammer', attackBonus: '+3', damage: '1d4 bludgeoning', damageAttribute: 'Strength', special: 'Light, Thrown (range 20/60)' },
  { name: 'Spear', attackBonus: '+3', damage: '1d6 piercing', damageAttribute: 'Strength', special: 'Thrown (range 20/60), Versatile (1d8)' },
  { name: 'Trident', attackBonus: '+3', damage: '1d6 piercing', damageAttribute: 'Strength', special: 'Thrown (range 20/60), Versatile (1d8)' },
  { name: 'Glaive', attackBonus: '+3', damage: '1d10 slashing', damageAttribute: 'Strength', special: 'Heavy, Reach, Two-Handed' },
  { name: 'Halberd', attackBonus: '+3', damage: '1d10 slashing', damageAttribute: 'Strength', special: 'Heavy, Reach, Two-Handed' },
  { name: 'Pike', attackBonus: '+3', damage: '1d10 piercing', damageAttribute: 'Strength', special: 'Heavy, Reach, Two-Handed' },
  { name: 'Whip', attackBonus: '+4', damage: '1d4 slashing', damageAttribute: 'Dexterity', special: 'Finesse, Reach' },
  { name: 'Club', attackBonus: '+2', damage: '1d4 bludgeoning', damageAttribute: 'Strength', special: 'Light' },
  { name: 'Mace', attackBonus: '+2', damage: '1d6 bludgeoning', damageAttribute: 'Strength', special: '—' },
  { name: 'Sickle', attackBonus: '+4', damage: '1d4 slashing', damageAttribute: 'Dexterity', special: 'Light' },
  { name: 'Battleaxe', attackBonus: '+3', damage: '1d8 slashing', damageAttribute: 'Strength', special: 'Versatile (1d10)' },
  { name: 'Flail', attackBonus: '+3', damage: '1d8 bludgeoning', damageAttribute: 'Strength', special: '—' },
  { name: 'Maul', attackBonus: '+3', damage: '2d6 bludgeoning', damageAttribute: 'Strength', special: 'Heavy, Two-Handed' },
  { name: 'Morningstar', attackBonus: '+3', damage: '1d8 piercing', damageAttribute: 'Strength', special: '—' },
  { name: 'War Pick', attackBonus: '+3', damage: '1d8 piercing', damageAttribute: 'Strength', special: '—' },
  { name: 'Lance', attackBonus: '+3', damage: '1d12 piercing', damageAttribute: 'Strength', special: 'Reach, Special' },
  { name: 'Greataxe', attackBonus: '+3', damage: '1d12 slashing', damageAttribute: 'Strength', special: 'Heavy, Two-Handed' },
];

export const RANGED_WEAPONS: Weapon[] = [
  { name: 'Light Crossbow', attackBonus: '+4', damage: '1d8 piercing', damageAttribute: 'Dexterity', special: 'Ammunition (range 80/320), Loading, Two-Handed' },
  { name: 'Shortbow', attackBonus: '+4', damage: '1d6 piercing', damageAttribute: 'Dexterity', special: 'Ammunition (range 80/320), Two-Handed' },
  { name: 'Longbow', attackBonus: '+4', damage: '1d8 piercing', damageAttribute: 'Dexterity', special: 'Ammunition (range 150/600), Heavy, Two-Handed' },
  { name: 'Sling', attackBonus: '+4', damage: '1d4 bludgeoning', damageAttribute: 'Dexterity', special: 'Ammunition (range 30/120)' },
  { name: 'Dart', attackBonus: '+4', damage: '1d4 piercing', damageAttribute: 'Dexterity', special: 'Finesse, Thrown (range 20/60)' },
  { name: 'Javelin', attackBonus: '+3', damage: '1d6 piercing', damageAttribute: 'Strength', special: 'Thrown (range 30/120)' },
  { name: 'Blowgun', attackBonus: '+4', damage: '1 piercing', damageAttribute: 'Dexterity', special: 'Ammunition (range 25/100), Loading' },
  { name: 'Net', attackBonus: '+4', damage: '0', damageAttribute: 'Strength', special: 'Special, Thrown (range 5/15)' },
  { name: 'Hand Crossbow', attackBonus: '+4', damage: '1d6 piercing', damageAttribute: 'Dexterity', special: 'Ammunition (range 30/120), Light, Loading' },
  { name: 'Heavy Crossbow', attackBonus: '+4', damage: '1d10 piercing', damageAttribute: 'Dexterity', special: 'Ammunition (range 100/400), Heavy, Loading, Two-Handed' },
];

export const DND_5E_CHARACTERS: Character[] = [
  {
    id: 'default-1',
    name: 'Elara Whisperwind',
    race: 'Elf',
    class: 'Ranger',
    level: 3,
    experience: 900,
    alignment: 'Neutral Good',
    background: 'Hermit',
    speed: 30,
    hitDice: '1d10',
    hp: 25,
    maxHp: 25,
    proficiencyBonus: 2,
    stats: { strength: 10, dexterity: 16, constitution: 14, intelligence: 12, wisdom: 15, charisma: 8 },
    primaryAttribute: 'Dexterity',
    secondaryAttribute: 'Wisdom',
    armor: 'Leather Armor',
    fightStyle: 'Archery',
    ac: 14,
    initiative: 3,
    passivePerception: 14,
    savingThrows: ['Strength', 'Dexterity'],
    skills: ['Acrobatics', 'Perception', 'Stealth', 'Survival'],
    weapons: {
      primary: { name: 'Shortsword', attackBonus: '+5', damage: '1d6 + 3 piercing', damageAttribute: 'Dexterity', special: 'Finesse, Light' },
      ranged: { name: 'Longbow', attackBonus: '+5', damage: '1d8 + 3 piercing', damageAttribute: 'Dexterity', special: 'Ammunition (range 150/600), Heavy, Two-Handed' },
    },
    equipment: ['Quiver (20 arrows)', 'Backpack', 'Bedroll', 'Rope (50 ft)', 'Rations (5 days)', 'Waterskin'],
    inventory: ['Healing Potion', 'Torch'],
    features: ['Natural Explorer', 'Favored Enemy'],
    personality: {
      trait: 'I am always calm, no matter the situation.',
      ideal: 'Nature: The natural world is more important than all the constructs of civilization.',
      bond: 'I protect the wilderness from those who would defile it.',
      flaw: 'I am slow to trust, and even slower to forgive.',
    },
    appearance: 'Tall and slender, with long auburn hair and piercing green eyes.'
  },
  {
    id: 'default-2',
    name: 'Grak Stonefist',
    race: 'Half-Orc',
    class: 'Barbarian',
    level: 3,
    experience: 900,
    alignment: 'Chaotic Good',
    background: 'Outlander',
    speed: 40,
    hitDice: '1d12',
    hp: 34,
    maxHp: 34,
    proficiencyBonus: 2,
    stats: { strength: 18, dexterity: 12, constitution: 16, intelligence: 8, wisdom: 10, charisma: 10 },
    primaryAttribute: 'Strength',
    secondaryAttribute: 'Constitution',
    armor: 'None',
    fightStyle: 'Great Weapon Fighting',
    ac: 14, // 10 + Dex mod (1) + Con mod (3)
    initiative: 1,
    passivePerception: 10,
    savingThrows: ['Strength', 'Constitution'],
    skills: ['Athletics', 'Intimidation', 'Survival'],
    weapons: {
      primary: { name: 'Greataxe', attackBonus: '+6', damage: '1d12 + 4 slashing', damageAttribute: 'Strength', special: 'Heavy, Two-Handed' },
    },
    equipment: ['Backpack', 'Bedroll', 'Rations (5 days)', 'Waterskin', 'Hunting Trap'],
    inventory: ['Healing Potion'],
    features: ['Rage', 'Unarmored Defense', 'Reckless Attack'],
    personality: {
      trait: 'I am a boisterous and jovial companion, quick to laugh and quicker to fight.',
      ideal: 'Freedom: Chains are meant to be broken, as are those who would forge them.',
      bond: 'I seek to prove my worth to my tribe, or to find a new one.',
      flaw: 'I have a short temper and often resort to violence to solve problems.',
    },
    appearance: 'Muscular and imposing, with green-tinged skin and prominent tusks.'
  }
];
