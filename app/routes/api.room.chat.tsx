import { json } from "@remix-run/node";
import { getRoomChatMessages, insertChatMessage } from "~/services/room.server";

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const roomCode = url.searchParams.get('roomCode');
  
  console.log(`[API CHAT] Received GET request for room: ${roomCode}`);
  
  if (!roomCode) {
    console.log(`[API CHAT] Missing room code`);
    return json({ error: "Missing room code" }, { status: 400 });
  }
  
  try {
    // Get recent chat messages for the room
    const messages = await getRoomChatMessages(roomCode, 100);
    
    console.log(`[API CHAT] Returning ${messages.length} messages for room: ${roomCode}`);
    return json({ 
      messages
    });
  } catch (error) {
    console.error("Error fetching chat messages:", error);
    return json({ error: "Failed to fetch chat messages" }, { status: 500 });
  }
}

export async function action({ request }: { request: Request }) {
  const formData = await request.formData();
  const intent = formData.get('intent');
  const roomCode = formData.get('roomCode')?.toString();
  const message = formData.get('message')?.toString();
  const userId = formData.get('userId')?.toString();
  const username = formData.get('username')?.toString();
  
  console.log(`[API CHAT] Received action: ${intent} for room: ${roomCode}, user: ${username}`);
  
  if (!roomCode || !message || !userId || !username) {
    console.log(`[API CHAT] Missing required fields`);
    return json({ error: "Missing required fields" }, { status: 400 });
  }
  
  if (intent === 'sendMessage') {
    try {
      const success = await insertChatMessage(roomCode, userId, username, message);
      
      if (success) {
        console.log(`[API CHAT] Message sent successfully for room: ${roomCode}`);
        return json({ success: true, message: "Message sent successfully" });
      } else {
        return json({ error: "Failed to send message" }, { status: 500 });
      }
    } catch (error) {
      console.error("Error sending chat message:", error);
      return json({ error: "Failed to send message" }, { status: 500 });
    }
  }
  
  return json({ error: "Invalid intent" }, { status: 400 });
}
