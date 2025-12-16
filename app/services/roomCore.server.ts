import { redirect, json } from "@remix-run/node";
import { db } from "~/services/db.server";
import type { PlayerSlot, Room, Character, ScenarioForDisplay, DiceRollingState, DBRoom, RoomParticipant } from "~/types"; // Import DBRoom, RoomParticipant from ~/types
import { logger } from "~/utils/logger";
import { requireUser } from "~/services/auth.server"; // Assuming auth.server exports requireUser
import { calculateInactivityCleanup, persistRoomUpdate, cleanupRoomsBeforeFetch } from "./roomCleanup.server"; // Import cleanup functions
import { createApiErrorResponse, createErrorResponse } from "~/utils/errors";
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
        
        // Create room
        const { data, error } = await db.from("rooms").insert({
            name: roomName,
            code: code,
            owner_id: userId,
            user_id: userId,
            host_id: userId,
            status: "lobby",
            participants: [],
            setup_slots: [],
            active_slots: 0,
            maxplayers: 4
        }).select().single();
        
        if (error) {
            logger.error(`[roomCore.server] Error creating room:`, { error });
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
        
        return redirect(`/game?roomCode=${code}`);
    }
    
    if (intent === "joinRoom") {
        if (!roomCode) {
            return createApiErrorResponse(new Error("Room code is required"), "Missing room code");
        }
        
        const room = await getRoomByCode(roomCode);
        if (!room) {
            return createApiErrorResponse(new Error("Room not found"), "Room not found");
        }
        
        return redirect(`/game?roomCode=${roomCode}`);
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
export async function updateRoomStatus(roomCode: string, newStatus: 'lobby' | 'scenario_selection' | 'scenario-selected' | 'active_game' | 'finished'): Promise<boolean> {
    logger.debug(`[roomCore.server] updateRoomStatus: ${roomCode} to ${newStatus}`);
    
    const { data, error } = await db.from("rooms").update({
        status: newStatus,
        updated_at: new Date().toISOString()
    }).eq("code", roomCode).select().single();
    
    if (error) {
        logger.error(`[roomCore.server] Error updating room status:`, { roomCode, newStatus, error });
        return false;
    }
    
    return true;
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
        const { updatedRoom: cleanedRoom, needsDBUpdate: cleanupNeedsUpdate } = calculateInactivityCleanup(room, userId);
        
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