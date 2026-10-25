import React, { useState } from 'react';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { queryClient, queryKeys } from './api/queryClient.js';
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
import { PermissionDenied } from './components/ui/PermissionDenied.js';
import { api } from './api/client.js';

const MainDashboard: React.FC = () => {
  const { user, isLoading } = useAuth();
  const [currentTab, setCurrentTab] = useState<TabType>(() => {
    const initial = parseRouteFromLocation();
    return initial;
  });
  const { data: gatewayStatus = null } = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => api.getHealth().catch(() => null),
    refetchInterval: 30_000
  });

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '14px', backgroundColor: 'var(--bg-canvas)' }}>
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
          {currentTab === 'audit' && (
            user.role === 'admin' ? (
              <AuditLogsView onNavigate={setCurrentTab} />
            ) : (
              <PermissionDenied
                title="Admin Role Required"
                description="Cluster audit logs track tool call payloads, durations, and actor attributions. This audit trail is restricted to administrators."
                actionLabel="Return to Overview"
                onAction={() => setCurrentTab('overview')}
              />
            )
          )}
          {currentTab === 'chat' && <ChatAgentView />}
        </>
      )}
    </AppShell>
  );
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <MainDashboard />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};
