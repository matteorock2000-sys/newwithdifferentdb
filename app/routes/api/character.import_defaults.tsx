import { ActionFunctionArgs, json } from "@remix-run/node";
import { requireUserId } from "~/services/auth.server";
import { getCharactersForUser, saveCharacter } from "~/services/db.server";
import type { Character } from "~/types";

// Define default characters (replace with actual character data)
const defaultCharacters: Omit<Character, 'id' | 'slotIndex' | 'userId'>[] = [
  {
    name: "Aragorn",
    race: "Human",
    class: "Fighter",
    level: 1,
    experience: 0,
    alignment: "Lawful Good",
    background: "Noble",
    speed: 30,
    hitDice: "1d10",
    hp: 10,
    maxHp: 10,
    proficiencyBonus: 2,
    stats: {
      strength: 15,
      dexterity: 14,
      constitution: 13,
      intelligence: 12,
      wisdom: 10,
      charisma: 8,
    },
    ac: 16,
    initiative: 2,
    passivePerception: 10,
    savingThrows: ["Strength +2", "Constitution +2"],
    skills: ["Athletics +4", "Intimidation +1"],
    equipment: ["Longsword", "Shield", "Chainmail"],
    inventory: [],
    features: [],
    personality: {},
  },
  {
    name: "Gandalf",
    race: "Human",
    class: "Wizard",
    level: 1,
    experience: 0,
    alignment: "Neutral Good",
    background: "Sage",
    speed: 30,
    hitDice: "1d6",
    hp: 8,
    maxHp: 8,
    proficiencyBonus: 2,
    stats: {
      strength: 8,
      dexterity: 14,
      constitution: 10,
      intelligence: 15,
      wisdom: 13,
      charisma: 12,
    },
    ac: 12,
    initiative: 2,
    passivePerception: 11,
    savingThrows: ["Intelligence +2", "Wisdom +2"],
    skills: ["Arcana +4", "History +4"],
    equipment: ["Staff", "Spellbook"],
    inventory: [],
    features: [],
    personality: {},
  },
];

export async function action({ request }: ActionFunctionArgs) {
  console.log("--- API character import defaults action hit ---");

  // 1. Ensure user is authenticated
  const userId = await requireUserId(request);

  // 2. Fetch existing characters to determine available slots
  const existingCharacters = await getCharactersForUser(userId);
  const occupiedSlots = new Set(existingCharacters.map((c) => c?.slotIndex));
  const maxSlots = 12;
  let nextSlot = 1;

  const importedCharacters: Character[] = [];

  for (const defaultChar of defaultCharacters) {
    // Find the next available slot
    while (occupiedSlots.has(nextSlot) && nextSlot <= maxSlots) {
      nextSlot++;
    }

    if (nextSlot > maxSlots) {
      console.warn("No available character slots to import default characters.");
      break; // No more slots available
    }

    // Create a new character object with the assigned slot and userId
    const newCharacter: Character = {
      ...defaultChar as Character,
      id: crypto.randomUUID(),
      slotIndex: nextSlot,
      userId: userId,
    };

    try {
      // Save the character to the database
      const savedCharacter = await saveCharacter(userId, newCharacter);
      importedCharacters.push(savedCharacter);
      occupiedSlots.add(nextSlot); // Mark the slot as occupied
      nextSlot++; // Increment for the next character
    } catch (error) {
      console.error("Error saving default character:", error);
      return json(
        {
          success: false,
          error: `Failed to save default character: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
        { status: 500 }
      );
    }
  }

  if (importedCharacters.length === 0) {
    return json(
      {
        success: true,
        message: "No default characters were imported (slots may be full).",
      },
      { status: 200 }
    );
  }

  // 4. Return a success response with the imported characters
  return json({ success: true, characters: importedCharacters }, { status: 200 });
}
