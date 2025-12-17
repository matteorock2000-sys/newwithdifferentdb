// Simplified test API endpoint to debug 503 errors
import { json } from "@remix-run/node";
import { getScenarioVotes, getScenarioVoteCounts, getRegenerateVoteCount } from "~/services/scenarioVoteService.server";
import { logger } from "~/utils/logger";

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const roomCode = url.searchParams.get("roomCode");
  
  logger.debug(`[TEST API VOTES] Received GET request for room: ${roomCode}`);
  
  if (!roomCode) {
    return json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Missing room code",
          userMessage: "The room code is required to fetch vote data.",
          recoverySteps: ["Check the room URL", "Refresh the page and try again"],
          retryable: false,
        },
      },
      { status: 400 }
    );
  }
  
  try {
    // Test without retry logic first
    const votes = await getScenarioVotes(roomCode);
    const voteCounts = await getScenarioVoteCounts(roomCode);
    const regenerateVoteCount = await getRegenerateVoteCount(roomCode);
    
    logger.debug(`[TEST API VOTES] Returning ${votes.length} votes for room: ${roomCode}`);
    
    return json({
      success: true,
      data: {
        votes,
        voteCounts,
        regenerateVoteCount,
      },
    });
  } catch (error) {
    logger.error("[TEST API VOTES] Error fetching votes:", { error });
    return json(
      {
        success: false,
        error: {
          code: "DATABASE_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
          userMessage: "Failed to fetch vote data. Please try again later.",
          recoverySteps: ["Refresh the page", "Check your internet connection", "Try again in a moment"],
          retryable: true,
        },
      },
      { status: 500 }
    );
  }
}
