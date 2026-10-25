import React from 'react';
import { motion } from 'motion/react';
import { usePrefersReducedMotion, motionTokens } from '../../theme/motion.js';

export interface ProgressBarProps {
  value?: number;
  max?: number;
  indeterminate?: boolean;
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
  size?: 'xs' | 'sm' | 'md';
  label?: string;
  showPercentage?: boolean;
  style?: React.CSSProperties;
  className?: string;
  'aria-label'?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  indeterminate = false,
  variant = 'primary',
  size = 'sm',
  label,
  showPercentage = false,
  style = {},
  className = '',
  'aria-label': ariaLabel
}) => {
  const prefersReduced = usePrefersReducedMotion();
  const isIndeterminate = indeterminate || value === undefined;
  const percentage = isIndeterminate ? 100 : Math.min(100, Math.max(0, ((value ?? 0) / max) * 100));

  const getHeight = () => {
    switch (size) {
      case 'xs':
        return '2px';
      case 'md':
        return '6px';
      case 'sm':
      default:
        return '4px';
    }
  };

  const getVariantColor = () => {
    switch (variant) {
      case 'success':
        return 'var(--color-success)';
      case 'warning':
        return 'var(--color-warning)';
      case 'danger':
        return 'var(--color-danger)';
      case 'info':
        return 'var(--color-info)';
      case 'primary':
      default:
        return 'var(--accent-primary)';
    }
  };

  const height = getHeight();
  const barColor = getVariantColor();

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: '5px', width: '100%', ...style }}
      className={className}
    >
      {(label || (showPercentage && !isIndeterminate)) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px',
            color: 'var(--text-secondary)'
          }}
        >
          {label && <span>{label}</span>}
          {showPercentage && !isIndeterminate && (
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
              {Math.round(percentage)}%
            </span>
          )}
        </div>
      )}

      <div
        role="progressbar"
        aria-valuenow={isIndeterminate ? undefined : Math.round(percentage)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={ariaLabel || label || (isIndeterminate ? 'Action in progress' : `${Math.round(percentage)}% complete`)}
        aria-busy="true"
        style={{
          width: '100%',
          height,
          backgroundColor: 'rgba(255, 255, 255, 0.08)',
          borderRadius: 'var(--radius-full)',
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        {isIndeterminate ? (
          <motion.div
            animate={
              prefersReduced
                ? { opacity: 0.6 }
                : {
                    x: ['-100%', '100%']
                  }
            }
            transition={
              prefersReduced
                ? { duration: 0 }
                : {
                    repeat: Infinity,
                    duration: 1.2,
                    ease: 'linear'
                  }
            }
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              width: '50%',
              backgroundColor: barColor,
              borderRadius: 'var(--radius-full)'
            }}
          />
        ) : (
          <motion.div
            initial={false}
            animate={{ width: `${percentage}%` }}
            transition={{
              duration: prefersReduced ? 0 : motionTokens.duration.normal,
              ease: motionTokens.ease.standard
            }}
            style={{
              height: '100%',
              backgroundColor: barColor,
              borderRadius: 'var(--radius-full)'
            }}
          />
        )}
      </div>
    </div>
  );
};
