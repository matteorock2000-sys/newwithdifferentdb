import React, { useEffect, useRef } from 'react';

interface PortalProps {
  children: React.ReactNode;
  container?: Element | null;
}

export default function Portal({ children, container }: PortalProps) {
  const defaultContainerRef = useRef<HTMLDivElement | null>(null);
  const targetContainer = container || defaultContainerRef.current;

  useEffect(() => {
    // Create a default container if none provided
    if (!container && !defaultContainerRef.current) {
      const portalContainer = document.createElement('div');
      portalContainer.id = 'portal-root';
      document.body.appendChild(portalContainer);
      defaultContainerRef.current = portalContainer;
    }

    return () => {
      // Clean up default container if it was created
      if (!container && defaultContainerRef.current) {
        document.body.removeChild(defaultContainerRef.current);
        defaultContainerRef.current = null;
      }
    };
  }, [container]);

  if (typeof document === 'undefined') {
    // Return null on the server side
    return null;
  }

  const containerToUse = container || defaultContainerRef.current;

  if (!containerToUse) {
    return null;
  }

  return React.createPortal(children, containerToUse);
}