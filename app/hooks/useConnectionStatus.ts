import { useState, useEffect, useRef } from 'react';

export type ConnectionStatus = 'online' | 'offline' | 'reconnecting';

export function useConnectionStatus() {
  const [status, setStatus] = useState<ConnectionStatus>('online');
  const lastStatusRef = useRef<ConnectionStatus>('online');

  useEffect(() => {
    // Listen to window online/offline events
    const handleOnline = () => {
      if (status !== 'online') {
        setStatus('online');
        lastStatusRef.current = 'online';
      }
    };

    const handleOffline = () => {
      if (status !== 'offline') {
        setStatus('offline');
        lastStatusRef.current = 'offline';
      }
    };

    // Listen for window events
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Cleanup listeners
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [status]);

  return {
    status,
    isOnline: status === 'online',
    isReconnecting: status === 'reconnecting',
    isOffline: status === 'offline',
  };
}
