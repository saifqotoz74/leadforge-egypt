import React from 'react';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  fullWidth?: boolean;
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-brand text-fg-on-brand border-0 hover:bg-brand-hover active:bg-brand-pressed shadow-xs',
  secondary:
    'bg-surface text-brand border border-line-strong hover:bg-brand-soft hover:border-line-brand active:bg-brand-soft-strong shadow-xs',
  ghost:
    'bg-transparent text-fg-primary border-0 hover:bg-subtle active:bg-line',
  danger:
    'bg-danger-fill text-white border-0 hover:bg-danger-fill-hover active:bg-red-700 shadow-xs',
  link:
    'bg-transparent text-brand border-0 p-0 h-auto hover:underline underline-offset-[3px]',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-body-sm rounded-md',
  md: 'h-10 px-4 text-body-sm rounded-md',
  lg: 'h-12 px-6 text-body rounded-md',
};

const ICON_SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-5 w-5',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      fullWidth = false,
      disabled = false,
      startIcon,
      endIcon,
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading;

    return (
      <button
        ref={ref}
        type="button"
        disabled={isDisabled}
        aria-busy={isLoading}
        className={`inline-flex items-center justify-center gap-2 font-medium transition-colors select-none focus-visible:outline-2 focus-visible:outline-brand-accent focus-visible:outline-offset-2 ${
          fullWidth ? 'w-full' : 'w-auto'
        } ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${
          isDisabled
            ? 'opacity-60 cursor-not-allowed pointer-events-none'
            : 'cursor-pointer'
        } ${className}`}
        {...props}
      >
        {isLoading ? (
          <Spinner size={size === 'sm' ? 'sm' : 'md'} className="text-current" />
        ) : (
          startIcon && (
            <span className={`inline-flex items-center justify-center shrink-0 ${ICON_SIZE_CLASSES[size]}`}>
              {startIcon}
            </span>
          )
        )}
        <span>{children}</span>
        {!isLoading && endIcon && (
          <span className={`inline-flex items-center justify-center shrink-0 ${ICON_SIZE_CLASSES[size]}`}>
            {endIcon}
          </span>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  'aria-label': string; // Required for accessibility in Arabic
}

const ICON_BUTTON_SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 w-8 rounded-md',
  md: 'h-10 w-10 rounded-md',
  lg: 'h-12 w-12 rounded-md',
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      variant = 'ghost',
      size = 'md',
      isLoading = false,
      disabled = false,
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading;

    return (
      <button
        ref={ref}
        type="button"
        disabled={isDisabled}
        aria-busy={isLoading}
        className={`inline-flex items-center justify-center shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-brand-accent focus-visible:outline-offset-2 ${
          ICON_BUTTON_SIZE_CLASSES[size]
        } ${VARIANT_CLASSES[variant]} ${
          isDisabled
            ? 'opacity-60 cursor-not-allowed pointer-events-none'
            : 'cursor-pointer'
        } ${className}`}
        {...props}
      >
        {isLoading ? (
          <Spinner size={size === 'sm' ? 'sm' : 'md'} className="text-current" />
        ) : (
          children
        )}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';
