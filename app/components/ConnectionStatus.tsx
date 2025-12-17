import React, { useEffect, useState } from 'react';

interface ConnectionStatusProps {
  status: 'connected' | 'reconnecting' | 'offline';
  autoHide?: boolean;
  autoHideDelay?: number;
}

export default function ConnectionStatus({ 
  status,
  autoHide = true, 
  autoHideDelay = 3000 
}: ConnectionStatusProps) {
  const [isVisible, setIsVisible] = useState(true);

  // Auto-hide when connected
  useEffect(() => {
    if (status === 'connected' && autoHide) {
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, autoHideDelay);

      return () => clearTimeout(timer);
    } else {
      setIsVisible(true);
    }
  }, [status, autoHide, autoHideDelay]);

  if (!isVisible) {
    return null;
  }

  const getStatusConfig = () => {
    switch (status) {
      case 'connected':
        return {
          color: 'bg-green-500',
          text: 'Connected',
          bgColor: 'bg-green-900',
          borderColor: 'border-green-600'
        };
      case 'reconnecting':
        return {
          color: 'bg-yellow-500',
          text: 'Reconnecting...',
          bgColor: 'bg-yellow-900',
          borderColor: 'border-yellow-600'
        };
      case 'offline':
        return {
          color: 'bg-red-500',
          text: 'Offline',
          bgColor: 'bg-red-900',
          borderColor: 'border-red-600'
        };
    }
  };

  const config = getStatusConfig();
  const isOnline = status === 'connected';
  const isReconnecting = status === 'reconnecting';
  const isOffline = status === 'offline';

  return (
    <div className="fixed top-4 right-4 z-50">
      <div className={`flex items-center space-x-3 px-4 py-2 rounded-lg border-2 ${config.bgColor} ${config.borderColor} shadow-lg`}>
        <div className={`w-3 h-3 rounded-full ${config.color} animate-pulse`} />
        <span className="text-white font-semibold">{config.text}</span>
        {!isOnline && (
          <div className="ml-2 text-xs text-gray-300">
            {isReconnecting ? 'Attempting to reconnect...' : 'No internet connection'}
          </div>
        )}
      </div>
    </div>
  );
}
