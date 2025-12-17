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
  environment?: 'client' | 'server';
  [key: string]: any;
}

/**
 * Detects if code is running on client or server
 */
export function getLogEnvironment(): 'client' | 'server' {
  return typeof window === 'undefined' ? 'server' : 'client';
}

/**
 * Masks sensitive data in log context
 */
export function maskSensitiveData(data: any): any {
  if (!data) return data;
  
  const masked = { ...data };
  
  // Mask user IDs (show first 8 chars only)
  if (masked.userId) masked.userId = `${masked.userId.substring(0, 8)}...`;
  if (masked.currentUserId) masked.currentUserId = `${masked.currentUserId.substring(0, 8)}...`;
  
  // Mask room codes (show first 3 chars only)
  if (masked.roomCode) masked.roomCode = `${masked.roomCode.substring(0, 3)}***`;
  
  // Mask character IDs
  if (masked.characterId) masked.characterId = `${masked.characterId.substring(0, 8)}...`;
  
  return masked;
}

export function log(
  level: LogLevel,
  message: string,
  context?: LogContext
) {
  // In production, only log WARN and ERROR
  if (process.env.NODE_ENV === 'production' && level < LogLevel.WARN) {
    return;
  }
  
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level: LogLevel[level],
    message,
    environment: getLogEnvironment(),
    ...maskSensitiveData(context)
  };
  
  // Safe JSON stringify that handles circular references
  const safeStringify = (obj: any): string => {
    const seen = new WeakSet();
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      
      // Skip functions and DOM elements
      if (typeof value === 'function') {
        return '[Function]';
      }
      
      // Skip DOM elements (only available on client)
      if (typeof window !== 'undefined' && value instanceof Element) {
        return {
          tagName: value.tagName,
          id: value.id,
          className: value.className
        };
      }
      
      return value;
    });
  };
  
  if (process.env.NODE_ENV === 'production') {
    // In production, log WARN and ERROR to console as fallback
    const logFn = level >= LogLevel.ERROR ? console.error :
                  level >= LogLevel.WARN ? console.warn :
                  console.log;
    logFn(safeStringify(logEntry));
    
    // TODO: Wire to external service (Sentry, LogRocket, etc.)
    // Example: Sentry.captureMessage(message, { level: LogLevel[level], extra: context });
  } else {
    // Console log in development only
    const logFn = level >= LogLevel.ERROR ? console.error :
                  level >= LogLevel.WARN ? console.warn :
                  console.log;
    logFn(safeStringify(logEntry));
  }
}

/**
 * Helper methods for common log patterns
 */
export const logger = {
  debug: (message: string, context?: LogContext) => 
    log(LogLevel.DEBUG, message, context),
  
  info: (message: string, context?: LogContext) => 
    log(LogLevel.INFO, message, context),
  
  warn: (message: string, context?: LogContext) => 
    log(LogLevel.WARN, message, context),
  
  error: (message: string, context?: LogContext) => 
    log(LogLevel.ERROR, message, context),
};