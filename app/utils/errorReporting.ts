import { logger } from "./logger";

// Interface for error reports
export interface ErrorReport {
  message: string;
  stack?: string;
  context?: Record<string, any>;
  userId?: string;
  timestamp: string;
  url?: string;
  userAgent?: string;
  level: "error" | "warning" | "info";
}

// Interface for performance reports
export interface PerformanceReport {
  type: "performance";
  name: string;
  duration: number;
  context?: Record<string, any>;
  timestamp: string;
}

// Interface for user action reports
export interface UserActionReport {
  type: "user_action";
  action: string;
  context?: Record<string, any>;
  timestamp: string;
  userId?: string;
}

// Combined report type
export type Report = ErrorReport | PerformanceReport | UserActionReport;

// Configuration for error reporting
interface ErrorReportingConfig {
  enabled: boolean;
  environment: "development" | "production" | "staging";
  sampleRate: number; // 0-1, percentage of errors to report
  maxContextSize: number; // Maximum size of context object
  endpoints: {
    errors: string;
    performance: string;
    userActions: string;
  };
}

// Default configuration
const DEFAULT_CONFIG: ErrorReportingConfig = {
  enabled: process.env.NODE_ENV === "production",
  environment: (process.env.NODE_ENV as any) || "development",
  sampleRate: 1.0,
  maxContextSize: 100,
  endpoints: {
    errors: "/api/error-report",
    performance: "/api/performance-report",
    userActions: "/api/user-action-report",
  },
};

// Current configuration
let config = { ...DEFAULT_CONFIG };

// Update configuration
export function configureErrorReporting(
  newConfig: Partial<ErrorReportingConfig>
) {
  config = { ...config, ...newConfig };
}

// Sanitize context to prevent sensitive data leakage
function sanitizeContext(context?: Record<string, any>): Record<string, any> {
  if (!context || typeof context !== "object") {
    return {};
  }

  const sanitized: Record<string, any> = {};
  let size = 0;

  for (const [key, value] of Object.entries(context)) {
    // Skip sensitive keys
    if (
      key.toLowerCase().includes("password") ||
      key.toLowerCase().includes("token") ||
      key.toLowerCase().includes("secret") ||
      key.toLowerCase().includes("key") ||
      key.toLowerCase().includes("session") ||
      key.toLowerCase().includes("cookie")
    ) {
      continue;
    }

    // Limit object size
    if (size >= config.maxContextSize) {
      break;
    }

    // Sanitize string values
    if (typeof value === "string") {
      sanitized[key] = value
        .replace(/password/gi, "[REDACTED]")
        .replace(/token/gi, "[REDACTED]")
        .replace(/secret/gi, "[REDACTED]")
        .replace(/key/gi, "[REDACTED]")
        .replace(/session/gi, "[REDACTED]")
        .replace(/cookie/gi, "[REDACTED]");
    } else if (typeof value === "object" && value !== null) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeContext(value);
    } else {
      sanitized[key] = value;
    }

    size++;
  }

  return sanitized;
}

// Report an error
export function reportError(
  error: Error,
  context?: Record<string, any>,
  level: "error" | "warning" | "info" = "error"
) {
  if (!config.enabled) {
    // Still log in development
    logger.error("Error reported", { error: error.message, context });
    return;
  }

  // Sample errors based on sample rate
  if (Math.random() > config.sampleRate) {
    return;
  }

  const report: ErrorReport = {
    type: "error",
    message: error.message,
    stack: error.stack,
    context: sanitizeContext(context),
    userId: context?.userId,
    timestamp: new Date().toISOString(),
    url: typeof window !== "undefined" ? window.location.href : undefined,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    level,
  };

  // Log locally
  logger.error("Error reported", { report });

  // Send to monitoring service
  sendReport(report);
}

// Report a warning
export function reportWarning(message: string, context?: Record<string, any>) {
  reportError(new Error(message), context, "warning");
}

// Report an info message
export function reportInfo(message: string, context?: Record<string, any>) {
  reportError(new Error(message), context, "info");
}

// Report performance metrics
export function reportPerformance(
  name: string,
  duration: number,
  context?: Record<string, any>
) {
  const report: PerformanceReport = {
    type: "performance",
    name,
    duration,
    context: sanitizeContext(context),
    timestamp: new Date().toISOString(),
  };

  logger.info("Performance reported", { report });

  if (config.enabled) {
    sendReport(report);
  }
}

// Report user actions
export function reportUserAction(
  action: string,
  context?: Record<string, any>,
  userId?: string
) {
  const report: UserActionReport = {
    type: "user_action",
    action,
    context: sanitizeContext(context),
    timestamp: new Date().toISOString(),
    userId,
  };

  logger.info("User action reported", { report });

  if (config.enabled) {
    sendReport(report);
  }
}

// Send report to monitoring service
async function sendReport(report: Report) {
  try {
    const endpoint =
      report.type === "error"
        ? config.endpoints.errors
        : report.type === "performance"
          ? config.endpoints.performance
          : config.endpoints.userActions;

    await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(report),
    });
  } catch (error) {
    // Don't report errors from the error reporting system
    logger.error("Failed to send report", { error: error.message });
  }
}

// Capture unhandled promise rejections
if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    reportError(
      new Error(
        `Unhandled Promise Rejection: ${event.reason?.message || event.reason}`
      ),
      {
        reason: event.reason,
        promise: event.promise,
      }
    );
  });

  // Capture global errors
  window.addEventListener("error", (event) => {
    reportError(
      new Error(`Global Error: ${event.message}`),
      {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error,
      }
    );
  });
}

// Export for backward compatibility
export { config as errorReportingConfig };
