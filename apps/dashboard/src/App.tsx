import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { TabType } from './components/Navbar.js';
import { AppShell, parseRouteFromLocation } from './components/shell/index.js';
import { LoginScreen } from './components/LoginScreen.js';
import { OverviewView } from './components/OverviewView.js';
import { UpstreamServersView } from './components/UpstreamServersView.js';
import { StoresView } from './components/StoresView.js';
import { TeamManagementView } from './components/TeamManagementView.js';
import { ClientSetupView } from './components/ClientSetupView.js';
import { AuditLogsView } from './components/AuditLogsView.js';
import { ChatAgentView } from './components/ChatAgentView.js';
import { StyleGuideView } from './components/StyleGuideView.js';
import { ToastProvider } from './components/ui/Toast.js';
import { api } from './api/client.js';

const MainDashboard: React.FC = () => {
  const { user, isLoading } = useAuth();
  const [currentTab, setCurrentTab] = useState<TabType>(() => {
    const initial = parseRouteFromLocation();
    return initial;
  });
  const [gatewayStatus, setGatewayStatus] = useState<{ status: string; uptime: number; database: string } | null>(null);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const health = await api.getHealth();
        setGatewayStatus(health);
      } catch {
        setGatewayStatus(null);
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '14px' }}>
        Initializing Urumi Gateway session...
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <AppShell
      currentTab={currentTab}
      onTabChange={setCurrentTab}
      gatewayStatus={gatewayStatus}
    >
      {typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('view') === 'styleguide' ? (
        <StyleGuideView />
      ) : (
        <>
          {currentTab === 'overview' && <OverviewView onNavigate={setCurrentTab} />}
          {currentTab === 'servers' && <UpstreamServersView />}
          {currentTab === 'stores' && <StoresView />}
          {currentTab === 'team' && <TeamManagementView />}
          {currentTab === 'setup' && <ClientSetupView />}
          {currentTab === 'audit' && user.role === 'admin' && <AuditLogsView />}
          {currentTab === 'chat' && <ChatAgentView />}
        </>
      )}
    </AppShell>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <ToastProvider>
        <MainDashboard />
      </ToastProvider>
    </AuthProvider>
  );
};
