import { db } from "~/services/db.server";
import { logger } from "~/utils/logger";

/**
 * Type definition for a chat message.
 */
export interface ChatMessage {
  id: string;
  user_id: string;
  username: string;
  message: string;
  created_at: string;
}

/**
 * Retrieves chat messages for a room.
 * @param roomCode - The code of the room.
 * @param limit - The maximum number of messages to retrieve.
 * @returns A promise that resolves with an array of ChatMessage.
 */
export async function getRoomChatMessages(roomCode: string, limit: number): Promise<ChatMessage[]> {
    logger.debug(`[roomChat.server] getRoomChatMessages: room ${roomCode}, limit ${limit}`);
    
    try {
        const { data, error } = await db.from("room_chat").select(`
            id,
            user_id,
            username,
            message,
            created_at
        `).eq("code", roomCode).order("created_at", { ascending: false }).limit(limit);
        
        if (error) {
            logger.error(`[roomChat.server] Error fetching chat messages:`, { roomCode, error });
            return [];
        }
        
        return (data || []) as ChatMessage[];
    } catch (error) {
        logger.error(`[roomChat.server] Exception fetching chat messages:`, { roomCode, error });
        return [];
    }
}

/**
 * Inserts a new chat message into a room.
 * @param roomCode - The code of the room.
 * @param userId - The ID of the user sending the message.
 * @param username - The username of the sender.
 * @param message - The content of the message.
 * @returns A promise that resolves when the message is inserted.
 */
export async function insertChatMessage(roomCode: string, userId: string, username: string, message: string): Promise<boolean> {
    logger.debug(`[roomChat.server] insertChatMessage: room ${roomCode}, user ${userId}, message ${message}`);
    
    try {
        const { error } = await db.from("room_chat").insert({
            code: roomCode,
            user_id: userId,
            username: username,
            message: message,
            created_at: new Date().toISOString()
        });
        
        if (error) {
            logger.error(`[roomChat.server] Error inserting chat message:`, { roomCode, userId, error });
            return false;
        }
        
        // Update the room_chat_last_updated timestamp
        const { error: updateError } = await db.from("rooms").update({
            room_chat_last_updated: new Date().toISOString()
        }).eq("code", roomCode);
        
        if (updateError) {
            logger.warn(`[roomChat.server] Error updating room_chat_last_updated:`, { roomCode, updateError });
        }
        
        return true;
    } catch (error) {
        logger.error(`[roomChat.server] Exception inserting chat message:`, { roomCode, userId, error });
        return false;
    }
}