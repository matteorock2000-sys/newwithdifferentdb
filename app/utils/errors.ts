import { json } from "@remix-run/node";
import { logger } from "./logger";

// Standardized error response format
export interface StandardErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    userMessage: string;
    recoverySteps: string[];
    retryable: boolean;
  };
}

// Error catalog with user-friendly messages and recovery guidance
export const ERROR_CATALOG = {
  ROOM_NOT_FOUND: {
    code: "ROOM_NOT_FOUND",
    message: "Room not found",
    userMessage: "The game room could not be found.",
    recoverySteps: ["Check the room code", "Ask the host for a new invite"],
    retryable: false,
  },
  NETWORK_TIMEOUT: {
    code: "NETWORK_TIMEOUT",
    message: "Network request timed out",
    userMessage: "Connection timed out. Please check your internet.",
    recoverySteps: ["Check your internet connection", "Try again in a moment"],
    retryable: true,
  },
  API_QUOTA_EXCEEDED: {
    code: "API_QUOTA_EXCEEDED",
    message: "API quota exceeded",
    userMessage: "Service temporarily unavailable due to high demand.",
    recoverySteps: ["Wait a few minutes", "Try again later"],
    retryable: true,
  },
  SCENARIO_GENERATION_FAILED: {
    code: "SCENARIO_GENERATION_FAILED",
    message: "Failed to generate scenarios",
    userMessage: "Could not generate adventure scenarios.",
    recoverySteps: [
      "Try generating again",
      "Use a different character",
      "Check your internet connection",
    ],
    retryable: true,
  },
  MAP_GENERATION_FAILED: {
    code: "MAP_GENERATION_FAILED",
    message: "Failed to generate map",
    userMessage: "Could not generate the battle map.",
    recoverySteps: [
      "Try regenerating the map",
      "Continue without a custom map",
    ],
    retryable: true,
  },
  SLOT_UPDATE_FAILED: {
    code: "SLOT_UPDATE_FAILED",
    message: "Failed to update slot",
    userMessage: "Could not save your character selection.",
    recoverySteps: [
      "Try selecting again",
      "Refresh the page if issue persists",
    ],
    retryable: true,
  },
  UNAUTHORIZED: {
    code: "UNAUTHORIZED",
    message: "Unauthorized access",
    userMessage: "You need to be logged in to do that.",
    recoverySteps: ["Log in to your account", "Create a new account"],
    retryable: false,
  },
  VALIDATION_ERROR: {
    code: "VALIDATION_ERROR",
    message: "Validation failed",
    userMessage: "The information provided is invalid.",
    recoverySteps: ["Check your input", "Try again with valid data"],
    retryable: false,
  },
  DATABASE_ERROR: {
    code: "DATABASE_ERROR",
    message: "Database operation failed",
    userMessage: "A server error occurred. Please try again.",
    recoverySteps: [
      "Try again in a moment",
      "Contact support if issue persists",
    ],
    retryable: true,
  },
  CHARACTER_IMPORT_FAILED: {
    code: "CHARACTER_IMPORT_FAILED",
    message: "Failed to import character",
    userMessage: "Could not import your character sheet.",
    recoverySteps: [
      "Check the character sheet format",
      "Try again with a different file",
      "Contact support if issue persists",
    ],
    retryable: true,
  },
  HEARTBEAT_FAILED: {
    code: "HEARTBEAT_FAILED",
    message: "Heartbeat failed",
    userMessage: "Connection to game server lost.",
    recoverySteps: [
      "Check your internet connection",
      "Refresh the page",
      "Rejoin the game room",
    ],
    retryable: true,
  },
  DICE_ROLL_FAILED: {
    code: "DICE_ROLL_FAILED",
    message: "Dice roll failed",
    userMessage: "Could not roll the dice.",
    recoverySteps: [
      "Try rolling again",
      "Check your internet connection",
      "Use manual dice if issue persists",
    ],
    retryable: true,
  },
  CHAT_SEND_FAILED: {
    code: "CHAT_SEND_FAILED",
    message: "Failed to send message",
    userMessage: "Could not send your message.",
    recoverySteps: [
      "Check your internet connection",
      "Try sending again",
      "Refresh the page if issue persists",
    ],
    retryable: true,
  },
  VOTE_CAST_FAILED: {
    code: "VOTE_CAST_FAILED",
    message: "Failed to cast vote",
    userMessage: "Could not save your vote.",
    recoverySteps: [
      "Try voting again",
      "Check your internet connection",
      "Refresh the page if issue persists",
    ],
    retryable: true,
  },
} as const;

// Helper to create standardized error responses
export function createErrorResponse(
  errorType: keyof typeof ERROR_CATALOG,
  additionalContext?: string
): StandardErrorResponse {
  const error = ERROR_CATALOG[errorType];
  return {
    success: false,
    error: {
      ...error,
      message: additionalContext
        ? `${error.message}: ${additionalContext}`
        : error.message,
    },
  };
}

// Helper to detect error type from exception
export function detectErrorType(error: unknown): keyof typeof ERROR_CATALOG {
  if (!error || typeof error !== "object") {
    return "DATABASE_ERROR";
  }

  const errorMessage = (error as any)?.message || "";
  const errorCode = (error as any)?.code || "";

  // Network timeout errors
  if (
    errorMessage?.includes("ETIMEDOUT") ||
    errorMessage?.includes("ECONNRESET") ||
    errorMessage?.includes("ENOTFOUND") ||
    errorMessage?.includes("timeout") ||
    errorMessage?.includes("network")
  ) {
    return "NETWORK_TIMEOUT";
  }

  // API quota/rate limit errors
  if (
    errorMessage?.includes("quota") ||
    errorMessage?.includes("rate limit") ||
    errorMessage?.includes("429") ||
    errorMessage?.includes("503") ||
    errorMessage?.includes("too many requests")
  ) {
    return "API_QUOTA_EXCEEDED";
  }

  // Unauthorized errors
  if (
    errorCode === "UNAUTHORIZED" ||
    errorMessage?.includes("unauthorized") ||
    errorMessage?.includes("not logged in")
  ) {
    return "UNAUTHORIZED";
  }

  // Room not found errors
  if (
    errorMessage?.includes("room not found") ||
    errorMessage?.includes("room not found") ||
    errorMessage?.includes("invalid room")
  ) {
    return "ROOM_NOT_FOUND";
  }

  // Scenario generation errors - be more specific to avoid false positives
  if (
    errorMessage?.includes("SCENARIO_GENERATION_FAILED") || // Explicit error code
    errorMessage?.includes("gemini") ||
    errorMessage?.includes("AI generation") ||
    errorMessage?.includes("scenario generation")
  ) {
    return "SCENARIO_GENERATION_FAILED";
  }

  // Map generation errors - be more specific to avoid false positives
  if (
    errorMessage?.includes("MAP_GENERATION_FAILED") || // Explicit error code
    errorMessage?.includes("freepik") ||
    errorMessage?.includes("map image")
  ) {
    return "MAP_GENERATION_FAILED";
  }

  // Character import errors - be more specific to avoid false positives
  if (
    errorMessage?.includes("CHARACTER_IMPORT_FAILED") || // Explicit error code
    errorMessage?.includes("character sheet") ||
    errorMessage?.includes("import character")
  ) {
    return "CHARACTER_IMPORT_FAILED";
  }

  // Dice roll errors - be more specific to avoid false positives
  if (
    errorMessage?.includes("DICE_ROLL_FAILED") || // Explicit error code
    errorMessage?.includes("dice roll")
  ) {
    return "DICE_ROLL_FAILED";
  }

  // Chat errors - be more specific to avoid false positives
  if (
    errorMessage?.includes("CHAT_SEND_FAILED") || // Explicit error code
    errorMessage?.includes("send message")
  ) {
    return "CHAT_SEND_FAILED";
  }

  // Vote errors - be more specific to avoid false positives
  if (
    errorMessage?.includes("VOTE_CAST_FAILED") || // Explicit error code
    errorMessage?.includes("cast vote")
  ) {
    return "VOTE_CAST_FAILED";
  }

  // Database errors
  if (
    errorMessage?.includes("database") ||
    errorMessage?.includes("sql") ||
    errorMessage?.includes("connection") ||
    errorCode === "23505" || // Unique constraint violation
    errorCode === "23503" || // Foreign key constraint violation
    errorCode === "23502" // Not null constraint violation
  ) {
    return "DATABASE_ERROR";
  }

  // Default to database error for unknown server errors
  return "DATABASE_ERROR";
}

// Helper to mask sensitive data in error logs
export function sanitizeErrorForLogging(error: unknown): object {
  if (!error || typeof error !== "object") {
    return { error };
  }

  const sanitized: any = {};

  // Copy safe properties
  const safeProperties = ["message", "stack", "code", "name"];
  for (const prop of safeProperties) {
    if (prop in error) {
      const value = (error as any)[prop];
      // Mask sensitive information
      if (typeof value === "string") {
        sanitized[prop] = value
          .replace(/password/gi, "[REDACTED]")
          .replace(/token/gi, "[REDACTED]")
          .replace(/secret/gi, "[REDACTED]")
          .replace(/key/gi, "[REDACTED]")
          .replace(/session/gi, "[REDACTED]");
      } else {
        sanitized[prop] = value;
      }
    }
  }

  // Add timestamp
  sanitized.timestamp = new Date().toISOString();

  return sanitized;
}

// Helper to create API response with standardized error format
export function createApiErrorResponse(
  error: unknown,
  additionalContext?: string
) {
  const errorType = detectErrorType(error);
  const errorResponse = createErrorResponse(errorType, additionalContext);

  // Log the error with context
  logger.error("API error occurred", {
    errorType,
    error: sanitizeErrorForLogging(error),
    additionalContext,
  });

  // Determine status code based on error type
  const statusCode =
    errorResponse.error.retryable && errorType !== "UNAUTHORIZED"
      ? 503 // Service Unavailable for retryable errors
      : errorType === "UNAUTHORIZED"
        ? 401
        : errorType === "VALIDATION_ERROR"
          ? 400
          : 500;

  return json(errorResponse, { status: statusCode });
}

// Helper to check if error is retryable
export function isRetryableError(error: unknown): boolean {
  const errorType = detectErrorType(error);
  return ERROR_CATALOG[errorType].retryable;
}
