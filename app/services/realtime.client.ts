import { supabaseClient } from "~/entry.client";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js"; // Import RealtimePostgresChangesPayload
import { logger } from "~/utils/logger";
import type { DBRoom, RoomUpdatePayload, RoomUpdateType, DiceRollingState, ScenarioVote, ScenarioForDisplay, PlayerSlot } from "~/types"; // DBRoom is now imported from ~/types

// SupabaseRealtimePayload now uses DBRoom from ~/types.ts
type SupabaseRealtimePayload = RealtimePostgresChangesPayload<DBRoom>;

// Map to store room channels with their callbacks
const channels = new Map<string, { channel: RealtimeChannel; callbacks: Array<(payload: RoomUpdatePayload) => void> }>();

export function subscribeToRoomChanges(
  roomCode: string,
  callback: (payload: RoomUpdatePayload) => void,
  statusCallback?: (status: string) => void
): () => void {
  let roomData = channels.get(roomCode);
  
  if (!roomData) {
    // Create new channel for this room
    const channel = supabaseClient
      .channel(`room:${roomCode}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rooms",
          filter: `code=eq.${roomCode}`,
        },
        (payload: SupabaseRealtimePayload) => { // Use SupabaseRealtimePayload
          logger.debug("Realtime room update received:", { payload });
          
          const oldRoom = payload.old as DBRoom | null; // Explicitly cast to DBRoom | null
          const newRoom = payload.new as DBRoom | null; // Explicitly cast to DBRoom | null

          // Ensure both old and new room data exist for comparison, otherwise return
          if (!oldRoom || !newRoom) {
            logger.warn("Realtime update received without both old and new room data. Skipping transformation.", { payload });
            return;
          }

          const transformedPayload: RoomUpdatePayload = {
            type: 'room_status_updated', // Default type, will be more specific below
            data: {
              roomCode: newRoom.code,
              newRoom: newRoom, // Pass the entire new room for context
            }
          };

          // Determine the specific type of update based on changes
          if (oldRoom.scenarios !== newRoom.scenarios) {
            transformedPayload.type = 'scenarios_updated';
            transformedPayload.data.scenarios = newRoom.scenarios;
          } else if (oldRoom.dice_rolling_state !== newRoom.dice_rolling_state) {
            transformedPayload.type = 'dice_updated';
            transformedPayload.data.diceState = newRoom.dice_rolling_state;
            transformedPayload.data.diceRolls = newRoom.dice_rolling_state?.rolls; // Assuming rolls are part of state
            transformedPayload.data.diceRollComplete = newRoom.dice_rolling_state?.status === 'completed';
            transformedPayload.data.showDiceRoll = true; // Assuming we always show roll on update
            transformedPayload.data.isInitializingDice = false;
            transformedPayload.data.winningScenarioFromDice = newRoom.scenarios?.find(s => s.id === newRoom.scenario_winner_id) || null; // Infer winner
          } else if (oldRoom.participants !== newRoom.participants || oldRoom.setup_slots !== newRoom.setup_slots) {
            transformedPayload.type = 'participants_updated';
            transformedPayload.data.party = newRoom.setup_slots; // Pass updated slots as party
          } else if (oldRoom.room_chat_last_updated !== newRoom.room_chat_last_updated) {
            transformedPayload.type = 'chat_updated';
            // Chat message updates will be fetched separately or included if needed.
          } else if (oldRoom.status !== newRoom.status) {
            transformedPayload.type = 'room_status_updated';
          }
          
          // Invoke all registered callbacks for this room
          const roomData = channels.get(roomCode);
          if (roomData) {
            roomData.callbacks.forEach(cb => {
              try {
                cb(transformedPayload); // Pass the transformed payload
              } catch (error) {
                logger.error("Error in room callback", { error: error instanceof Error ? error.message : "Unknown error" });
              }
            });
          }
        }
      )
      .subscribe((status: string) => { // Explicitly type status
        logger.debug(`Supabase Realtime channel status for room ${roomCode}:`, { status });
        if (status === "SUBSCRIBED") {
          logger.debug(`Successfully subscribed to room ${roomCode} changes.`);
        } else if (status === "CHANNEL_ERROR") {
          logger.error(`Error subscribing to room ${roomCode} channel`);
        }
        
        // Call status callback if provided
        if (statusCallback) {
          statusCallback(status);
        }
      });

    roomData = { channel, callbacks: [] };
    channels.set(roomCode, roomData);
  }

  // Add callback to the list
  roomData.callbacks.push(callback);

  // Return unsubscribe function
  return () => {
    const roomData = channels.get(roomCode);
    if (roomData) {
      // Remove this specific callback
      roomData.callbacks = roomData.callbacks.filter(cb => cb !== callback);
      
      // If no more callbacks, remove the channel
      if (roomData.callbacks.length === 0) {
        logger.debug(`Unsubscribing from room ${roomCode} changes.`);
        supabaseClient.removeChannel(roomData.channel); // Fix: Pass the channel object directly
        channels.delete(roomCode);
      }
    }
  };
}

export function unsubscribeFromAllRoomChanges() {
  logger.debug("Unsubscribing from all room changes.");
  channels.forEach((roomData) => supabaseClient.removeChannel(roomData.channel)); // Fix: Pass the channel object directly
  channels.clear();
}