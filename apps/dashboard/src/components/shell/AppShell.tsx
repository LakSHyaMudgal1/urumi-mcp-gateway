import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { TabType } from '../Navbar.js';
import { Sidebar } from './Sidebar.js';
import { TopBar } from './TopBar.js';
import { MobileDrawer } from './MobileDrawer.js';

interface AppShellProps {
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
  gatewayStatus?: { status: string; uptime: number; database: string } | null;
  children: React.ReactNode;
}

export function parseRouteFromLocation(): TabType {
  if (typeof window === 'undefined') return 'servers';

  // 1. Check pathname: e.g. /team, /stores, /servers
  const path = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
  // 2. Check hash: e.g. #team
  const hash = window.location.hash.replace(/^#+/, '').toLowerCase();
  // 3. Check query param: e.g. ?tab=team
  const param = new URLSearchParams(window.location.search).get('tab')?.toLowerCase();

  const candidate = path || hash || param || 'overview';

  switch (candidate) {
    case 'overview':
    case 'home':
      return 'overview';
    case 'stores':
    case 'tenants':
      return 'stores';
    case 'servers':
    case 'fleet':
      return 'servers';
    case 'team':
    case 'keys':
      return 'team';
    case 'client-setup':
    case 'setup':
      return 'setup';
    case 'audit':
    case 'logs':
      return 'audit';
    case 'playground':
    case 'chat':
      return 'chat';
    default:
      return 'overview';
  }
}

export const AppShell: React.FC<AppShellProps> = ({
  currentTab,
  onTabChange,
  gatewayStatus,
  children
}) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // Sidebar collapse state with localStorage persistence
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('urumi_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);

  const toggleCollapse = useCallback(() => {
    setIsCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('urumi_sidebar_collapsed', String(next));
      } catch {
        // Ignore storage errors in restricted contexts
      }
      return next;
    });
  }, []);

  // Keyboard shortcut: Ctrl+[ or Cmd+[ toggles sidebar collapse
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '[') {
        e.preventDefault();
        toggleCollapse();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleCollapse]);

  // Handle route navigation with browser back/forward and role verification
  const handleNavChange = useCallback((nextTab: TabType) => {
    if (nextTab === 'audit' && !isAdmin) {
      nextTab = 'servers';
    }

    if (nextTab !== currentTab) {
      onTabChange(nextTab);
      try {
        const nextPath = `/${nextTab}`;
        if (window.location.pathname !== nextPath) {
          window.history.pushState({ tab: nextTab }, '', nextPath);
        }
      } catch {
        // Fallback for restricted sandboxes
      }
    }
  }, [currentTab, onTabChange, isAdmin]);

  // Synchronize on browser Back/Forward (popstate) and hashchange
  useEffect(() => {
    const handlePopState = () => {
      const parsed = parseRouteFromLocation();
      if (parsed === 'audit' && !isAdmin) {
        onTabChange('servers');
      } else {
        onTabChange(parsed);
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
    };
  }, [onTabChange, isAdmin]);

  return (
    <div className="shell-container">
      {/* Desktop Left Rail Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onTabChange={handleNavChange}
        isCollapsed={isCollapsed}
        onToggleCollapse={toggleCollapse}
        gatewayStatus={gatewayStatus}
      />

      {/* Mobile Drawer (Dialog overlay) */}
      <MobileDrawer
        isOpen={isMobileDrawerOpen}
        onClose={() => setIsMobileDrawerOpen(false)}
        currentTab={currentTab}
        onTabChange={handleNavChange}
        triggerRef={mobileTriggerRef}
      />

      {/* Main App Container */}
      <div className="shell-main-wrapper">
        {/* Top Header Bar */}
        <TopBar
          currentTab={currentTab}
          onOpenMobileDrawer={() => setIsMobileDrawerOpen(true)}
          triggerRef={mobileTriggerRef}
          gatewayStatus={gatewayStatus}
        />

        {/* Scrollable Page Content Container */}
        <main id="main-content" className="shell-content" role="main">
          {children}
        </main>
      </div>
    </div>
  );
};
