import { db } from "~/services/db.server";
import type { AdventureScenario, ScenarioForDisplay } from "~/types";
import { getRoomByCode } from "~/services/roomCore.server";
import { logger } from "~/utils/logger";

// Scenario Suggestions (Chat-based)

/**
 * Inserts a new scenario suggestion for a room.
 * @param roomCode - The code of the room.
 * @param userId - The ID of the user suggesting.
 * @param username - The username of the suggester.
 * @param suggestion - The suggestion message.
 * @returns A promise that resolves when the suggestion is inserted.
 */
export async function insertScenarioSuggestion(roomCode: string, userId: string, username: string, suggestion: string): Promise<boolean> {
  try {
    const { error } = await db.from("room_chat").insert({
      code: roomCode,
      user_id: userId,
      username: username,
      message: suggestion,
      message_type: 'scenario_suggestion',
      created_at: new Date().toISOString(),
    });

    if (error) {
      logger.error("[roomScenarios.server] Error inserting scenario suggestion:", {
        roomCode,
        userId,
        error,
      });
      return false;
    }

    return true;
  } catch (error) {
    logger.error("[roomScenarios.server] Exception inserting scenario suggestion:", {
      roomCode,
      userId,
      error,
    });
    return false;
  }
}

/**
 * Retrieves scenario suggestions for a room.
 * @param roomCode - The code of the room.
 * @returns A promise that resolves with an array of scenario suggestions.
 */
export async function getScenarioSuggestions(roomCode: string): Promise<any[]> {
  logger.debug(`[roomScenarios.server] getScenarioSuggestions: room ${roomCode}`);

  try {
    const { data, error } = await db
      .from("room_chat")
      .select(`
            id,
            code,
            user_id,
            username,
            message,
            created_at
        `)
      .eq("code", roomCode)
      .eq("message_type", 'scenario_suggestion')
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("[roomScenarios.server] Error fetching scenario suggestions:", {
        roomCode,
        error,
      });
      return [];
    }

    return data || [];
  } catch (error) {
    logger.error("[roomScenarios.server] Exception fetching scenario suggestions:", {
      roomCode,
      error,
    });
    return [];
  }
}

// Scenario Storage & Retrieval

/**
 * Stores an array of scenarios for a room.
 * @param roomCode - The code of the room.
 * @param scenarios - An array of AdventureScenario objects to store.
 * @returns A promise that resolves when the scenarios are stored.
 */
export async function storeRoomScenarios(roomCode: string, scenarios: AdventureScenario[]): Promise<boolean> {
  logger.debug(
    `[roomScenarios.server] storeRoomScenarios: room ${roomCode}, count ${scenarios.length}`
  );

  try {
    const { data, error } = await db
      .from("rooms")
      .update({
        scenarios: scenarios,
        updated_at: new Date().toISOString(),
      })
      .eq("code", roomCode)
      .select();

    if (error) {
      logger.error("[roomScenarios.server] Error storing room scenarios:", {
        roomCode,
        error,
      });
      return false;
    }

    if (!data || data.length === 0) {
        logger.warn("[roomScenarios.server] No room found to store scenarios for.", { roomCode });
        return false;
    }

    return true;
  } catch (error) {
    logger.error("[roomScenarios.server] Exception storing room scenarios:", {
      roomCode,
      error,
    });
    return false;
  }
}

/**
 * Retrieves scenarios for a room.
 * @param roomCode - The code of the room.
 * @returns A promise that resolves with an array of stored scenarios.
 */
export async function getRoomScenarios(roomCode: string): Promise<AdventureScenario[]> {
  logger.debug(`[roomScenarios.server] getRoomScenarios: room ${roomCode}`);

  try {
    const { data, error } = await db
      .from("rooms")
      .select("scenarios")
      .eq("code", roomCode)
      .single();

    if (error) {
      logger.error("[roomScenarios.server] Error fetching room scenarios:", {
        roomCode,
        error,
      });
      throw new Error("Failed to fetch room scenarios");
    }

    return data?.scenarios || [];
  } catch (error) {
    logger.error("[roomScenarios.server] Exception fetching room scenarios:", {
      roomCode,
      error,
    });
    throw error;
  }
}

/**
 * Clears all stored scenarios for a room.
 * @param roomCode - The code of the room.
 * @returns A promise that resolves when the scenarios are cleared.
 */
export async function clearRoomScenarios(roomCode: string): Promise<void> {
  logger.debug(`[roomScenarios.server] clearRoomScenarios: room ${roomCode}`);

  try {
    const { error } = await db
      .from("rooms")
      .update({
        scenarios: null,
        updated_at: new Date().toISOString(),
      })
      .eq("code", roomCode);

    if (error) {
      logger.error("[roomScenarios.server] Error clearing room scenarios:", {
        roomCode,
        error,
      });
      throw new Error("Failed to clear room scenarios");
    }
  } catch (error) {
    logger.error("[roomScenarios.server] Exception clearing room scenarios:", {
      roomCode,
      error,
    });
    throw error;
  }
}

/**
 * Retrieves scenarios for a room, specifically formatted for voting.
 * @param roomCode - The code of the room.
 * @returns A promise that resolves with an array of ScenarioForDisplay.
 */
export async function getRoomScenariosForVoting(roomCode: string): Promise<ScenarioForDisplay[]> {
  logger.debug(`[roomScenarios.server] getRoomScenariosForVoting: room ${roomCode}`);

  try {
    const { data, error } = await db
      .from("rooms")
      .select("scenarios")
      .eq("code", roomCode)
      .single();

    if (error) {
      logger.error("[roomScenarios.server] Error fetching room scenarios for voting:", {
        roomCode,
        error,
      });
      throw new Error("Failed to fetch room scenarios for voting");
    }

    const scenarios = (data?.scenarios || []) as ScenarioForDisplay[];
    logger.debug(`[roomScenarios.server] Retrieved ${scenarios.length} scenarios for room ${roomCode}`);
    return scenarios;
  } catch (error) {
    logger.error("[roomScenarios.server] Exception fetching room scenarios for voting:", {
      roomCode,
      error,
    });
    throw error;
  }
}

/**
 * Checks if a room has any stored scenarios.
 * @param roomCode - The code of the room.
 * @returns A promise that resolves to true if scenarios exist, false otherwise.
 */
export async function hasRoomScenarios(roomCode: string): Promise<boolean> {
  logger.debug(`[roomScenarios.server] hasRoomScenarios: room ${roomCode}`);

  try {
    const scenarios = await getRoomScenarios(roomCode);
    return scenarios.length > 0;
  } catch (error) {
    logger.error("[roomScenarios.server] Exception checking room scenarios:", {
      roomCode,
      error,
    });
    throw error;
  }
}

// Winner Selection

/**
 * Sets the winning scenario for a room.
 * @param roomCode - The code of the room.
 * @param scenarioId - The ID of the winning scenario.
 * @returns A promise that resolves when the winner is set.
 */
export async function setRoomScenarioWinner(roomCode: string, scenarioOrId: string | ScenarioForDisplay): Promise<void> {
  const debugPrefix = `[setRoomScenarioWinner]`;
  console.log(`${debugPrefix} START - room: ${roomCode}, scenario: ${typeof scenarioOrId === 'string' ? scenarioOrId : scenarioOrId?.id}`);
  
  logger.debug(
    `[roomScenarios.server] setRoomScenarioWinner: room ${roomCode}, winner ${typeof scenarioOrId === 'string' ? scenarioOrId : scenarioOrId?.id}`
  );

  try {
    // Resolve full scenario object. If caller provided an ID (string), try to find the full scenario
    let winnerObj: any = null;

    if (typeof scenarioOrId === 'string') {
      // Try to locate the scenario in the room's stored scenarios
      try {
        const room = await getRoomByCode(roomCode);
        if (room && room.scenarios && Array.isArray(room.scenarios)) {
          const found = room.scenarios.find((s: ScenarioForDisplay) => s.id === scenarioOrId);
          if (found) {
            winnerObj = found;
          }
        }
      } catch (e) {
        // Non-fatal; we'll fall back to storing the id if we can't fetch the room
        logger.warn('[roomScenarios.server] Could not fetch room to resolve scenario id', { roomCode, scenarioId: scenarioOrId, error: e instanceof Error ? e.message : String(e) });
      }

      // If not found, store minimal object with id so the JSONB field still contains usable info
      if (!winnerObj) {
        winnerObj = { id: scenarioOrId };
      }
    } else {
      // Caller provided full scenario object
      winnerObj = scenarioOrId;
    }

    console.log(`${debugPrefix} Executing UPDATE query (storing JSONB scenario)...`);
    const { error: updateError, count } = await db
      .from("rooms")
      .update({
        scenario_winner_id: winnerObj,
        updated_at: new Date().toISOString(),
      })
      .eq("code", roomCode);

    console.log(`${debugPrefix} Query result - error: ${updateError?.message || 'none'}, count: ${count}`);

    if (updateError) {
      console.error(`${debugPrefix} Supabase error:`, updateError);
      logger.error("[roomScenarios.server] Supabase error setting room scenario winner:", {
        roomCode,
        winnerObj,
        errorCode: updateError.code,
        errorMessage: updateError.message,
        errorDetails: updateError.details,
        errorHint: updateError.hint,
      });
      throw new Error(`Failed to set room scenario winner: ${updateError.message}`);
    }

    if (!count || count === 0) {
      console.warn(`${debugPrefix} No rows updated - room may not exist or already has winner`);
      logger.warn("[roomScenarios.server] No rows updated - room may not exist:", {
        roomCode,
        winnerObj,
        affectedRows: count,
      });
      // Don't throw here - it's possible the room was just deleted
    } else {
      console.log(`${debugPrefix} SUCCESS - Updated ${count} row(s)`);
      logger.info("[roomScenarios.server] Successfully updated scenario winner:", {
        roomCode,
        winnerObj,
        affectedRows: count,
      });
    }

    console.log(`${debugPrefix} COMPLETE`);
  } catch (error) {
    console.error(`${debugPrefix} EXCEPTION:`, error);
    logger.error("[roomScenarios.server] Exception setting room scenario winner:", {
      roomCode,
      winnerObj: typeof scenarioOrId === 'string' ? { id: scenarioOrId } : scenarioOrId,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

/**
 * Retrieves the winning scenario for a room.
 * @param roomCode - The code of the room.
 * @returns A promise that resolves with the winning scenario, or null if not set.
 */
export async function getRoomScenarioWinner(roomCode: string): Promise<ScenarioForDisplay | null> {
  logger.debug(`[roomScenarios.server] getRoomScenarioWinner: room ${roomCode}`);

  try {
    const { data, error } = await db
      .from("rooms")
      .select(`
            scenarios,
            scenario_winner_id
        `)
      .eq("code", roomCode)
      .single();

    if (error) {
      logger.error("[roomScenarios.server] Error fetching room scenario winner:", {
        roomCode,
        error,
      });
      return null;
    }

    if (!data?.scenario_winner_id || !data?.scenarios) {
      return null;
    }

    const winnerRef = data.scenario_winner_id;
    const winnerId = typeof winnerRef === 'string' ? winnerRef : winnerRef?.id;

    if (!winnerId) return null;

    const winner = data.scenarios.find(
      (scenario: ScenarioForDisplay) => scenario.id === winnerId
    );
    return winner || null;
  } catch (error) {
    logger.error("[roomScenarios.server] Exception fetching room scenario winner:", {
      roomCode,
      error,
    });
    return null;
  }
}
