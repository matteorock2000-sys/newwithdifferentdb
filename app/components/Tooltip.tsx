import React, { useState, useEffect, useRef, useCallback } from 'react';
import Portal from './Portal';

interface TooltipProps {
  content: string | React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactNode;
  delay?: number;
  maxWidth?: string;
  className?: string;
  disabled?: boolean;
}

export default function Tooltip({ 
  content, 
  position = 'top', 
  children, 
  delay = 200, 
  maxWidth = '240px',
  className = '',
  disabled = false
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [positionStyles, setPositionStyles] = useState<React.CSSProperties>({});
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current || !tooltipRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = 0;
    let top = 0;
    let newPosition = position;

    switch (position) {
      case 'top':
        left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
        top = triggerRect.top - tooltipRect.height - 8;
        break;
      case 'bottom':
        left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
        top = triggerRect.bottom + 8;
        break;
      case 'left':
        left = triggerRect.left - tooltipRect.width - 8;
        top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
        break;
      case 'right':
        left = triggerRect.right + 8;
        top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
        break;
    }

    // Adjust position if tooltip goes out of viewport
    if (left < 8) {
      left = 8;
      newPosition = 'right';
    } else if (left + tooltipRect.width > viewportWidth - 8) {
      left = viewportWidth - tooltipRect.width - 8;
      newPosition = 'left';
    }

    if (top < 8) {
      top = 8;
      newPosition = 'bottom';
    } else if (top + tooltipRect.height > viewportHeight - 8) {
      top = viewportHeight - tooltipRect.height - 8;
      newPosition = 'top';
    }

    setPositionStyles({
      position: 'fixed',
      left: `${left}px`,
      top: `${top}px`,
      maxWidth,
      zIndex: 9999
    });

    setAdjustedPosition(newPosition);
  }, [position, maxWidth]);

  const showTooltip = useCallback(() => {
    if (disabled) return;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
      setTimeout(calculatePosition, 0);
    }, delay);
  }, [delay, calculatePosition, disabled]);

  const hideTooltip = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsVisible(false);
  }, []);

  const handleResize = useCallback(() => {
    if (isVisible) {
      calculatePosition();
    }
  }, [isVisible, calculatePosition]);

  useEffect(() => {
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [handleResize]);

  const getArrowClass = () => {
    const baseClass = 'absolute w-0 h-0 border-4';
    switch (adjustedPosition) {
      case 'top':
        return `${baseClass} border-l-transparent border-r-transparent border-b-gray-900 border-t-transparent bottom-[-8px] left-1/2 transform -translate-x-1/2`;
      case 'bottom':
        return `${baseClass} border-l-transparent border-r-transparent border-t-gray-900 border-b-transparent top-[-8px] left-1/2 transform -translate-x-1/2`;
      case 'left':
        return `${baseClass} border-t-transparent border-b-transparent border-r-gray-900 border-l-transparent right-[-8px] top-1/2 transform -translate-y-1/2`;
      case 'right':
        return `${baseClass} border-t-transparent border-b-transparent border-l-gray-900 border-r-transparent left-[-8px] top-1/2 transform -translate-y-1/2`;
    }
  };

  const tooltipContent = (
    <div
      ref={tooltipRef}
      role="tooltip"
      className={`bg-gray-900 text-white text-sm rounded-md px-3 py-2 shadow-lg border border-gray-700 ${className}`}
      style={positionStyles}
    >
      {typeof content === 'string' ? <span>{content}</span> : content}
      <div className={getArrowClass()} />
    </div>
  );

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        onTouchStart={showTooltip}
        onClick={(e) => {
          // Prevent clicks from propagating when tooltip is visible
          if (isVisible) e.stopPropagation();
        }}
        className="relative"
      >
        {children}
      </div>
      
      {isVisible && !disabled && (
        <Portal>
          {tooltipContent}
        </Portal>
      )}
    </>
  );
}
