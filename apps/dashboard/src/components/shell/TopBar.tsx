import React from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { TabType } from '../Navbar.js';
import { Badge } from '../ui/Badge.js';
import { Tooltip } from '../ui/Tooltip.js';
import {
  Menu,
  ShieldCheck,
  UserCheck,
  LogOut,
  ChevronRight
} from 'lucide-react';

interface TopBarProps {
  currentTab: TabType;
  onOpenMobileDrawer: () => void;
  triggerRef: React.Ref<HTMLButtonElement>;
  isMobileDrawerOpen?: boolean;
  gatewayStatus?: { status: string; uptime: number; database: string } | null;
}

const TAB_BREADCRUMBS: Record<TabType, { category: string; title: string }> = {
  overview: { category: 'Platform', title: 'Gateway Overview' },
  stores: { category: 'Platform', title: 'WooCommerce Tenants' },
  servers: { category: 'Platform', title: 'Upstream MCP Servers' },
  team: { category: 'Access', title: 'Team & API Keys' },
  audit: { category: 'Governance', title: 'Cluster Audit Trail' },
  setup: { category: 'Developer Tools', title: 'Client Setup' },
  chat: { category: 'Developer Tools', title: 'Chat / Playground' }
};

export const TopBar: React.FC<TopBarProps> = React.memo(({
  currentTab,
  onOpenMobileDrawer,
  triggerRef,
  isMobileDrawerOpen = false,
  gatewayStatus
}) => {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isHealthy = gatewayStatus?.status === 'healthy';

  const breadcrumb = TAB_BREADCRUMBS[currentTab] || { category: 'Console', title: 'Overview' };

  return (
    <header className="shell-topbar" aria-label="Application Header">
      {/* Left: Mobile Trigger & Context Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
        {/* Mobile menu hamburger button */}
        <button
          ref={triggerRef}
          onClick={onOpenMobileDrawer}
          className="mobile-menu-trigger"
          aria-label="Open mobile navigation"
          aria-expanded={isMobileDrawerOpen}
          aria-controls="mobile-navigation-drawer"
          style={{
            background: 'transparent',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            width: '34px',
            height: '34px',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}
        >
          <Menu size={18} />
        </button>

        {/* Breadcrumb Context */}
        <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', minWidth: 0 }}>
          <span className="topbar-breadcrumb-category" style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {breadcrumb.category}
          </span>
          <ChevronRight size={13} className="topbar-breadcrumb-separator" style={{ color: 'var(--text-disabled)', flexShrink: 0 }} />
          <span style={{ fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
            {breadcrumb.title}
          </span>
        </nav>
      </div>

      {/* Right: Cluster Status & User Session */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        {/* Cluster Status Badge */}
        <Badge
          variant={isHealthy ? 'success' : 'neutral'}
          dot
          style={{ fontSize: '11px', padding: '3px 9px' }}
        >
          {isHealthy ? 'Cluster Online' : 'Connecting'}
        </Badge>

        {/* User Card & Sign Out */}
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 10px 4px 6px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)'
              }}
            >
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  backgroundColor: isAdmin ? 'var(--accent-subtle)' : 'rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: isAdmin ? 'var(--accent-text)' : 'var(--text-primary)',
                  flexShrink: 0
                }}
              >
                {user.name.charAt(0).toUpperCase()}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                    {user.name}
                  </span>
                  <Badge variant={isAdmin ? 'accent' : 'neutral'} style={{ padding: '0 4px', fontSize: '9px' }}>
                    {isAdmin ? <ShieldCheck size={9} style={{ marginRight: '2px' }} /> : <UserCheck size={9} style={{ marginRight: '2px' }} />}
                    {user.role}
                  </Badge>
                </div>
              </div>
            </div>

            <Tooltip content="Sign Out of Console" position="bottom" delayMs={150}>
              <button
                onClick={logout}
                aria-label="Sign out of console"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  backgroundColor: 'var(--bg-surface-elevated)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.12s ease'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.color = 'var(--color-danger-text)';
                  e.currentTarget.style.borderColor = 'var(--color-danger-border)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.color = 'var(--text-secondary)';
                  e.currentTarget.style.borderColor = 'var(--border-subtle)';
                }}
              >
                <LogOut size={14} />
              </button>
            </Tooltip>
          </div>
        )}
      </div>
    </header>
  );
});

TopBar.displayName = 'TopBar';
