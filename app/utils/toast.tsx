import { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from 'react';
import { logger } from './logger';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

interface ToastContextType {
  toasts: Toast[];
  showToast: (message: string, type?: Toast['type']) => void;
  hideToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useGlobalToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useGlobalToast must be used within a ToastProvider');
  }
  return context;
};

interface ToastProviderProps {
  children: ReactNode;
}

// Global toast state for non-React contexts
let globalToasts: Toast[] = [];
let globalSetToastsCallbacks: ((toasts: Toast[]) => void)[] = [];

export const addGlobalSetToastsCallback = (callback: (toasts: Toast[]) => void) => {
  globalSetToastsCallbacks.push(callback);
  return () => {
    globalSetToastsCallbacks = globalSetToastsCallbacks.filter(cb => cb !== callback);
  };
};

export const showToast = (message: string, type: Toast['type'] = 'info') => {
  const id = Math.random().toString(36).substr(2, 9);
  globalToasts = [...globalToasts, { id, message, type }];
  
  // Notify all registered callbacks
  globalSetToastsCallbacks.forEach(callback => callback(globalToasts));
  
  // Auto-hide after 3 seconds
  setTimeout(() => {
    globalToasts = globalToasts.filter(t => t.id !== id);
    globalSetToastsCallbacks.forEach(callback => callback(globalToasts));
  }, 3000);
};

export const hideToast = (id: string) => {
  globalToasts = globalToasts.filter(t => t.id !== id);
  globalSetToastsCallbacks.forEach(callback => callback(globalToasts));
};

export const ToastProvider = ({ children }: ToastProviderProps) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Register this provider's callback
  const unsubscribeRef = useRef<(() => void) | null>(null);
  
  useEffect(() => {
    unsubscribeRef.current = addGlobalSetToastsCallback(setToasts);
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  // Also expose the local showToast for React components
  const localShowToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    showToast(message, type);
  }, []);

  const localHideToast = useCallback((id: string) => {
    hideToast(id);
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, showToast: localShowToast, hideToast: localHideToast }}>
      {children}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`p-4 rounded-lg shadow-lg ${
              toast.type === 'success' ? 'bg-green-600' :
              toast.type === 'error' ? 'bg-red-600' :
              toast.type === 'warning' ? 'bg-yellow-600' : 'bg-blue-600'
            } text-white min-w-[280px]`}
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="font-semibold">
                  {toast.type === 'success' ? 'Success' :
                   toast.type === 'error' ? 'Error' :
                   toast.type === 'warning' ? 'Warning' : 'Info'}
                </div>
                <div className="text-sm opacity-90 mt-1">{toast.message}</div>
              </div>
              <button
                onClick={() => hideToast(toast.id)}
                className="ml-2 text-white hover:text-gray-200"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};