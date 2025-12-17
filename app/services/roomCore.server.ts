import { redirect, json } from "@remix-run/node";
import { db } from "~/services/db.server";
import type { PlayerSlot, Room, Character, ScenarioForDisplay, DiceRollingState, DBRoom, RoomParticipant } from "~/types"; // Import DBRoom, RoomParticipant from ~/types
import { logger } from "~/utils/logger";
import { requireUser } from "~/services/auth.server"; // Assuming auth.server exports requireUser
import { calculateInactivityCleanup, persistRoomUpdate, cleanupRoomsBeforeFetch } from "./roomCleanup.server"; // Import cleanup functions
import { createApiErrorResponse, createErrorResponse } from "~/utils/errors";
import { saveTemporaryPartySetup, clearTemporaryPartySetup } from "./db.server"; // Import saveTemporaryPartySetup function
// 

// DBRoom and RoomParticipant types are now in ~/types.ts

// Define the threshold for considering a participant active (e.g., last 15 seconds)
export const ACTIVE_THRESHOLD_MS = 15 * 1000; // 15 seconds (Quick cleanup after one missed 10s ping)
export const INACTIVITY_DELETION_MS = 5 * 60 * 1000; // 5 minutes in milliseconds

// Cleanup throttling: only run cleanup every 30 seconds per room
const lastCleanupTimes = new Map<string, number>();
const CLEANUP_THROTTLE_MS = 30 * 1000;

// Helper to generate a unique 6-character code
export function generateUniqueCodeSync(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// --- OPTIMISTIC LOCKING UTILITY ---
/**
 * Performs operations with optimistic locking using version checks
 */
export async function withOptimisticLock<T>(
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

/**
 * Gets a room by its code.
 */
export async function getRoomByCode(code: string): Promise<DBRoom | null> {
    logger.debug(`[roomCore.server] getRoomByCode: ${code}`);
    
    const { data, error } = await db.from("rooms").select(`
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
        active_slots,
        maxplayers,
        room_chat_last_updated,
        scenarios,
        dice_rolling_state,
        scenario_winner_id
    `).eq("code", code).single();
    
    if (error) {
        logger.error(`[roomCore.server] Error fetching room by code:`, { code, error });
        return null;
    }
    
    return data as DBRoom;
}

/**
 * Gets all active rooms.
 */
export async function getAllActiveRooms(): Promise<Room[]> {
    logger.debug(`[roomCore.server] getAllActiveRooms`);
    const { data, error } = await db.from("rooms").select(`
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
        active_slots,
        maxplayers,
        room_chat_last_updated,
        scenarios,
        dice_rolling_state,
        scenario_winner_id
    `).neq("status", "finished");
    
    if (error) {
        logger.error(`[roomCore.server] Error fetching active rooms:`, { error });
        return [];
    }
    
    // Map DBRoom to Room interface directly (cleanup moved to background job)
    return (data as DBRoom[]).map(dbRoom => ({
        id: dbRoom.id,
        name: dbRoom.name,
        code: dbRoom.code,
        host_id: dbRoom.host_id,
        owner_id: dbRoom.owner_id,
        participants: dbRoom.participants,
        status: dbRoom.status as Room['status'], // Cast status string to Room['status']
        createdAt: dbRoom.created_at,
        updatedAt: dbRoom.updated_at,
        currentPlayers: dbRoom.participants.length, // Assume all participants are current players
        maxPlayers: dbRoom.maxplayers || 4, // Default maxPlayers if not set
        activeSlotsCount: dbRoom.active_slots || 0, // Default activeSlotsCount
        setup_slots: dbRoom.setup_slots,
        room_chat_last_updated: dbRoom.room_chat_last_updated,
        scenarios: dbRoom.scenarios,
        dice_rolling_state: dbRoom.dice_rolling_state,
        scenario_winner_id: dbRoom.scenario_winner_id,
    }));
}

/**
 * Handles room creation and joining actions.
 */
interface HandleRoomActionOptions {
    userId?: string; 
}
export async function handleRoomAction(request: Request, options: HandleRoomActionOptions = {}): Promise<Response> {
    logger.debug(`[roomCore.server] handleRoomAction: intent from request`);
    
    const formData = await request.formData();
    const intent = formData.get("intent");
    const roomName = formData.get("roomName")?.toString();
    const roomCode = formData.get("roomCode")?.toString();
    const userId = options.userId || formData.get("userId")?.toString();
    
    if (!userId) {
        return json(
          {
            success: false,
            error: {
              code: "UNAUTHORIZED",
              message: "User not authenticated",
              userMessage: "You need to be logged in to create a room.",
              recoverySteps: ["Log in to your account", "Refresh the page and try again"],
              retryable: false,
            },
          },
          { status: 401 }
        );
    }
    
    if (intent === "createRoom") {
        if (!roomName) {
          return json(
            {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "Room name is required",
                userMessage: "Room name is required to create a room.",
                recoverySteps: ["Enter a room name", "Try again"],
                retryable: false,
              },
            },
            { status: 400 }
          );
        }
        
        // Generate unique room code
        let code: string;
        let attempts = 0;
        do {
            code = generateUniqueCodeSync();
            attempts++;
            if (attempts > 10) {
                return json(
                  {
                    success: false,
                    error: {
                      code: "DATABASE_ERROR",
                      message: "Failed to generate unique room code",
                      userMessage: "Could not create a unique room code. Please try again.",
                      recoverySteps: ["Try creating the room again", "Contact support if issue persists"],
                      retryable: true,
                    },
                  },
                  { status: 500 }
                );
            }
        } while (await getRoomByCode(code));
        
        // Parse and save room slots (party setup)
        const roomSlotsJson = formData.get("roomSlots")?.toString();
        let setupSlots: PlayerSlot[] = [];
        if (roomSlotsJson) {
            try {
                setupSlots = JSON.parse(roomSlotsJson);
                logger.debug(`[roomCore.server] Parsed roomSlots:`, { setupSlots });
                
                // Save the temporary party setup to the database
                await saveTemporaryPartySetup(userId, setupSlots);
                logger.debug(`[roomCore.server] Saved temporary party setup for user:`, { userId });
            } catch (error) {
                logger.warn(`[roomCore.server] Failed to parse roomSlots, using empty array:`, { error });
            }
        }
        
        // Create room
        const username = formData.get("username")?.toString() || "Unknown";
        
        // Create participants array with the room creator
        const participants = setupSlots
            .filter(slot => slot.characterId)
            .map(slot => ({
                userId: userId,
                characterId: slot.characterId,
                username: username
            }));
        
        const { data, error } = await db.from("rooms").insert({
            name: roomName,
            code: code,
            owner_id: userId,
            user_id: userId,
            host_id: userId,
            status: "lobby",
            participants: participants,
            setup_slots: setupSlots,
            active_slots: setupSlots.length,
            maxplayers: 4
        }).select().single();
        
        if (error) {
            logger.error(`[roomCore.server] Error creating room:`, { error, roomName, code, userId, setupSlots });
            return json(
              {
                success: false,
                error: {
                  code: "DATABASE_ERROR",
                  message: "Failed to create room",
                  userMessage: "Could not create the room. Please try again.",
                  recoverySteps: ["Try creating the room again", "Contact support if issue persists"],
                  retryable: true,
                },
              },
              { status: 500 }
            );
        }
        
        logger.debug(`[roomCore.server] Room created successfully:`, { data, code });
        await clearTemporaryPartySetup(userId); // Clear temporary party setup after successful room creation
        // Return success response with redirect URL for fetcher
        return json(
          {
            success: true,
            redirectUrl: `/game?roomCode=${code}`,
            roomCode: code
          },
          { status: 200 }
        );
    }
    
    if (intent === "joinRoom") {
        if (!roomCode) {
            return createApiErrorResponse(new Error("Room code is required"), "Missing room code");
        }
        
        const room = await getRoomByCode(roomCode);
        if (!room) {
            return createApiErrorResponse(new Error("Room not found"), "Room not found");
        }

        // Check if user is already in the room
        const isUserAlreadyInRoom = room.participants.some(p => p.userId === userId);
        if (isUserAlreadyInRoom) {
            logger.debug(`[roomCore.server] User ${userId} is already in room ${roomCode}, redirecting.`);
            return json(
              {
                success: true,
                redirectUrl: `/game?roomCode=${roomCode}`,
                roomCode: roomCode
              },
              { status: 200 }
            );
        }
        
        // Check if room is full
        if (room.participants.length >= room.maxplayers) {
            return createApiErrorResponse(new Error("Room is full"), "This room is at maximum capacity");
        }
        
        // Get user's party setup from form
        const roomSlotsJson = formData.get("roomSlots")?.toString();
        if (!roomSlotsJson) {
            return createApiErrorResponse(new Error("Missing party setup"), "Your party setup was not provided.");
        }
        
        let userSlots: PlayerSlot[];
        try {
            userSlots = JSON.parse(roomSlotsJson);
        } catch (error) {
            logger.warn(`[roomCore.server] Failed to parse roomSlots from user:`, { error });
            return createApiErrorResponse(new Error("Invalid party setup format"), "Your party setup is invalid.");
        }

        // Find character to join with (first Human slot with a character)
        const characterSlotToJoin = userSlots.find(s => s.type === 'Human' && s.characterId);

        if (!characterSlotToJoin || !characterSlotToJoin.characterId) {
            return createApiErrorResponse(new Error("No character to join with"), "You must have a character selected in your party to join a room.");
        }

        const username = formData.get("username")?.toString() || "Unknown";

        // Check if character is already in the room
        const isCharacterAlreadyInRoom = room.setup_slots.some(s => s.characterId === characterSlotToJoin.characterId);
        if (isCharacterAlreadyInRoom) {
            logger.warn(`[roomCore.server] Character ${characterSlotToJoin.characterId} is already in room ${roomCode}.`);
             return createApiErrorResponse(new Error("Character already in room"), "This character is already in the room.");
        }

        // Find an available slot in the room
        const availableSlotIndex = room.setup_slots.findIndex(s => s.type === 'None' || !s.characterId);

        if (availableSlotIndex === -1) {
            return createApiErrorResponse(new Error("Room is full"), "This room is full, so you cannot join at the moment.");
        }

        // Create the new setup_slots array
        const newSetupSlots = [...room.setup_slots];
        newSetupSlots[availableSlotIndex] = {
            ...characterSlotToJoin,
            userId: userId,
            username: username,
            isReady: true // Assume ready on join
        };

        // Update participants
        const newParticipants = newSetupSlots
            .filter(slot => slot.characterId && slot.userId)
            .map(slot => ({
                userId: slot.userId!,
                characterId: slot.characterId!,
                lastActive: new Date().toISOString()
            }));

        // Update the room
        const { error } = await db.from("rooms").update({
            setup_slots: newSetupSlots,
            active_slots: newSetupSlots.filter(slot => slot.type === 'Human' || slot.type === 'AI').length,
            participants: newParticipants,
            updated_at: new Date().toISOString()
        }).eq("code", roomCode);

        if (error) {
            logger.error(`[roomCore.server] Error updating room slots:`, { error, roomCode, newSetupSlots });
            return json(
              {
                success: false,
                error: {
                  code: "DATABASE_ERROR",
                  message: "Failed to update room slots",
                  userMessage: "Could not update the room. Please try again.",
                  recoverySteps: ["Try joining the room again", "Contact support if issue persists"],
                  retryable: true,
                },
              },
              { status: 500 }
            );
        }

        logger.debug(`[roomCore.server] Room slots updated successfully for user join:`, { roomCode, newSetupSlots });
        
        await clearTemporaryPartySetup(userId); // Clear temporary party setup after successful room join
        
        return json(
          {
            success: true,
            redirectUrl: `/game?roomCode=${roomCode}`,
            roomCode: roomCode
          },
          { status: 200 }
        );
    }
    
    return createApiErrorResponse(new Error("Invalid intent"), "Invalid action intent");
}

/**
 * Deletes a room.
 */
export async function deleteRoom(roomCode: string, userId: string): Promise<void> {
    logger.debug(`[roomCore.server] deleteRoom: ${roomCode} by ${userId}`);
    
    const { error } = await db.from("rooms").delete().eq("code", roomCode).eq("owner_id", userId);
    
    if (error) {
        logger.error(`[roomCore.server] Error deleting room:`, { roomCode, userId, error });
        throw new Error("Failed to delete room");
    }
}

/**
 * Updates the status of a room.
 */
export async function updateRoomStatus(roomCode: string, newStatus: 'lobby' | 'scenario_selection' | 'scenario-selected' | 'active_game' | 'map_generation' | 'finished'): Promise<boolean> {
    logger.debug(`[roomCore.server] updateRoomStatus: ${roomCode} to ${newStatus}`);

    try {
        const { data, error } = await db.from("rooms").update({
            status: newStatus,
            updated_at: new Date().toISOString()
        }).eq("code", roomCode).select().single();

        if (error) {
            logger.error(`[roomCore.server] Error updating room status:`, { roomCode, newStatus, error });
            return false;
        }

        logger.debug(`[roomCore.server] updateRoomStatus: DB returned`, { roomCode, status: data?.status });
        return true;
    } catch (err) {
        logger.error(`[roomCore.server] Exception updating room status:`, { roomCode, newStatus, err });
        return false;
    }
}

/**
 * Updates the lastActive timestamp for a participant in a room.
 */
export async function updateParticipantActivity(roomCode: string, userId: string): Promise<DBRoom | null> {
    logger.debug(`[roomCore.server] updateParticipantActivity: ${roomCode} for ${userId}`);
    
    // Get current room data
    const room = await getRoomByCode(roomCode);
    if (!room) {
        logger.warn(`[roomCore.server] Room not found for activity update: ${roomCode}`);
        return null; // Return null if room not found
    }
    
    // Update participant activity
    const now = new Date().toISOString();
    let updatedParticipants = room.participants?.map(p => 
        p.userId === userId ? { ...p, lastActive: now } : p
    ) || [];
    
    // If user not in participants, add them (assuming they have an associated character, which needs to be handled carefully)
    if (!updatedParticipants.some(p => p.userId === userId)) {
        logger.debug(`[roomCore.server] User ${userId} not found in participants, adding as new participant.`);
        // This is a basic addition. In a real scenario, characterId would need to be passed or derived.
        updatedParticipants.push({
            userId,
            characterId: null, // No character assigned yet
            lastActive: now
        });
    }

    // Check if cleanup should run for this room (throttle to every 30 seconds)
    const nowTimestamp = Date.now();
    const lastCleanup = lastCleanupTimes.get(roomCode) || 0;
    const shouldRunCleanup = (nowTimestamp - lastCleanup) >= CLEANUP_THROTTLE_MS;

    let needsDBUpdate = false;
    let finalRoom = { ...room, participants: updatedParticipants, updated_at: now };

    if (shouldRunCleanup) {
        // Perform inactivity cleanup and get updated room state
        const cleanupResult = await calculateInactivityCleanup(room, userId);

        if (!cleanupResult || !cleanupResult.updatedRoom) {
            logger.error('[roomCore.server] Inactivity cleanup failed to return a valid room object.');
            // Fallback to the initial room state to avoid a crash
            return room;
        }

        const { updatedRoom: cleanedRoom, needsDBUpdate: cleanupNeedsUpdate } = cleanupResult;
        
        // Apply participant updates on top of cleaned participants
        const cleanedParticipants = cleanedRoom.participants || [];
        const finalParticipants = cleanedParticipants.map(p => 
            p.userId === userId ? { ...p, lastActive: now } : p
        );
        
        // If user not in cleaned participants, add them
        if (!finalParticipants.some(p => p.userId === userId)) {
            logger.debug(`[roomCore.server] User ${userId} not found in cleaned participants, adding as new participant.`);
            finalParticipants.push({
                userId,
                characterId: null, // No character assigned yet
                lastActive: now
            });
        }
        
        finalRoom = {
            ...cleanedRoom,
            participants: finalParticipants,
            updated_at: now
        };

        needsDBUpdate = cleanupNeedsUpdate;
        lastCleanupTimes.set(roomCode, nowTimestamp);
    } else {
        // Only update participant activity, no cleanup
        needsDBUpdate = true;
    }

    // Only update DB if changes are needed
    if (needsDBUpdate) {
        const { data, error } = await db.from("rooms").update(finalRoom).eq("code", roomCode).select().single();
        
        if (error) {
            logger.error(`[roomCore.server] Error updating participant activity:`, { roomCode, userId, error });
            throw new Error("Failed to update participant activity");
        }

        return data as DBRoom; // Return the updated room
    }

    // If no DB update needed, return the calculated room state
    return finalRoom;
}