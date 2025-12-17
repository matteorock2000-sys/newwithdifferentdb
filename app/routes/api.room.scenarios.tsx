import { json } from "@remix-run/node";
import { getRoomScenariosForVoting } from "~/services/roomScenarios.server";
import { getScenarioVoteCounts, getRegenerateVoteCount } from "~/services/scenarioVoteService.server";
import { createApiErrorResponse, detectErrorType } from "~/utils/errors";
import { retryOperation } from "~/utils/retry";

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const roomCode = url.searchParams.get("roomCode");
  
  // Validate required parameters
  if (!roomCode) {
    return json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Missing room code",
          userMessage: "The room code is required to fetch scenarios.",
          recoverySteps: ["Check the room URL", "Refresh the page and try again"],
          retryable: false,
        },
      },
      { status: 400 }
    );
  }
  
  try {
    console.log(`[API SCENARIOS] Fetching scenarios for room: ${roomCode}`);
    
    // First, check if the room exists
    const { getRoomByCode } = await import("~/services/roomCore.server");
    const room = await getRoomByCode(roomCode);
    
    if (!room) {
      console.log(`[API SCENARIOS] Room not found: ${roomCode}`);
      return json(
        {
          success: false,
          error: {
            code: "ROOM_NOT_FOUND",
            message: "Room not found",
            userMessage: "The game room could not be found.",
            recoverySteps: ["Check the room code", "Ask the host for a new invite"],
            retryable: false,
          },
        },
        { status: 404 }
      );
    }
    
    console.log(`[API SCENARIOS] Room found: ${roomCode}, scenarios: ${room.scenarios?.length || 0}`);
    
    // Use retry logic for fetching scenarios with exponential backoff
    const scenarios = await retryOperation(
      () => getRoomScenariosForVoting(roomCode),
      {
        maxAttempts: 3,
        delayMs: 1000,
        maxDelayMs: 5000,
        shouldRetry: (error) => {
          // Retry on network errors, database timeouts, and service unavailable
          const errorType = detectErrorType(error);
          return (
            errorType === "NETWORK_TIMEOUT" ||
            errorType === "DATABASE_ERROR" ||
            errorType === "API_QUOTA_EXCEEDED"
          );
        },
        onRetry: (error, attempt) => {
          console.log(`[API SCENARIOS] Retrying scenario fetch (attempt ${attempt}):`, error.message);
        },
      }
    );
    
    console.log(`[API SCENARIOS] Found ${scenarios.length} scenarios for room: ${roomCode}`);
    
    // Use retry logic for fetching vote counts - simplified without grouped votes for now
    const [voteCounts, regenerateVoteCount] = await Promise.all([
      retryOperation(() => getScenarioVoteCounts(roomCode), {
        maxAttempts: 2,
        delayMs: 500,
        shouldRetry: (error) => detectErrorType(error) === "NETWORK_TIMEOUT",
      }),
      retryOperation(() => getRegenerateVoteCount(roomCode), {
        maxAttempts: 2,
        delayMs: 500,
        shouldRetry: (error) => detectErrorType(error) === "NETWORK_TIMEOUT",
      }),
    ]);
    
    console.log(`[API SCENARIOS] Vote counts:`, voteCounts);
    console.log(`[API SCENARIOS] Regenerate votes:`, regenerateVoteCount);
    
    // Add vote counts to scenarios
    const scenariosWithVotes = scenarios.map((scenario) => ({
      ...scenario,
      votes: voteCounts[scenario.id] || 0,
    }));
    
    console.log(`[API SCENARIOS] Final scenarios with votes:`, scenariosWithVotes.length);
    
    return json({
      success: true,
      data: {
        scenarios: scenariosWithVotes,
        regenerateVoteCount,
      },
    });
  } catch (error) {
    console.error(`[API SCENARIOS] Error fetching scenarios:`, error);
    // Create standardized error response
    return createApiErrorResponse(error, `roomCode: ${roomCode}`);
  }
}
