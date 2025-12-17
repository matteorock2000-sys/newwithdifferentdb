import React from "react";
import { logger } from "~/utils/logger";
import { reportError } from "~/utils/errorReporting";
import { useGlobalToast, showToast } from "~/utils/toast";

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  showRecoveryOptions?: boolean; // New prop
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ error, errorInfo });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Log error to console in development
    if (process.env.NODE_ENV === "development") {
      logger.error("ErrorBoundary caught an error", {
        error: error instanceof Error ? error.message : "Unknown error",
        errorInfo,
      });
    }

    // Report error to monitoring service
    reportError(error, {
      componentStack: errorInfo.componentStack,
      errorBoundary: true,
      userAgent: navigator.userAgent,
      url: window.location.href,
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  handleGoHome = () => {
    window.location.href = "/";
  };

  handleReportError = () => {
    // Send error to monitoring service (future integration)
    const errorReport = {
      message: this.state.error?.message,
      stack: this.state.error?.stack,
      componentStack: this.state.errorInfo?.componentStack,
      timestamp: new Date().toISOString(),
    };

    logger.error("User reported error", { errorReport });
    
    // Use the global toast system (without hook since we're in a class component)
    showToast("Error report sent. Thank you!", "success");
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-900">
          <div className="bg-red-900 bg-opacity-20 border border-red-600 rounded-lg p-8 max-w-md w-full">
            <div className="flex items-center justify-center w-16 h-16 bg-red-600 rounded-full mx-auto mb-4">
              <span className="text-white text-2xl">⚠️</span>
            </div>
            <h2 className="text-2xl font-bold text-red-400 text-center mb-2">
              Something went wrong
            </h2>
            <p className="text-gray-300 text-center mb-6">
              {this.getUserFriendlyMessage()}
            </p>

            {/* Recovery steps */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-red-400 mb-2">
                What you can do:
              </h3>
              <ul className="text-sm text-gray-300 space-y-1">
                <li>• Try refreshing the page</li>
                <li>• Go back to the home page</li>
                <li>• Check your internet connection</li>
                <li>• Report this error if it persists</li>
              </ul>
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  this.handleRetry();
                  showToast("Trying again...", "info");
                }}
                className="bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-4 rounded transition duration-200"
              >
                Try Again
              </button>
              <button
                onClick={() => {
                  window.location.reload();
                  showToast("Refreshing page...", "info");
                }}
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded transition duration-200"
              >
                Refresh Page
              </button>
              <button
                onClick={() => {
                  this.handleGoHome();
                  showToast("Going home...", "info");
                }}
                className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded transition duration-200"
              >
                Go Home
              </button>
              <button
                onClick={() => {
                  this.handleReportError();
                  showToast("Reporting error...", "info");
                }}
                className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded transition duration-200"
              >
                Report Error
              </button>
            </div>

            {/* Dev error details */}
            {process.env.NODE_ENV === "development" && (
              <details className="mt-4">
                <summary>Error Details (Dev)</summary>
                <pre>{this.state.error?.toString()}</pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }

  getUserFriendlyMessage(): string {
    const error = this.state.error;
    if (!error) return "An unexpected error occurred.";

    // Map common errors to user-friendly messages
    if (error.message.includes("network")) {
      return "Connection lost. Please check your internet.";
    }
    if (error.message.includes("quota")) {
      return "Service temporarily unavailable. Please try again in a few minutes.";
    }
    return "We apologize for the inconvenience. Please try again.";
  }
}

export default ErrorBoundary;