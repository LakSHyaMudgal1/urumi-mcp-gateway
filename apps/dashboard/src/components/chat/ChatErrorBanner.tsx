import React from 'react';
import { ClassifiedError } from './chatUtils.js';
import { AlertCircle, RotateCcw, X, Server, Cpu, ShieldAlert } from 'lucide-react';
import { Button } from '../ui/index.js';

interface ChatErrorBannerProps {
  error: ClassifiedError;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export const ChatErrorBanner: React.FC<ChatErrorBannerProps> = ({
  error,
  onRetry,
  onDismiss
}) => {
  const getOriginBadge = () => {
    switch (error.origin) {
      case 'upstream':
        return {
          icon: <Server size={12} />,
          label: 'Upstream MCP Error',
          color: 'var(--color-danger-text)',
          bg: 'var(--color-danger-bg)',
          border: 'var(--color-danger-border)'
        };
      case 'model':
        return {
          icon: <Cpu size={12} />,
          label: 'LLM Provider Error',
          color: 'var(--color-warning-text)',
          bg: 'var(--color-warning-bg)',
          border: 'var(--color-warning-border)'
        };
      case 'gateway':
      default:
        return {
          icon: <ShieldAlert size={12} />,
          label: 'Gateway Layer Error',
          color: 'var(--color-danger-text)',
          bg: 'var(--color-danger-bg)',
          border: 'var(--color-danger-border)'
        };
    }
  };

  const badge = getOriginBadge();

  return (
    <div
      role="alert"
      style={{
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-danger-border)',
        background: 'var(--color-danger-bg)',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '12px',
        margin: '8px 0'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <AlertCircle
          size={16}
          style={{ color: 'var(--color-danger-text)', flexShrink: 0, marginTop: '2px' }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 6px',
                borderRadius: '4px',
                background: badge.bg,
                color: badge.color,
                border: `1px solid ${badge.border}`
              }}
            >
              {badge.icon}
              <span>{badge.label}</span>
            </span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {error.title}
            </span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.5' }}>
            {error.message}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        {error.canRetry && onRetry && (
          <Button
            size="sm"
            variant="outline"
            onClick={onRetry}
            leftIcon={<RotateCcw size={12} />}
            style={{ fontSize: '12px', padding: '4px 10px' }}
          >
            Retry
          </Button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss error"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
};
