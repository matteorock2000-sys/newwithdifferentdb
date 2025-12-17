import React from 'react';

interface SkeletonLoaderProps {
  variant?: 'card' | 'text' | 'avatar' | 'button';
  count?: number;
  className?: string;
  width?: string | number;
  height?: string | number;
}

export default function SkeletonLoader({ 
  variant = 'text', 
  count = 1, 
  className = '', 
  width, 
  height 
}: SkeletonLoaderProps) {
  const baseClasses = 'animate-pulse bg-gray-700 rounded';

  const getVariantClasses = () => {
    switch (variant) {
      case 'card':
        return 'bg-gray-800 rounded-lg p-4';
      case 'text':
        return 'rounded w-full h-4 bg-gray-700';
      case 'avatar':
        return 'rounded-full bg-gray-700';
      case 'button':
        return 'rounded-full bg-gray-700';
      default:
        return 'rounded w-full h-4 bg-gray-700';
    }
  };

  const getVariantStyle = () => {
    const style: React.CSSProperties = {};
    
    if (width) style.width = typeof width === 'number' ? `${width}px` : width;
    if (height) style.height = typeof height === 'number' ? `${height}px` : height;
    
    if (variant === 'text') {
      if (!height) style.height = '16px';
      if (!width) style.width = '100%';
    } else if (variant === 'avatar') {
      if (!width && !height) {
        style.width = '40px';
        style.height = '40px';
      }
    } else if (variant === 'button') {
      if (!width) style.width = '120px';
      if (!height) style.height = '40px';
    }
    
    return style;
  };

  const renderSkeleton = (index: number) => (
    <div 
      key={index} 
      className={`${baseClasses} ${getVariantClasses()} ${className}`}
      style={getVariantStyle()}
    >
      {variant === 'card' && (
        <div className="space-y-3">
          <div className="h-6 bg-gray-700 rounded w-3/4" />
          <div className="h-4 bg-gray-700 rounded w-full" />
          <div className="h-4 bg-gray-700 rounded w-5/6" />
          <div className="h-4 bg-gray-700 rounded w-2/3" />
        </div>
      )}
      {variant === 'text' && (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div 
              key={i} 
              className={`h-4 bg-gray-700 rounded ${
                i === 0 ? 'w-3/4' : i === 1 ? 'w-1/2' : 'w-5/6'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className={className}>
      {Array.from({ length: count }, (_, i) => renderSkeleton(i))}
    </div>
  );
}
