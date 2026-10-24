import React from 'react';
import { useAuth } from '../context/AuthContext.js';
import { Badge } from './ui/Badge.js';
import {
  Server,
  Store,
  Users,
  Terminal,
  ScrollText,
  Bot,
  LogOut,
  Layers,
  ShieldCheck,
  UserCheck
} from 'lucide-react';

export type TabType = 'servers' | 'stores' | 'team' | 'setup' | 'audit' | 'chat';

interface NavbarProps {
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
  gatewayStatus?: { status: string; uptime: number; database: string } | null;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, onTabChange, gatewayStatus }) => {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';

  const isHealthy = gatewayStatus?.status === 'healthy';

  const navItems: Array<{ id: TabType; label: string; icon: React.ReactNode; adminOnly?: boolean }> = [
    { id: 'servers', label: 'MCP Servers', icon: <Server size={15} /> },
    { id: 'stores', label: 'Stores', icon: <Store size={15} /> },
    { id: 'team', label: 'Team & Keys', icon: <Users size={15} /> },
    { id: 'setup', label: 'Client Setup', icon: <Terminal size={15} /> },
    { id: 'audit', label: 'Audit Logs', icon: <ScrollText size={15} />, adminOnly: true },
    { id: 'chat', label: 'Chat Agent', icon: <Bot size={15} /> }
  ];

  const visibleNavItems = navItems.filter(item => !item.adminOnly || isAdmin);

  return (
    <header
      style={{
        borderBottom: '1px solid var(--border-subtle)',
        backgroundColor: 'var(--bg-surface)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        width: '100%'
      }}
    >
      <div
        style={{
          maxWidth: '1440px',
          margin: '0 auto',
          padding: '0 20px',
          height: '60px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px'
        }}
      >
        {/* Left: Brand / Platform Identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--accent-subtle)',
              border: '1px solid var(--accent-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-text)'
            }}
            aria-hidden="true"
          >
            <Layers size={18} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.01em'
                }}
              >
                Urumi MCP Gateway
              </span>
              <Badge variant={isHealthy ? 'success' : 'neutral'} dot>
                {isHealthy ? 'Cluster Online' : 'Connected'}
              </Badge>
            </div>
          </div>
        </div>

        {/* Center: Navigation Tabs */}
        <nav
          aria-label="Console views"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            backgroundColor: 'var(--bg-input)',
            padding: '3px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)'
          }}
        >
          {visibleNavItems.map(item => {
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                aria-current={isActive ? 'page' : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: isActive ? 600 : 500,
                  fontFamily: 'var(--font-sans)',
                  borderRadius: 'var(--radius-sm)',
                  border: isActive ? '1px solid var(--border-default)' : '1px solid transparent',
                  cursor: 'pointer',
                  backgroundColor: isActive ? 'var(--bg-surface-elevated)' : 'transparent',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  transition: 'all 0.12s ease'
                }}
              >
                <span
                  style={{
                    color: isActive ? 'var(--accent-text)' : 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right: User Profile & Session */}
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 10px',
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
                  color: isAdmin ? 'var(--accent-text)' : 'var(--text-primary)'
                }}
              >
                {user.name.charAt(0).toUpperCase()}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                    {user.name}
                  </span>
                  <Badge variant={isAdmin ? 'accent' : 'neutral'} style={{ padding: '1px 5px', fontSize: '10px' }}>
                    {isAdmin ? <ShieldCheck size={10} style={{ marginRight: '3px' }} /> : <UserCheck size={10} style={{ marginRight: '3px' }} />}
                    {user.role}
                  </Badge>
                </div>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.2 }}>
                  {user.email}
                </span>
              </div>
            </div>

            <button
              onClick={logout}
              aria-label="Sign out of console"
              title="Sign Out"
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
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--color-danger-text)';
                e.currentTarget.style.borderColor = 'var(--color-danger-border)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-secondary)';
                e.currentTarget.style.borderColor = 'var(--border-subtle)';
              }}
            >
              <LogOut size={14} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
