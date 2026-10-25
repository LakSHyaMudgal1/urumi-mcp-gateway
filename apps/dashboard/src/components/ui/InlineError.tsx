import React from 'react';
import { AlertCircle } from 'lucide-react';

export interface InlineErrorProps {
  error?: string | null;
  id?: string;
  style?: React.CSSProperties;
  className?: string;
}

export const InlineError: React.FC<InlineErrorProps> = ({
  error,
  id,
  style = {},
  className = ''
}) => {
  if (!error) return null;

  return (
    <div
      id={id}
      role="alert"
      aria-live="polite"
      className={`console-inline-error ${className}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '11px',
        color: 'var(--color-danger-text)',
        lineHeight: 1.4,
        marginTop: '4px',
        ...style
      }}
    >
      <AlertCircle size={13} style={{ flexShrink: 0 }} aria-hidden="true" />
      <span>{error}</span>
    </div>
  );
};
