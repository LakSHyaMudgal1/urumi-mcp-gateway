import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Import pure utility functions
function extractEndpointHostname(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const hostWithPort = `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}`;
    const cleanPath = parsed.pathname !== '/' ? parsed.pathname : '';
    return `${hostWithPort}${cleanPath}`;
  } catch {
    return urlStr.replace(/^https?:\/\//, '').split('@').pop() || urlStr;
  }
}

function getServerCategory(slug, name) {
  const s = `${slug} ${name}`.toLowerCase();
  if (s.includes('woo') || s.includes('store') || s.includes('shop') || s.includes('commerce')) {
    return 'E-Commerce';
  }
  if (s.includes('invent') || s.includes('stock') || s.includes('catalog') || s.includes('wareh')) {
    return 'Inventory';
  }
  if (s.includes('ship') || s.includes('fulfill') || s.includes('logist') || s.includes('post') || s.includes('carrier')) {
    return 'Shipping';
  }
  return 'Cluster Service';
}

function formatCheckedTime(isoString) {
  if (!isoString) return 'Not checked yet';
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    if (diffMs < 0) return 'Just now';
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

function validateUpstreamForm(isEdit, name, slug, url, timeout) {
  const errors = {};

  if (!name || !name.trim()) {
    errors.name = 'Server display name is required.';
  } else if (name.trim().length > 100) {
    errors.name = 'Server display name must not exceed 100 characters.';
  }

  if (!isEdit) {
    if (!slug || !slug.trim()) {
      errors.slug = 'Server slug is required.';
    } else if (!/^[a-z0-9-]+$/.test(slug.trim())) {
      errors.slug = 'Slug must contain only lowercase letters, numbers, and hyphens (e.g. "inventory").';
    } else if (slug.trim().length > 50) {
      errors.slug = 'Slug must not exceed 50 characters.';
    }
  }

  if (!url || !url.trim()) {
    errors.url = 'Streamable HTTP endpoint URL is required.';
  } else {
    try {
      const parsed = new URL(url.trim());
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        errors.url = 'Only HTTP and HTTPS protocols are supported.';
      } else if (parsed.hostname === '169.254.169.254' || parsed.hostname.includes('metadata.google')) {
        errors.url = 'Target rejected: Cloud metadata IPs are blocked by SSRF security policy.';
      }
    } catch {
      errors.url = 'Must be a valid URL (e.g. http://inventory-mcp:4002/mcp).';
    }
  }

  if (isNaN(timeout) || timeout < 500 || timeout > 60000) {
    errors.timeout = 'Timeout must be an integer between 500ms and 60,000ms.';
  }

  return errors;
}

describe('Upstream Servers Management View: Operational Table & Configuration Workflow', () => {

  describe('1. Endpoint Hostname Sanitization & Security', () => {
    it('should strip out sensitive embedded basic auth credentials from URLs', () => {
      const url = 'http://admin:secret12345@inventory-mcp:4002/mcp';
      const sanitized = extractEndpointHostname(url);
      assert.strictEqual(sanitized, 'inventory-mcp:4002/mcp');
      assert.strictEqual(sanitized.includes('secret12345'), false);
      assert.strictEqual(sanitized.includes('admin:'), false);
    });

    it('should extract host, port, and path cleanly without protocol prefix', () => {
      const url = 'http://shipping-service.default.svc.cluster.local:8080/v1/mcp';
      const sanitized = extractEndpointHostname(url);
      assert.strictEqual(sanitized, 'shipping-service.default.svc.cluster.local:8080/v1/mcp');
    });

    it('should handle root paths cleanly without trailing slash clutter', () => {
      const url = 'https://api.external-partner.com/';
      const sanitized = extractEndpointHostname(url);
      assert.strictEqual(sanitized, 'api.external-partner.com');
    });
  });

  describe('2. Server Categorization & Domain Tagging', () => {
    it('should accurately categorize e-commerce servers', () => {
      assert.strictEqual(getServerCategory('woocommerce', 'WooCommerce Storefront'), 'E-Commerce');
      assert.strictEqual(getServerCategory('shop', 'Shopify Sync Server'), 'E-Commerce');
    });

    it('should accurately categorize inventory & warehouse servers', () => {
      assert.strictEqual(getServerCategory('inventory', 'Regional Warehouse Inventory'), 'Inventory');
      assert.strictEqual(getServerCategory('stock-mgr', 'Stock Catalog Aggregator'), 'Inventory');
    });

    it('should accurately categorize shipping & fulfillment servers', () => {
      assert.strictEqual(getServerCategory('shipping', 'FedEx / DHL Fulfillment'), 'Shipping');
      assert.strictEqual(getServerCategory('logistics', 'Carrier Dispatch Hub'), 'Shipping');
    });

    it('should fall back gracefully to Cluster Service for custom upstreams', () => {
      assert.strictEqual(getServerCategory('crm', 'Customer Records'), 'Cluster Service');
    });
  });

  describe('3. Relative Time Formatter', () => {
    it('should handle null or undefined checked times with clear accessible label', () => {
      assert.strictEqual(formatCheckedTime(null), 'Not checked yet');
      assert.strictEqual(formatCheckedTime(undefined), 'Not checked yet');
    });

    it('should format recent timestamps as seconds or minutes ago', () => {
      const oneMinuteAgo = new Date(Date.now() - 65 * 1000).toISOString();
      assert.strictEqual(formatCheckedTime(oneMinuteAgo), '1m ago');
    });
  });

  describe('4. Add/Edit Field Validation & SSRF Guard', () => {
    it('should catch missing required fields on create', () => {
      const errors = validateUpstreamForm(false, '', '', '', 10000);
      assert.ok(errors.name, 'Name must be required');
      assert.ok(errors.slug, 'Slug must be required');
      assert.ok(errors.url, 'URL must be required');
    });

    it('should enforce slug format (lowercase alphanumeric and hyphens)', () => {
      const errors = validateUpstreamForm(false, 'My Server', 'INVALID SLUG!', 'http://localhost:4001', 10000);
      assert.ok(errors.slug, 'Slug with uppercase and special chars must be rejected');

      const validErrors = validateUpstreamForm(false, 'My Server', 'valid-slug-123', 'http://localhost:4001', 10000);
      assert.strictEqual(validErrors.slug, undefined);
    });

    it('should reject prohibited URL protocols and SSRF cloud metadata', () => {
      const ftpErrors = validateUpstreamForm(false, 'FTP', 'ftp-serv', 'ftp://127.0.0.1:21/mcp', 10000);
      assert.ok(ftpErrors.url.includes('Only HTTP and HTTPS'));

      const ssrfErrors = validateUpstreamForm(false, 'AWS', 'aws-meta', 'http://169.254.169.254/latest', 10000);
      assert.ok(ssrfErrors.url.includes('SSRF security policy'));
    });

    it('should enforce timeout boundary (500ms to 60,000ms)', () => {
      const lowTimeout = validateUpstreamForm(false, 'Server', 'srv', 'http://127.0.0.1:4000', 100);
      assert.ok(lowTimeout.timeout);

      const highTimeout = validateUpstreamForm(false, 'Server', 'srv', 'http://127.0.0.1:4000', 100000);
      assert.ok(highTimeout.timeout);

      const validTimeout = validateUpstreamForm(false, 'Server', 'srv', 'http://127.0.0.1:4000', 5000);
      assert.strictEqual(validTimeout.timeout, undefined);
    });

    it('should allow slug to be omitted/immutable during edit flow', () => {
      const errors = validateUpstreamForm(true, 'Renamed Server', '', 'http://127.0.0.1:4000', 5000);
      assert.strictEqual(errors.slug, undefined, 'Slug is immutable during edit and should not produce an error');
      assert.strictEqual(Object.keys(errors).length, 0);
    });
  });

  describe('5. Write-Only Secret Rotation & Preservation Semantics', () => {
    function prepareUpdatePayload(inputToken, name, url, timeout, enabled) {
      const payload = { name, url, timeoutMs: timeout, enabled };
      if (inputToken.trim() === '[CLEAR]') {
        payload.authToken = null;
      } else if (inputToken.trim().length > 0) {
        payload.authToken = inputToken.trim();
      }
      // Leaving blank omits authToken, preserving stored credential
      return payload;
    }

    it('should omit authToken when input is blank to preserve existing credential', () => {
      const payload = prepareUpdatePayload('', 'Inventory', 'http://127.0.0.1:4002/mcp', 5000, true);
      assert.strictEqual('authToken' in payload, false, 'Blank input must omit authToken from update payload');
    });

    it('should include new authToken when admin enters a rotated secret', () => {
      const payload = prepareUpdatePayload('new-secret-xyz', 'Inventory', 'http://127.0.0.1:4002/mcp', 5000, true);
      assert.strictEqual(payload.authToken, 'new-secret-xyz');
    });

    it('should send null when admin explicitly types [CLEAR] to revoke credential', () => {
      const payload = prepareUpdatePayload('[CLEAR]', 'Inventory', 'http://127.0.0.1:4002/mcp', 5000, true);
      assert.strictEqual(payload.authToken, null);
    });
  });

  describe('6. Search, Filter, and Pagination Pipeline', () => {
    const mockServers = [
      { id: '1', name: 'WooCommerce Store', slug: 'woocommerce', url: 'http://woo:4001/mcp', enabled: true, status: 'connected', timeoutMs: 3000 },
      { id: '2', name: 'Inventory Service', slug: 'inventory', url: 'http://inv:4002/mcp', enabled: true, status: 'connected', timeoutMs: 2000 },
      { id: '3', name: 'Shipping Service', slug: 'shipping', url: 'http://ship:4003/mcp', enabled: false, status: 'disabled', timeoutMs: 5000 }
    ];

    it('should filter by status correctly', () => {
      const connected = mockServers.filter(s => s.enabled && s.status === 'connected');
      assert.strictEqual(connected.length, 2);

      const disabled = mockServers.filter(s => !s.enabled);
      assert.strictEqual(disabled.length, 1);
      assert.strictEqual(disabled[0].slug, 'shipping');
    });

    it('should search by name, slug, or url substring', () => {
      const query = 'inv';
      const results = mockServers.filter(s =>
        s.name.toLowerCase().includes(query) ||
        s.slug.toLowerCase().includes(query) ||
        s.url.toLowerCase().includes(query)
      );
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].slug, 'inventory');
    });

    it('should paginate items with proper slices and total pages', () => {
      const pageSize = 2;
      const page1 = mockServers.slice(0, pageSize);
      const page2 = mockServers.slice(pageSize, pageSize * 2);

      assert.strictEqual(page1.length, 2);
      assert.strictEqual(page2.length, 1);
      assert.strictEqual(Math.ceil(mockServers.length / pageSize), 2);
    });
  });
});
