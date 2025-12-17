import { logger } from "./logger";

export interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  backoffMultiplier?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: any, attempt: number) => boolean;
  onRetry?: (error: any, attempt: number) => void;
  timeoutMs?: number;
}

// Enhanced shouldRetry logic to handle various error types
function defaultShouldRetry(error: any, attempt: number): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const errorMessage = error.message || "";
  const errorCode = error.code || "";

  // Network errors
  if (
    errorMessage?.includes("ETIMEDOUT") ||
    errorMessage?.includes("ECONNRESET") ||
    errorMessage?.includes("ENOTFOUND") ||
    errorMessage?.includes("network") ||
    errorMessage?.includes("fetch") ||
    errorMessage?.includes("connection")
  ) {
    return true;
  }

  // API quota/rate limit errors
  if (
    errorMessage?.includes("quota") ||
    errorMessage?.includes("rate limit") ||
    errorMessage?.includes("429") ||
    errorMessage?.includes("503") ||
    errorMessage?.includes("too many requests") ||
    errorCode === "429" ||
    errorCode === "503"
  ) {
    return true;
  }

  // Gemini API specific errors
  if (
    errorMessage?.includes("GoogleGenerativeAI") ||
    errorMessage?.includes("gemini") ||
    errorMessage?.includes("API") ||
    errorMessage?.includes("quota exceeded")
  ) {
    return true;
  }

  // Database connection errors
  if (
    errorMessage?.includes("database") ||
    errorMessage?.includes("sql") ||
    errorMessage?.includes("connection") ||
    errorMessage?.includes("timeout") ||
    errorCode === "ETIMEDOUT" ||
    errorCode === "ECONNRESET"
  ) {
    return true;
  }

  // Service unavailable errors
  if (
    errorMessage?.includes("service unavailable") ||
    errorMessage?.includes("503") ||
    errorMessage?.includes("502") ||
    errorMessage?.includes("500")
  ) {
    return true;
  }

  // Timeout errors
  if (errorMessage?.includes("timeout") || error.name === "TimeoutError") {
    return true;
  }

  return false;
}

// Add jitter to prevent thundering herd
function applyJitter(delay: number): number {
  const jitter = Math.random() * 0.5; // 0-50% jitter
  return Math.floor(delay * (1 + jitter));
}

// Wrap operation with timeout
function withTimeout<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    operation()
      .then((result) => {
        clearTimeout(timeout);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

export async function retryOperation<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    delayMs = 1000,
    backoffMultiplier = 2,
    maxDelayMs = 10000,
    shouldRetry = defaultShouldRetry,
    onRetry,
    timeoutMs,
  } = options;

  let lastError: any;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const op = timeoutMs ? withTimeout(operation, timeoutMs) : operation();
      return await op;
    } catch (error) {
      lastError = error;
      
      // Don't retry on last attempt or if error is not retryable
      if (attempt === maxAttempts || !shouldRetry(error, attempt)) {
        logger.error("Operation failed after all retries", {
          error: error.message,
          attempts: attempt,
          maxAttempts,
        });
        throw error;
      }

      // Calculate delay with exponential backoff and jitter
      const baseDelay = Math.min(
        delayMs * Math.pow(backoffMultiplier, attempt - 1),
        maxDelayMs
      );
      const delayWithJitter = applyJitter(baseDelay);

      // Log retry attempt
      logger.info("Retrying operation", {
        attempt,
        maxAttempts,
        delayMs: delayWithJitter,
        error: error.message,
      });

      // Call retry callback if provided
      if (onRetry) {
        onRetry(error, attempt);
      }

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delayWithJitter));
    }
  }

  // This should never be reached, but just in case
  throw lastError;
}

// Convenience functions for common retry patterns
export const retryNetworkOperation = <T>(
  operation: () => Promise<T>,
  options: Omit<RetryOptions, "shouldRetry"> = {}
): Promise<T> =>
  retryOperation(operation, {
    ...options,
    shouldRetry: (error) => {
      // More aggressive retry for network operations
      return error?.message?.includes("network") ||
        error?.message?.includes("ETIMEDOUT") ||
        error?.message?.includes("ECONNRESET") ||
        error?.message?.includes("ENOTFOUND") ||
        error?.message?.includes("fetch") ||
        error?.code === "NETWORK_ERROR";
    },
  });

export const retryApiOperation = <T>(
  operation: () => Promise<T>,
  options: Omit<RetryOptions, "shouldRetry"> = {}
): Promise<T> =>
  retryOperation(operation, {
    ...options,
    shouldRetry: (error) => {
      // Retry on API errors (429, 503, 502, 500)
      return error?.status >= 500 ||
        error?.status === 429 ||
        error?.status === 503 ||
        error?.status === 502 ||
        error?.message?.includes("quota") ||
        error?.message?.includes("rate limit") ||
        error?.message?.includes("service unavailable");
    },
  });

export const retryDatabaseOperation = <T>(
  operation: () => Promise<T>,
  options: Omit<RetryOptions, "shouldRetry"> = {}
): Promise<T> =>
  retryOperation(operation, {
    ...options,
    shouldRetry: (error) => {
      // Retry on database connection issues and timeouts
      return error?.message?.includes("database") ||
        error?.message?.includes("sql") ||
        error?.message?.includes("connection") ||
        error?.message?.includes("timeout") ||
        error?.code?.includes("ETIMEDOUT") ||
        error?.code?.includes("ECONNRESET") ||
        error?.code === "23502" || // Not null constraint
        error?.code === "23503" || // Foreign key constraint
        error?.code === "23505" || // Unique constraint
        error?.code === "40001"; // Deadlock detected
    },
  });