import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

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
      setTimeout(() => removeToast(id), 4000);
      return [...prev.slice(-3), { id, message, type }]; // Keep max 4 toasts
    });
  }, [removeToast]);

  const success = useCallback((message: string) => toast(message, 'success'), [toast]);
  const error = useCallback((message: string) => toast(message, 'error'), [toast]);
  const info = useCallback((message: string) => toast(message, 'info'), [toast]);

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
        {toasts.map(t => {
          const isSuccess = t.type === 'success';
          const isError = t.type === 'error';

          return (
            <div
              key={t.id}
              role="status"
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
                  opacity: 0.6,
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <X size={13} />
              </button>
            </div>
          );
        })}
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
