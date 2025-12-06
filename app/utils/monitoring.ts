export function trackOperation(
  operationName: string,
  metadata?: Record<string, any>
) {
  const startTime = performance.now();
  
  return {
    success: () => {
      const duration = performance.now() - startTime;
      // Send to monitoring service (e.g., DataDog, New Relic)
      if (process.env.NODE_ENV === 'production') {
        // Track success metric
        // Example: datadog.gauge('operation.duration', duration, { operation: operationName, ...metadata });
      }
    },
    error: (error: Error) => {
      const duration = performance.now() - startTime;
      // Send error to monitoring service
      if (process.env.NODE_ENV === 'production') {
        // Track error metric
        // Example: datadog.increment('operation.error', 1, { operation: operationName, error: error.message, ...metadata });
      }
    }
  };
}