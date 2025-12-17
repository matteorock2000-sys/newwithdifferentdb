import React, { useEffect, useRef } from 'react';
import Portal from './Portal';

interface LoadingOverlayProps {
  isLoading: boolean;
  message?: string;
  fullScreen?: boolean;
  transparent?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export default function LoadingOverlay({ 
  isLoading, 
  message = 'Loading...', 
  fullScreen = false, 
  transparent = false,
  className = '',
  children 
}: LoadingOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isLoading && fullScreen) {
      // Prevent background scrolling when overlay is active
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = 'unset';
      };
    }
  }, [isLoading, fullScreen]);

  if (!isLoading) {
    return children || null;
  }

  const overlayClasses = `
    ${fullScreen ? 'fixed inset-0 z-50' : 'relative'}
    ${transparent ? 'bg-transparent' : 'bg-black/50 backdrop-blur-sm'}
    ${fullScreen ? 'flex' : 'flex'}
    items-center justify-center
    ${className}
  `;

  const contentClasses = `
    ${fullScreen ? 'bg-gray-900/95' : 'bg-gray-800'}
    rounded-lg p-6 shadow-xl
    flex items-center gap-4
    animate-in fade-in zoom-in-95
  `;

  const spinnerClasses = `
    animate-spin h-8 w-8 sm:h-10 sm:w-10
    border-4 border-gray-600 border-t-blue-500 rounded-full
  `;

  const messageClasses = `
    text-white text-sm sm:text-base
    font-medium tracking-wide
  `;

  return (
    <div className="relative">
      {children}
      
      {isLoading && (
        fullScreen ? (
          <Portal>
            <div ref={overlayRef} className={overlayClasses}>
              <div className={contentClasses}>
                <div className={spinnerClasses} />
                <div className={messageClasses}>
                  {message}
                </div>
              </div>
            </div>
          </Portal>
        ) : (
          <div className={overlayClasses}>
            <div className={contentClasses}>
              <div className={spinnerClasses} />
              <div className={messageClasses}>
                {message}
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}
