export async function retryOperation<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number;
    delayMs?: number;
    backoffMultiplier?: number;
    shouldRetry?: (error: any) => boolean;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    delayMs = 1000,
    backoffMultiplier = 2,
    shouldRetry = (error) => 
      error?.message?.includes('ETIMEDOUT') || 
      error?.message?.includes('ECONNRESET')
  } = options;

  let lastError: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !shouldRetry(error)) {
        throw error;
      }
      await new Promise(resolve => 
        setTimeout(resolve, delayMs * Math.pow(backoffMultiplier, attempt - 1))
      );
    }
  }
  throw lastError;
}