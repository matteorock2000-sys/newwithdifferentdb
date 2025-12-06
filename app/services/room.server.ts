import { json, redirect } from "@remix-run/node";
import { db, getUserById } from "~/services/db.server";
import type { Room, PlayerSlot, ScenarioForDisplay, DiceRollingState } from "~/types";
import { generateUniqueCode } from "~/utils/dice"; // Assuming this utility exists for code generation
import { requireUser } from "~/services/auth.server"; // Import required for action context if needed elsewhere

// Define the structure for a participant within the room's participants JSONB array
interface RoomParticipant {
    userId: string;
    characterId: string;
    lastActive: string; // ISO timestamp
}

// Define a type for the DB Room structure including setup_slots
export interface DBRoom {
    id: string;
    name: string;
    code: string;
    owner_id: string;
    user_id: string;
    host_id: string; // ADDED: Host ID field
    status: string;
    created_at: string;
    updated_at: string;
    participants: RoomParticipant[]; // Now typed
    setup_slots: PlayerSlot[]; // Crucial field for persistence
    active_slots: number | null; // ADDED: New column for cleanup verification
}

// Define the threshold for considering a participant active (e.g., last 7 seconds)
const ACTIVE_THRESHOLD_MS = 7 * 1000; // 7 seconds (Quick cleanup after one missed 5s ping)
const INACTIVITY_DELETION_MS = 5 * 60 * 1000; // 5 minutes in milliseconds

// --- MOCK/ASSUMED UTILITIES/FUNCTIONS ---
// Helper to generate a unique 6-character code (assuming this is in ~/utils/dice)
async function generateUniqueCode(): Promise<string> {
    // Placeholder: In a real app, this would loop until a unique code is found in the DB.
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // In a real implementation, you MUST check if this code exists in the DB.
    return result;
}

// --- OPTIMISTIC LOCKING UTILITY ---
/**
 * Performs operations with optimistic locking using version checks
 */
async function withOptimisticLock<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let attempts = 0;
  while (attempts < maxRetries) {
    try {
      return await operation();
    } catch (error) {
      attempts++;
      if (attempts >= maxRetries) {
        throw error;
      }
      // Wait before retrying with exponential backoff
      await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempts)));
    }
  }
  throw new Error('Operation failed after maximum retries');
}

// --- NEW CORE CLEANUP UTILITY ---

/**
 * Performs 7s participant inactivity cleanup, updates setup_slots, and calculates new active_slots count.
 * Does NOT update the DB itself.
 * @param room The current room state.
 * @param activeUserId Optional ID of the user currently pinging (to ensure they are marked active).
 * @returns An object containing the updated room state and a flag indicating if a DB update is required.
 */
function calculateInactivityCleanup(room: DBRoom, activeUserId?: string): { updatedRoom: DBRoom, needsDBUpdate: boolean } {
    const now = new Date();
    const nowISO = now.toISOString();
    const activeThreshold = now.getTime() - ACTIVE_THRESHOLD_MS;

    const originalParticipants = room.participants || [];
    const updatedSetupSlots: PlayerSlot[] = [...room.setup_slots];
    const newParticipants: RoomParticipant[] = [];
    const charactersToCleanup: string[] = [];
    let needsDBUpdate = false;
    let participantFound = false;

    // 1. Check all participants for inactivity and update the active user
    for (const p of originalParticipants) {
        const lastActiveTime = new Date(p.lastActive).getTime();
        const isInactive = lastActiveTime < activeThreshold;
        
        // --- START DEBUG LOGGING ---
        // --- END DEBUG LOGGING ---

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
                console.log(`[CLEANUP] Removing inactive participant ${p.userId} (Character: ${p.characterId}) from room ${room.code}.`);
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
        console.log(`[SLOT CLEANUP] Room ${room.code}: Characters to remove: ${charactersToCleanup.join(', ')}`);
        console.log(`[SLOT CLEANUP] Room ${room.code}: Initial slots types: ${JSON.stringify(room.setup_slots.map(s => s.type))}`);
        
        updatedSetupSlots.forEach((slot, index) => {
            if (slot.characterId && charactersToCleanup.includes(slot.characterId)) {
                console.log(`[SLOT CLEANUP] Room ${room.code}: Resetting slot ${index} (Char ID: ${slot.characterId.substring(0, 8)}) from ${slot.type} to None.`);
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
        
        console.log(`[SLOT CLEANUP] Room ${room.code}: Checking for orphaned slots. Current participants: ${JSON.stringify(newParticipants.map(p => ({ userId: p.userId, characterId: p.characterId })))}`);
        console.log(`[SLOT CLEANUP] Room ${room.code}: Current slots before orphaned check: ${JSON.stringify(updatedSetupSlots.map(s => ({ type: s.type, characterId: s.characterId?.substring(0, 8) })))}`);
        
        // Only reset slots if there's a real mismatch (slots have characters not in participants)
        let hasOrphanedSlots = false;
        updatedSetupSlots.forEach((slot, index) => {
            if (slot.characterId && !currentCharacterIds.has(slot.characterId)) {
                // Additional check: only reset if the slot is not already 'None'
                if (slot.type !== 'None') {
                    console.log(`[SLOT CLEANUP] Room ${room.code}: Resetting orphaned slot ${index} (Char ID: ${slot.characterId.substring(0, 8)}) from ${slot.type} to None.`);
                    updatedSetupSlots[index] = {
                        type: 'None',
                        characterId: null,
                        isReady: false,
                    };
                    hasOrphanedSlots = true;
                    needsDBUpdate = true;
                }
            }
        });
        
        // If no orphaned slots found, don't force a DB update just for this check
        if (!hasOrphanedSlots) {
            console.log(`[SLOT CLEANUP] Room ${room.code}: No orphaned slots found, preserving existing slot data.`);
        }
    }
    
    // 2.5. CRITICAL FIX: If no participants remain, reset all Human/AI slots to 'None'.
    // This handles rooms where the last participant left/timed out, but the slot data remained stale.
    if (newParticipants.length === 0) {
        updatedSetupSlots.forEach((slot, index) => {
            if (slot.type === 'Human' || slot.type === 'AI') {
                console.log(`[CRITICAL CLEANUP] Room ${room.code}: Resetting slot ${index} from ${slot.type} to None because participant list is empty.`);
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
        console.log(`[SLOT CLEANUP] Room ${room.code}: Final slots types: ${JSON.stringify(updatedSetupSlots.map(s => s.type))}`);
        console.log(`[SLOT CLEANUP] Room ${room.code}: Final active slots count: ${newActiveSlotsCount}`);
    }

    // 4. Check if active_slots count is stale
    if (room.active_slots !== newActiveSlotsCount) {
        console.log(`[CLEANUP DEBUG] Room ${room.code}: Active slots count changed from ${room.active_slots} to ${newActiveSlotsCount}. DB update required.`);
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
        console.log(`[SLOT CLEANUP] Room ${room.code}: Final slots types: ${JSON.stringify(updatedSetupSlots.map(s => s.type))}`);
        console.log(`[SLOT CLEANUP] Room ${room.code}: Final active slots count: ${newActiveSlotsCount}`);
    }

    return { updatedRoom: updatedRoomData, needsDBUpdate }; // FIX: Returns the defined variable
}

/**
 * Helper to persist calculated room updates to the database.
 */
async function persistRoomUpdate(roomCode: string, updates: Partial<DBRoom>): Promise<DBRoom | null> {
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
        .select(`id, name, code, owner_id, user_id, status, created_at, updated_at, participants, setup_slots, active_slots`)
        .single();

    if (updateError) {
        console.error("Error persisting room update:", updateError);
        return null;
    }
    return data as DBRoom;
}

// --- END NEW CORE UTILITY ---


/**
 * Deletes a room if the provided userId is the owner.
 */
export async function deleteRoom(roomCode: string, userId: string): Promise<void> {
    const { error } = await db
        .from('rooms')
        .delete()
        .eq('code', roomCode)
        .eq('owner_id', userId); // Only owner can delete

    if (error) {
        console.error("Error deleting room:", error);
        throw new Error(`Failed to delete room: ${error.message}`);
    }
    console.log(`Room ${roomCode} deleted by owner ${userId}.`);
}

/**
 * Checks if a room is inactive (0 active slots for 5 minutes based on last update time) and deletes it.
 * Returns true if the room was deleted.
 */
async function checkAndCleanupRoom(room: DBRoom): Promise<boolean> {
    const now = new Date();
    const fiveMinutesAgo = now.getTime() - INACTIVITY_DELETION_MS; // Use constant

    // Check if active_slots is 0 or null
    const isActive = (room.active_slots || 0) > 0;

    if (!isActive) {
        
        const lastUpdateTime = new Date(room.updated_at || room.created_at).getTime();
        
        // Enhanced logging for diagnosis
        console.log(`[CLEANUP CHECK] Room ${room.code} (ID: ${room.id}) has 0 active slots.`);
        console.log(`[CLEANUP CHECK] Last Update Time: ${new Date(lastUpdateTime).toISOString()}`);
        console.log(`[CLEANUP CHECK] 5 Minutes Ago Threshold: ${new Date(fiveMinutesAgo).toISOString()}`);
        console.log(`[CLEANUP CHECK] Should Delete: ${lastUpdateTime < fiveMinutesAgo}`);

        if (lastUpdateTime < fiveMinutesAgo) {
            console.log(`[CLEANUP] Deleting room ${room.code} (ID: ${room.id}) due to 0 active slots for > 5 minutes.`);
            const { error } = await db.from('rooms').delete().eq('id', room.id);
            if (error) {
                console.error(`[CLEANUP] Failed to delete room ${room.code}:`, error);
            }
            return true;
        }
    }
    return false;
}

/**
 * Runs cleanup on all active rooms before returning them.
 * 1. Performs 7s participant inactivity cleanup (updates DB if needed).
 * 2. Performs 5m room deletion check if active_slots is 0 (updates DB/deletes room if needed).
 */
async function cleanupRoomsBeforeFetch(rooms: DBRoom[]): Promise<DBRoom[]> {
    const processedRooms: DBRoom[] = [];
    const deletionPromises: Promise<boolean>[] = [];

    for (const room of rooms) {
        // Step 1: Perform 7s participant cleanup and sync active_slots count (System check, no activeUserId)
        const { updatedRoom, needsDBUpdate } = calculateInactivityCleanup(room);
        
        let roomForDeletionCheck = updatedRoom;

        if (needsDBUpdate) {
            // Persist the cleanup changes (participants, setup_slots, active_slots, updated_at)
            const persistedRoom = await persistRoomUpdate(room.code, {
                participants: updatedRoom.participants,
                setup_slots: updatedRoom.setup_slots,
                active_slots: updatedRoom.active_slots,
            });
            
            if (persistedRoom) {
                roomForDeletionCheck = persistedRoom;
            } else {
                // If persistence failed, use the calculated room data for the deletion check, but log error
                console.error(`[SYSTEM CLEANUP] Failed to persist cleanup for room ${room.code}. Proceeding with deletion check.`);
            }
        }

        // Step 2: Check if the room is eligible for 5-minute deletion
        deletionPromises.push(checkAndCleanupRoom(roomForDeletionCheck));
        processedRooms.push(roomForDeletionCheck);
    }
    
    const deletionResults = await Promise.all(deletionPromises);
    
    // Filter out rooms that were deleted
    return processedRooms.filter((_, index) => !deletionResults[index]);
}


/**
 * Updates the lastActive timestamp for a participant in a room.
 * Also checks for and removes inactive participants if they haven't pinged recently (7s threshold).
 */
export async function updateParticipantActivity(roomCode: string, userId: string): Promise<DBRoom | null> {
    const room = await getRoomByCode(roomCode);
    if (!room) return null;

    // Calculate the required updates, ensuring the current userId is marked active
    const { updatedRoom, needsDBUpdate } = calculateInactivityCleanup(room, userId);
    
    if (!needsDBUpdate) {
        // If no changes were needed (e.g., only lastActive updated, but it was already fresh, or user not found)
        return updatedRoom;
    }

    // Persist the changes
    const persistedRoom = await persistRoomUpdate(roomCode, {
        participants: updatedRoom.participants,
        setup_slots: updatedRoom.setup_slots,
        active_slots: updatedRoom.active_slots,
    });

    if (!persistedRoom) {
        return null;
    }
    
    // If the room is now empty (0 active slots), trigger immediate cleanup check
    if (persistedRoom.active_slots === 0) {
        // Use the persisted data which contains the fresh updated_at timestamp
        await checkAndCleanupRoom(persistedRoom);
    }

    return persistedRoom;
}

/**
 * Updates the readiness status of a specific slot in a room's setup_slots.
 */
export async function updateSlotReadiness(roomCode: string, slotIndex: number, isReady: boolean): Promise<DBRoom | null> {
    const room = await getRoomByCode(roomCode);
    if (!room) return null;

    if (slotIndex < 0 || slotIndex >= room.setup_slots.length) {
        throw new Error("Invalid slot index.");
    }

    const updatedSetupSlots = [...room.setup_slots];
    const slotToUpdate = updatedSetupSlots[slotIndex];

    if (!slotToUpdate || !slotToUpdate.characterId || (slotToUpdate.type === 'None')) {
        // Cannot set readiness if no character is selected or slot is 'None'
        console.warn(`Attempted to set readiness for invalid slot ${slotIndex} in room ${roomCode}.`);
        return room;
    }

    // Update the readiness status
    updatedSetupSlots[slotIndex] = {
        ...slotToUpdate,
        isReady: isReady,
    };
    
    // Recalculate active slots count (though it shouldn't change here, it's good practice)
    const newActiveSlotsCount = updatedSetupSlots.filter(s => s.type === 'Human' || s.type === 'AI').length;
    
    const nowISO = new Date().toISOString();

    const { data, error: updateError } = await db
        .from('rooms')
        .update({ 
            setup_slots: updatedSetupSlots,
            active_slots: newActiveSlotsCount,
            updated_at: nowISO,
        })
        .eq('code', roomCode)
        .select(`id, name, code, owner_id, user_id, status, created_at, updated_at, participants, setup_slots, active_slots`)
        .single();

    if (updateError) {
        console.error("Error updating slot readiness:", updateError);
        throw new Error(`Failed to update slot readiness: ${updateError.message}`);
    }

    return data as DBRoom | null;
}

/**
 * Updates the entire slot data for a room (for lobby setup modifications).
 * This is used when the host is modifying slots in the lobby.
 */
export async function updateRoomSlots(roomCode: string, updatedSlots: PlayerSlot[]): Promise<DBRoom | null> {
    const room = await getRoomByCode(roomCode);
    if (!room) return null;

    if (updatedSlots.length !== room.setup_slots.length) {
        throw new Error("Invalid slot array length.");
    }

    // Recalculate active slots count
    const newActiveSlotsCount = updatedSlots.filter(s => s.type === 'Human' || s.type === 'AI').length;
    
    const nowISO = new Date().toISOString();

    const { data, error: updateError } = await db
        .from('rooms')
        .update({ 
            setup_slots: updatedSlots,
            active_slots: newActiveSlotsCount,
            updated_at: nowISO,
        })
        .eq('code', roomCode)
        .select(`id, name, code, owner_id, user_id, status, created_at, updated_at, participants, setup_slots, active_slots`)
        .single();

    if (updateError) {
        console.error("Error updating room slots:", updateError);
        throw new Error(`Failed to update room slots: ${updateError.message}`);
    }

    return data as DBRoom;
}

/**
 * Updates a specific slot while preserving all other slots (for dynamic updates).
 * This ensures that when one user updates a slot, all other slots are preserved.
 */
export async function updateSpecificSlot(roomCode: string, slotIndex: number, newSlotData: PlayerSlot): Promise<DBRoom | null> {
    const room = await getRoomByCode(roomCode);
    if (!room) return null;

    if (slotIndex < 0 || slotIndex >= room.setup_slots.length) {
        throw new Error("Invalid slot index.");
    }

    // Create a copy of the current slots
    const updatedSetupSlots = [...room.setup_slots];
    
    // Update only the specific slot
    updatedSetupSlots[slotIndex] = newSlotData;
    
    // Recalculate active slots count
    const newActiveSlotsCount = updatedSetupSlots.filter(s => s.type === 'Human' || s.type === 'AI').length;
    
    const nowISO = new Date().toISOString();

    const { data, error: updateError } = await db
        .from('rooms')
        .update({ 
            setup_slots: updatedSetupSlots,
            active_slots: newActiveSlotsCount,
            updated_at: nowISO,
        })
        .eq('code', roomCode)
        .select(`id, name, code, owner_id, user_id, status, created_at, updated_at, participants, setup_slots, active_slots`)
        .single();

    if (updateError) {
        console.error("Error updating specific slot:", updateError);
        throw new Error(`Failed to update specific slot: ${updateError.message}`);
    }

    return data as DBRoom;
}

/**
 * Synchronizes a user's local slots with the room's slots.
 * This ensures that when a user joins or refreshes, they see the correct slot data.
 */
export async function synchronizeUserSlots(roomCode: string, userId: string, userSlots: PlayerSlot[]): Promise<PlayerSlot[]> {
    const room = await getRoomByCode(roomCode);
    if (!room) return userSlots;

    const roomSlots = room.setup_slots;
    
    // Create a merged view of slots
    const synchronizedSlots: PlayerSlot[] = [];
    
    for (let i = 0; i < roomSlots.length; i++) {
        const roomSlot = roomSlots[i];
        const userSlot = userSlots[i];
        
        // If the room slot has a user, use the room slot data
        if (roomSlot.userId) {
            synchronizedSlots.push(roomSlot);
        } else {
            // If the room slot is empty, check if the user has a slot they want to keep
            if (userSlot && (userSlot.type !== 'None' || userSlot.characterId)) {
                // User has a slot they want to keep, but room slot is empty
                // This means the user might be joining with a preset
                synchronizedSlots.push(userSlot);
            } else {
                // Both room and user slots are empty, use room slot
                synchronizedSlots.push(roomSlot);
            }
        }
    }
    
    return synchronizedSlots;
}

// --- END NEW UTILITIES ---


export async function getRoomByCode(code: string): Promise<DBRoom | null> {
    const { data, error } = await db
        .from('rooms')
.select(`id, name, code, owner_id, user_id, host_id, status, created_at, updated_at, participants, setup_slots, active_slots`)
        .eq('code', code)
        .single();

    if (error) {
        // CRITICAL FIX: Log error but return null if not found, instead of throwing PGRST116
        if (error.code !== 'PGRST116') {
            console.error("Error fetching room by code:", error);
        }
        return null;
    }

    // Supabase returns JSONB fields like 'setup_slots' as objects/arrays if selected correctly.
    return data as DBRoom | null;
}

export async function getAllActiveRooms(): Promise<Room[]> {
    // FIX: Changed relational select syntax for JSONB column 'participants' to simple field selection.
    const { data, error } = await db
        .from('rooms')
        .select(`
            id,
            name,
            code,
            owner_id,
            user_id,
            host_id,
            status,
            created_at,
            updated_at,
            participants,
            setup_slots,
            active_slots
        `)
        .eq('status', 'lobby');

    if (error) {
        console.error("Error fetching active rooms:", error);
        // Return empty array on error, but log the error clearly
        return [];
    }

    // Map DB structure to client Room type. 
    if (!data) return [];
    
    // Run defensive cleanup (7s participant cleanup + 5-minute deletion) before mapping and returning
    const roomsToProcess = data as DBRoom[];
    const cleanedRooms = await cleanupRoomsBeforeFetch(roomsToProcess);

    const now = new Date().getTime();
    const activeThreshold = now - ACTIVE_THRESHOLD_MS;

    const finalRooms = cleanedRooms.map((roomData: DBRoom): Room => {
        
        // Defensive cleanup: Filter participants based on the 7-second threshold
        // This ensures the lobby view reflects inactivity immediately, even if the DB hasn't been formally updated by a heartbeat.
        const activeParticipants = (roomData.participants || []).filter(p => {
            const lastActiveTime = new Date(p.lastActive).getTime();
            return lastActiveTime >= activeThreshold;
        });
        
        // Calculate current players based on unique users in the *active* participants array
        const currentPlayers = activeParticipants.length; 
        // Max players is fixed at 4 slots
        const maxPlayers = 4; 
        
        // Use the stored active_slots count from the DB, as it's the source of truth for cleanup
        const activeSlotsCount = roomData.active_slots || 0; 
        
        // NEW SERVER LOGGING: Confirm final active slots count before sending to client
        console.log(`[SERVER ROOMS RETURN] Room ${roomData.code} (${roomData.name}) | Active Slots: ${activeSlotsCount}/${maxPlayers} | Participants: ${activeParticipants.length}`);


        return {
            id: roomData.id,
            name: roomData.name,
            code: roomData.code,
            host_id: roomData.owner_id, // Assuming host_id maps to owner_id
            owner_id: roomData.owner_id, // NEW: Track the original room creator
            participants: activeParticipants, // Return the filtered list for accurate client display
            status: (roomData.status as 'active' | 'lobby' | 'scenario_selection' | 'finished') || 'lobby',
            createdAt: roomData.created_at,
            updatedAt: roomData.updated_at, // Use actual updated_at
            currentPlayers,
            maxPlayers,
            activeSlotsCount, // Use the value from the DB
        };
    });
    
    return finalRooms;
}

// --- END MOCK/ASSUMED UTILITIES/FUNCTIONS ---


interface HandleRoomActionOptions {
    userId?: string; // Added to receive the host ID from the action
}

export async function handleRoomAction(request: Request, options: HandleRoomActionOptions = {}) {
  const formData = await request.formData();
  const intent = formData.get("intent");
  
  // If userId is not provided via options (e.g., joining via list), fetch it here.
  const userId = options.userId || (await requireUser(request)).id; 
  
  if (intent === "create") {
    const roomName = formData.get("roomName")?.toString() || "New Game";
    const roomSlotsJson = formData.get("roomSlots")?.toString();
    
    if (!roomName || !roomSlotsJson) {
        throw new Error("Missing room name or slot configuration.");
    }

    const slots: PlayerSlot[] = JSON.parse(roomSlotsJson);
    
    // 1. Validate readiness and find the host character (first ready Human slot)
    const activeSlots = slots.filter(slot => slot.type === 'Human' || slot.type === 'AI');
    const newActiveSlotsCount = activeSlots.length; // Calculate initial active slots count
    
    const allActiveSlotsReady = newActiveSlotsCount > 0 && activeSlots.every(slot => slot.isReady);
    
    // Host is the first Human slot that is ready and has a character selected
    const hostSlot = slots.find(s => s.type === 'Human' && s.isReady && s.characterId !== null);

    if (!allActiveSlotsReady) {
        throw new Error("Room creation failed: All active slots must be marked as Ready.");
    }
    
    if (!hostSlot || !hostSlot.characterId) {
        throw new Error("Room creation failed: At least one Human character must be selected and ready to host the room.");
    }
    
    const hostCharacterId = hostSlot.characterId;

    // 2. Generate Unique Code
    const roomCode = await generateUniqueCode(); 

    // 3. Determine Host Participant (The creator is always the first participant)
    const newParticipant: RoomParticipant = {
        userId: userId,
        characterId: hostCharacterId,
        lastActive: new Date().toISOString(), // Initialize last active time
    };

    // Fetch the username for the host user
    const hostUser = await getUserById(userId);
    const hostUsername = hostUser?.username;

    // 4. Prepare Room Data for DB Insertion
    // NOTE: We use the full slots array, including AI slots and other ready human slots.
    // Update slots to include userId and username for all active slots
    const updatedSlots = slots.map((slot) => {
        if ((slot.type === 'Human' || slot.type === 'AI') && slot.characterId) {
            // For the host slot, add userId and username
            if (slot.characterId === hostCharacterId) {
                return {
                    ...slot,
                    userId: userId,
                    username: hostUsername,
                };
            }
        }
        return slot;
    });

    const roomData = {
        name: roomName,
        code: roomCode,
        owner_id: userId, // Set owner_id
        user_id: userId,  // Set user_id to satisfy NOT NULL constraint
        host_id: userId,  // Set host_id to identify the host
        participants: [newParticipant],
        setup_slots: updatedSlots, // Storing slots as JSONB with username enrichment
        active_slots: newActiveSlotsCount, // NEW: Store initial active slots count
    };

    const { data, error } = await db
        .from('rooms')
        .insert([roomData])
        .select(`id, name, code, owner_id, user_id, host_id, status, created_at, updated_at, active_slots`) // Ensure active_slots is selected
        .single();

    if (error) {
        console.error("Error creating room:", error);
        throw new Error(`Failed to create room: ${error.message}`);
    }

    // Redirect user to the game/lobby view using the new room code
    throw redirect(`/game?roomCode=${data.code}`);

  } else if (intent === "join") {
    const roomCode = formData.get("roomCode")?.toString();
    const roomSlotsJson = formData.get("roomSlots")?.toString(); 

    if (!roomCode || !roomSlotsJson) {
        throw new Error("Missing room code or party configuration for joining.");
    }
    
    const joiningSlots: PlayerSlot[] = JSON.parse(roomSlotsJson);

    // 1. Find the room
    const room = await getRoomByCode(roomCode);
    if (!room) {
        throw new Error("Room not found or invalid code.");
    }
    
    console.log(`[JOIN ATTEMPT] User ${userId.substring(0, 8)} is attempting to join room ${roomCode}.`);
    
    // 2. Check if the user is already a participant
    const isAlreadyParticipant = room.participants.some(p => p.userId === userId);
    if (isAlreadyParticipant) {
        // If already in the room, just redirect to the game
        throw redirect(`/game?roomCode=${room.code}`);
    }

    // 3. VALIDATION: Check if there are enough slots for the joining party
    const availableSlotsCount = room.setup_slots.filter(slot => slot.type === 'None').length;
    const joiningCharacters = joiningSlots.filter(s => (s.type === 'Human' || s.type === 'AI') && s.isReady && s.characterId !== null);
    
    if (joiningCharacters.length === 0) {
        throw new Error("You must select at least one character and mark it as Ready to join a room.");
    }
    
    if (joiningCharacters.length > availableSlotsCount) {
        throw new Error(`Not enough space for your party. You have ${joiningCharacters.length} character(s) ready, but the room only has ${availableSlotsCount} open slot(s).`);
    }
    
    // 3b. Check if room is full (all 4 slots occupied)
    const totalSlots = room.setup_slots.length;
    const occupiedSlots = room.setup_slots.filter(slot => slot.type !== 'None').length;
    if (occupiedSlots >= totalSlots) {
        throw new Error("This room is full. Please try joining a different room or create a new one.");
    }
    
    // Process all joining characters, not just the first one
    console.log(`[JOIN ATTEMPT] User is joining with ${joiningCharacters.length} character(s).`);
    console.log(`[JOIN ATTEMPT] Current room slots before join:`, JSON.stringify(room.setup_slots.map(s => ({ type: s.type, charId: s.characterId ? s.characterId.substring(0, 8) : null }))));

    // 4. SMART JOIN LOGIC: Process all joining characters
    const roomSetupSlots = [...room.setup_slots]; // Make a mutable copy
    const newParticipants: RoomParticipant[] = [];
    const joiningUser = await getUserById(userId);
    const joiningUsername = joiningUser?.username;

    // Process each joining character
    for (const joiningCharacter of joiningCharacters) {
        const joiningCharacterOriginalIndex = joiningSlots.findIndex(s => s.characterId === joiningCharacter.characterId);
        
        console.log(`[JOIN ATTEMPT] Processing character: ${joiningCharacter.characterName} (ID: ${joiningCharacter.characterId?.substring(0, 8)})`);
        console.log(`[JOIN ATTEMPT] Character's preferred slot index from their setup: ${joiningCharacterOriginalIndex}.`);

        let targetSlotIndex = -1;

        // 4a. Check if the user's preferred slot is available
        if (joiningCharacterOriginalIndex >= 0 && roomSetupSlots[joiningCharacterOriginalIndex]?.type === 'None') {
            console.log(`[SMART JOIN] Preferred slot ${joiningCharacterOriginalIndex} is available. Assigning character there.`);
            targetSlotIndex = joiningCharacterOriginalIndex;
        } else {
            // 4b. Preferred slot is taken, find the first available 'None' slot
            console.log(`[SMART JOIN] Preferred slot ${joiningCharacterOriginalIndex} is taken or invalid. Finding next available 'None' slot.`);
            targetSlotIndex = roomSetupSlots.findIndex(slot => slot.type === 'None');
            if (targetSlotIndex !== -1) {
                console.log(`[SMART JOIN] Found available slot at index ${targetSlotIndex}.`);
            }
        }

        if (targetSlotIndex === -1) {
            console.error(`[SMART JOIN] CRITICAL ERROR: No available slot found for character ${joiningCharacter.characterName} in room ${roomCode}, but validation passed. This should not happen.`);
            throw new Error("Room is full. No available slots to join.");
        }
        
        // Add participant for this character
        newParticipants.push({
            userId: userId,
            characterId: joiningCharacter.characterId!,
            lastActive: new Date().toISOString(),
        });
        
        // Update the slot with character information
        roomSetupSlots[targetSlotIndex] = {
            ...joiningCharacter,
            isReady: false, // Joining players always start as not ready
            userId: userId, // Explicitly link the user to this slot
            username: joiningUsername, // Add username to the slot
        };
        
        console.log(`[JOIN SUCCESS] Assigning character ${joiningCharacter.characterName} to slot ${targetSlotIndex} for user ${userId.substring(0, 8)}.`);
    }
    
    const newParticipantsArray = [...room.participants, ...newParticipants];
    const newActiveSlotsCount = roomSetupSlots.filter(s => s.type === 'Human' || s.type === 'AI').length;

    console.log(`[JOIN SUCCESS] Room slots after update:`, JSON.stringify(roomSetupSlots.map(s => ({ type: s.type, charId: s.characterId ? s.characterId.substring(0, 8) : null, userId: s.userId ? s.userId.substring(0, 8) : null }))));
    console.log(`[SLOT CLEANUP] Room ${roomCode}: Final slots types: ${JSON.stringify(roomSetupSlots.map(s => s.type))}`);
    console.log(`[SLOT CLEANUP] Room ${roomCode}: Final active slots count: ${newActiveSlotsCount}`);

    // Check if this is the first user joining an empty room and update host if needed
    const roomUpdates: Partial<DBRoom> = { 
        participants: newParticipantsArray,
        setup_slots: roomSetupSlots,
        active_slots: newActiveSlotsCount,
    };

    // If room was empty and this is the first user, they become the host
    // BUT only if there's no existing owner (room was created without an owner)
    if (room.participants.length === 0 && newParticipants.length > 0 && !room.owner_id) {
        console.log(`[JOIN LOGIC] First user ${userId.substring(0, 8)} joining empty room ${roomCode}. Assigning as host.`);
        roomUpdates.owner_id = userId;
        roomUpdates.user_id = userId;
    }

    // 6. Update the database
    // FIX: Add .select() to ensure the action waits for the update to complete before redirecting.
    const { data: updatedRoom, error: updateError } = await db
        .from('rooms')
        .update(roomUpdates)
        .eq('code', roomCode)
        .select('code') // Select a minimal field to confirm the update happened
        .single();

    if (updateError) {
        console.error("Error joining room:", updateError);
        throw new Error(`Failed to join room: ${updateError.message}`);
    }
    
    if (!updatedRoom) {
        console.error(`[JOIN LOGIC] Update for room ${roomCode} did not return data, indicating a possible failure.`);
        throw new Error("Failed to confirm room update after joining.");
    }

    console.log(`[JOIN LOGIC] Successfully joined room ${roomCode} for user ${userId.substring(0, 8)}. Redirecting to /game?roomCode=${updatedRoom.code}`);
    console.log(`[JOIN LOGIC] Redirect URL: /game?roomCode=${updatedRoom.code}`);
    // Log the redirect to see if it's being triggered
    console.log(`[JOIN LOGIC] About to throw redirect for user ${userId.substring(0, 8)}`);
    // Redirect to the game/lobby view
    throw redirect(`/game?roomCode=${updatedRoom.code}`);
  }

  throw new Response("Invalid intent", { status: 400 });
}

/**
 * Updates the status of a room
 * @param roomCode - The room code
 * @param newStatus - The new status ('lobby', 'scenario_selection', 'active_game', 'finished')
 * @returns Promise<boolean> - true if update was successful
 */
export async function updateRoomStatus(roomCode: string, newStatus: 'lobby' | 'scenario_selection' | 'active_game' | 'finished'): Promise<boolean> {
  try {
    const { error } = await db
      .from('rooms')
      .update({ status: newStatus })
      .eq('code', roomCode)
      .select()
      .single();

    if (error) {
      console.error(`Error updating room ${roomCode} status to ${newStatus}:`, error);
      return false;
    }

    console.log(`[ROOM STATUS] Updated room ${roomCode} status to: ${newStatus}`);
    return true;
  } catch (error) {
    console.error(`Exception updating room status for ${roomCode}:`, error);
    return false;
  }
}

/**
 * Inserts a scenario suggestion into the room_chat table
 */
export async function insertScenarioSuggestion(roomCode: string, userId: string, username: string, suggestion: string): Promise<boolean> {
    const { error } = await db
        .from('room_chat')
        .insert({
            code: roomCode,
            user_id: userId,
            username: username,
            message: suggestion,
            message_type: 'scenario_suggestion',
            expires_at: new Date(Date.now() + 30 * 60 * 1000) // Expire after 30 minutes
        });

    if (error) {
        console.error("Error inserting scenario suggestion:", error);
        return false;
    }
    return true;
}

/**
 * Gets recent scenario suggestions for a room
 */
export async function getScenarioSuggestions(roomCode: string): Promise<Array<{
    id: string;
    user_id: string;
    username: string;
    message: string;
    created_at: string;
}>> {
    console.log(`[DB SUGGESTIONS] Querying suggestions for room: ${roomCode}`);
    const { data, error } = await db
        .from('room_chat')
        .select('id, user_id, username, message, created_at')
        .eq('code', roomCode)
        .eq('message_type', 'scenario_suggestion')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error("Error fetching scenario suggestions:", error);
        return [];
    }
    console.log(`[DB SUGGESTIONS] Found ${data?.length || 0} suggestions for room: ${roomCode}`);
    return data || [];
}

/**
 * Gets recent chat messages for a room (excluding expired scenario suggestions)
 */
export async function getRoomChatMessages(roomCode: string, limit: number = 50): Promise<Array<{
    id: string;
    user_id: string;
    username: string;
    message: string;
    message_type: string;
    created_at: string;
}>> {
    const { data, error } = await db
        .from('room_chat')
        .select('id, user_id, username, message, message_type, created_at')
        .eq('code', roomCode)
        .or('message_type.eq.text,message_type.eq.system,message_type.eq.notification')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error("Error fetching room chat messages:", error);
        return [];
    }
    return data || [];
}

/**
 * Stores generated scenarios for a room in the scenarios column
 */
export async function storeRoomScenarios(roomCode: string, scenarios: ScenarioForDisplay[]): Promise<boolean> {
    try {
        // Store scenarios as JSON in the scenarios column
        const { error } = await db
            .from('rooms')
            .update({ 
                scenarios: scenarios, // Store as JSON directly
                updated_at: new Date().toISOString()
            })
            .eq('code', roomCode);

        if (error) {
            console.error("Error storing room scenarios:", error);
            return false;
        }
        
        console.log(`[DB SCENARIOS] Stored ${scenarios.length} scenarios for room: ${roomCode}`);
        return true;
    } catch (error) {
        console.error("Error storing room scenarios:", error);
        return false;
    }
}

/**
 * Gets stored scenarios for a room from the scenarios column
 */
export async function getRoomScenarios(roomCode: string): Promise<ScenarioForDisplay[]> {
    try {
        const { data, error } = await db
            .from('rooms')
            .select('scenarios')
            .eq('code', roomCode)
            .single();

        if (error) {
            console.error("Error fetching room scenarios:", error);
            return [];
        }
        
        if (!data || !data.scenarios) {
            return [];
        }
        
        // Scenarios are stored as JSON, parse them
        const scenarios = Array.isArray(data.scenarios) ? data.scenarios : JSON.parse(data.scenarios || '[]');
        console.log(`[DB SCENARIOS] Retrieved ${scenarios.length} scenarios for room: ${roomCode}`);
        return scenarios;
    } catch (error) {
        console.error("Error fetching room scenarios:", error);
        return [];
    }
}

/**
 * Sets the winning scenario ID for a room
 */
export async function setRoomScenarioWinner(roomCode: string, scenarioId: string): Promise<boolean> {
    try {
        const { error } = await db
            .from('rooms')
            .update({ 
                scenario_winner_id: scenarioId,
                updated_at: new Date().toISOString()
            })
            .eq('code', roomCode);

        if (error) {
            console.error("Error setting room scenario winner:", error);
            return false;
        }
        
        console.log(`[DB SCENARIOS] Set scenario winner for room ${roomCode}: ${scenarioId}`);
        return true;
    } catch (error) {
        console.error("Error setting room scenario winner:", error);
        return false;
    }
}

/**
 * Gets the winning scenario for a room
 */
export async function getRoomScenarioWinner(roomCode: string): Promise<string | null> {
    try {
        const { data, error } = await db
            .from('rooms')
            .select('scenario_winner_id')
            .eq('code', roomCode)
            .single();

        if (error) {
            console.error("Error fetching room scenario winner:", error);
            return null;
        }
        
        if (!data || !data.scenario_winner_id) {
            return null;
        }
        
        console.log(`[DB SCENARIOS] Retrieved scenario winner for room ${roomCode}: ${data.scenario_winner_id}`);
        return data.scenario_winner_id;
    } catch (error) {
        console.error("Error fetching room scenario winner:", error);
        return null;
    }
}

/**
 * Clears stored scenarios for a room
 */
export async function clearRoomScenarios(roomCode: string): Promise<boolean> {
    try {
        const { error } = await db
            .from('rooms')
            .update({ 
                scenarios: null,
                updated_at: new Date().toISOString()
            })
            .eq('code', roomCode);

        if (error) {
            console.error("Error clearing room scenarios:", error);
            return false;
        }
        
        console.log(`[DB SCENARIOS] Cleared scenarios for room: ${roomCode}`);
        return true;
    } catch (error) {
        console.error("Error clearing room scenarios:", error);
        return false;
    }
}

/**
 * Gets scenarios from room without regenerating them
 */
export async function getRoomScenariosForVoting(roomCode: string): Promise<ScenarioForDisplay[]> {
    try {
        const { data, error } = await db
            .from('rooms')
            .select('scenarios')
            .eq('code', roomCode)
            .single();

        if (error) {
            console.error("Error fetching room scenarios for voting:", error);
            return [];
        }
        
        if (!data || !data.scenarios) {
            return [];
        }
        
        // Scenarios are stored as JSON, parse them
        const scenarios = Array.isArray(data.scenarios) ? data.scenarios : JSON.parse(data.scenarios || '[]');
        console.log(`[DB SCENARIOS] Retrieved ${scenarios.length} scenarios for voting in room: ${roomCode}`);
        return scenarios;
    } catch (error) {
        console.error("Error fetching room scenarios for voting:", error);
        return [];
    }
}

/**
 * Checks if scenarios exist for a room
 */
export async function hasRoomScenarios(roomCode: string): Promise<boolean> {
    try {
        const { data, error } = await db
            .from('rooms')
            .select('scenarios')
            .eq('code', roomCode)
            .single();

        if (error) {
            console.error("Error checking room scenarios:", error);
            return false;
        }
        
        return !!(data && data.scenarios && data.scenarios.length > 0);
    } catch (error) {
        console.error("Error checking room scenarios:", error);
        return false;
    }
}

// DICE ROLLING STATE MANAGEMENT FUNCTIONS

/**
 * Initialize dice rolling state for a room
 */
export async function startDiceRolling(roomCode: string): Promise<boolean> {
    try {
        // Fetch room data including setup_slots
        const { data: roomData, error: roomError } = await db
            .from('rooms')
            .select('setup_slots, host_id, owner_id')
            .eq('code', roomCode)
            .single();

        if (roomError || !roomData) {
            console.error("Room not found:", roomError);
            return false;
        }

        // Build players array from slots with type 'Human' or 'AI'
        const players: Array<{
            userId: string;
            slotIndex: number;
            characterId: string;
            characterName: string;
        }> = [];

        if (roomData.setup_slots) {
            for (let i = 0; i < roomData.setup_slots.length; i++) {
                const slot = roomData.setup_slots[i];
                if (slot && (slot.type === 'Human' || slot.type === 'AI')) {
                    // Fetch character name from database
                    let characterName = slot.characterName || `Player ${i + 1}`;
                    
                    if (slot.characterId) {
                        const { data: characterData, error: charError } = await db
                            .from('characters')
                            .select('name')
                            .eq('id', slot.characterId)
                            .single();
                        
                        if (!charError && characterData) {
                            characterName = characterData.name;
                        }
                    }

                    players.push({
                        userId: slot.userId || roomData.host_id,
                        slotIndex: i,
                        characterId: slot.characterId || '',
                        characterName
                    });
                }
            }
        }

        // Initialize dice rolling state
        const diceRollingState: DiceRollingState = {
            status: 'rolling',
            currentPlayerIndex: 0,
            players,
            rolls: {},
            winner: null
        };

        // Update room record with new state
        const { error: updateError } = await db
            .from('rooms')
            .update({ 
                dice_rolling_state: diceRollingState,
                updated_at: new Date().toISOString()
            })
            .eq('code', roomCode);

        if (updateError) {
            console.error("Error updating room dice rolling state:", updateError);
            return false;
        }

        return true;
    } catch (error) {
        console.error("Error starting dice rolling:", error);
        return false;
    }
}

/**
 * Record an individual dice roll for a player
 */
export async function recordDiceRoll(
    roomCode: string, 
    userId: string, 
    slotType: string, 
    slotIndex: number, 
    diceResult: number, 
    diceType: string, 
    rollReason: string // Parameter for future extensibility
): Promise<boolean> {
    try {
        // Fetch current dice rolling state
        const { data: roomData, error: roomError } = await db
            .from('rooms')
            .select('dice_rolling_state')
            .eq('code', roomCode)
            .single();

        if (roomError || !roomData || !roomData.dice_rolling_state) {
            console.error("Room or dice rolling state not found:", roomError);
            return false;
        }

        const diceRollingState: DiceRollingState = roomData.dice_rolling_state;

        // Validate player exists in players array
        const playerIndex = diceRollingState.players.findIndex((p: { slotIndex: number; userId: string }) => 
            p.slotIndex === slotIndex && p.userId === userId
        );

        if (playerIndex === -1) {
            console.error("Player not found in dice rolling state");
            return false;
        }

        // Validate player hasn't already rolled
        if (diceRollingState.rolls[slotIndex] !== undefined) {
            console.error("Player has already rolled");
            return false;
        }

        // Validate dice result (1-20 for d20)
        if (diceType === 'd20' && (diceResult < 1 || diceResult > 20)) {
            console.error("Invalid dice result:", diceResult);
            return false;
        }

        // Add roll to rolls object
        diceRollingState.rolls[slotIndex] = diceResult;

        // Check if all players have rolled
        const allPlayersRolled = diceRollingState.players.every((player: { slotIndex: number }) => 
            diceRollingState.rolls[player.slotIndex] !== undefined
        );

        if (allPlayersRolled) {
            // Determine winner (highest roll, handle ties by earliest roll)
            let maxRoll = -1;
            let winnerIndex = -1;
            
            for (const player of diceRollingState.players) {
                const playerRoll = diceRollingState.rolls[player.slotIndex];
                if (playerRoll !== undefined && playerRoll > maxRoll) {
                    maxRoll = playerRoll;
                    winnerIndex = player.slotIndex;
                }
            }
            
            diceRollingState.winner = winnerIndex;
            diceRollingState.status = 'completed';
        } else {
            // Advance to next player
            let nextPlayerIndex = diceRollingState.currentPlayerIndex;
            do {
                nextPlayerIndex = (nextPlayerIndex + 1) % diceRollingState.players.length;
            } while (
                nextPlayerIndex !== diceRollingState.currentPlayerIndex &&
                diceRollingState.rolls[diceRollingState.players[nextPlayerIndex].slotIndex] !== undefined
            );
            
            diceRollingState.currentPlayerIndex = nextPlayerIndex;
        }

        // Persist updated dice rolling state
        const { error: updateError } = await db
            .from('rooms')
            .update({ 
                dice_rolling_state: diceRollingState,
                updated_at: new Date().toISOString()
            })
            .eq('code', roomCode);

        if (updateError) {
            console.error("Error updating room dice rolling state:", updateError);
            return false;
        }

        return true;
    } catch (error) {
        console.error("Error recording dice roll:", error);
        return false;
    }
}

/**
 * Get current dice rolling state for a room
 */
export async function getDiceRollingState(roomCode: string): Promise<DiceRollingState | null> {
    try {
        const { data, error } = await db
            .from('rooms')
            .select('dice_rolling_state')
            .eq('code', roomCode)
            .single();

        if (error || !data) {
            console.error("Error fetching dice rolling state:", error);
            return null;
        }

        return data.dice_rolling_state || null;
    } catch (error) {
        console.error("Error getting dice rolling state:", error);
        return null;
    }
}

/**
 * Get all dice results for a room
 */
export async function getRoomDiceResults(roomCode: string): Promise<Array<{ slotIndex: number; userId: string; result: number; characterName: string }>> {
    try {
        const { data, error } = await db
            .from('rooms')
            .select('dice_rolling_state')
            .eq('code', roomCode)
            .single();

        if (error || !data || !data.dice_rolling_state) {
            console.error("Error fetching dice results:", error);
            return [];
        }

        const diceRollingState: DiceRollingState = data.dice_rolling_state;
        
        // Map rolls to array with player details
        const results: Array<{ slotIndex: number; userId: string; result: number; characterName: string }> = [];
        
        for (const [slotIndexStr, result] of Object.entries(diceRollingState.rolls)) {
            const slotIndex = parseInt(slotIndexStr);
            const player = diceRollingState.players.find((p: { slotIndex: number }) => p.slotIndex === slotIndex);
            
            if (player && result !== undefined) {
                results.push({
                    slotIndex,
                    userId: player.userId,
                    result: result as number,
                    characterName: player.characterName
                });
            }
        }

        // Sort by slotIndex
        return results.sort((a, b) => a.slotIndex - b.slotIndex);
    } catch (error) {
        console.error("Error getting room dice results:", error);
        return [];
    }
}

/**
 * Check if tiebreaker is complete and get results
 */
export async function checkTiebreakerCompletion(roomCode: string): Promise<{ isComplete: boolean; winner: number | null; results: Array<{ slotIndex: number; result: number }> }> {
    try {
        const diceRollingState = await getDiceRollingState(roomCode);
        
        if (!diceRollingState) {
            return { isComplete: false, winner: null, results: [] };
        }

        return {
            isComplete: diceRollingState.status === 'completed',
            winner: diceRollingState.winner,
            results: Object.entries(diceRollingState.rolls).map(([slotIndex, result]) => ({
                slotIndex: parseInt(slotIndex),
                result
            }))
        };
    } catch (error) {
        console.error("Error checking tiebreaker completion:", error);
        return { isComplete: false, winner: null, results: [] };
    }
}

/**
 * Clear dice rolling state for a room
 */
export async function clearRoomDiceRolls(roomCode: string): Promise<boolean> {
    try {
        const { error } = await db
            .from('rooms')
            .update({ 
                dice_rolling_state: {
                    status: 'not-started',
                    currentPlayerIndex: 0,
                    players: [],
                    rolls: {},
                    winner: null
                },
                updated_at: new Date().toISOString()
            })
            .eq('code', roomCode);

        if (error) {
            console.error("Error clearing dice rolls:", error);
            return false;
        }

        return true;
    } catch (error) {
        console.error("Error clearing room dice rolls:", error);
        return false;
    }
}

/**
 * Get player slot information for a room
 */
export async function getPlayerSlotInfo(roomCode: string, userId: string): Promise<Array<{ slotIndex: number; characterId: string; characterName: string }>> {
    try {
        const { data, error } = await db
            .from('rooms')
            .select('setup_slots')
            .eq('code', roomCode)
            .single();

        if (error || !data) {
            console.error("Error fetching player slot info:", error);
            return [];
        }

        const slots: Array<{ slotIndex: number; characterId: string; characterName: string }> = [];
        
        if (data.setup_slots) {
            for (let i = 0; i < data.setup_slots.length; i++) {
                const slot = data.setup_slots[i];
                if (slot && slot.userId === userId) {
                    slots.push({
                        slotIndex: i,
                        characterId: slot.characterId || '',
                        characterName: slot.characterName || `Player ${i + 1}`
                    });
                }
            }
        }

        return slots;
    } catch (error) {
        console.error("Error getting player slot info:", error);
        return [];
    }
}

/**
 * Update character coordinates in a room
 */
export async function updateCharacterCoordinates(roomCode: string, characterId: string, x: number, y: number): Promise<boolean> {
    try {
        const { data, error } = await db
            .from('rooms')
            .select('setup_slots')
            .eq('code', roomCode)
            .single();

        if (error || !data) {
            console.error("Error fetching room for coordinate update:", error);
            return false;
        }

        const updatedSlots = data.setup_slots.map((slot: any) => {
            if (slot && slot.characterId === characterId) {
                return {
                    ...slot,
                    x,
                    y
                };
            }
            return slot;
        });

        const { error: updateError } = await db
            .from('rooms')
            .update({ setup_slots: updatedSlots })
            .eq('code', roomCode);

        if (updateError) {
            console.error("Error updating character coordinates:", updateError);
            return false;
        }

        return true;
    } catch (error) {
        console.error("Error updating character coordinates:", error);
        return false;
    }
}

/**
 * Update room scenarios
 */
export async function updateRoomScenarios(roomCode: string, scenarios: any[]): Promise<boolean> {
    try {
        const { error } = await db
            .from('rooms')
            .update({ scenarios })
            .eq('code', roomCode);

        if (error) {
            console.error("Error updating room scenarios:", error);
            return false;
        }

        return true;
    } catch (error) {
        console.error("Error updating room scenarios:", error);
        return false;
    }
}
