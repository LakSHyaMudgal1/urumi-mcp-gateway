import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../../context/AuthContext.js';
import { TabType } from '../Navbar.js';
import { NAV_ITEMS, GROUP_LABELS } from './Sidebar.js';
import { Badge } from '../ui/Badge.js';
import {
  Layers,
  X,
  LogOut,
  ShieldCheck,
  UserCheck
} from 'lucide-react';
import { usePrefersReducedMotion, motionTokens } from '../../theme/motion.js';

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
  triggerRef: React.RefObject<HTMLButtonElement>;
}

export const MobileDrawer: React.FC<MobileDrawerProps> = React.memo(({
  isOpen,
  onClose,
  currentTab,
  onTabChange,
  triggerRef
}) => {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';
  const drawerRef = useRef<HTMLDivElement>(null);
  const firstLinkRef = useRef<HTMLButtonElement>(null);
  const prefersReduced = usePrefersReducedMotion();

  // Focus management & Escape key listener
  useEffect(() => {
    if (!isOpen) return;

    // Focus the first navigable button upon opening
    const timer = setTimeout(() => {
      firstLinkRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        triggerRef.current?.focus();
        return;
      }

      // Focus trap
      if (e.key === 'Tab' && drawerRef.current) {
        const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
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

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, triggerRef]);

  const visibleItems = NAV_ITEMS.filter(item => !item.adminOnly || isAdmin);
  const groups: Array<'platform' | 'governance' | 'tools'> = ['platform', 'governance', 'tools'];

  const handleSelectTab = (tab: TabType) => {
    onTabChange(tab);
    onClose();
    triggerRef.current?.focus();
  };

  const duration = prefersReduced ? 0 : motionTokens.duration.normal;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReduced ? 0 : 0.16 }}
            className="mobile-nav-backdrop"
            onClick={() => {
              onClose();
              triggerRef.current?.focus();
            }}
            aria-hidden="true"
          />

          {/* Drawer Dialog */}
          <motion.aside
            id="mobile-navigation-drawer"
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Mobile Navigation"
            className="mobile-nav-drawer"
            initial={prefersReduced ? { opacity: 0 } : { x: '-100%' }}
            animate={prefersReduced ? { opacity: 1 } : { x: 0 }}
            exit={prefersReduced ? { opacity: 0 } : { x: '-100%' }}
            transition={{
              duration,
              ease: motionTokens.ease.standard
            }}
          >
            {/* Header */}
            <div
              style={{
                height: '56px',
                padding: '0 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid var(--border-subtle)',
                flexShrink: 0
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.2), rgba(14, 165, 233, 0.2))',
                    border: '1px solid var(--accent-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--accent-text)'
                  }}
                  aria-hidden="true"
                >
                  <Layers size={17} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Urumi
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Gateway
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  onClose();
                  triggerRef.current?.focus();
                }}
                aria-label="Close navigation drawer"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 'var(--radius-sm)'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Nav Links */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {groups.map((groupKey, gIdx) => {
                const groupItems = visibleItems.filter(item => item.group === groupKey);
                if (groupItems.length === 0) return null;

                return (
                  <div key={groupKey} className="shell-nav-group">
                    <div className="shell-nav-group-title">
                      {GROUP_LABELS[groupKey]}
                    </div>

                    {groupItems.map((item, itemIdx) => {
                      const isActive = currentTab === item.id;
                      const isFirstOverall = gIdx === 0 && itemIdx === 0;

                      return (
                        <button
                          key={item.id}
                          ref={isFirstOverall ? firstLinkRef : undefined}
                          onClick={() => handleSelectTab(item.id)}
                          className={`shell-nav-link ${isActive ? 'active' : ''}`}
                          aria-current={isActive ? 'page' : undefined}
                        >
                          <span className="shell-nav-icon">{item.icon}</span>
                          <span className="shell-nav-label">{item.label}</span>
                          {item.badge && (
                            <Badge
                              variant={item.id === 'audit' ? 'danger' : 'neutral'}
                              style={{ padding: '1px 5px', fontSize: '10px', marginLeft: 'auto' }}
                            >
                              {item.badge}
                            </Badge>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Footer / User Profile */}
            <div
              style={{
                padding: '16px',
                borderTop: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-surface-elevated)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: isAdmin ? 'var(--accent-subtle)' : 'var(--bg-surface)',
                    border: `1px solid ${isAdmin ? 'var(--accent-border)' : 'var(--border-subtle)'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: isAdmin ? 'var(--accent-text)' : 'var(--text-secondary)',
                    flexShrink: 0
                  }}
                  aria-hidden="true"
                >
                  {isAdmin ? <ShieldCheck size={16} /> : <UserCheck size={16} />}
                </div>
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {user?.name || user?.email}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {isAdmin ? 'Administrator' : 'Team Member'}
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  logout();
                  onClose();
                }}
                aria-label="Sign out"
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-xs)',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '6px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px'
                }}
              >
                <LogOut size={13} />
                <span>Exit</span>
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
});

MobileDrawer.displayName = 'MobileDrawer';

