import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { requireUser } from "~/services/auth.server";
import { updateParticipantActivity } from "~/services/roomCore.server";
import { logger } from "~/utils/logger";
import { createApiErrorResponse, detectErrorType } from "~/utils/errors";
import { retryOperation } from "~/utils/retry";

/**
 * Handles client-side pings to update participant activity status.
 * Also triggers cleanup of inactive participants in the room.
 */
export async function action({ request }: ActionFunctionArgs) {
  const userId = (await requireUser(request)).id;
  const formData = await request.formData();
  const roomCode = formData.get("roomCode")?.toString();

  if (!roomCode) {
    return json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Missing room code",
          userMessage: "Room code is required for heartbeat.",
          recoverySteps: ["Check the room URL", "Refresh the page"],
          retryable: false,
        },
      },
      { status: 400 }
    );
  }

  try {
    // Use retry logic for heartbeat with fast retries
    const updatedRoom = await retryOperation(
      () => updateParticipantActivity(roomCode, userId),
      {
        maxAttempts: 3,
        delayMs: 200,
        maxDelayMs: 1000,
        shouldRetry: (error) => {
          const errorType = detectErrorType(error);
          return (
            errorType === "NETWORK_TIMEOUT" ||
            errorType === "DATABASE_ERROR" ||
            errorType === "HEARTBEAT_FAILED"
          );
        },
        onRetry: (error, attempt) => {
          logger.info("Retrying heartbeat", {
            userId,
            roomCode,
            attempt,
            error: error.message,
          });
        },
      }
    );

    if (!updatedRoom) {
      // Room might have been deleted by cleanup or not found
      return json(
        {
          success: false,
          error: {
            code: "ROOM_NOT_FOUND",
            message: "Room not found or update failed",
            userMessage: "The game room could not be found.",
            recoverySteps: ["Check the room code", "Ask the host for a new invite"],
            retryable: false,
          },
        },
        { status: 404 }
      );
    }

    // Success response (we don't need to send back the whole room, just confirmation)
    return json({
      success: true,
      participantsCount: updatedRoom.participants.length,
      message: "Heartbeat successful",
    });
  } catch (error) {
    logger.error(`Heartbeat failed for user ${userId} in room ${roomCode}`, {
      error: error instanceof Error ? error.message : "Unknown error",
    });

    // Handle specific database timeout errors with graceful degradation
    if (error instanceof Error && error.message.includes("ETIMEDOUT")) {
      return json(
        {
          success: true,
          message:
            "Database temporarily unavailable, using offline mode",
          offlineMode: true,
          participantsCount: 0,
        },
        { status: 200 }
      );
    }

    // Create standardized error response
    return createApiErrorResponse(error, `userId: ${userId}, roomCode: ${roomCode}`);
  }
}
