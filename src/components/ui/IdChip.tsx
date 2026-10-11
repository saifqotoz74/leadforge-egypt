import React from 'react';

export interface IdChipProps {
  id: string;
  truncateLength?: number;
  className?: string;
}

export const IdChip: React.FC<IdChipProps> = ({
  id,
  truncateLength,
  className = '',
}) => {
  const displayId =
    truncateLength && id.length > truncateLength
      ? `${id.slice(0, truncateLength)}…`
      : id;

  return (
    <span
      className={`inline-block font-mono text-caption px-1.5 py-0.5 rounded bg-subtle text-fg-secondary border border-line ltr-iso select-all ${className}`}
      title={id}
    >
      {displayId}
    </span>
  );
};
