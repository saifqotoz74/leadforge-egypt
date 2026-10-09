'use client';

import React, { useState, useRef } from 'react';

export interface TooltipProps {
  content: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom';
  className?: string;
}

export function Tooltip({
  content,
  children,
  position = 'top',
  className = '',
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, 300);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  };

  const POSITION_CLASSES = {
    top: 'bottom-full mb-2 start-1/2 -translate-x-1/2 rtl:translate-x-1/2',
    bottom: 'top-full mt-2 start-1/2 -translate-x-1/2 rtl:translate-x-1/2',
  };

  return (
    <div
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
    >
      {children}
      {isVisible && (
        <div
          role="tooltip"
          className={`absolute z-tooltip px-2.5 py-1.5 bg-inverse text-white text-caption rounded-sm shadow-md whitespace-nowrap pointer-events-none animate-in fade-in duration-150 ${POSITION_CLASSES[position]}`}
        >
          {content}
        </div>
      )}
    </div>
  );
}
