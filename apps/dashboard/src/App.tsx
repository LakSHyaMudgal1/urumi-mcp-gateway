import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { Navbar, TabType } from './components/Navbar.js';
import { LoginScreen } from './components/LoginScreen.js';
import { UpstreamServersView } from './components/UpstreamServersView.js';
import { StoresView } from './components/StoresView.js';
import { TeamManagementView } from './components/TeamManagementView.js';
import { ClientSetupView } from './components/ClientSetupView.js';
import { AuditLogsView } from './components/AuditLogsView.js';
import { ChatAgentView } from './components/ChatAgentView.js';
import { api } from './api/client.js';

const MainDashboard: React.FC = () => {
  const { user, isLoading } = useAuth();
  const [currentTab, setCurrentTab] = useState<TabType>('servers');
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
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        gatewayStatus={gatewayStatus}
      />

      <main style={{ flex: 1 }}>
        {currentTab === 'servers' && <UpstreamServersView />}
        {currentTab === 'stores' && <StoresView />}
        {currentTab === 'team' && <TeamManagementView />}
        {currentTab === 'setup' && <ClientSetupView />}
        {currentTab === 'audit' && user.role === 'admin' && <AuditLogsView />}
        {currentTab === 'chat' && <ChatAgentView />}
      </main>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <MainDashboard />
    </AuthProvider>
  );
};
