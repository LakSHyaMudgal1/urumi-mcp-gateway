import React, { useRef, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Badge, BadgeProps } from './Badge.js';
import { usePrefersReducedMotion, motionTokens } from '../../theme/motion.js';

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
  const prefersReduced = usePrefersReducedMotion();
  const normalized = (status || '').toLowerCase();
  const prevStatusRef = useRef<string>(normalized);
  const [hasChanged, setHasChanged] = useState(false);

  // Animate state change ONLY when a real state update occurs
  useEffect(() => {
    if (prevStatusRef.current !== normalized) {
      prevStatusRef.current = normalized;
      setHasChanged(true);
      const timer = setTimeout(() => setHasChanged(false), 240);
      return () => clearTimeout(timer);
    }
  }, [normalized]);

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
    <motion.span
      animate={
        hasChanged && !prefersReduced
          ? { scale: [1, 1.06, 1], opacity: [0.8, 1, 1] }
          : { scale: 1, opacity: 1 }
      }
      transition={{
        duration: motionTokens.duration.fast,
        ease: motionTokens.ease.standard
      }}
      style={{ display: 'inline-flex' }}
    >
      <Badge variant={variant} dot={dot} style={style} className={className}>
        {text}
      </Badge>
    </motion.span>
  );
};

function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
