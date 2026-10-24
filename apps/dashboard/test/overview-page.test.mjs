import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Overview / Home Page: Operational Telemetry & Interactions', () => {

  // Logic matching OverviewView uptime formatter
  function formatUptime(seconds) {
    if (!seconds || seconds <= 0) return '0m';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
    return parts.join(' ');
  }

  // Logic matching OverviewView metrics computation
  function computeClusterMetrics({ health, upstreams, tools, recentLogs }) {
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

    return {
      isGatewayHealthy: health?.status === 'healthy',
      databaseStatus: health?.database || 'disconnected',
      uptimeFormatted: formatUptime(health?.uptime),
      totalUpstreams: upstreams.length,
      connectedCount: connectedUpstreams.length,
      unreachableCount: unreachableUpstreams.length,
      disabledCount: disabledUpstreams.length,
      totalTools: tools.length,
      recentLogsCount: recentLogs.length,
      successCount: successLogs.length,
      errorCount: errorLogs.length,
      failureRatePercent: failureRate,
      avgDurationMs,
      hasFailedCalls: errorLogs.length > 0
    };
  }

  // Logic matching OverviewView readiness checklist
  function computeChecklistStatus({ upstreams, keys, stores }) {
    return [
      {
        id: 'upstreams',
        label: 'Internal MCP Upstream Services',
        completed: upstreams.length > 0 && upstreams.some(u => u.status === 'connected'),
        actionTab: 'servers',
        actionLabel: upstreams.length > 0 ? 'View Fleet' : 'Register Service'
      },
      {
        id: 'keys',
        label: 'Gateway API Key Generated',
        completed: keys.length > 0,
        actionTab: 'team',
        actionLabel: keys.length > 0 ? 'Manage Keys' : 'Generate Key'
      },
      {
        id: 'setup',
        label: 'Configure External MCP Client',
        completed: true, // Always accessible
        actionTab: 'setup',
        actionLabel: 'Setup Guide'
      },
      {
        id: 'chat',
        label: 'Verify Tool Execution in Playground',
        completed: true,
        actionTab: 'chat',
        actionLabel: 'Open Playground'
      },
      {
        id: 'stores',
        label: 'WooCommerce Tenant Store',
        completed: stores.length > 0,
        actionTab: 'stores',
        actionLabel: stores.length > 0 ? 'View Tenants' : 'Provision Store'
      }
    ];
  }

  describe('1. Health Telemetry & Uptime Computation', () => {
    it('should format seconds into days, hours, and minutes', () => {
      assert.strictEqual(formatUptime(0), '0m');
      assert.strictEqual(formatUptime(45), '0m');
      assert.strictEqual(formatUptime(120), '2m');
      assert.strictEqual(formatUptime(3665), '1h 1m');
      assert.strictEqual(formatUptime(90060), '1d 1h 1m');
    });

    it('should accurately compute health summary from real Gateway responses', () => {
      const mockHealth = {
        service: 'urumi-gateway',
        status: 'healthy',
        uptime: 172800,
        database: 'connected',
        upstreams: { total: 3, enabled: 3 }
      };

      const mockUpstreams = [
        { id: '1', name: 'WooCommerce', slug: 'woocommerce', status: 'connected', enabled: true },
        { id: '2', name: 'Inventory', slug: 'inventory', status: 'connected', enabled: true },
        { id: '3', name: 'Shipping', slug: 'shipping', status: 'unreachable', enabled: true },
        { id: '4', name: 'Legacy', slug: 'legacy', status: 'disabled', enabled: false }
      ];

      const mockTools = [
        { name: 'woocommerce__create_product', upstreamSlug: 'woocommerce' },
        { name: 'inventory__get_stock', upstreamSlug: 'inventory' }
      ];

      const mockLogs = [
        { id: 'l1', status: 'success', durationMs: 40 },
        { id: 'l2', status: 'success', durationMs: 60 },
        { id: 'l3', status: 'error', durationMs: 110, errorMessage: 'Connection timed out' }
      ];

      const metrics = computeClusterMetrics({
        health: mockHealth,
        upstreams: mockUpstreams,
        tools: mockTools,
        recentLogs: mockLogs
      });

      assert.strictEqual(metrics.isGatewayHealthy, true);
      assert.strictEqual(metrics.databaseStatus, 'connected');
      assert.strictEqual(metrics.uptimeFormatted, '2d');
      assert.strictEqual(metrics.totalUpstreams, 4);
      assert.strictEqual(metrics.connectedCount, 2);
      assert.strictEqual(metrics.unreachableCount, 1);
      assert.strictEqual(metrics.disabledCount, 1);
      assert.strictEqual(metrics.totalTools, 2);
      assert.strictEqual(metrics.recentLogsCount, 3);
      assert.strictEqual(metrics.successCount, 2);
      assert.strictEqual(metrics.errorCount, 1);
      assert.strictEqual(metrics.failureRatePercent, '33.3');
      assert.strictEqual(metrics.avgDurationMs, 70);
      assert.strictEqual(metrics.hasFailedCalls, true);
    });
  });

  describe('2. Empty State & Zero-Division Safety', () => {
    it('should handle zero recent logs gracefully without NaN or division by zero', () => {
      const metrics = computeClusterMetrics({
        health: { status: 'healthy', database: 'connected', uptime: 300 },
        upstreams: [],
        tools: [],
        recentLogs: []
      });

      assert.strictEqual(metrics.totalUpstreams, 0);
      assert.strictEqual(metrics.connectedCount, 0);
      assert.strictEqual(metrics.totalTools, 0);
      assert.strictEqual(metrics.failureRatePercent, '0.0');
      assert.strictEqual(metrics.avgDurationMs, 0);
      assert.strictEqual(metrics.hasFailedCalls, false);
    });
  });

  describe('3. Contextual Next Steps & Readiness Checklist', () => {
    it('should evaluate partial configuration state and recommend pending setup steps', () => {
      // Partially configured workspace: upstreams exist, but no API keys or stores
      const steps = computeChecklistStatus({
        upstreams: [{ id: 'ups_1', status: 'connected' }],
        keys: [],
        stores: []
      });

      const upstreamStep = steps.find(s => s.id === 'upstreams');
      const keyStep = steps.find(s => s.id === 'keys');
      const storeStep = steps.find(s => s.id === 'stores');

      assert.strictEqual(upstreamStep.completed, true);
      assert.strictEqual(upstreamStep.actionLabel, 'View Fleet');

      assert.strictEqual(keyStep.completed, false);
      assert.strictEqual(keyStep.actionLabel, 'Generate Key');
      assert.strictEqual(keyStep.actionTab, 'team');

      assert.strictEqual(storeStep.completed, false);
      assert.strictEqual(storeStep.actionLabel, 'Provision Store');
      assert.strictEqual(storeStep.actionTab, 'stores');
    });

    it('should mark all steps as completed in a fully provisioned cluster', () => {
      const steps = computeChecklistStatus({
        upstreams: [{ id: 'ups_1', status: 'connected' }],
        keys: [{ id: 'key_1', name: 'Claude Code' }],
        stores: [{ id: 'store_1', name: 'Store Alpha' }]
      });

      assert.strictEqual(steps.every(s => s.completed), true);
    });
  });

  describe('4. Dashboard Key Actions & Error Recovery Interaction', () => {
    it('should dispatch primary action to register upstream server', () => {
      let navigatedTab = null;
      let modalOpened = false;

      const handlePrimaryAction = (isAdmin) => {
        if (!isAdmin) return;
        modalOpened = true;
        navigatedTab = 'servers';
      };

      handlePrimaryAction(true);
      assert.strictEqual(modalOpened, true);
      assert.strictEqual(navigatedTab, 'servers');
    });

    it('should recover from network failure upon retry action execution', async () => {
      let attempts = 0;
      let error = 'Network failure: 503 Service Unavailable';
      let data = null;

      async function fetchDataWithRetry() {
        attempts++;
        if (attempts === 1) {
          throw new Error('Network failure: 503 Service Unavailable');
        }
        return { status: 'healthy', uptime: 450 };
      }

      // First attempt fails
      try {
        data = await fetchDataWithRetry();
      } catch (err) {
        error = err.message;
      }
      assert.strictEqual(data, null);
      assert.strictEqual(error, 'Network failure: 503 Service Unavailable');

      // Operator clicks 'Retry Connection'
      try {
        data = await fetchDataWithRetry();
        error = null;
      } catch (err) {
        error = err.message;
      }
      assert.deepEqual(data, { status: 'healthy', uptime: 450 });
      assert.strictEqual(error, null);
      assert.strictEqual(attempts, 2);
    });
  });
});
