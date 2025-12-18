import { createClient } from "@supabase/supabase-js";
import Redis from "ioredis";
import type { Character, User as UserType, PlayerSlot } from "~/types";
import { logger } from "~/utils/logger";

// Define the User type structure
export interface User extends UserType {}

// Environment variables are assumed to be set in .env
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const redisUrl = process.env.REDIS_URL;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for server-side operations.");
}

export const db = createClient(supabaseUrl, supabaseServiceKey);

// Redis is optional - only initialize if REDIS_URL is provided
export const redis = redisUrl ? new Redis(redisUrl) : null;

if (redisUrl) {
  // Log successful Redis connection setup
  redis?.on("connect", () => {
    logger.debug("[DB SERVICE] Redis connected successfully.");
  });
  
  redis?.on("error", (err: Error) => {
    logger.warn("[DB SERVICE] Redis connection error", { error: err.message });
  });
}

// Helper function to map DB response (snake_case) to User interface (camelCase)
function mapDbUserToUser(dbData: any): User | null {
  if (!dbData) return null;
  return {
    id: dbData.id,
    email: dbData.email,
    username: dbData.username,
    hashedPassword: dbData.hashed_password,
  };
}

// Helper function to map Character interface (camelCase) to DB object (snake_case) for insertion
function mapCharacterToDb(character: Character, userId: string) {
  return {
    id: character.id,
    userId: userId, // CORRECTED: Use the passed userId for the snake_case DB column
    slot_index: character.slotIndex, // MAPPED: slotIndex -> slot_index
    name: character.name,
    race: character.race,
    class: character.class,
    level: character.level,
    experience: character.experience,
    alignment: character.alignment,
    background: character.background,
    speed: character.speed,
    hit_dice: character.hitDice,
    hp: character.hp,
    max_hp: character.maxHp,
    proficiency_bonus: character.proficiencyBonus,
    armor_class: character.ac, 
    initiative: character.initiative,
    passive_perception: character.passivePerception,
    armor: character.armor,
    fight_style: character.fightStyle,
    total_ac: character.totalAc,
    spellcasting_ability: character.spellcastingAbility,
    spell_save_dc: character.spellSaveDC,
    spell_attack_bonus: character.spellAttackBonus,
    primary_attribute: character.primaryAttribute,
    secondary_attribute: character.secondaryAttribute,
    avatar_url: character.avatarUrl,
    stats: character.stats,
    stat_rolls: character.statRolls,
    modifiers: character.modifiers,
    saving_throws: character.savingThrows,
    skills: character.skills,
    equipment: character.equipment,
    inventory: character.inventory,
    weapons: character.weapons,
    spells: character.spells,
    spell_slots: character.spellSlots,
    
    // NEW: Bundle narrative/trait elements into the 'data' JSONB column
    data: {
        appearance: character.appearance,
        features: character.features,
        personality: character.personality,
    }
    // Note: appearance, features, personality removed from top level mapping
  };
}

// Helper function to map DB response (snake_case) to Character interface (camelCase)
function mapDbCharacterToCharacter(dbData: any): Character {
  const data = dbData.data || {}; // Safely access the new data object
  
  return {
    id: dbData.id,
    userId: dbData.userId, // CORRECTED: Map DB userId to client userId
    slotIndex: dbData.slot_index, // MAPPED: slot_index -> slotIndex
    name: dbData.name,
    race: dbData.race,
    class: dbData.class,
    level: dbData.level,
    experience: dbData.experience,
    alignment: dbData.alignment,
    background: dbData.background,
    speed: dbData.speed,
    hitDice: dbData.hit_dice,
    hp: dbData.hp,
    maxHp: dbData.max_hp,
    proficiencyBonus: dbData.proficiency_bonus,
    stats: dbData.stats,
    statRolls: dbData.stat_rolls,
    modifiers: dbData.modifiers,
    primaryAttribute: dbData.primary_attribute,
    secondaryAttribute: dbData.secondary_attribute,
    ac: dbData.armor_class,
    initiative: dbData.initiative,
    passivePerception: dbData.passive_perception,
    savingThrows: dbData.saving_throws,
    skills: dbData.skills,
    equipment: dbData.equipment,
    inventory: dbData.inventory,
    armor: dbData.armor,
    fightStyle: dbData.fight_style,
    totalAc: dbData.total_ac,
    weapons: dbData.weapons,
    spellcastingAbility: dbData.spellcasting_ability,
    spellSaveDC: dbData.spell_save_dc,
    spellAttackBonus: dbData.spell_attack_bonus,
    
    // Read from data payload to satisfy interface structure
    appearance: data.appearance,
    avatarUrl: dbData.avatar_url,
    features: data.features || [],
    personality: data.personality || {},
    
    spells: dbData.spells,
    spellSlots: dbData.spellSlots,
  };
}


// --- User Management Functions ---

export async function createUser(email: string, hashedPassword: string, username: string): Promise<User> {
  const { data, error } = await db
    .from('users')
    .insert([{ email, hashed_password: hashedPassword, username }])
    .select()
    .single();

  if (error) {
    logger.error("Error creating user", { error: error instanceof Error ? error.message : "Unknown error" });
    throw new Error("Failed to create user.");
  }
  return mapDbUserToUser(data)!;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  try {
    const { data, error, status } = await db
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error) {
      logger.error("Error fetching user by email", { email, status, error });
      if (error.code === 'PGRST116' || status === 406) return null;
      throw new Error(`Failed to fetch user by email ${email}: ${error.message || JSON.stringify(error)}`);
    }

    return mapDbUserToUser(data);
  } catch (err) {
    logger.error("Exception while fetching user by email", { email, err });
    throw err instanceof Error ? err : new Error("Unknown error fetching user by email");
  }
}

export async function getUserByUsername(username: string): Promise<User | null> {
  try {
    const { data, error, status } = await db
      .from('users')
      .select('*')
      .eq('username', username)
      .single();

    if (error) {
      logger.error("Error fetching user by username", { username, status, error });
      if (error.code === 'PGRST116' || status === 406) return null;
      throw new Error(`Failed to fetch user by username ${username}: ${error.message || JSON.stringify(error)}`);
    }

    return mapDbUserToUser(data);
  } catch (err) {
    logger.error("Exception while fetching user by username", { username, err });
    throw err instanceof Error ? err : new Error("Unknown error fetching user by username");
  }
}

export async function getUserById(id: string): Promise<User | null> {
  try {
    const { data, error, status } = await db
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      // Log full error object and response status to help debugging (not just the message)
      logger.error("Error fetching user by ID", { id, status, error });

      // If PostgREST indicates "no rows" return null so callers can handle missing users
      if (error.code === 'PGRST116' || status === 406) return null;

      // For other errors, throw a descriptive error so upstream callers see details in logs
      throw new Error(`Failed to fetch user by id ${id}: ${error.message || JSON.stringify(error)}`);
    }

    return mapDbUserToUser(data);
  } catch (err) {
    // Catch any unexpected exceptions (network, client misconfig) and log details
    logger.error("Exception while fetching user by ID", { id, err });
    throw err instanceof Error ? err : new Error("Unknown error fetching user by ID");
  }
}

// --- Character Management Functions ---

/**
 * Finds the next available character slot for a user (from 1 to 12).
 */
export async function findNextAvailableSlot(userId: string): Promise<number | null> {
  const { data, error } = await db
    .from('characters')
    .select('slot_index')
    .eq('userId', userId);

  if (error) {
    logger.error("Error fetching character slots", { error: error instanceof Error ? error.message : "Unknown error" });
    throw new Error("Failed to check for available slots.");
  }

  const occupiedSlots = new Set(data.map(c => c.slot_index));
  for (let i = 1; i <= 12; i++) {
    if (!occupiedSlots.has(i)) {
      return i;
    }
  }

  return null; // No slots available
}

export async function getCharactersForUser(userId: string): Promise<(Character | null)[]> {
  const { data, error } = await db
    .from('characters')
    .select('*')
    .eq('userId', userId); // CORRECTED: Query using userId

  if (error) {
    logger.error("Error fetching characters", { error: error instanceof Error ? error.message : "Unknown error" });
    return [];
  }
  return data.map(mapDbCharacterToCharacter);
}

export async function getCharacterById(userId: string, characterId: string): Promise<Character | null> {
  const { data, error } = await db
    .from('characters')
    .select('*')
    .eq('id', characterId)
    .eq('userId', userId) // Ensure ownership
    .single();

  if (error && error.code === 'PGRST116') {
    return null;
  }

  if (error) {
    logger.error("Error fetching character by ID", { error: error instanceof Error ? error.message : "Unknown error" });
    throw new Error("Failed to fetch character.");
  }
  return mapDbCharacterToCharacter(data);
}

export async function getCharacterAvatarUrl(userId: string, characterId: string): Promise<string | null> {
  const { data, error } = await db
    .from('characters')
    .select('avatar_url')
    .eq('id', characterId)
    .eq('userId', userId) // Ensure ownership
    .single();

  if (error && error.code === 'PGRST116') {
    return null;
  }

  if (error) {
    logger.error("Error fetching character avatar URL by ID", { error: error instanceof Error ? error.message : "Unknown error" });
    throw new Error("Failed to fetch character avatar URL.");
  }
  return data?.avatar_url || null;
}

export async function getCharactersByIds(characterIds: string[]): Promise<Character[]> {
  if (characterIds.length === 0) return [];
  
  const { data, error } = await db
    .from('characters')
    .select('*')
    .in('id', characterIds);

  if (error) {
    logger.error("Error fetching characters by IDs", { error: error instanceof Error ? error.message : "Unknown error" });
    return [];
  }
  return data.map(mapDbCharacterToCharacter);
}

export async function saveCharacter(userId: string, character: Character): Promise<Character> {
  const characterData = mapCharacterToDb(character, userId);

  const { data, error } = await db
    .from('characters')
    .upsert([characterData], { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    logger.error("Error saving/updating character", { error: error instanceof Error ? error.message : "Unknown error" });
    throw new Error(`Failed to save character: ${error.message}`);
  }
  return mapDbCharacterToCharacter(data);
}

export async function deleteCharacter(userId: string, characterId: string): Promise<void> {
  const { error } = await db
    .from('characters')
    .delete()
    .eq('id', characterId)
    .eq('userId', userId); // CORRECTED: Query using userId

  if (error) {
    logger.error("Error deleting character", { error: error instanceof Error ? error.message : "Unknown error" });
    throw new Error("Failed to delete character.");
  }
}

export async function saveDefaultCharactersForUser(userId: string, characters: Omit<Character, 'slotIndex'>[]): Promise<Character[]> {
    let nextSlot = await findNextAvailableSlot(userId);
    if (nextSlot === null) {
        throw new Error("No available character slots to save default characters.");
    }

    const charactersToInsert = [];
    for (const char of characters) {
        if (nextSlot > 12) break; // Stop if we run out of slots
        // Ensure slotIndex is correctly assigned here before mapping
        const newChar: Character = { ...char as Character, id: crypto.randomUUID(), slotIndex: nextSlot, userId: userId };
        charactersToInsert.push(mapCharacterToDb(newChar, userId));
        nextSlot++;
    }

    if (charactersToInsert.length === 0) return [];

    const { data, error } = await db
        .from('characters')
        .insert(charactersToInsert)
        .select();

    if (error) {
        logger.error("Error saving default characters", { error: error instanceof Error ? error.message : "Unknown error" });
        throw new Error("Failed to save default characters.");
    }
    return data.map(mapDbCharacterToCharacter);
}

// --- Temporary Party Setup Management (Requires 'temporary_party_setups' table) ---

/**
 * Saves the temporary party configuration to the database, overwriting any existing setup for the user.
 * NOTE: This requires a 'temporary_party_setups' table with columns: user_id (text, primary key), party_slots (jsonb).
 */
export async function saveTemporaryPartySetup(userId: string, partySlots: PlayerSlot[]): Promise<void> {
  const dataToUpsert = [{ user_id: userId, party_slots: partySlots }];
  logger.debug("[DB SERVICE] Attempting to save temporary party setup for user:", { userId, data: JSON.stringify(dataToUpsert) });
  
  const { error } = await db
    .from('temporary_party_setups')
    // Use user_id (snake_case) to match the database schema
    .upsert(dataToUpsert, { onConflict: 'user_id' });

  if (error) {
    logger.error("[DB SERVICE] Error saving temporary party setup", { error: error instanceof Error ? error.message : "Unknown error" });
    throw new Error("Failed to save temporary party setup.");
  }
  logger.debug("[DB SERVICE] Temporary party setup saved successfully.");
}

/**
 * Clears (deletes) the temporary party configuration for a user.
 */
export async function clearTemporaryPartySetup(userId: string): Promise<void> {
  const { error: deleteError } = await db
    .from('temporary_party_setups')
    .delete()
    .eq('user_id', userId);

  if (deleteError) {
    logger.warn("[DB SERVICE] Warning: Failed to clear temporary party setup for user:", { userId, error: deleteError instanceof Error ? deleteError.message : "Unknown error" });
    throw new Error("Failed to clear temporary party setup.");
  } else {
    logger.debug("[DB SERVICE] Temporary party setup cleared successfully.");
  }
}



/**
 * Retrieves the temporary party configuration.
 */
export async function getTemporaryPartySetup(userId: string): Promise<PlayerSlot[] | null> {
  // 1. Retrieve the data
  const { data, error: fetchError } = await db
    .from('temporary_party_setups')
    .select('party_slots')
    // Query using user_id (snake_case)
    .eq('user_id', userId)
    .single();

  if (fetchError && fetchError.code !== 'PGRST116') {
    logger.error("[DB SERVICE] Error fetching temporary party setup", { error: fetchError instanceof Error ? fetchError.message : "Unknown error" });
    throw new Error("Failed to fetch temporary party setup.");
  }

  if (!data) {
    logger.debug("[DB SERVICE] No temporary party setup found for user:", { userId });
    return null;
  }
  
  logger.debug("[DB SERVICE] Successfully retrieved temporary party setup.");

  // 3. Return the retrieved slots
  // Supabase returns JSONB columns as objects/arrays directly
  return data.party_slots as PlayerSlot[];
}

/**
 * Retrieves the temporary party configuration for a user and then immediately clears it.
 * This is useful for "consume once" temporary data patterns.
 */
export async function getAndClearTemporaryPartySetup(userId: string): Promise<PlayerSlot[] | null> {
  logger.debug("[DB SERVICE] Attempting to get and clear temporary party setup for user:", { userId });
  const partySlots = await getTemporaryPartySetup(userId);
  if (partySlots) {
    await clearTemporaryPartySetup(userId);
    logger.debug("[DB SERVICE] Successfully got and cleared temporary party setup.");
  } else {
    logger.debug("[DB SERVICE] No temporary party setup found to get and clear.");
  }
  return partySlots;
}
