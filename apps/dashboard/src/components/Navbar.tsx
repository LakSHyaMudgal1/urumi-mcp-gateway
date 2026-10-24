import React from 'react';
import { useAuth } from '../context/AuthContext.js';

export type TabType = 'servers' | 'team' | 'setup' | 'audit' | 'chat';

interface NavbarProps {
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
  gatewayStatus?: { status: string; uptime: number; database: string } | null;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, onTabChange, gatewayStatus }) => {
  const { user, logout } = useAuth();

  return (
    <header
      className="glass-panel"
      style={{
        margin: '16px 24px',
        padding: '14px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        borderRadius: '16px'
      }}
    >
      {/* Brand & Platform Identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #6366f1, #3b82f6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: '19px',
            color: '#ffffff',
            boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)'
          }}
          aria-hidden="true"
        >
          U
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
              Urumi MCP Gateway
            </h1>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '999px',
                background: gatewayStatus?.status === 'healthy' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                color: gatewayStatus?.status === 'healthy' ? 'var(--accent-success)' : 'var(--accent-primary)',
                border: '1px solid rgba(255, 255, 255, 0.08)'
              }}
            >
              {gatewayStatus?.status === 'healthy' ? '● Cluster Online' : '● Connected'}
            </span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Enterprise Multi-Tenant Tool Gateway
          </p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav
        aria-label="Dashboard views"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'rgba(15, 23, 42, 0.6)',
          padding: '4px',
          borderRadius: '10px',
          border: '1px solid var(--border-subtle)'
        }}
      >
        <button
          onClick={() => onTabChange('servers')}
          aria-current={currentTab === 'servers' ? 'page' : undefined}
          style={{
            padding: '7px 14px',
            fontSize: '13px',
            fontWeight: 600,
            borderRadius: '7px',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            background: currentTab === 'servers' ? 'var(--accent-primary)' : 'transparent',
            color: currentTab === 'servers' ? '#ffffff' : 'var(--text-secondary)'
          }}
        >
          MCP Servers
        </button>

        <button
          onClick={() => onTabChange('team')}
          aria-current={currentTab === 'team' ? 'page' : undefined}
          style={{
            padding: '7px 14px',
            fontSize: '13px',
            fontWeight: 600,
            borderRadius: '7px',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            background: currentTab === 'team' ? 'var(--accent-primary)' : 'transparent',
            color: currentTab === 'team' ? '#ffffff' : 'var(--text-secondary)'
          }}
        >
          Team & Keys
        </button>

        <button
          onClick={() => onTabChange('setup')}
          aria-current={currentTab === 'setup' ? 'page' : undefined}
          style={{
            padding: '7px 14px',
            fontSize: '13px',
            fontWeight: 600,
            borderRadius: '7px',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            background: currentTab === 'setup' ? 'var(--accent-primary)' : 'transparent',
            color: currentTab === 'setup' ? '#ffffff' : 'var(--text-secondary)'
          }}
        >
          Client Setup
        </button>

        {user?.role === 'admin' && (
          <button
            onClick={() => onTabChange('audit')}
            aria-current={currentTab === 'audit' ? 'page' : undefined}
            style={{
              padding: '7px 14px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: '7px',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              background: currentTab === 'audit' ? 'var(--accent-primary)' : 'transparent',
              color: currentTab === 'audit' ? '#ffffff' : 'var(--text-secondary)'
            }}
          >
            Audit Logs
          </button>
        )}

        <button
          onClick={() => onTabChange('chat')}
          aria-current={currentTab === 'chat' ? 'page' : undefined}
          style={{
            padding: '7px 14px',
            fontSize: '13px',
            fontWeight: 600,
            borderRadius: '7px',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            background: currentTab === 'chat' ? 'var(--accent-primary)' : 'transparent',
            color: currentTab === 'chat' ? '#ffffff' : 'var(--text-secondary)'
          }}
        >
          Chat Agent
        </button>
      </nav>

      {/* User Session & Role Indicator */}
      {user && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {user.name}
              </span>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: user.role === 'admin' ? 'rgba(239, 68, 68, 0.18)' : 'rgba(59, 130, 246, 0.18)',
                  color: user.role === 'admin' ? '#f87171' : '#60a5fa',
                  border: user.role === 'admin' ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(59, 130, 246, 0.3)'
                }}
              >
                {user.role}
              </span>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{user.email}</p>
          </div>

          <button
            onClick={logout}
            aria-label="Sign out"
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 500,
              borderRadius: '6px',
              border: '1px solid var(--border-subtle)',
              background: 'rgba(255, 255, 255, 0.05)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'background 0.15s ease'
            }}
          >
            Sign Out
          </button>
        </div>
      )}
    </header>
  );
};
