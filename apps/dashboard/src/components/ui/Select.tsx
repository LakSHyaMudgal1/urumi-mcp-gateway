import React from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options?: SelectOption[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, helperText, options, id, children, style = {}, className = '', ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

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
          <select
            id={inputId}
            ref={ref}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-help` : undefined}
            className={`console-input ${className}`}
            style={{
              appearance: 'none',
              paddingRight: '32px',
              cursor: 'pointer',
              borderColor: error ? 'var(--color-danger)' : undefined,
              ...style
            }}
            {...props}
          >
            {options
              ? options.map(opt => (
                  <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                    {opt.label}
                  </option>
                ))
              : children}
          </select>
          <div
            style={{
              position: 'absolute',
              right: '10px',
              color: 'var(--text-muted)',
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'center'
            }}
            aria-hidden="true"
          >
            <ChevronDown size={14} />
          </div>
        </div>
        {error && (
          <span
            id={`${inputId}-error`}
            role="alert"
            aria-live="polite"
            style={{ fontSize: '11px', color: 'var(--color-danger-text)' }}
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

Select.displayName = 'Select';
