import React from 'react';

export interface CodeChipProps {
  children: React.ReactNode;
  className?: string;
}

export const CodeChip: React.FC<CodeChipProps> = ({ children, className = '' }) => {
  return (
    <code
      className={`inline-block font-mono text-caption px-1.5 py-0.5 rounded bg-subtle text-fg-primary border border-line ltr-iso select-all ${className}`}
    >
      {children}
    </code>
  );
};
