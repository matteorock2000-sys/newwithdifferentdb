import { roll4d6DropLowest, rollHitDice, rollAllStats, calculateModifier } from "~/utils/dice";
import type { Character, Stats, Modifiers, SavingThrows, Skills, Personality, SpellSlots } from "~/types";

// --- Static Data Lists ---

export const RANDOMIZER_RACES = [
  "Human", "Dwarf", "Elf", "Halfling", "Gnome", "Half-Elf", "Half-Orc", "Tiefling", "Dragonborn"
];

export const RANDOMIZER_CLASSES = [
  { name: "Barbarian", hd: "1d12", primary: "strength", spellcaster: false },
  { name: "Bard", hd: "1d8", primary: "charisma", spellcaster: true },
  { name: "Cleric", hd: "1d8", primary: "wisdom", spellcaster: true },
  { name: "Druid", hd: "1d8", primary: "wisdom", spellcaster: true },
  { name: "Fighter", hd: "1d10", primary: "strength", spellcaster: false },
  { name: "Monk", hd: "1d8", primary: "dexterity", spellcaster: false },
  { name: "Paladin", hd: "1d10", primary: "strength", spellcaster: true },
  { name: "Ranger", hd: "1d10", primary: "dexterity", spellcaster: true },
  { name: "Rogue", hd: "1d8", primary: "dexterity", spellcaster: false },
  { name: "Sorcerer", hd: "1d6", primary: "charisma", spellcaster: true },
  { name: "Warlock", hd: "1d8", primary: "charisma", spellcaster: true },
  { name: "Wizard", hd: "1d6", primary: "intelligence", spellcaster: true },
];

export const RANDOMIZER_BACKGROUNDS = [
  "Acolyte", "Criminal", "Folk Hero", "Noble", "Sage", "Soldier", "Urchin", "Hermit"
];

export const RANDOMIZER_FIRST_NAMES = [
  "Alistair", "Brienne", "Caelen", "Darian", "Elara", "Faelar", "Gareth", "Hilda", "Ivor", "Jessa", 
  "Kael", "Lyra", "Milo", "Nyssa", "Orin", "Pippin", "Quinn", "Roric", "Seraphina", "Torvin"
];

// --- Helper Functions for Character Assembly ---

const getAverageHdRoll = (hd: string): number => {
    switch (hd) {
        case '1d12': return 7; // Average of 1-12
        case '1d10': return 6; // Average of 1-10
        case '1d8': return 5;  // Average of 1-8
        case '1d6': return 4;  // Average of 1-6
        default: return 4; 
    }
};

/**
 * Creates a basic Level 3 character shell with randomized data.
 */
export function createRandomLevel3Character(): Omit<Character, 'userId' | 'slotIndex'> {
  const randomRace = RANDOMIZER_RACES[Math.floor(Math.random() * RANDOMIZER_RACES.length)];
  const randomClassData = RANDOMIZER_CLASSES[Math.floor(Math.random() * RANDOMIZER_CLASSES.length)];
  const randomBackground = RANDOMIZER_BACKGROUNDS[Math.floor(Math.random() * RANDOMIZER_BACKGROUNDS.length)];
  const randomName = RANDOMIZER_FIRST_NAMES[Math.floor(Math.random() * RANDOMIZER_FIRST_NAMES.length)];
  
  // Use the exported rollAllStats function
  const { stats, statRolls, modifiers } = rollAllStats();
  
  const level = 3;
  const proficiencyBonus = 2; // PB is +2 at level 3
  const primaryAttr = randomClassData.primary;
  const secondaryAttr = primaryAttr === 'strength' ? 'dexterity' : 'strength'; // Simple fallback
  
  // --- Calculate Derived Stats for Level 3 ---
  
  const conMod = modifiers.constitution;
  
  // 1. Calculate Max HP at Level 1 (Max HD Roll + CON Mod)
  const maxHpL1 = rollHitDice(randomClassData.hd) + conMod;
  
  // 2. Calculate HP gain per level after L1 (Avg HD Roll + CON Mod)
  const avgHdGain = getAverageHdRoll(randomClassData.hd) + conMod;
  
  // 3. Calculate Max HP at Level 3 (Max HP L1 + 2 * subsequent level gains)
  const maxHp = maxHpL1 + (2 * avgHdGain);
  const hp = maxHp;
  
  // Initiative: DEX Mod
  const initiative = modifiers.dexterity;
  
  // AC: Default to 10 + DEX mod (assuming no armor initially)
  const ac = 10 + modifiers.dexterity;
  
  // Spellcasting Ability & DC (if applicable)
  let spellcastingAbility: keyof Stats | undefined = undefined;
  let spellSaveDC: number | undefined = undefined;
  let spellAttackBonus: string | undefined = undefined;

  if (randomClassData.spellcaster) {
    spellcastingAbility = primaryAttr as keyof Stats;
    const spellcastingScore = stats[spellcastingAbility];
    // DC = 8 + Prof + Mod
    spellSaveDC = 8 + proficiencyBonus + calculateModifier(spellcastingScore);
    // Attack = Prof + Mod
    const attackBonusNum = proficiencyBonus + calculateModifier(spellcastingScore);
    spellAttackBonus = attackBonusNum >= 0 ? `+${attackBonusNum}` : `${attackBonusNum}`;
  }

  // Default Saving Throws (MultiSelect expects string[])
  const savingThrowsArray: string[] = [];
  if (primaryAttr === 'strength') savingThrowsArray.push('Strength');
  if (primaryAttr === 'dexterity') savingThrowsArray.push('Dexterity');
  if (primaryAttr === 'constitution') savingThrowsArray.push('Constitution');
  if (primaryAttr === 'intelligence') savingThrowsArray.push('Intelligence');
  if (primaryAttr === 'wisdom') savingThrowsArray.push('Wisdom');
  if (primaryAttr === 'charisma') savingThrowsArray.push('Charisma');
  
  // Default Skills: Empty array for now
  const skillsArray: string[] = [];
  
  // Default Spell Slots for Level 3 Caster (Full Caster approximation: 3 L1 slots, 2 L2 slots)
  let defaultSpellSlots: SpellSlots = {
    level1: { current: 3, max: 3 },
    level2: { current: 2, max: 2 },
  };
  
  // Adjust slots for known non-full casters at level 3 (Paladin/Ranger get 2 L1, 1 L2; Warlock gets 2 L1, 0 L2)
  if (randomClassData.name === 'Warlock') {
      defaultSpellSlots = { level1: { current: 2, max: 2 }, level2: { current: 0, max: 0 } };
  } else if (['Paladin', 'Ranger'].includes(randomClassData.name)) {
      defaultSpellSlots = { level1: { current: 2, max: 2 }, level2: { current: 1, max: 1 } };
  }


  const defaultCharacter: Omit<Character, 'userId' | 'slotIndex'> = {
    id: crypto.randomUUID(),
    name: randomName,
    race: randomRace,
    class: randomClassData.name,
    level: level,
    experience: 0,
    alignment: "Unaligned",
    background: randomBackground,
    speed: 30, // Default speed
    hitDice: randomClassData.hd,
    hp: hp,
    maxHp: maxHp,
    proficiencyBonus: proficiencyBonus,
    stats: stats,
    statRolls: statRolls,
    modifiers: modifiers,
    savingThrows: savingThrowsArray, // <-- Now guaranteed to be string[]
    skills: skillsArray, // <-- Now guaranteed to be string[]
    equipment: [`Starting Equipment (${randomClassData.name})`],
    inventory: [],
    armor: "Unarmored",
    fightStyle: "N/A",
    totalAc: ac,
    primaryAttribute: primaryAttr,
    secondaryAttribute: secondaryAttr,
    spellcastingAbility: spellcastingAbility as keyof Stats | undefined,
    spellSaveDC: spellSaveDC,
    spellAttackBonus: spellAttackBonus,
    features: [`Level ${level} Features: ${randomClassData.name} Features`],
    personality: { trait: "A bit quiet.", ideal: "Self-Improvement", bond: "My homeland.", flaw: "Easily distracted." },
    appearance: `A ${randomRace} ${randomClassData.name} from the ${randomBackground} background.`,
    spells: { cantrips: [], level1: [], level2: [] },
    spellSlots: defaultSpellSlots,
  };
  
  return defaultCharacter;
}
