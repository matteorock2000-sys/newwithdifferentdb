import { db } from "~/services/db.server";
import type { PlayerSlot, DBRoom } from "~/types";
import { getRoomByCode } from "~/services/roomCore.server";
import { logger } from "~/utils/logger";

/**
 * Updates readiness status for a specific slot.
 * @param roomCode - The code of the room.
 * @param slotIndex - The index of the slot to update.
 * @param isReady - The new readiness status.
 * @returns A promise that resolves when the update is complete.
 */
export async function updateSlotReadiness(roomCode: string, slotIndex: number, isReady: boolean): Promise<boolean> {
    logger.debug(`[roomSlots.server] updateSlotReadiness: room ${roomCode}, slot ${slotIndex}, ready ${isReady}`);
    
    const room = await getRoomByCode(roomCode);
    if (!room) {
        logger.warn(`[roomSlots.server] Room not found: ${roomCode}`);
        throw new Error(`Room ${roomCode} not found. It may have been deleted or expired.`);
    }
    
    if (slotIndex < 0 || slotIndex >= room.setup_slots.length) {
        throw new Error(`Invalid slot index ${slotIndex}. Valid range: 0-${room.setup_slots.length - 1}`);
    }
    
    const updatedSlots = [...room.setup_slots];
    updatedSlots[slotIndex] = {
        ...updatedSlots[slotIndex],
        isReady
    };
    
    const { data, error } = await db.from("rooms").update({
        setup_slots: updatedSlots,
        updated_at: new Date().toISOString()
    }).eq("code", roomCode).select().single();
    
    if (error) {
        logger.error(`[roomSlots.server] Error updating slot readiness:`, { roomCode, slotIndex, isReady, error });
        throw new Error(`Failed to update slot readiness: ${error.message}`);
    }
    
    return true;
}

/**
 * Updates all player slots in a room.
 * @param roomCode - The code of the room.
 * @param updatedSlots - An array of updated PlayerSlot objects.
 * @returns A promise that resolves when the update is complete.
 */
export async function updateRoomSlots(roomCode: string, updatedSlots: PlayerSlot[]): Promise<void> {
    logger.debug(`[roomSlots.server] updateRoomSlots: room ${roomCode}`);
    
    const { error } = await db.from("rooms").update({
        setup_slots: updatedSlots,
        updated_at: new Date().toISOString()
    }).eq("code", roomCode);
    
    if (error) {
        logger.error(`[roomSlots.server] Error updating room slots:`, { roomCode, error });
        throw new Error("Failed to update room slots");
    }
}

/**
 * Updates specific data for a single slot in a room.
 * @param roomCode - The code of the room.
 * @param slotIndex - The index of the slot to update.
 * @param newSlotData - The new data for the slot.
 * @returns A promise that resolves when the update is complete.
 */
export async function updateSpecificSlot(roomCode: string, slotIndex: number, newSlotData: Partial<PlayerSlot>): Promise<DBRoom | null> {
    logger.debug(`[roomSlots.server] updateSpecificSlot: room ${roomCode}, slot ${slotIndex}`);
    
    const room = await getRoomByCode(roomCode);
    if (!room) {
        logger.warn(`[roomSlots.server] Room not found: ${roomCode}`);
        throw new Error(`Room ${roomCode} not found. It may have been deleted or expired.`);
    }
    
    if (slotIndex < 0 || slotIndex >= room.setup_slots.length) {
        throw new Error(`Invalid slot index ${slotIndex}. Valid range: 0-${room.setup_slots.length - 1}`);
    }
    
    const updatedSlots = [...room.setup_slots];
    updatedSlots[slotIndex] = {
        ...updatedSlots[slotIndex],
        ...newSlotData
    };
    
    const { data, error } = await db.from("rooms").update({
        setup_slots: updatedSlots,
        updated_at: new Date().toISOString()
    }).eq("code", roomCode).select().single();
    
    if (error) {
        logger.error(`[roomSlots.server] Error updating specific slot:`, { roomCode, slotIndex, newSlotData, error });
        throw new Error(`Failed to update slot: ${error.message}. Please try again.`);
    }
    
    return data as DBRoom;
}

/**
 * Synchronizes user's slots in a room.
 * @param roomCode - The code of the room.
 * @param userId - The ID of the user.
 * @param userSlots - The slots belonging to the user, indexed by slot index.
 * @returns A promise that resolves when the synchronization is complete.
 */
export async function synchronizeUserSlots(roomCode: string, userId: string, userSlots: PlayerSlot[]): Promise<void> {
    logger.debug(`[roomSlots.server] synchronizeUserSlots: room ${roomCode}, user ${userId}`);
    
    const room = await getRoomByCode(roomCode);
    if (!room) {
        logger.warn(`[roomSlots.server] Room not found: ${roomCode}`);
        throw new Error("Room not found");
    }
    
    const updatedSlots = room.setup_slots.map((slot, slotIndex) => {
        if (slot.userId === userId) {
            // Match by slot index instead of userId to handle multi-slot users
            const userSlot = userSlots[slotIndex];
            
            if (userSlot) {
                // Verify the userSlot has the correct userId before applying
                if (userSlot.userId === userId) {
                    return { ...slot, ...userSlot };
                } else {
                    logger.warn(`[roomSlots.server] Mismatched userId in userSlots[${slotIndex}]: expected ${userId}, got ${userSlot.userId}`);
                    return slot;
                }
            } else {
                logger.warn(`[roomSlots.server] No matching userSlot found for slotIndex ${slotIndex}`);
                return slot;
            }
        }
        return slot;
    });
    
    const { error } = await db.from("rooms").update({
        setup_slots: updatedSlots,
        updated_at: new Date().toISOString()
    }).eq("code", roomCode);
    
    if (error) {
        logger.error(`[roomSlots.server] Error synchronizing user slots:`, { roomCode, userId, error });
        throw new Error("Failed to synchronize user slots");
    }
}
