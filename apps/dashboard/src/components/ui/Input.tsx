import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
  leftIcon?: React.ReactNode;
  prefixIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, icon, leftIcon, prefixIcon, id, style = {}, className = '', ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
    const effectiveIcon = leftIcon || prefixIcon || icon;

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
          {effectiveIcon && (
            <div
              style={{
                position: 'absolute',
                left: '10px',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                pointerEvents: 'none'
              }}
            >
              {effectiveIcon}
            </div>
          )}
          <input
            id={inputId}
            ref={ref}
            className={`console-input ${className}`}
            style={{
              paddingLeft: effectiveIcon ? '34px' : '12px',
              borderColor: error ? 'var(--color-danger)' : undefined,
              ...style
            }}
            {...props}
          />
        </div>
        {error && (
          <span style={{ fontSize: '11px', color: 'var(--color-danger-text)' }}>
            {error}
          </span>
        )}
        {helperText && !error && (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {helperText}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
