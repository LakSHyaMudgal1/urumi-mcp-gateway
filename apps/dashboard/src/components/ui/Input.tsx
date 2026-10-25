import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
  leftIcon?: React.ReactNode;
  prefixIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      icon,
      leftIcon,
      prefixIcon,
      rightIcon,
      id,
      style = {},
      className = '',
      ...props
    },
    ref
  ) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
    const effectiveLeftIcon = leftIcon || prefixIcon || icon;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
        {label && (
          <label
            htmlFor={inputId}
            style={{
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              letterSpacing: '0.01em'
            }}
          >
            {label}
          </label>
        )}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
          {effectiveLeftIcon && (
            <div
              style={{
                position: 'absolute',
                left: '10px',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                pointerEvents: 'none'
              }}
              aria-hidden="true"
            >
              {effectiveLeftIcon}
            </div>
          )}
          <input
            id={inputId}
            ref={ref}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-help` : undefined}
            className={`console-input ${className}`}
            style={{
              paddingLeft: effectiveLeftIcon ? '34px' : '12px',
              paddingRight: rightIcon ? '34px' : '12px',
              borderColor: error ? 'var(--color-danger)' : undefined,
              ...style
            }}
            {...props}
          />
          {rightIcon && (
            <div
              style={{
                position: 'absolute',
                right: '10px',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center'
              }}
              aria-hidden="true"
            >
              {rightIcon}
            </div>
          )}
        </div>
        {error && (
          <span
            id={`${inputId}-error`}
            role="alert"
            aria-live="polite"
            style={{ fontSize: '11px', color: 'var(--color-danger-text)', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            {error}
          </span>
        )}
        {helperText && !error && (
          <span id={`${inputId}-help`} style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {helperText}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
