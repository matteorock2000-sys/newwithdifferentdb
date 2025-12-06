import { json } from "@remix-run/node";
import { redis } from "./db.server";
import type { Character } from "~/types";
import { v4 as uuidv4 } from 'uuid';

const CHARACTER_KEY_PREFIX = "character:";

export async function getAllCharacters(userId: string): Promise<Character[]> {
  try {
    const keys = await redis.keys(`${CHARACTER_KEY_PREFIX}${userId}:*`);
    if (!keys || keys.length === 0) {
      return [];
    }

    const characterJsons = await redis.mget(keys);
    if (!characterJsons || characterJsons.length === 0) {
      return [];
    }

    const characters: Character[] = characterJsons.map(jsonString => {
      try {
        return JSON.parse(jsonString as string);
      } catch (error) {
        console.error("Error parsing character JSON:", jsonString, error);
        return null; // Or handle the error as needed
      }
    }).filter(Boolean) as Character[]; // Remove any null values from parsing errors

    return characters;
  } catch (error) {
    console.error("Error getting characters:", error);
    return []; // Or throw the error, depending on your error handling strategy
  }
}

export async function saveCharacter(userId: string, character: Character): Promise<Character> {
  try {
    const characterId = character.id || uuidv4();
    const key = `${CHARACTER_KEY_PREFIX}${userId}:${characterId}`;

    // Ensure the character has a slot assigned.  If not, it's an error.
    if (character.slotIndex === undefined || character.slotIndex === null) {
      throw new Error("Character must have a slot assigned before saving.");
    }

    const characterToSave = { ...character, id: characterId };
    await redis.set(key, JSON.stringify(characterToSave));
    return characterToSave;
  } catch (error) {
    console.error("Error saving character:", error);
    throw error; // Re-throw the error to be handled by the calling function
  }
}
