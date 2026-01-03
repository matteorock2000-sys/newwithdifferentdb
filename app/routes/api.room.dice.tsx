import type { ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { requireUser } from '~/services/auth.server';
import { 
  recordDiceRoll, 
  getRoomDiceResults, 
  checkTiebreakerCompletion,
  clearRoomDiceRolls,
  getPlayerSlotInfo,
  startDiceRolling,
  getDiceRollingState
} from '~/services/roomDice.server';
import { logger } from '~/utils/logger';
import { createApiErrorResponse, detectErrorType } from '~/utils/errors';
import { retryOperation } from '~/utils/retry';

/**
 * Handle dice roll actions for tiebreakers and other game mechanics
 */
export async function action({ request }: ActionFunctionArgs) {
  logger.debug(`[DICE API] Dice API action called with method: ${request.method}`);
  
  try {
    const user = await requireUser(request);
    logger.debug(`[DICE API] User authenticated: ${user.id}`);
    
    const formData = await request.formData();
    const intent = formData.get("intent")?.toString();
    const roomCode = formData.get("roomCode")?.toString();
    
    logger.debug(`[DICE API] Intent: ${intent}, RoomCode: ${roomCode}`);
    
    // Validate required fields
    if (!roomCode) {
      return json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Missing room code",
            userMessage: "The room code is required to perform dice actions.",
            recoverySteps: ["Check the room URL", "Refresh the page and try again"],
            retryable: false,
          },
        },
        { status: 400 }
      );
    }

    if (!intent) {
      return json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Missing intent",
            userMessage: "The action type is required.",
            recoverySteps: ["Check the action", "Try again"],
            retryable: false,
          },
        },
        { status: 400 }
      );
    }

    switch (intent) {
      case "startDiceRolling": {
        // Use retry for starting dice rolling
        const success = await retryOperation(
          () => startDiceRolling(roomCode),
          {
            maxAttempts: 2,
            delayMs: 300,
            shouldRetry: (error) => detectErrorType(error) === "NETWORK_TIMEOUT",
            onRetry: (error, attempt) => {
              logger.info("Retrying dice rolling start", {
                roomCode,
                attempt,
                error: error.message,
              });
            },
          }
        );

        return json({ success });
      }

      case "getDiceRollingState": {
        logger.debug(`[DICE API] Processing getDiceRollingState intent`);
        try {
          logger.debug(`[DICE API] getDiceRollingState called for room: ${roomCode}`);
          const diceRollingState = await retryOperation(
            () => getDiceRollingState(roomCode),
            {
              maxAttempts: 3,
              delayMs: 500,
              shouldRetry: (error) => {
                const errorType = detectErrorType(error);
                logger.debug(`[DICE API] Retry check for getDiceRollingState: ${errorType}`);
                return (
                  errorType === "NETWORK_TIMEOUT" ||
                  errorType === "DATABASE_ERROR"
                );
              },
            }
          );

          logger.debug(`[DICE API] getDiceRollingState result:`, { success: !!diceRollingState, hasState: !!diceRollingState });
          return json({ success: !!diceRollingState, diceRollingState });
        } catch (error) {
          logger.error("[DICE API] Error fetching dice rolling state", {
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
                diceRollingState: null,
              },
              { status: 200 }
            );
          }

          return json(
            {
              success: false,
              error: {
                code: "DICE_ROLL_FAILED",
                message: "Failed to fetch dice state due to server error",
                userMessage: "Could not load dice rolling state.",
                recoverySteps: [
                  "Check your internet connection",
                  "Try refreshing the page",
                ],
                retryable: true,
              },
              diceRollingState: null,
            },
            { status: 503 }
          );
        }
      }

      case "rollDice": {
        const slotIndex = parseInt(formData.get("slotIndex")?.toString() || "0");
        const diceResult = parseInt(formData.get("diceResult")?.toString() || "1");
        const diceType = formData.get("diceType")?.toString() || "d20";
        const rollReason = formData.get("rollReason")?.toString() || "tiebreaker";
        const userIdForSlot = formData.get("userIdForSlot")?.toString();

        if (!userIdForSlot) {
          return json(
            {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "Missing userId for slot",
                userMessage: "User ID is required to record dice roll.",
                recoverySteps: ["Check your login", "Refresh the page"],
                retryable: false,
              },
            },
            { status: 400 }
          );
        }

        if (!diceResult || diceResult < 1 || diceResult > 20) {
          return json(
            {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "Invalid dice result",
                userMessage: "Dice result must be between 1 and 20.",
                recoverySteps: ["Check your dice roll", "Try again"],
                retryable: false,
              },
            },
            { status: 400 }
          );
        }

        // Use retry for recording dice roll
        const success = await retryOperation(
          () =>
            recordDiceRoll(
              roomCode,
              userIdForSlot,
              "Human", // slotType is not used meaningfully in recordDiceRoll
              slotIndex,
              diceResult,
              diceType,
              rollReason
            ),
          {
            maxAttempts: 2,
            delayMs: 300,
            shouldRetry: (error) => detectErrorType(error) === "NETWORK_TIMEOUT",
            onRetry: (error, attempt) => {
              logger.info("Retrying dice roll recording", {
                roomCode,
                slotIndex,
                attempt,
                error: error.message,
              });
            },
          }
        );

        if (!success) {
          return json(
            {
              success: false,
              error: {
                code: "DICE_ROLL_FAILED",
                message: "Failed to record dice roll",
                userMessage: "Could not save your dice roll.",
                recoverySteps: [
                  "Try rolling again",
                  "Check your internet connection",
                ],
                retryable: true,
              },
            },
            { status: 503 }
          );
        }

        // The completion status is now part of the dice_rolling_state
        const state = await getDiceRollingState(roomCode);

        return json({
          success: true,
          message: `Rolled ${diceResult} for slot ${slotIndex}`,
          diceResult,
          state,
        });
      }

      case "getDiceResults": {
        const results = await getRoomDiceResults(roomCode);
        const completionStatus = await checkTiebreakerCompletion(roomCode);

        return json({
          success: true,
          results,
          completionStatus,
        });
      }

      case "checkCompletion": {
        const completionStatus = await checkTiebreakerCompletion(roomCode);

        return json({
          success: true,
          completionStatus,
        });
      }

      case "clearDiceRolls": {
        const success = await retryOperation(
          () => clearRoomDiceRolls(roomCode),
          {
            maxAttempts: 2,
            delayMs: 300,
            shouldRetry: (error) => detectErrorType(error) === "NETWORK_TIMEOUT",
          }
        );

        if (!success) {
          return json(
            {
              success: false,
              error: {
                code: "DICE_ROLL_FAILED",
                message: "Failed to clear dice rolls",
                userMessage: "Could not clear dice rolls.",
                recoverySteps: [
                  "Try again",
                  "Refresh the page if issue persists",
                ],
                retryable: true,
              },
            },
            { status: 503 }
          );
        }

        return json({
          success: true,
          message: "Cleared all dice rolls for the room.",
        });
      }

      case "getSlotInfo": {
        const slotInfo = await getPlayerSlotInfo(roomCode, user.id);

        return json({
          success: true,
          slotInfo,
        });
      }

      default:
        return json(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Unknown intent",
              userMessage: "Unknown action requested.",
              recoverySteps: ["Check the action", "Try again"],
              retryable: false,
            },
          },
          { status: 400 }
        );
    }
  } catch (error) {
    logger.error("[DICE API] Error handling dice action", {
      error: error instanceof Error ? error.message : "Unknown error",
    });

    // Create standardized error response
    return createApiErrorResponse(error, `roomCode: ${roomCode}, intent: ${intent}`);
  }
}