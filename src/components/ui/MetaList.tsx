import React from 'react';

export interface MetaListProps {
  items?: (React.ReactNode | string | null | undefined)[];
  children?: React.ReactNode;
  className?: string;
}

export const MetaList: React.FC<MetaListProps> = ({
  items,
  children,
  className = '',
}) => {
  if (items && items.length > 0) {
    const validItems = items.filter(
      (item) => item !== null && item !== undefined && item !== false && item !== ''
    );

    return (
      <div
        className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 text-caption text-fg-secondary ${className}`}
      >
        {validItems.map((item, idx) => (
          <span key={idx} className="inline-flex items-center">
            {item}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 text-caption text-fg-secondary ${className}`}
    >
      {children}
    </div>
  );
};
