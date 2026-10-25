import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Loader2, Sparkles, Cpu, Server } from 'lucide-react';
import { usePrefersReducedMotion, motionTokens } from '../../theme/motion.js';

interface ChatStatusIndicatorProps {
  isLoading: boolean;
}

export const ChatStatusIndicator: React.FC<ChatStatusIndicatorProps> = ({ isLoading }) => {
  const prefersReduced = usePrefersReducedMotion();
  const [stage, setStage] = useState<0 | 1 | 2>(0);

  useEffect(() => {
    if (!isLoading) {
      setStage(0);
      return;
    }

    const timer1 = setTimeout(() => setStage(1), 800);
    const timer2 = setTimeout(() => setStage(2), 2200);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [isLoading]);

  if (!isLoading) return null;

  const stageData = [
    {
      icon: <Sparkles size={13} style={{ color: 'var(--color-primary)' }} />,
      text: 'Evaluating query & inspecting gateway tool registry...'
    },
    {
      icon: <Cpu size={13} style={{ color: 'var(--color-info)' }} />,
      text: 'Routing MCP tool call through gateway with user identity...'
    },
    {
      icon: <Server size={13} style={{ color: 'var(--color-warning)' }} />,
      text: 'Awaiting upstream cluster execution & verifying output boundaries...'
    }
  ][stage];

  return (
    <motion.div
      role="status"
      aria-live="polite"
      initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 4 }}
      animate={prefersReduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
      exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -4 }}
      transition={{
        duration: prefersReduced ? 0 : motionTokens.duration.fast,
        ease: motionTokens.ease.standard
      }}
      style={{
        alignSelf: 'flex-start',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 14px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-surface-elevated)',
        border: '1px solid var(--border-subtle)',
        fontSize: '12px',
        color: 'var(--text-secondary)',
        marginTop: '6px'
      }}
    >
      <Loader2 size={13} className="spin" style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
      {stageData.icon}
      <span>{stageData.text}</span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '3px',
          marginLeft: '2px'
        }}
        aria-hidden="true"
      >
        <span
          style={{
            width: '4px',
            height: '4px',
            borderRadius: '50%',
            background: 'var(--color-primary)',
            display: 'inline-block',
            animation: prefersReduced ? 'none' : 'pulse 1s infinite'
          }}
        />
        <span
          style={{
            width: '4px',
            height: '4px',
            borderRadius: '50%',
            background: 'var(--color-primary)',
            display: 'inline-block',
            animation: prefersReduced ? 'none' : 'pulse 1s infinite 0.2s'
          }}
        />
        <span
          style={{
            width: '4px',
            height: '4px',
            borderRadius: '50%',
            background: 'var(--color-primary)',
            display: 'inline-block',
            animation: prefersReduced ? 'none' : 'pulse 1s infinite 0.4s'
          }}
        />
      </span>
    </motion.div>
  );
};
