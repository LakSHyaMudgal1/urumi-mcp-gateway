import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../api/queryClient.js';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import { TabType } from './Navbar.js';
import {
  PageHeader,
  Button,
  Badge,
  StatusBadge,
  Skeleton,
  EmptyState,
  Alert,
  ProgressBar,
  useToast
} from './ui/index.js';
import {
  Activity,
  Server,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Database,
  ArrowRight,
  RefreshCw,
  Plus,
  Terminal,
  KeyRound,
  Bot,
  Globe,
  Radio,
  FileText
} from 'lucide-react';

interface OverviewViewProps {
  onNavigate: (tab: TabType) => void;
  onOpenCreateServer?: () => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({ onNavigate, onOpenCreateServer }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const toast = useToast();

  // TanStack Query for all platform telemetry with stable query keys
  const healthQuery = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => api.getHealth().catch(() => null)
  });

  const upstreamsQuery = useQuery({
    queryKey: queryKeys.upstreams,
    queryFn: () => api.getUpstreams().catch(() => [])
  });

  const toolsQuery = useQuery({
    queryKey: queryKeys.tools,
    queryFn: () => api.getTools().catch(() => ({ count: 0, tools: [] }))
  });

  const auditLogsQuery = useQuery({
    queryKey: queryKeys.auditLogs({ limit: 10 }),
    queryFn: () => api.getAuditLogs({ limit: 10 }).catch(() => ({ logs: [], total: 0 }))
  });

  const keysQuery = useQuery({
    queryKey: queryKeys.keys,
    queryFn: () => api.getKeys().catch(() => [])
  });

  const storesQuery = useQuery({
    queryKey: queryKeys.stores,
    queryFn: () => api.listStores().catch(() => ({ stores: [], quota: { current: 0, max: 3, remaining: 3 } }))
  });

  const health = healthQuery.data || null;
  const upstreams = upstreamsQuery.data || [];
  const tools = toolsQuery.data?.tools || [];
  const recentLogs = auditLogsQuery.data?.logs || [];
  const totalLogs = auditLogsQuery.data?.total || 0;
  const keys = keysQuery.data || [];
  const stores = storesQuery.data?.stores || [];
  const quota = storesQuery.data?.quota || null;

  const isInitialLoading = healthQuery.isLoading || upstreamsQuery.isLoading || toolsQuery.isLoading;
  const isRefetching =
    healthQuery.isRefetching ||
    upstreamsQuery.isRefetching ||
    toolsQuery.isRefetching ||
    auditLogsQuery.isRefetching;

  const queryError = healthQuery.error || upstreamsQuery.error || toolsQuery.error;
  const errorMessage = queryError ? (queryError as any).message || 'Failed to fetch cluster telemetry' : null;

  const handleManualRefresh = async () => {
    try {
      await Promise.all([
        healthQuery.refetch(),
        upstreamsQuery.refetch(),
        toolsQuery.refetch(),
        auditLogsQuery.refetch(),
        keysQuery.refetch(),
        storesQuery.refetch()
      ]);
      toast.success('Cluster telemetry refreshed');
    } catch {
      toast.error('Failed to refresh cluster telemetry');
    }
  };

  // Format uptime into human-readable format
  const formatUptime = (seconds?: number): string => {
    if (!seconds || seconds <= 0) return '0m';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
    return parts.join(' ');
  };

  // Operational metrics calculations
  const connectedUpstreams = upstreams.filter(u => u.enabled && u.status === 'connected');
  const unreachableUpstreams = upstreams.filter(u => u.enabled && u.status === 'unreachable');
  const disabledUpstreams = upstreams.filter(u => !u.enabled);

  const errorLogs = recentLogs.filter(l => l.status === 'error');
  const successLogs = recentLogs.filter(l => l.status === 'success');
  const failureRate = recentLogs.length > 0
    ? ((errorLogs.length / recentLogs.length) * 100).toFixed(1)
    : '0.0';

  const avgDurationMs = recentLogs.length > 0
    ? Math.round(recentLogs.reduce((acc, curr) => acc + (curr.durationMs || 0), 0) / recentLogs.length)
    : 0;

  return (
    <div className="page-container">
      {/* 1. Page Header with Title, Concise Explanation, and Primary Action */}
      <PageHeader
        title="Gateway Cluster Overview"
        description="Real-time health telemetry, upstream connectivity, tool distribution, and error monitoring."
        badge={
          <Badge variant={health?.status === 'healthy' ? 'success' : 'warning'} dot>
            {health?.status === 'healthy' ? 'Cluster Online' : 'Degraded State'}
          </Badge>
        }
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Button
              variant="outline"
              onClick={handleManualRefresh}
              disabled={isInitialLoading || isRefetching}
              isLoading={isRefetching}
              leftIcon={<RefreshCw size={14} />}
              aria-label="Refresh telemetry"
            >
              Refresh Telemetry
            </Button>

            {isAdmin && (
              <Button
                variant="primary"
                onClick={() => {
                  if (onOpenCreateServer) {
                    onOpenCreateServer();
                  } else {
                    onNavigate('servers');
                  }
                }}
                leftIcon={<Plus size={14} />}
                aria-label="Register MCP server"
              >
                Register Upstream
              </Button>
            )}
          </div>
        }
      />

      {/* Hairline synchronization indicator during live telemetry refetch */}
      {isRefetching && (
        <div style={{ marginBottom: '16px' }}>
          <ProgressBar
            indeterminate
            size="xs"
            variant="primary"
            aria-label="Synchronizing gateway cluster telemetry"
          />
        </div>
      )}

      {/* Global Error Banner with Retry */}
      {errorMessage && (
        <Alert
          variant="danger"
          title="Telemetry Connection Error"
          style={{ marginBottom: '24px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <span>{errorMessage}</span>
            <Button size="sm" variant="outline" onClick={handleManualRefresh}>
              Retry Connection
            </Button>
          </div>
        </Alert>
      )}

      {/* 2. Compact Health Summary Cards */}
      {isInitialLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '16px', marginBottom: '28px' }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="console-card" style={{ padding: '20px' }}>
              <Skeleton width="120px" height="14px" style={{ marginBottom: '12px' }} />
              <Skeleton width="160px" height="28px" style={{ marginBottom: '10px' }} />
              <Skeleton width="100%" height="12px" />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '16px', marginBottom: '28px' }}>
          {/* Card 1: Gateway Cluster Health */}
          <div className="console-card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Gateway Health
              </span>
              <Activity size={15} style={{ color: health?.status === 'healthy' ? 'var(--color-success)' : 'var(--color-warning)' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {health?.status === 'healthy' ? 'Healthy' : (health ? 'Unhealthy' : 'Unreachable')}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Uptime {formatUptime(health?.uptime)}
              </span>
            </div>
            <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Database size={11} />
              <span>SQLite DB: {health?.database || 'unknown'}</span>
              <span>•</span>
              <span>Source: /health</span>
            </div>
          </div>

          {/* Card 2: Connected Upstreams */}
          <div className="console-card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Upstream Servers
              </span>
              <Server size={15} style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {connectedUpstreams.length} / {upstreams.length}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Connected
              </span>
            </div>
            <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text-muted)' }}>
              {unreachableUpstreams.length > 0 ? (
                <span style={{ color: 'var(--accent-danger)' }}>{unreachableUpstreams.length} unreachable</span>
              ) : (
                <span style={{ color: 'var(--accent-success)' }}>All enabled services online</span>
              )}
              {disabledUpstreams.length > 0 && <span> • {disabledUpstreams.length} disabled</span>}
            </div>
          </div>

          {/* Card 3: Total Tools Declared */}
          <div className="console-card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Declared Tools
              </span>
              <Wrench size={15} style={{ color: 'var(--accent-text)' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {tools.length} Tools
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Aggregated
              </span>
            </div>
            <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text-muted)' }}>
              Namespaced &lt;slug&gt;__&lt;tool&gt; • Streamable HTTP
            </div>
          </div>

          {/* Card 4: Recent Call Success Rate */}
          <div className="console-card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Tool Call Quality
              </span>
              <Clock size={15} style={{ color: errorLogs.length === 0 ? 'var(--accent-success)' : 'var(--accent-danger)' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '22px', fontWeight: 700, color: errorLogs.length === 0 ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
                {recentLogs.length > 0 ? `${(100 - Number(failureRate)).toFixed(0)}%` : '100%'}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Success rate
              </span>
            </div>
            <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text-muted)' }}>
              {errorLogs.length === 0
                ? `0 errors across ${recentLogs.length} recent calls • avg ${avgDurationMs}ms`
                : `${errorLogs.length} failure(s) in last ${recentLogs.length} calls`}
            </div>
          </div>
        </div>
      )}

      {/* 3. Server Connectivity & Status List */}
      <div style={{ marginBottom: '36px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Upstream MCP Connectivity
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
              Live connection status and tool counts for upstream MCP servers registered with the gateway.
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onNavigate('servers')}
            rightIcon={<ArrowRight size={13} />}
          >
            View Upstream Servers
          </Button>
        </div>

        <div className="console-card" style={{ overflowX: 'auto', padding: 0 }}>
          {isInitialLoading ? (
            <div style={{ padding: '24px' }}>
              <Skeleton width="100%" height="120px" borderRadius="var(--radius-sm)" />
            </div>
          ) : upstreams.length === 0 ? (
            <div style={{ padding: '36px', textAlign: 'center' }}>
              <EmptyState
                icon={<Server size={22} />}
                title="No Upstream Servers Connected"
                description="Connect your first internal cluster microservice via Streamable HTTP."
                actionLabel="Register MCP Server"
                onAction={() => onNavigate('servers')}
              />
            </div>
          ) : (
            <table className="console-table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Slug Prefix</th>
                  <th>Endpoint URL</th>
                  <th>Tools Declared</th>
                  <th>Credentials</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {upstreams.map(server => {
                  const serverTools = tools.filter(t => t.upstreamSlug === server.slug);
                  const statusKey = !server.enabled
                    ? 'disabled'
                    : server.status === 'connected'
                    ? 'connected'
                    : 'unreachable';

                  return (
                    <tr key={server.id}>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {server.name}
                      </td>
                      <td>
                        <Badge variant="accent">{server.slug}</Badge>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Globe size={12} style={{ color: 'var(--text-muted)' }} />
                          <code style={{ fontSize: '11px', color: 'var(--text-primary)' }}>{server.url}</code>
                        </div>
                      </td>
                      <td>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {serverTools.length} tools
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {server.hasAuthToken ? 'Bearer Token Configured' : 'None'}
                        </span>
                      </td>
                      <td>
                        <StatusBadge status={statusKey} />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onNavigate('servers')}
                        >
                          Configure
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 4. Recent Tool-Call Activity & Failure Highlights */}
      <div style={{ marginBottom: '36px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Recent Tool-Call Invocations & Errors
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
              Real execution telemetry from client interactions (Claude Code, Cursor, Chat).
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onNavigate('audit')}
            rightIcon={<ArrowRight size={13} />}
          >
            Full Audit Trail ({totalLogs})
          </Button>
        </div>

        {/* Failed Invocations Callout Banner */}
        {errorLogs.length > 0 && (
          <div
            className="console-card"
            style={{
              padding: '14px 18px',
              marginBottom: '16px',
              backgroundColor: 'var(--color-danger-bg)',
              borderColor: 'var(--color-danger-border)',
              borderRadius: 'var(--radius-sm)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-danger-text)', fontWeight: 600, fontSize: '13px', marginBottom: '6px' }}>
              <AlertTriangle size={15} />
              <span>Attention: {errorLogs.length} Failed Invocations Detected in Recent Traffic</span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {errorLogs.slice(0, 3).map(err => (
                <div key={err.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <code style={{ color: 'var(--color-danger-text)', fontSize: '11px' }}>{err.toolName}</code>
                  <span style={{ color: 'var(--text-muted)' }}>failed at {new Date(err.timestamp).toLocaleTimeString()}</span>
                  <span>—</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{err.errorMessage || 'Upstream service returned error status'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="console-card" style={{ overflowX: 'auto', padding: 0 }}>
          {isInitialLoading ? (
            <div style={{ padding: '24px' }}>
              <Skeleton width="100%" height="160px" borderRadius="var(--radius-sm)" />
            </div>
          ) : recentLogs.length === 0 ? (
            <div style={{ padding: '36px', textAlign: 'center' }}>
              <EmptyState
                icon={<FileText size={22} />}
                title="No Tool Invocations Yet"
                description="Tools will appear here as soon as Claude Code, Cursor, or the Chat Assistant executes a call."
                actionLabel="Open Chat Playground"
                onAction={() => onNavigate('chat')}
              />
            </div>
          ) : (
            <table className="console-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>User Attribution</th>
                  <th>Upstream Target</th>
                  <th>Tool Executed</th>
                  <th>Latency</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {recentLogs.map(log => {
                  const isSuccess = log.status === 'success';
                  return (
                    <tr key={log.id}>
                      <td style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontSize: '12px' }}>
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{log.userEmail}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{log.userId}</div>
                      </td>
                      <td>
                        <Badge variant="info">{log.upstreamSlug}</Badge>
                      </td>
                      <td>
                        <code style={{ color: 'var(--accent-primary)', fontWeight: 600, fontSize: '12px' }}>
                          {log.toolName}
                        </code>
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                        {log.durationMs}ms
                      </td>
                      <td>
                        <StatusBadge status={isSuccess ? 'success' : 'error'} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 5. Real-Data Operational Summary & Outcome Distribution */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '20px', marginBottom: '36px' }}>
        {/* Outcome Breakdown */}
        <div className="console-card" style={{ padding: '20px' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>
            Invocation Outcome Distribution
          </h4>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 16px' }}>
            Based on the last {recentLogs.length} audit records ({recentLogs.length > 0 ? 'Live sample' : 'No data'}).
          </p>

          {recentLogs.length === 0 ? (
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              No invocation records available.
            </p>
          ) : (
            <div>
              {/* Visual Split Bar */}
              <div style={{ height: '8px', width: '100%', borderRadius: '4px', overflow: 'hidden', display: 'flex', marginBottom: '14px' }}>
                <div
                  style={{
                    width: `${(successLogs.length / recentLogs.length) * 100}%`,
                    backgroundColor: 'var(--color-success)',
                    transition: 'width 0.3s ease'
                  }}
                  title={`Success: ${successLogs.length}`}
                />
                <div
                  style={{
                    width: `${(errorLogs.length / recentLogs.length) * 100}%`,
                    backgroundColor: 'var(--color-danger)',
                    transition: 'width 0.3s ease'
                  }}
                  title={`Error: ${errorLogs.length}`}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-success)' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>Success:</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{successLogs.length}</strong>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-danger)' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>Errors:</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{errorLogs.length}</strong>
                </div>

                <div style={{ color: 'var(--text-muted)' }}>
                  Avg Latency: <strong style={{ color: 'var(--text-primary)' }}>{avgDurationMs}ms</strong>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tenant Environment Summary */}
        <div className="console-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Tenant Store Provisioning
            </h4>
            <Button size="sm" variant="ghost" onClick={() => onNavigate('stores')} rightIcon={<ArrowRight size={13} />}>
              View Stores
            </Button>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 16px' }}>
            Isolated Kubernetes WooCommerce environments with dedicated MariaDB & MCP servers.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
              <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {stores.length}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                / {quota?.max || 3} Quota Allocated
              </span>
            </div>

            <Badge variant={stores.length < (quota?.max || 3) ? 'success' : 'warning'}>
              {(quota?.remaining ?? (3 - stores.length))} slots remaining
            </Badge>
          </div>

          <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Each store automatically receives ingress at <code>&lt;slug&gt;.store.local.test</code> and injects scoped tools into the Gateway.
          </div>
        </div>
      </div>

      {/* 6. Contextual Operator Next Steps / Readiness Checklist */}
      <div className="console-card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Gateway Integration & Readiness Checklist
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
              Verify upstream connectivity, client API keys, and tool routing across the gateway.
            </p>
          </div>

          <Badge variant="neutral" dot>
            Operational Checklist
          </Badge>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Step 1: Upstream fleet */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-canvas)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ color: upstreams.length > 0 ? 'var(--accent-success)' : 'var(--text-muted)' }}>
                {upstreams.length > 0 ? <CheckCircle2 size={18} /> : <Radio size={18} />}
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  1. Upstream MCP Servers Registered
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {upstreams.length > 0
                    ? `${connectedUpstreams.length} of ${upstreams.length} upstream servers connected and declaring tools.`
                    : 'No upstream servers configured yet.'}
                </div>
              </div>
            </div>

            <Button
              size="sm"
              variant={upstreams.length > 0 ? 'ghost' : 'primary'}
              onClick={() => onNavigate('servers')}
              rightIcon={<ArrowRight size={13} />}
            >
              {upstreams.length > 0 ? 'View Servers' : 'Register Server'}
            </Button>
          </div>

          {/* Step 2: API Keys */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-canvas)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ color: keys.length > 0 ? 'var(--accent-success)' : 'var(--text-muted)' }}>
                {keys.length > 0 ? <CheckCircle2 size={18} /> : <KeyRound size={18} />}
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  2. Gateway API Key Active
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {keys.length > 0
                    ? `${keys.length} API key(s) active for Bearer token gateway authentication.`
                    : 'Issue a personal key for Claude Code, Cursor, or terminal clients.'}
                </div>
              </div>
            </div>

            <Button
              size="sm"
              variant={keys.length > 0 ? 'ghost' : 'primary'}
              onClick={() => onNavigate('team')}
              rightIcon={<ArrowRight size={13} />}
            >
              {keys.length > 0 ? 'Inspect API Keys' : 'Generate Key'}
            </Button>
          </div>

          {/* Step 3: Client Integration */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-canvas)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ color: 'var(--accent-primary)' }}>
                <Terminal size={18} />
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  3. External Client Configuration Template
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Copy streamable HTTP configuration template for Claude Code or Cursor.
                </div>
              </div>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={() => onNavigate('setup')}
              rightIcon={<ArrowRight size={13} />}
            >
              Client Setup Guide
            </Button>
          </div>

          {/* Step 4: Verification in Playground */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-canvas)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ color: 'var(--accent-text)' }}>
                <Bot size={18} />
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  4. Test Routing in Chat Playground
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Execute natural language queries that orchestrate WooCommerce, Inventory, and Shipping tools.
                </div>
              </div>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={() => onNavigate('chat')}
              rightIcon={<ArrowRight size={13} />}
            >
              Open Chat Playground
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
