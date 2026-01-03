import { db } from "~/services/db.server";
import type { DBRoom, RoomParticipant } from "~/types"; // Import DBRoom from ~/types
import { logger } from "~/utils/logger";
import { ACTIVE_THRESHOLD_MS, INACTIVITY_DELETION_MS } from "~/services/roomCore.server"; // Import constants from roomCore.server

/**
 * Calculates inactivity and removes inactive participants from a room.
 */
export async function calculateInactivityCleanup(room: DBRoom, activeUserId?: string): Promise<{ updatedRoom: DBRoom, needsDBUpdate: boolean }> {
  logger.debug(`[roomCleanup.server] calculateInactivityCleanup for room ${room.code}`);
  
  const now = new Date();
  const nowISO = now.toISOString();
  const activeThreshold = now.getTime() - ACTIVE_THRESHOLD_MS;

  const originalParticipants = room.participants || [];
  const updatedSetupSlots: any[] = [...room.setup_slots];
  const newParticipants: RoomParticipant[] = [];
  const charactersToCleanup: string[] = [];
  let needsDBUpdate = false;
  let participantFound = false;

  // 1. Check all participants for inactivity and update the active user
  for (const p of originalParticipants) {
    const lastActiveTime = new Date(p.lastActive).getTime();
    const isInactive = lastActiveTime < activeThreshold;
    
    if (activeUserId && p.userId === activeUserId) {
      // Update current pinger
      if (p.lastActive !== nowISO) {
        p.lastActive = nowISO;
        needsDBUpdate = true;
      }
      participantFound = true;
      newParticipants.push(p);
    } else {
      // Check other participants for inactivity
      if (isInactive) {
        // Inactive, mark character for cleanup
        logger.debug(`[CLEANUP] Removing inactive participant ${p.userId} (Character: ${p.characterId}) from room ${room.code}.`);
        charactersToCleanup.push(p.characterId);
        needsDBUpdate = true;
      } else {
        // Active, keep
        newParticipants.push(p);
      }
    }
  }
  
  // If an activeUserId was provided but not found, we can't proceed with the update based on this ping.
  if (activeUserId && !participantFound) {
    // Return original room, no DB update needed based on this ping
    return { updatedRoom: room, needsDBUpdate: false };
  }

  // 2. Cleanup setup_slots for removed characters (only when participants are actually removed)
  if (charactersToCleanup.length > 0) {
    logger.debug(`[SLOT CLEANUP] Room ${room.code}: Characters to remove: ${charactersToCleanup.join(', ')}`);
    logger.debug(`[SLOT CLEANUP] Room ${room.code}: Initial slots types: ${JSON.stringify(room.setup_slots.map(s => s.type))}`);
    
    updatedSetupSlots.forEach((slot, index) => {
      if (slot.characterId && charactersToCleanup.includes(slot.characterId)) {
        logger.debug(`[SLOT CLEANUP] Room ${room.code}: Resetting slot ${index} (Char ID: ${slot.characterId.substring(0, 8)}) from ${slot.type} to None.`);
        updatedSetupSlots[index] = {
          type: 'None',
          characterId: null,
          isReady: false,
        };
        needsDBUpdate = true;
      }
    });
  } else {
    // No characters to cleanup, but we still need to ensure slots match current participants
    // Only reset slots if there's a real mismatch between participants and slots
    const currentCharacterIds = new Set(newParticipants.map(p => p.characterId));
    
    logger.debug(`[SLOT CLEANUP] Room ${room.code}: Checking for orphaned slots. Current participants: ${JSON.stringify(newParticipants.map(p => ({ userId: p.userId, characterId: p.characterId })))}`);
    logger.debug(`[SLOT CLEANUP] Room ${room.code}: Current slots before orphaned check: ${JSON.stringify(updatedSetupSlots.map(s => ({ type: s.type, characterId: s.characterId?.substring(0, 8) })))}`);
    
    // ROBUST CHARACTER PERSISTENCE LOGIC:
    // Only reset slots under very specific conditions to ensure character persistence
    let hasOrphanedSlots = false;
    updatedSetupSlots.forEach((slot, index) => {
      if (slot.characterId && !currentCharacterIds.has(slot.characterId)) {
        // CRITICAL CHECK 1: Is the room completely empty?
        const roomIsEmpty = newParticipants.length === 0;
        
        // CRITICAL CHECK 2: Is the host active?
        const hostIsActive = newParticipants.some(p => p.userId === room.host_id);

        // CRITICAL CHECK 3: Does the character belong to any current participant?
        // Enhanced check: Look for the character ID in the current participants list
        const characterBelongsToCurrentUser = newParticipants.some(p => p.characterId === slot.characterId);
        
        // CRITICAL CHECK 4: Is this a legitimate orphaned character?
        // Only consider truly abandoned characters for cleanup
        const isLegitimatelyOrphaned = !characterBelongsToCurrentUser && 
                                     roomIsEmpty === false && 
                                     hostIsActive === false;

        // DECISION LOGIC:
        // 1. If room is empty -> reset all slots (legitimate cleanup)
        if (roomIsEmpty) {
          if (slot.type !== 'None') {
            logger.debug(`[SLOT CLEANUP] Room ${room.code}: Resetting slot ${index} (Char ID: ${slot.characterId.substring(0, 8)}) from ${slot.type} to None because room is empty.`);
            updatedSetupSlots[index] = {
              type: 'None',
              characterId: null,
              isReady: false,
            };
            hasOrphanedSlots = true;
            needsDBUpdate = true;
          }
        }
        // 2. If host is active -> preserve AI slots (host control)
        else if (slot.type === 'AI' && hostIsActive) {
          logger.debug(`[SLOT CLEANUP] Room ${room.code}: Preserving AI slot ${index} (Char ID: ${slot.characterId.substring(0, 8)}) because host is active.`);
        }
        // 3. If character belongs to current user -> preserve slot (user ownership)
        else if (characterBelongsToCurrentUser) {
          logger.debug(`[SLOT CLEANUP] Room ${room.code}: Preserving slot ${index} (Char ID: ${slot.characterId.substring(0, 8)}) because character belongs to current user.`);
        }
        // 4. If character is legitimately orphaned -> reset slot (genuine cleanup)
        else if (isLegitimatelyOrphaned) {
          if (slot.type !== 'None') {
            logger.debug(`[SLOT CLEANUP] Room ${room.code}: Resetting orphaned slot ${index} (Char ID: ${slot.characterId.substring(0, 8)}) from ${slot.type} to None.`);
            updatedSetupSlots[index] = {
              type: 'None',
              characterId: null,
              isReady: false,
            };
            hasOrphanedSlots = true;
            needsDBUpdate = true;
          }
        }
        // 5. Default: Preserve slot (conservative approach)
        else {
          logger.debug(`[SLOT CLEANUP] Room ${room.code}: Preserving slot ${index} (Char ID: ${slot.characterId.substring(0, 8)}) due to conservative cleanup policy.`);
        }
      }
    });
    
    // If no orphaned slots found, don't force a DB update just for this check
    if (!hasOrphanedSlots) {
      logger.debug(`[SLOT CLEANUP] Room ${room.code}: No orphaned slots found, preserving existing slot data.`);
    }
  }
  
  // 2.5. CRITICAL FIX: If no participants remain, reset all Human/AI slots to 'None'.
  // This handles rooms where the last participant left/timed out, but the slot data remained stale.
  if (newParticipants.length === 0) {
    updatedSetupSlots.forEach((slot, index) => {
      if (slot.type === 'Human' || slot.type === 'AI') {
        logger.debug(`[CRITICAL CLEANUP] Room ${room.code}: Resetting slot ${index} from ${slot.type} to None because participant list is empty.`);
        updatedSetupSlots[index] = {
          type: 'None',
          characterId: null,
          isReady: false,
        };
        needsDBUpdate = true;
      }
    });
  }

  // 3. Calculate the new active slots count (moved before usage)
  const newActiveSlotsCount = updatedSetupSlots.filter(s => s.type === 'Human' || s.type === 'AI').length;

  // 3.5. Log slot changes if there are actual changes (moved after calculation)
  if (needsDBUpdate) {
    // Only log slot changes when there are actual changes, not just for active_slots count updates
    logger.debug(`[SLOT CLEANUP] Room ${room.code}: Final slots types: ${JSON.stringify(updatedSetupSlots.map(s => s.type))}`);
    logger.debug(`[SLOT CLEANUP] Room ${room.code}: Final active slots count: ${newActiveSlotsCount}`);
  }

  // 4. Check if active_slots count is stale
  if (room.active_slots !== newActiveSlotsCount) {
    logger.debug(`[CLEANUP DEBUG] Room ${room.code}: Active slots count changed from ${room.active_slots} to ${newActiveSlotsCount}. DB update required.`);
    needsDBUpdate = true;
  }

  const updatedRoomData: DBRoom = {
    ...room,
    participants: newParticipants,
    setup_slots: updatedSetupSlots,
    active_slots: newActiveSlotsCount,
    updated_at: needsDBUpdate ? nowISO : room.updated_at, // Use needsDBUpdate
  };
  
  if (needsDBUpdate) {
    logger.debug(`[SLOT CLEANUP] Room ${room.code}: Final slots types: ${JSON.stringify(updatedSetupSlots.map(s => s.type))}`);
    logger.debug(`[SLOT CLEANUP] Room ${room.code}: Final active slots count: ${newActiveSlotsCount}`);
  }

  return { updatedRoom: updatedRoomData, needsDBUpdate }; // FIX: Returns the defined variable
}

/**
 * Persists room updates to the database.
 */
export async function persistRoomUpdate(roomCode: string, updates: Partial<DBRoom>): Promise<DBRoom | null> {
  logger.debug(`[roomCleanup.server] persistRoomUpdate for room ${roomCode}`);
  
  const nowISO = new Date().toISOString();
  
  // Ensure updated_at is set if we are persisting changes
  const updatePayload = {
    ...updates,
    updated_at: nowISO,
  };

  const { data, error: updateError } = await db
    .from('rooms')
    .update(updatePayload)
    .eq('code', roomCode)
    .select(`id, name, code, owner_id, user_id, status, created_at, updated_at, participants, setup_slots, active_slots, scenarios, dice_rolling_state`)
    .single();

  if (updateError) {
    logger.error(`[roomCleanup.server] Error persisting room update:`, { roomCode, updateError });
    return null;
  }
  
  return data as DBRoom;
}

/**
 * Checks a room for inactivity and deletes it if necessary.
 */
export async function checkAndCleanupRoom(room: DBRoom): Promise<void> {
  logger.debug(`[roomCleanup.server] checkAndCleanupRoom for room ${room.code}`);
  
  const now = new Date();
  const fiveMinutesAgo = now.getTime() - INACTIVITY_DELETION_MS; // Use constant

  // Check if active_slots is 0 or null
  const isActive = (room.active_slots || 0) > 0;

  if (!isActive) {
    // Check if the room has been inactive for more than 5 minutes
    const lastUpdateTime = new Date(room.updated_at).getTime();
    const isExpired = lastUpdateTime < fiveMinutesAgo;

    if (isExpired) {
      logger.debug(`[CLEANUP] Deleting inactive room ${room.code} (0 participants, no updates for over 5 minutes).`);
      // Delete the room
      const { error } = await db.from('rooms').delete().eq('code', room.code);
      if (error) {
        logger.error(`[roomCleanup.server] Error deleting room:`, { roomCode: room.code, error });
      }
    }
  }
}

/**
 * Performs batch cleanup for a list of rooms before returning them.
 */
export async function cleanupRoomsBeforeFetch(rooms: DBRoom[]): Promise<DBRoom[]> {
  logger.debug(`[roomCleanup.server] cleanupRoomsBeforeFetch for ${rooms.length} rooms`);
  
  const cleanedRooms: DBRoom[] = [];
  
  for (const room of rooms) {
    // Apply inactivity cleanup
    const { updatedRoom, needsDBUpdate } = await calculateInactivityCleanup(room);
    
    // Persist changes if needed
    if (needsDBUpdate) {
      const updatedRoomFromDB = await persistRoomUpdate(room.code, updatedRoom);
      if (updatedRoomFromDB) {
        cleanedRooms.push(updatedRoomFromDB);
      }
    } else {
      cleanedRooms.push(updatedRoom);
    }
    
    // Check for room deletion
    await checkAndCleanupRoom(room);
  }
  
  return cleanedRooms;
}