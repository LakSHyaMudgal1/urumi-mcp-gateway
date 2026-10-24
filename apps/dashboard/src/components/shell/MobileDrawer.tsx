import React, { useEffect, useRef } from 'react';
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

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
  triggerRef: React.RefObject<HTMLButtonElement>;
}

export const MobileDrawer: React.FC<MobileDrawerProps> = ({
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

      // Simple focus trap
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

  if (!isOpen) return null;

  const visibleItems = NAV_ITEMS.filter(item => !item.adminOnly || isAdmin);
  const groups: Array<'platform' | 'governance' | 'tools'> = ['platform', 'governance', 'tools'];

  const handleSelectTab = (tab: TabType) => {
    onTabChange(tab);
    onClose();
    triggerRef.current?.focus();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="mobile-nav-backdrop"
        onClick={() => {
          onClose();
          triggerRef.current?.focus();
        }}
        aria-hidden="true"
      />

      {/* Drawer Dialog */}
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Mobile Navigation"
        className="mobile-nav-drawer"
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

                {groupItems.map((item, iIdx) => {
                  const isActive = currentTab === item.id;
                  const isFirst = gIdx === 0 && iIdx === 0;

                  return (
                    <button
                      key={item.id}
                      ref={isFirst ? firstLinkRef : undefined}
                      onClick={() => handleSelectTab(item.id)}
                      className={`shell-nav-link ${isActive ? 'active' : ''}`}
                      aria-current={isActive ? 'page' : undefined}
                      style={{ padding: '10px 12px' }}
                    >
                      <span className="shell-nav-icon">
                        {item.icon}
                      </span>
                      <span className="shell-nav-label" style={{ fontSize: '13px' }}>
                        {item.label}
                      </span>
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

        {/* User Footer */}
        {user && (
          <div
            style={{
              padding: '14px 16px',
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
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  backgroundColor: isAdmin ? 'var(--accent-subtle)' : 'rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: isAdmin ? 'var(--accent-text)' : 'var(--text-primary)',
                  flexShrink: 0
                }}
              >
                {user.name.charAt(0).toUpperCase()}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                    {user.name}
                  </span>
                  <Badge variant={isAdmin ? 'accent' : 'neutral'} style={{ padding: '0 4px', fontSize: '9px' }}>
                    {isAdmin ? <ShieldCheck size={9} style={{ marginRight: '2px' }} /> : <UserCheck size={9} style={{ marginRight: '2px' }} />}
                    {user.role}
                  </Badge>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                  {user.email}
                </span>
              </div>
            </div>

            <button
              onClick={logout}
              aria-label="Sign out"
              title="Sign Out"
              style={{
                background: 'transparent',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                width: '32px',
                height: '32px',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <LogOut size={14} />
            </button>
          </div>
        )}
      </aside>
    </>
  );
};
