import React from 'react';

export interface BadgeProps {
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent';
  children: React.ReactNode;
  dot?: boolean;
  withDot?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  children,
  dot = false,
  withDot = false,
  className = '',
  style = {}
}) => {
  const hasDot = dot || withDot;
  const getVariantStyles = (): { bg: string; border: string; text: string; dotColor: string } => {
    switch (variant) {
      case 'success':
        return {
          bg: 'var(--color-success-bg)',
          border: 'var(--color-success-border)',
          text: 'var(--color-success-text)',
          dotColor: 'var(--color-success)'
        };
      case 'warning':
        return {
          bg: 'var(--color-warning-bg)',
          border: 'var(--color-warning-border)',
          text: 'var(--color-warning-text)',
          dotColor: 'var(--color-warning)'
        };
      case 'danger':
        return {
          bg: 'var(--color-danger-bg)',
          border: 'var(--color-danger-border)',
          text: 'var(--color-danger-text)',
          dotColor: 'var(--color-danger)'
        };
      case 'info':
        return {
          bg: 'var(--color-info-bg)',
          border: 'var(--color-info-border)',
          text: 'var(--color-info-text)',
          dotColor: 'var(--color-info)'
        };
      case 'accent':
        return {
          bg: 'var(--accent-subtle)',
          border: 'var(--accent-border)',
          text: 'var(--accent-text)',
          dotColor: 'var(--accent-primary)'
        };
      case 'neutral':
      default:
        return {
          bg: 'rgba(255, 255, 255, 0.05)',
          border: 'var(--border-subtle)',
          text: 'var(--text-secondary)',
          dotColor: 'var(--text-muted)'
        };
    }
  };

  const v = getVariantStyles();

  return (
    <span
      className={`console-badge ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 8px',
        fontSize: '11px',
        fontWeight: 500,
        fontFamily: 'var(--font-sans)',
        letterSpacing: '0.02em',
        borderRadius: 'var(--radius-full)',
        backgroundColor: v.bg,
        borderColor: v.border,
        color: v.text,
        borderWidth: '1px',
        borderStyle: 'solid',
        lineHeight: 1.3,
        ...style
      }}
    >
      {hasDot && (
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: v.dotColor,
            flexShrink: 0
          }}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
};
