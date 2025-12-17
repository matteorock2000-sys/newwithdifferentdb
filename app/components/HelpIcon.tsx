import React from 'react';
import Tooltip from './Tooltip';

interface HelpIconProps {
  content: string | React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  color?: 'blue' | 'yellow' | 'gray' | 'green';
  className?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

export default function HelpIcon({ 
  content, 
  size = 'md', 
  color = 'blue', 
  className = '', 
  position = 'top',
  delay = 200
}: HelpIconProps) {
  const sizeClasses = {
    sm: 'h-4 w-4 text-xs',
    md: 'h-5 w-5 text-sm',
    lg: 'h-6 w-6 text-base'
  };

  const colorClasses = {
    blue: 'text-blue-400 hover:text-blue-300',
    yellow: 'text-yellow-400 hover:text-yellow-300',
    gray: 'text-gray-400 hover:text-gray-300',
    green: 'text-green-400 hover:text-green-300'
  };

  return (
    <Tooltip 
      content={content} 
      position={position}
      delay={delay}
      className="text-gray-300"
    >
      <div className={`inline-flex items-center justify-center ${className}`}>
        <div className={`
          flex items-center justify-center
          w-6 h-6 sm:w-7 sm:h-7 rounded-full
          bg-gray-800 border-2 border-gray-600
          ${colorClasses[color]}
          transition-all duration-200
          hover:scale-110 hover:border-gray-500
          focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
          cursor-help
        `}
        >
          <span className="text-white font-bold text-xs">?</span>
        </div>
      </div>
    </Tooltip>
  );
}
