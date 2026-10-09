'use client';

import React, { useState, useRef, useEffect } from 'react';

export interface PopoverProps {
  trigger: React.ReactNode;
  content: React.ReactNode;
  align?: 'start' | 'center' | 'end';
  className?: string;
}

export function Popover({
  trigger,
  content,
  align = 'center',
  className = '',
}: PopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const ALIGN_CLASSES = {
    start: 'start-0',
    center: 'start-1/2 -translate-x-1/2 rtl:translate-x-1/2',
    end: 'end-0',
  };

  return (
    <div ref={containerRef} className="relative inline-flex items-center">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen(!isOpen);
          }
        }}
        className="inline-flex items-center cursor-pointer select-none"
      >
        {trigger}
      </div>

      {isOpen && (
        <div
          role="region"
          className={`absolute top-full mt-2 z-dropdown w-72 max-w-popover p-4 bg-surface rounded-lg border border-line shadow-md text-start animate-in fade-in zoom-in-95 duration-150 ${ALIGN_CLASSES[align]} ${className}`}
        >
          {content}
        </div>
      )}
    </div>
  );
}
