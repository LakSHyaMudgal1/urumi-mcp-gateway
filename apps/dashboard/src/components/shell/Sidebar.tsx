import React from 'react';
import { motion } from 'motion/react';
import { useAuth } from '../../context/AuthContext.js';
import { TabType } from '../Navbar.js';
import { Tooltip } from '../ui/Tooltip.js';
import { Badge } from '../ui/Badge.js';
import { usePrefersReducedMotion, motionTokens } from '../../theme/motion.js';
import {
  Layers,
  Activity,
  Server,
  Store,
  Users,
  Terminal,
  ScrollText,
  Bot,
  PanelLeftClose,
  PanelLeftOpen,
  Radio
} from 'lucide-react';

export interface NavItemConfig {
  id: TabType;
  label: string;
  group: 'platform' | 'governance' | 'tools';
  icon: React.ReactNode;
  adminOnly?: boolean;
  badge?: string;
}

export const NAV_ITEMS: NavItemConfig[] = [
  // Group 1: Core Platform
  {
    id: 'overview',
    label: 'Overview',
    group: 'platform',
    icon: <Activity size={16} />
  },
  {
    id: 'servers',
    label: 'MCP Servers',
    group: 'platform',
    icon: <Server size={16} />
  },
  {
    id: 'stores',
    label: 'Store Tenants',
    group: 'platform',
    icon: <Store size={16} />
  },

  // Group 2: Access & Governance
  {
    id: 'team',
    label: 'Team & API Keys',
    group: 'governance',
    icon: <Users size={16} />
  },
  {
    id: 'audit',
    label: 'Audit Logs',
    group: 'governance',
    icon: <ScrollText size={16} />,
    adminOnly: true,
    badge: 'Admin'
  },

  // Group 3: Tools & Playground
  {
    id: 'setup',
    label: 'Client Setup',
    group: 'tools',
    icon: <Terminal size={16} />
  },
  {
    id: 'chat',
    label: 'Chat / Playground',
    group: 'tools',
    icon: <Bot size={16} />
  }
];

export const GROUP_LABELS: Record<'platform' | 'governance' | 'tools', string> = {
  platform: 'Core Platform',
  governance: 'Access & Governance',
  tools: 'Agent & Integration'
};

interface SidebarProps {
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  gatewayStatus?: { status: string; uptime: number; database: string } | null;
}

export const Sidebar: React.FC<SidebarProps> = React.memo(({
  currentTab,
  onTabChange,
  isCollapsed,
  onToggleCollapse,
  gatewayStatus
}) => {
  const { user } = useAuth();
  const prefersReduced = usePrefersReducedMotion();
  const isAdmin = user?.role === 'admin';
  const isHealthy = gatewayStatus?.status === 'healthy';

  const visibleItems = NAV_ITEMS.filter(item => !item.adminOnly || isAdmin);
  const groups: Array<'platform' | 'governance' | 'tools'> = ['platform', 'governance', 'tools'];

  return (
    <aside
      className={`shell-sidebar ${isCollapsed ? 'collapsed' : ''}`}
      aria-label="Sidebar Navigation"
    >
      {/* Brand Header */}
      <div className="shell-sidebar-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
          {/* Restrained Brand Monogram */}
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-sm)',
              background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.25), rgba(14, 165, 233, 0.15))',
              border: '1px solid var(--accent-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-text)',
              flexShrink: 0
            }}
            aria-hidden="true"
          >
            <Layers size={17} />
          </div>

          {!isCollapsed && (
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                  Urumi
                </span>
                <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-muted)' }}>
                  Gateway
                </span>
              </div>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1 }}>
                v1.0 • Infrastructure Console
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Groups */}
      <nav className="shell-sidebar-nav" aria-label="Main Navigation">
        {groups.map(groupKey => {
          const groupItems = visibleItems.filter(item => item.group === groupKey);
          if (groupItems.length === 0) return null;

          return (
            <div key={groupKey} className="shell-nav-group">
              {!isCollapsed ? (
                <div className="shell-nav-group-title">
                  {GROUP_LABELS[groupKey]}
                </div>
              ) : (
                <div style={{ height: '1px', background: 'var(--border-muted)', margin: '4px 8px 8px' }} />
              )}

              {groupItems.map(item => {
                const isActive = currentTab === item.id;

                const navButton = (
                  <button
                    key={item.id}
                    onClick={() => onTabChange(item.id)}
                    className={`shell-nav-link ${isActive ? 'active' : ''}`}
                    aria-current={isActive ? 'page' : undefined}
                    aria-label={item.label}
                    style={{
                      justifyContent: isCollapsed ? 'center' : 'flex-start',
                      padding: isCollapsed ? '9px 0' : '8px 10px',
                      position: 'relative'
                    }}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeSidebarIndicator"
                        transition={{
                          duration: prefersReduced ? 0 : 0.16,
                          ease: motionTokens.ease.standard
                        }}
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: '6px',
                          bottom: '6px',
                          width: '3px',
                          borderRadius: '2px',
                          backgroundColor: 'var(--accent-primary)',
                          zIndex: 2
                        }}
                        aria-hidden="true"
                      />
                    )}

                    <span className="shell-nav-icon">
                      {item.icon}
                    </span>

                    {!isCollapsed && (
                      <>
                        <span className="shell-nav-label">{item.label}</span>
                        {item.badge && (
                          <Badge
                            variant={item.id === 'audit' ? 'danger' : 'neutral'}
                            style={{ padding: '1px 5px', fontSize: '10px', marginLeft: 'auto' }}
                          >
                            {item.badge}
                          </Badge>
                        )}
                      </>
                    )}
                  </button>
                );

                if (isCollapsed) {
                  return (
                    <Tooltip key={item.id} content={item.label} position="right" delayMs={100}>
                      {navButton}
                    </Tooltip>
                  );
                }

                return navButton;
              })}
            </div>
          );
        })}
      </nav>

      {/* Footer / Collapse Toggle */}
      <div className="shell-sidebar-footer">
        {!isCollapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Radio
              size={12}
              style={{
                color: isHealthy ? 'var(--color-success)' : 'var(--color-warning)',
                animation: isHealthy ? 'pulse 2s infinite' : 'none'
              }}
              aria-hidden="true"
            />
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>
              {isHealthy ? 'Cluster Healthy' : 'Connecting'}
            </span>
          </div>
        )}

        <Tooltip
          content={isCollapsed ? 'Expand sidebar (Ctrl+[)' : 'Collapse sidebar'}
          position="right"
          delayMs={100}
        >
          <button
            onClick={onToggleCollapse}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: isCollapsed ? 'auto' : undefined,
              marginRight: isCollapsed ? 'auto' : undefined,
              transition: 'all 0.12s ease'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = 'var(--text-primary)';
              e.currentTarget.style.backgroundColor = 'var(--bg-surface-elevated)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'var(--text-muted)';
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            {isCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </Tooltip>
      </div>
    </aside>
  );
});

Sidebar.displayName = 'Sidebar';
