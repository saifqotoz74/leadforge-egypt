import React from 'react';

export interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  sm: 'w-8 h-8 text-caption',
  md: 'w-10 h-10 text-body-sm',
  lg: 'w-12 h-12 text-body',
};

export function Avatar({ name, size = 'md', className = '' }: AvatarProps) {
  // Extract initials: first two words or first character
  const parts = name.trim().split(/\s+/);
  const initials =
    parts.length > 1
      ? `${parts[0][0]}${parts[1][0]}`
      : name.slice(0, 2);

  return (
    <div
      role="img"
      aria-label={name}
      className={`inline-flex items-center justify-center rounded-full bg-brand-soft-strong text-brand font-semibold select-none shrink-0 ${SIZES[size]} ${className}`}
    >
      {initials}
    </div>
  );
}
