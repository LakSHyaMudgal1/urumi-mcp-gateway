import React from 'react';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, id, rows = 3, style = {}, className = '', ...props }, ref) => {
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
        <textarea
          id={inputId}
          ref={ref}
          rows={rows}
          className={`console-input ${className}`}
          style={{
            height: 'auto',
            padding: '10px 12px',
            borderColor: error ? 'var(--color-danger)' : undefined,
            fontFamily: 'inherit',
            resize: 'vertical',
            lineHeight: 1.5,
            ...style
          }}
          {...props}
        />
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

Textarea.displayName = 'Textarea';
