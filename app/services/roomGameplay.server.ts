import { db } from "~/services/db.server";
import { getRoomByCode } from "~/services/roomCore.server";
import { logger } from "~/utils/logger";

/**
 * Validates if the given coordinates are within the acceptable range (0 to 1).
 * @param x - The x-coordinate.
 * @param y - The y-coordinate.
 * @returns True if coordinates are valid, false otherwise.
 */
function validateCoordinates(x: number, y: number): boolean {
  return x >= 0 && x <= 1 && y >= 0 && y <= 1;
}

/**
 * Updates the coordinates of a character within a room.
 * @param roomCode - The code of the room.
 * @param characterId - The ID of the character to move.
 * @param x - The new x-coordinate (0-1).
 * @param y - The new y-coordinate (0-1).
 * @returns A promise that resolves when the coordinates are updated.
 */
export async function updateCharacterCoordinates(roomCode: string, characterId: string, x: number, y: number): Promise<boolean> {
    logger.debug(`[roomGameplay.server] updateCharacterCoordinates: room ${roomCode}, char ${characterId}, coords (${x},${y})`);
    
    if (!validateCoordinates(x, y)) {
        logger.warn(`[roomGameplay.server] Invalid coordinates for character ${characterId} in room ${roomCode}: (${x},${y})`);
        return false;
    }
    
    try {
        const room = await getRoomByCode(roomCode);
        if (!room) {
            logger.warn(`[roomGameplay.server] Room not found: ${roomCode}`);
            return false;
        }
        
        // Check if room is in active game status
        if (room.status !== 'active' && room.status !== 'active_game') {
            logger.warn(`[roomGameplay.server] Movement not allowed in room ${roomCode} with status ${room.status}`);
            return false;
        }
        
        const updatedSlots = room.setup_slots.map((slot) => {
            if (slot && slot.characterId === characterId) {
                return {
                    ...slot,
                    x,
                    y
                };
            }
            return slot;
        });
        
        const { error } = await db.from("rooms").update({
            setup_slots: updatedSlots,
            updated_at: new Date().toISOString()
        }).eq("code", roomCode);
        
        if (error) {
            logger.error(`[roomGameplay.server] Error updating character coordinates:`, { roomCode, characterId, error });
            return false;
        }
        
        return true;
    } catch (error) {
        logger.error(`[roomGameplay.server] Exception updating character coordinates:`, { roomCode, characterId, error });
        return false;
    }
}