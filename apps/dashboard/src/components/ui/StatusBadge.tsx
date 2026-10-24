import React from 'react';
import { Badge, BadgeProps } from './Badge.js';

export type SystemStatus =
  | 'connected'
  | 'unreachable'
  | 'disabled'
  | 'provisioning'
  | 'ready'
  | 'failed'
  | 'success'
  | 'warning'
  | 'error'
  | 'active'
  | 'revoked';

interface StatusBadgeProps {
  status: SystemStatus | string;
  label?: string;
  style?: React.CSSProperties;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label, style = {}, className = '' }) => {
  const normalized = (status || '').toLowerCase();

  const getConfig = (): { variant: BadgeProps['variant']; text: string; dot: boolean } => {
    switch (normalized) {
      case 'connected':
      case 'ready':
      case 'active':
      case 'success':
        return { variant: 'success', text: label || capitalize(normalized), dot: true };

      case 'provisioning':
      case 'warning':
      case 'pending':
        return { variant: 'warning', text: label || capitalize(normalized), dot: true };

      case 'unreachable':
      case 'failed':
      case 'error':
      case 'revoked':
        return { variant: 'danger', text: label || capitalize(normalized), dot: true };

      case 'disabled':
        return { variant: 'neutral', text: label || 'Disabled', dot: true };

      default:
        return { variant: 'neutral', text: label || capitalize(normalized) || 'Unknown', dot: false };
    }
  };

  const { variant, text, dot } = getConfig();

  return (
    <Badge variant={variant} dot={dot} style={style} className={className}>
      {text}
    </Badge>
  );
};

function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
