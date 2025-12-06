import { json } from "@remix-run/node";
import { getScenarioSuggestions } from "~/services/room.server";

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const roomCode = url.searchParams.get('roomCode');
  
  console.log(`[API SUGGESTIONS] Received GET request for room: ${roomCode}`);
  
  if (!roomCode) {
    console.log(`[API SUGGESTIONS] Missing room code`);
    return json({ error: "Missing room code" }, { status: 400 });
  }
  
  try {
    console.log(`[API SUGGESTIONS] Fetching suggestions for room: ${roomCode}`);
    const suggestions = await getScenarioSuggestions(roomCode);
    console.log(`[API SUGGESTIONS] Found ${suggestions.length} suggestions for room: ${roomCode}`);
    
    // Return only the last suggestion for display
    const lastSuggestion = suggestions.length > 0 ? [suggestions[0]] : [];
    
    return json({ suggestions: lastSuggestion });
  } catch (error) {
    console.error("Error fetching scenario suggestions:", error);
    return json({ error: "Failed to fetch suggestions" }, { status: 500 });
  }
}

export async function action({ request }: { request: Request }) {
  const url = new URL(request.url);
  const roomCode = url.searchParams.get('roomCode');
  
  console.log(`[API SUGGESTIONS] Received POST request for room: ${roomCode}`);
  
  if (!roomCode) {
    console.log(`[API SUGGESTIONS] Missing room code`);
    return json({ error: "Missing room code" }, { status: 400 });
  }
  
  try {
    console.log(`[API SUGGESTIONS] Fetching suggestions for room: ${roomCode}`);
    const suggestions = await getScenarioSuggestions(roomCode);
    console.log(`[API SUGGESTIONS] Found ${suggestions.length} suggestions for room: ${roomCode}`);
    return json({ suggestions });
  } catch (error) {
    console.error("Error fetching scenario suggestions:", error);
    return json({ error: "Failed to fetch suggestions" }, { status: 500 });
  }
}