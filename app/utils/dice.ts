/**
 * Utility functions for rolling dice.
 */
import type { AbilityScores } from "~/types";

/**
 * Calculates the D&D 5e ability modifier from a score.
 * Formula: floor((score - 10) / 2)
 */
export function calculateModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/**
 * Rolls a standard die (e.g., d4, d6, d8, d10, d12, d20).
 * @param sides The number of sides on the die.
 * @returns The result of the roll (1 to sides).
 */
export function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

/**
 * Rolls 4d6 and drops the lowest die result.
 * @returns An object containing the sum of the top 3 dice and the array of all 4 rolls.
 */
export function roll4d6DropLowest(): { sum: number, rolls: number[] } {
  const rolls = [rollDie(6), rollDie(6), rollDie(6), rollDie(6)];
  rolls.sort((a, b) => a - b); // Sort ascending
  
  const lowest = rolls.shift()!; // Remove the lowest (first element)
  const sum = rolls.reduce((acc, val) => acc + val, 0);
  
  return { sum, rolls: [...rolls, lowest].sort((a, b) => b - a) }; // Return sorted descending for display clarity (top 3 first)
}

/**
 * Rolls dice based on a Hit Dice string (e.g., "1d8").
 * @param hdString The hit dice string (e.g., "1d8").
 * @param numDice The number of times to roll the HD (usually 1 for initial HP calculation, or level for max HP calculation).
 * @returns The total rolled value.
 */
export function rollHitDice(hdString: string, numDice: number = 1): number {
    const match = hdString.match(/(\d+)d(\d+)/);
    if (!match) return 0;

    const count = parseInt(match[1], 10) * numDice;
    const sides = parseInt(match[2], 10);
    
    let total = 0;
    for (let i = 0; i < count; i++) {
        total += rollDie(sides);
    }
    return total;
}

/**
 * Rolls stats for all 6 abilities using 4d6 drop lowest for each.
 * This function encapsulates the logic previously found in generateStats in randomizerData.ts.
 */
export function rollAllStats(): { stats: AbilityScores, statRolls: Record<keyof AbilityScores, number[]>, modifiers: AbilityScores } {
  const statKeys: (keyof AbilityScores)[] = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
  const stats: Partial<AbilityScores> = {};
  const statRolls: Partial<Record<keyof AbilityScores, number[]>> = {};
  const modifiers: Partial<AbilityScores> = {};

  for (const key of statKeys) {
    const { sum, rolls } = roll4d6DropLowest();
    stats[key] = sum;
    statRolls[key] = rolls;
    modifiers[key] = calculateModifier(sum);
  }

  return { 
    stats: stats as AbilityScores, 
    statRolls: statRolls as Record<keyof AbilityScores, number[]>, 
    modifiers: modifiers as AbilityScores 
  };
}

/**
 * Helper to generate a unique 6-character code.
 */
export async function generateUniqueCode(): Promise<string> {
    // Placeholder: In a real app, this would loop until a unique code is found in the DB.
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // In a real implementation, you MUST check if this code exists in the DB.
    return result;
}
