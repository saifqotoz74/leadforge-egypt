'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { Check, ChevronDown, X, Search, AlertCircle } from 'lucide-react';

export interface MultiSelectOption {
  value: string;
  label: string;
}

export interface MultiSelectProps {
  label?: string;
  optional?: boolean;
  optionalLabel?: string;
  helperText?: string;
  error?: string;
  placeholder?: string;
  options: MultiSelectOption[];
  value: string[];
  onChange: (selected: string[]) => void;
  disabled?: boolean;
  className?: string;
}

export function MultiSelect({
  label,
  optional = false,
  optionalLabel,
  helperText,
  error,
  placeholder = 'اختر...',
  options,
  value,
  onChange,
  disabled = false,
  className = '',
}: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  let locale = 'ar';
  try {
    locale = useLocale();
  } catch {
    // fallback
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (optValue: string) => {
    if (value.includes(optValue)) {
      onChange(value.filter((v) => v !== optValue));
    } else {
      onChange([...value, optValue]);
    }
  };

  const removeChip = (optValue: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(value.filter((v) => v !== optValue));
  };

  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(search.toLowerCase())
  );

  const selectedOptionsMap = new Map(options.map((o) => [o.value, o.label]));
  const hasError = Boolean(error);

  return (
    <div ref={containerRef} className={`relative w-full text-start ${className}`}>
      {label && (
        <label className="block text-label font-medium text-fg-primary mb-2 select-none">
          {label}
          {optional && (
            <span className="text-fg-secondary font-normal ms-2 text-caption">
              {optionalLabel || (locale === 'en' ? '(Optional)' : '(اختياري)')}
            </span>
          )}
        </label>
      )}

      {/* Control Box */}
      <div
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            setIsOpen(!isOpen);
          }
        }}
        className={`min-h-10 w-full p-1.5 ps-3 pe-9 rounded-md bg-surface text-fg-primary text-body border transition-colors flex flex-wrap items-center gap-1.5 cursor-pointer outline-none ${
          hasError
            ? 'border-danger-icon focus:ring-2 focus:ring-danger-icon/30'
            : 'border-line-strong hover:border-fg-muted focus:border-brand focus:ring-2 focus:ring-brand-accent/40'
        } ${disabled ? 'bg-subtle cursor-not-allowed opacity-60' : ''}`}
      >
        {value.length === 0 ? (
          <span className="text-fg-muted text-body-sm ps-1">{placeholder}</span>
        ) : (
          value.map((val) => (
            <span
              key={val}
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-brand-soft-strong text-brand text-caption font-medium select-none"
            >
              <span>{selectedOptionsMap.get(val) || val}</span>
              <button
                type="button"
                onClick={(e) => removeChip(val, e)}
                className="hover:bg-brand/10 rounded-full p-0.5 text-brand"
                aria-label={`إزالة ${selectedOptionsMap.get(val) || val}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))
        )}

        <div className="absolute end-3 top-1/2 -translate-y-1/2 flex items-center justify-center text-fg-secondary pointer-events-none w-4 h-4">
          <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {hasError ? (
        <p className="flex items-center gap-1.5 mt-1.5 text-caption text-danger-text">
          <AlertCircle className="w-4 h-4 shrink-0 text-danger-icon" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : helperText ? (
        <p className="mt-1.5 text-caption text-fg-secondary">{helperText}</p>
      ) : null}

      {/* Popover Menu */}
      {isOpen && (
        <div className="absolute z-dropdown mt-1.5 w-full bg-surface rounded-lg border border-line shadow-md overflow-hidden text-start animate-in fade-in duration-100">
          {/* Search box */}
          <div className="p-2 border-b border-line bg-subtle/50 flex items-center gap-2">
            <Search className="w-4 h-4 text-fg-secondary shrink-0 ms-1" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث في القائمة..."
              className="w-full bg-transparent text-body-sm text-fg-primary outline-none placeholder:text-fg-muted"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          {/* Options list */}
          <div className="max-h-60 overflow-y-auto p-1" role="listbox">
            {filteredOptions.length === 0 ? (
              <div className="p-4 text-center text-caption text-fg-muted">
                لا توجد نتائج مطابقة
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = value.includes(opt.value);
                return (
                  <div
                    key={opt.value}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => toggleOption(opt.value)}
                    className={`h-10 px-3 rounded-md flex items-center justify-between text-body-sm transition-colors cursor-pointer select-none ${
                      isSelected
                        ? 'bg-brand-soft text-brand font-medium'
                        : 'text-fg-primary hover:bg-subtle'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {isSelected && <Check className="w-4 h-4 text-brand shrink-0 ms-2" />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
