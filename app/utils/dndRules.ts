/**
 * Calculates the D&D 5e ability modifier from a score.
 * Formula: floor((score - 10) / 2)
 */
export function calculateModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/**
 * Calculates the Spell Save DC.
 * Formula: 8 + Proficiency Bonus + Spellcasting Ability Modifier
 */
export function calculateSpellSaveDC(proficiencyBonus: number, spellcastingAbilityScore: number): number {
  const modifier = calculateModifier(spellcastingAbilityScore);
  return 8 + proficiencyBonus + modifier;
}

/**
 * Calculates the Spell Attack Bonus.
 * Formula: Proficiency Bonus + Spellcasting Ability Modifier
 */
export function calculateSpellAttackBonus(proficiencyBonus: number, spellcastingAbilityScore: number): string {
  const bonus = proficiencyBonus + calculateModifier(spellcastingAbilityScore);
  return bonus >= 0 ? `+${bonus}` : `${bonus}`;
}

/**
 * Calculates the Initiative Bonus.
 * Formula: Dexterity Modifier
 */
export function calculateInitiative(dexterityScore: number): number {
  return calculateModifier(dexterityScore);
}

/**
 * Calculates Passive Perception.
 * Formula: 10 + Wisdom Modifier (+ Proficiency Bonus if proficient in Perception)
 * NOTE: This function assumes no proficiency for simplicity unless explicitly passed.
 */
export function calculatePassivePerception(wisdomScore: number, isProficient: boolean = false, proficiencyBonus: number = 0): number {
  let passive = 10 + calculateModifier(wisdomScore);
  if (isProficient) {
    passive += proficiencyBonus;
  }
  return passive;
}
