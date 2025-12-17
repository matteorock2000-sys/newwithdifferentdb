import { json } from "@remix-run/node";
import { getScenarioSuggestions } from "~/services/roomScenarios.server";
import { logger } from "~/utils/logger";

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const roomCode = url.searchParams.get('roomCode');
  
  // Reduce verbosity - only log when there's a room code
  if (!roomCode) {
    return json({ error: "Missing room code" }, { status: 400 });
  }
  
  try {
    const suggestions = await getScenarioSuggestions(roomCode);
    
    // Log only when there are suggestions
    if (suggestions.length > 0) {
      logger.debug(`[API SUGGESTIONS] Found ${suggestions.length} suggestions for room: ${roomCode}`);
    }
    
    // Return only the last suggestion for display
    const lastSuggestion = suggestions.length > 0 ? [suggestions[0]] : [];
    
    return json({ suggestions: lastSuggestion });
  } catch (error) {
    logger.error("Error fetching scenario suggestions", { error: error instanceof Error ? error.message : "Unknown error" });
    return json({ error: "Failed to fetch suggestions" }, { status: 500 });
  }
}

export async function action({ request }: { request: Request }) {
  const url = new URL(request.url);
  const roomCode = url.searchParams.get('roomCode');
  
  // Reduce verbosity - only log when there's a room code
  if (!roomCode) {
    return json({ error: "Missing room code" }, { status: 400 });
  }
  
  try {
    const suggestions = await getScenarioSuggestions(roomCode);
    
    // Log only when there are suggestions
    if (suggestions.length > 0) {
      logger.debug(`[API SUGGESTIONS] Found ${suggestions.length} suggestions for room: ${roomCode}`);
    }
    
    return json({ suggestions });
  } catch (error) {
    logger.error("Error fetching scenario suggestions", { error: error instanceof Error ? error.message : "Unknown error" });
    return json({ error: "Failed to fetch suggestions" }, { status: 500 });
  }
}