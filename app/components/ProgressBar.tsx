import React from 'react';

interface ProgressBarProps {
  progress: number;
  label?: string;
  showPercentage?: boolean;
  color?: 'red' | 'green' | 'blue' | 'yellow' | 'purple' | 'pink';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  animated?: boolean;
}

export default function ProgressBar({ 
  progress, 
  label, 
  showPercentage = true, 
  color = 'blue', 
  size = 'md', 
  className = '',
  animated = true
}: ProgressBarProps) {
  const colorClasses = {
    red: 'from-red-600 to-red-500',
    green: 'from-green-600 to-green-500',
    blue: 'from-blue-600 to-blue-500',
    yellow: 'from-yellow-600 to-yellow-500',
    purple: 'from-purple-600 to-purple-500',
    pink: 'from-pink-600 to-pink-500'
  };

  const sizeClasses = {
    sm: 'h-2',
    md: 'h-3',
    lg: 'h-4'
  };

  const clampedProgress = Math.max(0, Math.min(100, progress));
  const transitionClass = animated ? 'transition-all duration-500 ease-out' : '';

  return (
    <div 
      role="progressbar"
      aria-valuenow={clampedProgress}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ? `${label} ${clampedProgress}%` : `${clampedProgress}%`}
      className={`space-y-2 ${className}`}
    >
      {label && (
        <div className="flex justify-between items-center text-sm text-gray-300">
          <span>{label}</span>
          {showPercentage && (
            <span className="font-medium text-white">{Math.round(clampedProgress)}%</span>
          )}
        </div>
      )}
      
      <div className={`w-full bg-gray-700 rounded-full ${sizeClasses[size]}`}>
        <div 
          className={`h-full rounded-full bg-gradient-to-r ${colorClasses[color]} ${transitionClass}`}
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
      
      {!label && showPercentage && (
        <div className="text-center text-sm text-gray-400">
          {Math.round(clampedProgress)}%
        </div>
      )}
    </div>
  );
}
