import { supabaseClient } from "~/entry.client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { type DBRoom } from "./room.server";

type RoomUpdatePayload = {
  eventType: "UPDATE";
  schema: "public";
  table: "rooms";
  commitTimestamp: string;
  errors: any[];
  old: DBRoom;
  new: DBRoom;
};

// Map to store room channels with their callbacks
const channels = new Map<string, { channel: RealtimeChannel; callbacks: Array<(payload: RoomUpdatePayload) => void> }>();

export function subscribeToRoomChanges(
  roomCode: string,
  callback: (payload: RoomUpdatePayload) => void
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
        (payload) => {
          console.log("Realtime room update received:", payload);
          // Invoke all registered callbacks for this room
          const roomData = channels.get(roomCode);
          if (roomData) {
            roomData.callbacks.forEach(cb => {
              try {
                cb(payload as RoomUpdatePayload);
              } catch (error) {
                console.error("Error in room callback:", error);
              }
            });
          }
        }
      )
      .subscribe((status) => {
        console.log(`Supabase Realtime channel status for room ${roomCode}:`, status);
        if (status === "SUBSCRIBED") {
          console.log(`Successfully subscribed to room ${roomCode} changes.`);
        } else if (status === "CHANNEL_ERROR") {
          console.error(`Error subscribing to room ${roomCode} channel.`);
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
        console.log(`Unsubscribing from room ${roomCode} changes.`);
        supabaseClient.removeChannel(roomData.channel);
        channels.delete(roomCode);
      }
    }
  };
}

export function unsubscribeFromAllRoomChanges() {
  console.log("Unsubscribing from all room changes.");
  channels.forEach((channel) => supabaseClient.removeChannel(channel));
  channels.clear();
}