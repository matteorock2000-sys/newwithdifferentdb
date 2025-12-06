import { json } from "@remix-run/node";
import { getScenarioSuggestions, storeRoomScenarios, getRoomScenarios } from "~/services/room.server";

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const roomCode = url.searchParams.get('roomCode');
  
  console.log(`[API SCENARIOS] Received GET request for room: ${roomCode}`);
  
  if (!roomCode) {
    console.log(`[API SCENARIOS] Missing room code`);
    return json({ error: "Missing room code" }, { status: 400 });
  }
  
  try {
    // Fetch scenarios from the room cache
    const scenarios = await getRoomScenarios(roomCode);
    
    console.log(`[API SCENARIOS] Returning ${scenarios.length} scenarios for room: ${roomCode}`);
    return json({ scenarios });
  } catch (error) {
    console.error("Error fetching scenarios:", error);
    return json({ error: "Failed to fetch scenarios" }, { status: 500 });
  }
}