import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export interface AlertProps {
  variant?: 'danger' | 'warning' | 'success' | 'info';
  title?: string;
  children: React.ReactNode;
  onClose?: () => void;
  style?: React.CSSProperties;
  className?: string;
}

export const Alert: React.FC<AlertProps> = ({
  variant = 'danger',
  title,
  children,
  onClose,
  style = {},
  className = ''
}) => {
  const getStyles = () => {
    switch (variant) {
      case 'success':
        return {
          bg: 'var(--color-success-bg)',
          border: 'var(--color-success-border)',
          color: 'var(--color-success-text)',
          icon: <CheckCircle2 size={16} />
        };
      case 'warning':
        return {
          bg: 'var(--color-warning-bg)',
          border: 'var(--color-warning-border)',
          color: 'var(--color-warning-text)',
          icon: <AlertTriangle size={16} />
        };
      case 'info':
        return {
          bg: 'var(--color-info-bg)',
          border: 'var(--color-info-border)',
          color: 'var(--color-info-text)',
          icon: <Info size={16} />
        };
      case 'danger':
      default:
        return {
          bg: 'var(--color-danger-bg)',
          border: 'var(--color-danger-border)',
          color: 'var(--color-danger-text)',
          icon: <AlertCircle size={16} />
        };
    }
  };

  const s = getStyles();

  return (
    <div
      role="alert"
      className={className}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        padding: '10px 14px',
        borderRadius: 'var(--radius-sm)',
        backgroundColor: s.bg,
        border: `1px solid ${s.border}`,
        color: s.color,
        fontSize: '12px',
        lineHeight: 1.45,
        position: 'relative',
        ...style
      }}
    >
      <div style={{ flexShrink: 0, marginTop: '1px' }}>{s.icon}</div>
      <div style={{ flex: 1 }}>
        {title && <div style={{ fontWeight: 600, marginBottom: '2px' }}>{title}</div>}
        <div>{children}</div>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Dismiss alert"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'currentColor',
            opacity: 0.7,
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
};
