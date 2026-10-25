import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { usePrefersReducedMotion, motionTokens } from '../../theme/motion.js';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: string;
  footer?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = '520px',
  footer
}) => {
  const prefersReduced = usePrefersReducedMotion();
  const previouslyFocusedElement = useRef<HTMLElement | null>(null);
  const modalCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    previouslyFocusedElement.current = document.activeElement as HTMLElement | null;

    // Focus the first focusable element inside modal or the card itself
    const timer = setTimeout(() => {
      if (modalCardRef.current) {
        const focusable = modalCardRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length > 0) {
          focusable[0].focus();
        } else {
          modalCardRef.current.focus();
        }
      }
    }, 40);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      // Accessible Focus Trap
      if (e.key === 'Tab' && modalCardRef.current) {
        const focusable = modalCardRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocusedElement.current && document.contains(previouslyFocusedElement.current)) {
        previouslyFocusedElement.current.focus();
      }
    };
  }, [isOpen, onClose]);

  const duration = prefersReduced ? 0 : motionTokens.duration.normal;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          aria-describedby={description ? 'modal-description' : undefined}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: prefersReduced ? 0 : 0.16 }}
          className="console-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              onClose();
            }
          }}
        >
          <motion.div
            ref={modalCardRef}
            tabIndex={-1}
            className="console-modal-card"
            initial={prefersReduced ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 4 }}
            animate={prefersReduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={prefersReduced ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 4 }}
            transition={{
              duration,
              ease: motionTokens.ease.standard
            }}
            style={{
              maxWidth
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '16px'
              }}
            >
              <div>
                <h3
                  id="modal-title"
                  style={{
                    fontSize: '16px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    letterSpacing: '-0.01em'
                  }}
                >
                  {title}
                </h3>
                {description && (
                  <p
                    id="modal-description"
                    style={{
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                      marginTop: '3px',
                      lineHeight: 1.4
                    }}
                  >
                    {description}
                  </p>
                )}
              </div>

              <button
                onClick={onClose}
                aria-label="Close modal"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '28px',
                  height: '28px',
                  borderRadius: 'var(--radius-xs)',
                  transition: 'color 0.12s ease, background-color 0.12s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--text-primary)';
                  e.currentTarget.style.backgroundColor = 'var(--bg-surface-hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--text-muted)';
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Content */}
            <div
              style={{
                padding: '20px 24px',
                overflowY: 'auto',
                flex: 1
              }}
            >
              {children}
            </div>

            {/* Optional Footer */}
            {footer && (
              <div
                style={{
                  padding: '14px 24px',
                  borderTop: '1px solid var(--border-subtle)',
                  backgroundColor: 'var(--bg-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: '10px'
                }}
              >
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
