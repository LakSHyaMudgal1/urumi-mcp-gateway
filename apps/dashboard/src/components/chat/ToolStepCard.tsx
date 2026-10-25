import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChatToolCallTrace } from '../../types/index.js';
import { getSafeToolSummary } from './chatUtils.js';
import { usePrefersReducedMotion, motionTokens } from '../../theme/motion.js';
import {
  Wrench,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Copy,
  Check,
  AlertTriangle,
  ShieldCheck
} from 'lucide-react';

interface ToolStepCardProps {
  stepIndex: number;
  toolCall: ChatToolCallTrace;
  userEmail?: string;
  userRole?: string;
}

export const ToolStepCard: React.FC<ToolStepCardProps> = ({
  stepIndex,
  toolCall,
  userEmail,
  userRole
}) => {
  const prefersReduced = usePrefersReducedMotion();
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedArgs, setCopiedArgs] = useState(false);
  const [copiedResult, setCopiedResult] = useState(false);

  const isFailed = toolCall.status === 'error';
  const isRunning = !toolCall.status;
  const isSuccess = toolCall.status === 'success';

  const summary = getSafeToolSummary(toolCall);

  const copyPayload = async (data: any, setCopied: (v: boolean) => void) => {
    try {
      const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard fallback
    }
  };

  // Format clean tool name
  const cleanToolName = toolCall.toolName.includes('__')
    ? toolCall.toolName.split('__')[1]
    : toolCall.toolName;

  const upstreamSlug = toolCall.upstreamSlug || (
    toolCall.toolName.includes('__') ? toolCall.toolName.split('__')[0] : 'gateway'
  );

  return (
    <div
      style={{
        borderRadius: 'var(--radius-md)',
        border: `1px solid ${isFailed ? 'var(--color-danger-border)' : 'var(--border-subtle)'}`,
        background: isFailed ? 'rgba(239, 68, 68, 0.04)' : 'var(--bg-surface-elevated)',
        overflow: 'hidden',
        transition: 'border-color 0.15s ease',
        marginTop: '6px'
      }}
    >
      {/* Header Bar */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-label={`Toggle details for tool step ${stepIndex}: ${cleanToolName}`}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          gap: '8px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', minWidth: 0 }}>
          {/* Step Number Badge */}
          <span
            style={{
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              color: 'var(--text-muted)',
              background: 'rgba(255, 255, 255, 0.06)',
              padding: '2px 6px',
              borderRadius: '4px'
            }}
          >
            Step {stepIndex}
          </span>

          {/* Upstream Badge */}
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--color-primary)',
              background: 'var(--bg-canvas)',
              border: '1px solid var(--border-subtle)',
              padding: '2px 6px',
              borderRadius: '4px',
              textTransform: 'lowercase'
            }}
          >
            {upstreamSlug}
          </span>

          {/* Tool Name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Wrench size={12} style={{ color: 'var(--text-muted)' }} />
            <code
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)'
              }}
            >
              {cleanToolName}
            </code>
          </div>

          {/* Status Badge */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              fontWeight: 500,
              padding: '2px 6px',
              borderRadius: '4px',
              background: isFailed
                ? 'var(--color-danger-bg)'
                : isRunning
                ? 'var(--color-info-bg)'
                : 'var(--color-success-bg)',
              color: isFailed
                ? 'var(--color-danger-text)'
                : isRunning
                ? 'var(--color-info-text)'
                : 'var(--color-success-text)',
              border: `1px solid ${
                isFailed
                  ? 'var(--color-danger-border)'
                  : isRunning
                  ? 'var(--color-info-border)'
                  : 'var(--color-success-border)'
              }`
            }}
          >
            {isFailed && <XCircle size={11} />}
            {isRunning && <Loader2 size={11} className="spin" />}
            {isSuccess && <CheckCircle2 size={11} />}
            <span>{isFailed ? 'Failed' : isRunning ? 'Running' : 'Succeeded'}</span>
          </span>

          {/* Latency */}
          {toolCall.durationMs !== undefined && (
            <span
              style={{
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)'
              }}
            >
              {toolCall.durationMs}ms
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', flexShrink: 0 }}>
          <span style={{ fontSize: '11px' }}>{isExpanded ? 'Hide details' : 'Inspect'}</span>
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </button>

      {/* Collapsed Safe Summary Bar */}
      {!isExpanded && (
        <div
          style={{
            padding: '4px 12px 8px',
            fontSize: '11px',
            color: isFailed ? 'var(--color-danger-text)' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          {isFailed && <AlertTriangle size={12} style={{ flexShrink: 0 }} />}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {summary}
          </span>
        </div>
      )}

      {/* Expanded Accordion Body */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={prefersReduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={prefersReduced ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
            exit={prefersReduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{
              duration: prefersReduced ? 0 : motionTokens.duration.fast,
              ease: motionTokens.ease.standard
            }}
            style={{
              overflow: 'hidden',
              borderTop: '1px solid var(--border-subtle)',
              background: 'rgba(0, 0, 0, 0.2)'
            }}
          >
            <div
              style={{
                padding: '10px 12px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}
            >
              {/* Transparency Callout if Failed */}
              {isFailed && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    padding: '8px 10px',
                    background: 'var(--color-danger-bg)',
                    border: '1px solid var(--color-danger-border)',
                    borderRadius: 'var(--radius-xs)',
                    fontSize: '11px',
                    color: 'var(--color-danger-text)'
                  }}
                >
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong>Transparency Note:</strong> Tool call failed upstream. The model responded without valid data from this tool.
                    {toolCall.errorMessage && (
                      <div style={{ marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                        Reason: {toolCall.errorMessage}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Caller Attribution Info */}
              {userEmail && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '11px',
                    color: 'var(--text-muted)'
                  }}
                >
                  <ShieldCheck size={12} style={{ color: 'var(--color-success-text)' }} />
                  <span>
                    Attributed caller: <strong style={{ color: 'var(--text-secondary)' }}>{userEmail}</strong> ({userRole || 'authenticated'}) via Gateway Proxy
                  </span>
                </div>
              )}

              {/* Tool Arguments */}
              {toolCall.arguments && Object.keys(toolCall.arguments).length > 0 && (
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '4px',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: 'var(--text-secondary)'
                    }}
                  >
                    <span>Input Arguments</span>
                    <button
                      type="button"
                      onClick={() => copyPayload(toolCall.arguments, setCopiedArgs)}
                      aria-label="Copy input arguments"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: copiedArgs ? 'var(--color-success-text)' : 'var(--text-muted)',
                        cursor: 'pointer',
                        fontSize: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px'
                      }}
                    >
                      {copiedArgs ? <Check size={10} /> : <Copy size={10} />}
                      <span>{copiedArgs ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <pre
                    style={{
                      margin: 0,
                      padding: '8px 10px',
                      background: 'var(--bg-canvas)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-xs)',
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-primary)',
                      maxHeight: '140px',
                      overflowY: 'auto',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word'
                    }}
                  >
                    {JSON.stringify(toolCall.arguments, null, 2)}
                  </pre>
                </div>
              )}

              {/* Tool Execution Result */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--text-secondary)'
                  }}
                >
                  <span>Tool Response Result</span>
                  <button
                    type="button"
                    onClick={() => copyPayload(toolCall.result?.content || toolCall.result, setCopiedResult)}
                    aria-label="Copy tool result"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: copiedResult ? 'var(--color-success-text)' : 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px'
                    }}
                  >
                    {copiedResult ? <Check size={10} /> : <Copy size={10} />}
                    <span>{copiedResult ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <pre
                  style={{
                    margin: 0,
                    padding: '8px 10px',
                    background: 'var(--bg-canvas)',
                    border: `1px solid ${isFailed ? 'var(--color-danger-border)' : 'var(--border-subtle)'}`,
                    borderRadius: 'var(--radius-xs)',
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    color: isFailed ? 'var(--color-danger-text)' : 'var(--color-success-text)',
                    maxHeight: '180px',
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word'
                  }}
                >
                  {typeof toolCall.result === 'string'
                    ? toolCall.result
                    : JSON.stringify(toolCall.result?.content || toolCall.result, null, 2)}
                </pre>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
