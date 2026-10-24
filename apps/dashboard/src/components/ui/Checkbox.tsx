import React from 'react';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
  description?: React.ReactNode;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, id, style = {}, className = '', ...props }, ref) => {
    const inputId = id || (typeof label === 'string' ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
        <input
          id={inputId}
          ref={ref}
          type="checkbox"
          style={{
            marginTop: '2px',
            width: '15px',
            height: '15px',
            accentColor: 'var(--accent-primary)',
            cursor: 'pointer',
            ...style
          }}
          className={className}
          {...props}
        />
        {(label || description) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {label && (
              <label
                htmlFor={inputId}
                style={{
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  userSelect: 'none'
                }}
              >
                {label}
              </label>
            )}
            {description && (
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', userSelect: 'none' }}>
                {description}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';
