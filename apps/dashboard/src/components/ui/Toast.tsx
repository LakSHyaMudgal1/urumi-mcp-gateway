import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { usePrefersReducedMotion, motionTokens } from '../../theme/motion.js';

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ToastContextType {
  toast: (message: string, type?: 'success' | 'error' | 'info') => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const prefersReduced = usePrefersReducedMotion();

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToasts(prev => {
      // Prevent duplicate toasts if an identical toast message is already visible
      if (prev.some(t => t.message === message && t.type === type)) {
        return prev;
      }
      const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const timeout = type === 'error' ? 7000 : 2600;
      setTimeout(() => removeToast(id), timeout);
      return [...prev.slice(-2), { id, message, type }]; // Keep max 3 toasts
    });
  }, [removeToast]);

  const success = useCallback((message: string) => toast(message, 'success'), [toast]);
  const error = useCallback((message: string) => toast(message, 'error'), [toast]);
  const info = useCallback((message: string) => toast(message, 'info'), [toast]);

  const duration = prefersReduced ? 0 : motionTokens.duration.fast;

  return (
    <ToastContext.Provider value={{ toast, success, error, info }}>
      {children}
      <div
        aria-live="polite"
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          zIndex: 1000,
          pointerEvents: 'none'
        }}
      >
        <AnimatePresence>
          {toasts.map(t => {
            const isSuccess = t.type === 'success';
            const isError = t.type === 'error';

            return (
              <motion.div
                key={t.id}
                role={isError ? 'alert' : 'status'}
                initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.96 }}
                animate={prefersReduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                exit={prefersReduced ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
                transition={{
                  duration,
                  ease: motionTokens.ease.standard
                }}
                style={{
                  pointerEvents: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-surface-elevated)',
                  border: `1px solid ${
                    isSuccess
                      ? 'var(--color-success-border)'
                      : isError
                      ? 'var(--color-danger-border)'
                      : 'var(--border-default)'
                  }`,
                  color: isSuccess
                    ? 'var(--color-success-text)'
                    : isError
                    ? 'var(--color-danger-text)'
                    : 'var(--text-primary)',
                  boxShadow: 'var(--shadow-md)',
                  fontSize: '12px',
                  fontWeight: 500,
                  minWidth: '220px',
                  maxWidth: '380px'
                }}
              >
                {isSuccess && <CheckCircle2 size={15} style={{ flexShrink: 0 }} />}
                {isError && <AlertCircle size={15} style={{ flexShrink: 0 }} />}
                {!isSuccess && !isError && <Info size={15} style={{ flexShrink: 0 }} />}
                <span style={{ flex: 1 }}>{t.message}</span>
                <button
                  onClick={() => removeToast(t.id)}
                  aria-label="Close notification"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'inherit',
                    cursor: 'pointer',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    opacity: 0.7,
                    borderRadius: '2px'
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}
                >
                  <X size={14} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
