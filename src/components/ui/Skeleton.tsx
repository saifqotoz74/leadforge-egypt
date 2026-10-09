import React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  circle?: boolean;
}

export function Skeleton({
  width,
  height,
  circle = false,
  className = '',
  style,
  ...props
}: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`bg-subtle animate-pulse ${
        circle ? 'rounded-full' : 'rounded-md'
      } ${className}`}
      style={{
        width,
        height,
        ...style,
      }}
      {...props}
    />
  );
}
