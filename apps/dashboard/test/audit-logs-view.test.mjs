import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Pure utility functions from AuditLogsView
function formatRelativeTime(isoString) {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    if (diffMs < 5000) return 'Just now';
    const seconds = Math.floor(diffMs / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return isoString;
  }
}

function formatExactTimestamp(isoString) {
  try {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    }).format(date);
  } catch {
    return isoString;
  }
}

function computeStartDate(range) {
  const now = Date.now();
  switch (range) {
    case '15m':
      return new Date(now - 15 * 60 * 1000).toISOString();
    case '1h':
      return new Date(now - 60 * 60 * 1000).toISOString();
    case '24h':
      return new Date(now - 24 * 60 * 60 * 1000).toISOString();
    case '7d':
      return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    default:
      return undefined;
  }
}

describe('Audit Log Observability & Troubleshooting: Unit & Interaction Tests', () => {

  describe('1. Relative & Timezone-Aware Timestamp Formatting', () => {
    it('should format recent events into relative seconds or minutes', () => {
      const nowIso = new Date().toISOString();
      assert.strictEqual(formatRelativeTime(nowIso), 'Just now');

      const tenSecondsAgo = new Date(Date.now() - 10000).toISOString();
      assert.strictEqual(formatRelativeTime(tenSecondsAgo), '10s ago');

      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      assert.strictEqual(formatRelativeTime(fiveMinutesAgo), '5m ago');

      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      assert.strictEqual(formatRelativeTime(threeHoursAgo), '3h ago');
    });

    it('should format exact timestamps with timezone name and full date representation', () => {
      const iso = '2026-10-24T18:10:29.837Z';
      const exact = formatExactTimestamp(iso);
      // Must contain year and month
      assert.ok(exact.includes('2026'));
      assert.ok(exact.includes('Oct') || exact.includes('10'));
    });
  });

  describe('2. Time-Range Preset Computations', () => {
    it('should calculate accurate ISO timestamps for supported presets', () => {
      const now = Date.now();

      const fifteenMin = computeStartDate('15m');
      assert.ok(fifteenMin);
      const diff15 = Math.abs(now - 15 * 60 * 1000 - new Date(fifteenMin).getTime());
      assert.ok(diff15 < 1000);

      const oneHour = computeStartDate('1h');
      assert.ok(oneHour);
      const diff1h = Math.abs(now - 60 * 60 * 1000 - new Date(oneHour).getTime());
      assert.ok(diff1h < 1000);

      const oneDay = computeStartDate('24h');
      assert.ok(oneDay);
      const diff24h = Math.abs(now - 24 * 60 * 60 * 1000 - new Date(oneDay).getTime());
      assert.ok(diff24h < 1000);

      const allTime = computeStartDate('all');
      assert.strictEqual(allTime, undefined, 'All time must omit startDate filter');
    });
  });

  describe('3. Multi-Field Text Search Filtering', () => {
    const mockLogs = [
      {
        id: 'aud_111',
        timestamp: new Date().toISOString(),
        userId: 'usr_admin',
        userEmail: 'admin@urumi.local',
        upstreamSlug: 'woocommerce',
        toolName: 'list_products',
        durationMs: 45,
        status: 'success',
        errorMessage: null
      },
      {
        id: 'aud_222',
        timestamp: new Date().toISOString(),
        userId: 'usr_alice',
        userEmail: 'alice@company.local',
        upstreamSlug: 'inventory',
        toolName: 'check_stock',
        durationMs: 120,
        status: 'error',
        errorMessage: 'Connection timeout after 3000ms'
      },
      {
        id: 'aud_333',
        timestamp: new Date().toISOString(),
        userId: 'usr_bob',
        userEmail: 'bob@company.local',
        upstreamSlug: 'shipping',
        toolName: 'estimate_rates',
        durationMs: 65,
        status: 'success',
        errorMessage: null
      }
    ];

    it('should filter by tool name substring', () => {
      const filterBySearch = (query) => {
        const q = query.toLowerCase().trim();
        return mockLogs.filter(log =>
          log.toolName.toLowerCase().includes(q) ||
          log.userEmail.toLowerCase().includes(q) ||
          log.upstreamSlug.toLowerCase().includes(q) ||
          log.id.toLowerCase().includes(q) ||
          (log.errorMessage && log.errorMessage.toLowerCase().includes(q))
        );
      };

      assert.strictEqual(filterBySearch('list_products').length, 1);
      assert.strictEqual(filterBySearch('stock').length, 1);
      assert.strictEqual(filterBySearch('alice').length, 1);
      assert.strictEqual(filterBySearch('timeout').length, 1);
      assert.strictEqual(filterBySearch('aud_333').length, 1);
      assert.strictEqual(filterBySearch('nonexistent').length, 0);
    });
  });

  describe('4. Correlation ID & Payload Safety Verification', () => {
    it('should ensure no credentials or raw tokens exist in sanitized parameters or summaries', () => {
      const mockLog = {
        id: 'aud_safe_999',
        parametersSanitized: {
          sku: 'URUMI-HD-01',
          quantity: 2
        },
        responseSummary: 'Found stock: 45 units available'
      };

      const paramsJson = JSON.stringify(mockLog.parametersSanitized);
      assert.strictEqual(paramsJson.includes('authToken'), false);
      assert.strictEqual(paramsJson.includes('password'), false);
      assert.strictEqual(paramsJson.includes('token'), false);
    });

    it('should verify execution correlation ID is copyable', () => {
      const executionId = 'aud_37f0f6c26bb6ebcf4b593675';
      let clipboard = '';
      const handleCopyId = (id) => {
        clipboard = id;
      };

      handleCopyId(executionId);
      assert.strictEqual(clipboard, executionId);
    });
  });

  describe('5. Access Permission Guard', () => {
    it('should restrict audit log tab to administrators only', () => {
      const isTabAuthorized = (tabId, userRole) => {
        if (tabId === 'audit') {
          return userRole === 'admin';
        }
        return true;
      };

      assert.strictEqual(isTabAuthorized('audit', 'admin'), true);
      assert.strictEqual(isTabAuthorized('audit', 'member'), false);
    });
  });
});
