import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'danger' | 'link';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  icon?: React.ReactNode;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  isIconOnly?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      isLoading = false,
      icon,
      leftIcon,
      rightIcon,
      isIconOnly = false,
      children,
      disabled,
      style = {},
      className = '',
      'aria-label': ariaLabel,
      ...props
    },
    ref
  ) => {
    const effectiveLeftIcon = leftIcon || icon;

    const getHeight = () => {
      switch (size) {
        case 'sm':
          return 'var(--control-height-sm)';
        case 'lg':
          return 'var(--control-height-lg)';
        case 'md':
        default:
          return 'var(--control-height-md)';
      }
    };

    const getPadding = () => {
      if (isIconOnly) return '0';
      switch (size) {
        case 'sm':
          return '0 10px';
        case 'lg':
          return '0 18px';
        case 'md':
        default:
          return '0 14px';
      }
    };

    const getFontSize = () => {
      switch (size) {
        case 'sm':
          return '12px';
        case 'lg':
          return '14px';
        case 'md':
        default:
          return '13px';
      }
    };

    const getVariantStyles = (): React.CSSProperties => {
      switch (variant) {
        case 'primary':
          return {
            backgroundColor: 'var(--accent-primary)',
            color: '#ffffff',
            borderColor: 'transparent'
          };
        case 'outline':
          return {
            backgroundColor: 'transparent',
            color: 'var(--text-primary)',
            borderColor: 'var(--border-default)'
          };
        case 'ghost':
          return {
            backgroundColor: 'transparent',
            color: 'var(--text-secondary)',
            borderColor: 'transparent'
          };
        case 'destructive':
        case 'danger':
          return {
            backgroundColor: 'var(--color-danger-bg)',
            color: 'var(--color-danger-text)',
            borderColor: 'var(--color-danger-border)'
          };
        case 'link':
          return {
            backgroundColor: 'transparent',
            color: 'var(--accent-text)',
            borderColor: 'transparent',
            textDecoration: 'underline',
            padding: '0'
          };
        case 'secondary':
        default:
          return {
            backgroundColor: 'var(--bg-surface-elevated)',
            color: 'var(--text-primary)',
            borderColor: 'var(--border-subtle)'
          };
      }
    };

    const v = getVariantStyles();
    const height = getHeight();

    return (
      <button
        ref={ref}
        className={`console-btn ${className}`}
        disabled={disabled || isLoading}
        aria-busy={isLoading ? true : undefined}
        aria-label={isIconOnly ? ariaLabel || (typeof children === 'string' ? children : undefined) : ariaLabel}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          height,
          width: isIconOnly ? height : undefined,
          padding: getPadding(),
          fontSize: getFontSize(),
          fontWeight: 500,
          fontFamily: 'var(--font-sans)',
          borderRadius: 'var(--radius-sm)',
          borderWidth: '1px',
          borderStyle: 'solid',
          cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
          opacity: disabled || isLoading ? 0.6 : 1,
          touchAction: 'manipulation',
          transition: 'transform 0.12s ease, background-color 0.12s ease, border-color 0.12s ease, color 0.12s ease, opacity 0.12s ease',
          ...v,
          ...style
        }}
        {...props}
      >
        {isLoading ? (
          <svg
            style={{ width: '14px', height: '14px', animation: 'spin 1s linear infinite' }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeLinecap="round" opacity="0.3" />
            <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
          </svg>
        ) : (
          effectiveLeftIcon
        )}
        {!isIconOnly && children}
        {!isLoading && rightIcon}
      </button>
    );
  }
);

Button.displayName = 'Button';
