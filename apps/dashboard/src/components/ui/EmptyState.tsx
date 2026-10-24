import React from 'react';
import { Button, ButtonProps } from './Button.js';

export interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: ButtonProps['variant'];
    icon?: React.ReactNode;
  };
  actionLabel?: string;
  onAction?: () => void;
  style?: React.CSSProperties;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  actionLabel,
  onAction,
  style = {}
}) => {
  const effectiveAction = action || (actionLabel && onAction ? { label: actionLabel, onClick: onAction } : undefined);
  return (
    <div
      className="console-card"
      style={{
        padding: '48px 24px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px dashed var(--border-default)',
        backgroundColor: 'var(--bg-subtle)',
        ...style
      }}
    >
      <div
        style={{
          width: '44px',
          height: '44px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--bg-surface-elevated)',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          marginBottom: '16px'
        }}
        aria-hidden="true"
      >
        {icon}
      </div>

      <h3
        style={{
          fontSize: '15px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          letterSpacing: '-0.01em',
          marginBottom: '6px'
        }}
      >
        {title}
      </h3>

      <p
        style={{
          fontSize: '13px',
          color: 'var(--text-secondary)',
          maxWidth: '420px',
          lineHeight: 1.5,
          marginBottom: effectiveAction ? '20px' : '0'
        }}
      >
        {description}
      </p>

      {effectiveAction && (
        <Button
          variant={effectiveAction.variant || 'secondary'}
          size="sm"
          onClick={effectiveAction.onClick}
          icon={effectiveAction.icon}
        >
          {effectiveAction.label}
        </Button>
      )}
    </div>
  );
};
