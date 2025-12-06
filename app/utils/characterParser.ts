import { RACES, CLASSES, INVENTORY_ITEMS, CANTRIPS, LEVEL_1_SPELLS, TRAITS, IDEALS, BONDS, FLAWS, FIGHT_STYLES, ARMOR_TYPES, SKILLS, SAVING_THROWS } from '~/data/dnd';
import type { Character, Weapon, SpellSlots, AbilityScores } from '~/types';

// Helper function to clean up text
const cleanText = (text: string): string => {
  // Remove invalid characters and emoji
  return text.replace(/[\r\n]+/g, ' ').replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA99}]/gu, '').trim(); // Replace line breaks with spaces and trim
};

// Utility function to extract a value based on a key and a regex
const extractValue = (text: string, keyRegex: RegExp, valueRegex: RegExp): string | undefined => {
  const match = text.match(keyRegex);
  if (!match) return undefined;

  const valueMatch = text.substring(match.index! + match[0].length).match(valueRegex);
  return valueMatch ? valueMatch[0].trim() : undefined;
};

// Utility function to extract a value based on a key and a regex
const extractValueWithKey = (text: string, keyRegex: RegExp, valueRegex: RegExp): string | undefined => {
  const match = text.match(keyRegex);
  if (!match) return undefined;

  const valueMatch = text.substring(match.index!).match(valueRegex);
  return valueMatch ? valueMatch[0].trim() : undefined;
};

// Utility function to extract a value based on a key and a regex
const extractValueWithKeyAndGroup = (text: string, keyRegex: RegExp, valueRegex: RegExp, groupIndex: number = 1): string | undefined => {
  const match = text.match(keyRegex);
  if (!match) return undefined;

  const valueMatch = text.substring(match.index!).match(valueRegex);
  return valueMatch && valueMatch[groupIndex] ? valueMatch[groupIndex].trim() : undefined;
};

// Utility function to extract a value based on a key and a regex
const extractValueWithKeyAndGroupMultiple = (text: string, keyRegex: RegExp, valueRegex: RegExp, groupIndex: number = 1): string[] => {
  // Ensure the regex is global
  if (!valueRegex.global) {
    console.warn("Regex is not global. Converting to global.");
    valueRegex = new RegExp(valueRegex.source, valueRegex.flags + 'g');
  }

  const matches = Array.from(text.matchAll(valueRegex));
  if (!matches || matches.length === 0) return [];

  const extractedValues: string[] = [];
  matches.forEach(match => {
    if (match && match[groupIndex]) {
      extractedValues.push(match[groupIndex].trim());
    }
  });
  return extractedValues;
};

// Function to parse the character sheet text
export const parseCharacterSheet = (text: string, context?: { partialCharacter?: Partial<Character>; questions?: string[] }) => {
  const cleanedText = cleanText(text);
  const character: Partial<Character> = context?.partialCharacter || {};
  const questions: string[] = context?.questions || [];

  // --- Name (from the top) ---
  character.name = character.name || extractValue(cleanedText, /⚔️\s*([A-Za-z0-9\s]+)\s*–/i, /([A-Za-z0-9\s]+)/);

  // --- Core Information ---
  character.race = character.race || extractValue(cleanedText, /Race:\s*/i, /([A-Za-z0-9\s()]+)/) || extractValue(cleanedText, /([A-Za-z0-9\s()]+)\s*\|/i, /([A-Za-z0-9\s()]+)/) || RACES[0];
  character.class = character.class || extractValue(cleanedText, /Class:\s*/i, /([A-Za-z0-9\s\/]+)/) || extractValue(cleanedText, /\|\s*([A-Za-z0-9\s\/]+)\s*\|/i, /([A-Za-z0-9\s\/]+)/) || CLASSES[0];
  character.level = character.level || parseInt(extractValue(cleanedText, /Level:\s*/i, /(\d+)/) || extractValue(cleanedText, /\|\s*Level\s*(\d+)\s*\|/i, /(\d+)/) || '3', 10);
  character.alignment = character.alignment || extractValue(cleanedText, /Alignment:\s*/i, /([A-Za-z0-9\s]+)/) || 'Neutral Good';
  character.background = character.background || extractValue(cleanedText, /Background:\s*/i, /([A-Za-z0-9\s]+)/) || 'Acolyte';
  character.experience = character.experience || parseInt(extractValue(cleanedText, /XP:\s*/i, /(\d+)/) || '0', 10);
  character.speed = character.speed || parseInt(extractValue(cleanedText, /Speed:\s*/i, /(\d+)/) || '30', 10);
  character.hitDice = character.hitDice || extractValue(cleanedText, /Hit Dice:\s*/i, /(\d+d\d+)/) || '1d8';
  character.hp = character.hp || parseInt(extractValue(cleanedText, /HP:\s*/i, /(\d+)/) || '10', 10);
  character.maxHp = character.maxHp || parseInt(extractValue(cleanedText, /Max HP:\s*/i, /(\d+)/) || '10', 10);
  character.proficiencyBonus = character.proficiencyBonus || parseInt(extractValue(cleanedText, /Proficiency Bonus:\s*/i, /(\+?\d+)/) || '2', 10);

  // --- Stats ---
  const statRegex = /(STR|DEX|CON|INT|WIS|CHA):\s*(\d+)\s*([+-]?\d+)?/gi;
  let statMatch;
  character.stats = character.stats || { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 };
  while ((statMatch = statRegex.exec(cleanedText)) !== null) {
    const stat = statMatch[1].toLowerCase();
    const score = parseInt(statMatch[2], 10);
    const modifier = statMatch[3] ? parseInt(statMatch[3], 10) : Math.floor((score - 10) / 2); // Calculate modifier if not provided
    // @ts-ignore - we know the keys exist
    character.stats[stat] = score;
    if (character.modifiers === undefined) {
      character.modifiers = { strength: 0, dexterity: 0, constitution: 0, intelligence: 0, wisdom: 0, charisma: 0 };
    }
    // @ts-ignore - we know the keys exist
    character.modifiers[stat] = modifier;
  }

  // --- Saving Throws & Skills ---
  character.savingThrows = character.savingThrows || extractValueWithKeyAndGroupMultiple(cleanedText, /Saving Throws:\s*/i, /([A-Za-z0-9\s+]+)/gi);
  character.skills = character.skills || extractValueWithKeyAndGroupMultiple(cleanedText, /Skills:\s*/i, /([A-Za-z0-9\s+]+)/gi);

  // --- Combat ---
  character.ac = character.ac || parseInt(extractValue(cleanedText, /Armor Class:\s*/i, /(\d+)/) || '10', 10);
  character.initiative = character.initiative || parseInt(extractValue(cleanedText, /Initiative:\s*/i, /(\+?\d+)/) || '0', 10);
  character.passivePerception = character.passivePerception || parseInt(extractValue(cleanedText, /Passive Perception:\s*/i, /(\d+)/) || '10', 10);
  character.armor = character.armor || extractValue(cleanedText, /Armor:\s*/i, /([A-Za-z0-9\s]+)/) || extractValue(cleanedText, /Armor Type:\s*/i, /([A-Za-z0-9\s]+)/) || ARMOR_TYPES[0];
  character.fightStyle = character.fightStyle || extractValue(cleanedText, /Fighting Style:\s*/i, /([A-Za-z0-9\s]+)/) || FIGHT_STYLES[0];
  character.totalAc = character.totalAc || parseInt(extractValue(cleanedText, /Total AC:\s*/i, /(\d+)/) || '10', 10);

  // --- Weapons ---
  const weaponRegex = /(Weapon|Melee Weapon|Ranged Weapon):\s*([A-Za-z0-9\s]+)\s*\(([^)]+)\)/gi;
  let weaponMatch;
  while ((weaponMatch = weaponRegex.exec(cleanedText)) !== null) {
    const weaponType = weaponMatch[1].toLowerCase();
    const weaponName = weaponMatch[2].trim();
    const weaponDetails = weaponMatch[3].split(',').map(detail => detail.trim());

    const attackBonus = weaponDetails.find(detail => detail.startsWith('+')) || '+0';
    const damage = weaponDetails.find(detail => detail.match(/^\d+d\d+/)) || '1d1';
    const damageAttribute = weaponDetails.find(detail => detail.match(/(STR|DEX|CON|INT|WIS|CHA)/i))?.toUpperCase() || 'DEX';

    const weapon: Weapon = {
      name: weaponName,
      attackBonus: attackBonus,
      damage: damage,
      damageAttribute: damageAttribute,
    };

    if (weaponType.includes('weapon')) {
      character.weapons = character.weapons || {};
      if (weaponType.includes('melee')) {
        character.weapons.primary = weapon;
      } else if (weaponType.includes('ranged')) {
        character.weapons.ranged = weapon;
      } else {
        character.weapons.primary = weapon; // Default to primary if type is unclear
      }
    }
  }

  // --- Equipment & Inventory ---
  character.equipment = character.equipment || extractValueWithKeyAndGroupMultiple(cleanedText, /Equipment:\s*/i, /([A-Za-z0-9\s]+)/gi);
  character.inventory = character.inventory || extractValueWithKeyAndGroupMultiple(cleanedText, /Inventory:\s*/i, /([A-Za-z0-9\s]+)/gi);

  // --- Spellcasting ---
  character.spellcastingAbility = character.spellcastingAbility || extractValue(cleanedText, /Spellcasting Ability:\s*/i, /([A-Za-z0-9\s]+)/);
  character.spellSaveDC = character.spellSaveDC || parseInt(extractValue(cleanedText, /Spell Save DC:\s*/i, /(\d+)/) || '8', 10);
  character.spellAttackBonus = character.spellAttackBonus || extractValue(cleanedText, /Spell Attack Bonus:\s*/i, /(\+?\d+)/);

  // --- Features & Traits ---
  character.features = character.features || extractValueWithKeyAndGroupMultiple(cleanedText, /Features & Traits:\s*/i, /([A-Za-z0-9\s]+)/gi) || extractValueWithKeyAndGroupMultiple(cleanedText, /Features:\s*/i, /([A-Za-z0-9\s]+)/gi);

  // --- Personality ---
  character.personality = character.personality || {};
  character.personality.trait = character.personality.trait || extractValue(cleanedText, /Trait:\s*/i, /([A-Za-z0-9\s]+)/);
  character.personality.ideal = character.personality.ideal || extractValue(cleanedText, /Ideal:\s*/i, /([A-Za-z0-9\s]+)/);
  character.personality.bond = character.personality.bond || extractValue(cleanedText, /Bond:\s*/i, /([A-Za-z0-9\s]+)/);
  character.personality.flaw = character.personality.flaw || extractValue(cleanedText, /Flaw:\s*/i, /([A-Za-z0-9\s]+)/);
  character.appearance = character.appearance || extractValue(cleanedText, /Appearance:\s*/i, /([A-Za-z0-9\s]+)/);

  // --- Spells ---
  const cantripRegex = /Cantrips:\s*([A-Za-z0-9\s,–-]+)/i;
  const level1SpellRegex = /1st-Level Spells:\s*([A-Za-z0-9\s,–-]+)/i;
  const level2SpellRegex = /2nd-Level Spells:\s*([A-Za-z0-9\s,–-]+)/i;

  character.spells = character.spells || { cantrips: [], level1: [], level2: [] };

  character.spells.cantrips = character.spells.cantrips || extractValueWithKeyAndGroupMultiple(cleanedText, cantripRegex, /([A-Za-z0-9\s,–-]+)/gi);
  character.spells.level1 = character.spells.level1 || extractValueWithKeyAndGroupMultiple(cleanedText, level1SpellRegex, /([A-Za-z0-9\s,–-]+)/gi);
  character.spells.level2 = character.spells.level2 || extractValueWithKeyAndGroupMultiple(cleanedText, level2SpellRegex, /([A-Za-z0-9\s,–-]+)/gi);

  // --- Spell Slots (Basic - needs more sophisticated parsing) ---
  const spellSlotsRegex = /(Level \d+ Slots):\s*(\d+)\/(\d+)/gi;
  let spellSlotsMatch;
  while ((spellSlotsMatch = spellSlotsRegex.exec(cleanedText)) !== null) {
    const level = spellSlotsMatch[1].toLowerCase().replace('level ', '').replace(' slots', '');
    const current = parseInt(spellSlotsMatch[2], 10);
    const max = parseInt(spellSlotsMatch[3], 10);

    if (character.spellSlots === undefined) {
      character.spellSlots = { level1: { current: 0, max: 0 }, level2: { current: 0, max: 0 } };
    }

    if (level === '1') {
      character.spellSlots.level1 = { current: current, max: max };
    } else if (level === '2') {
      character.spellSlots.level2 = { current: current, max: max };
    }
  }

  // --- Description (JSON Parsing) ---
  try {
    const descriptionMatch = extractValue(cleanedText, /Description:\s*/i, /({[\s\S]*})/);
    if (descriptionMatch) {
      const descriptionData = JSON.parse(descriptionMatch);
      // Assuming the JSON contains fields like traits, ideals, bonds, flaws, etc.
      if (descriptionData) {
        character.personality = {
          trait: descriptionData.trait || character.personality?.trait,
          ideal: descriptionData.ideal || character.personality?.ideal,
          bond: descriptionData.bond || character.personality?.bond,
          flaw: descriptionData.flaw || character.personality?.flaw,
          appearance: descriptionData.appearance || character.appearance,
        };
      }
    }
  } catch (jsonError) {
    console.warn("Error parsing description JSON:", jsonError);
    // If JSON parsing fails, keep the existing values or leave them undefined.
  }

  // --- Questions for incomplete parsing ---
  if (!character.name) questions.push("What is the character's name?");
  if (!character.race) questions.push("What is the character's race?");
  if (!character.class) questions.push("What is the character's class?");
  if (!character.background) questions.push("What is the character's background?");
  if (!character.stats?.strength) questions.push("What is the character's strength?");
  if (!character.stats?.dexterity) questions.push("What is the character's dexterity?");
  if (!character.stats?.constitution) questions.push("What is the character's constitution?");
  if (!character.stats?.intelligence) questions.push("What is the character's intelligence?");
  if (!character.stats?.wisdom) questions.push("What is the character's wisdom?");
  if (!character.stats?.charisma) questions.push("What is the character's charisma?");

  return { character, questions };
};
