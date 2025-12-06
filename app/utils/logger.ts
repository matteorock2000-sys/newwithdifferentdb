export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

export interface LogContext {
  userId?: string;
  roomCode?: string;
  characterId?: string;
  [key: string]: any;
}

export function log(
  level: LogLevel,
  message: string,
  context?: LogContext
) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level: LogLevel[level],
    message,
    ...context
  };
  
  // In production, send to logging service (e.g., Sentry, LogRocket)
  if (process.env.NODE_ENV === 'production') {
    // Send to external service
    // Example: Sentry.captureMessage(message, { level: LogLevel[level], extra: context });
  } else {
    // Console log in development
    const logFn = level >= LogLevel.ERROR ? console.error :
                  level >= LogLevel.WARN ? console.warn :
                  console.log;
    logFn(JSON.stringify(logEntry));
  }
}