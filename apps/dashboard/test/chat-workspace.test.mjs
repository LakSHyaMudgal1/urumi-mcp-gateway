import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

// Pure utility functions from chatUtils.ts
function classifyChatError(err, toolCalls) {
  const errMsg = typeof err === 'string' ? err : err?.message || 'Unknown chat error';
  const errLower = errMsg.toLowerCase();

  // 1. Check if tool calls encountered an upstream error
  const failedTool = toolCalls?.find(tc => tc.status === 'error');
  if (failedTool) {
    const upstream = failedTool.upstreamSlug || 'upstream';
    return {
      origin: 'upstream',
      title: `Upstream Failure (${upstream})`,
      message: failedTool.errorMessage || `Tool '${failedTool.toolName}' failed during upstream execution.`,
      canRetry: true
    };
  }

  // 2. Gateway Authorization / Rate Limit / Schema errors
  if (errLower.includes('unauthorized') || errLower.includes('jwt') || errLower.includes('forbidden') || err?.status === 401 || err?.status === 403) {
    return {
      origin: 'gateway',
      title: 'Gateway Authorization Error',
      message: errMsg,
      canRetry: false
    };
  }

  if (errLower.includes('rate limit') || errLower.includes('too many requests') || err?.status === 429) {
    return {
      origin: 'gateway',
      title: 'Gateway Rate Limit Exceeded',
      message: 'Too many chat requests sent in a short window. Please wait before retrying.',
      canRetry: true
    };
  }

  if (errLower.includes('validation') || err?.status === 400) {
    return {
      origin: 'gateway',
      title: 'Gateway Validation Error',
      message: errMsg,
      canRetry: false
    };
  }

  // 3. Model / LLM Provider errors
  if (
    errLower.includes('provider') ||
    errLower.includes('llm') ||
    errLower.includes('openai') ||
    errLower.includes('gemini') ||
    errLower.includes('ollama') ||
    errLower.includes('token') ||
    errLower.includes('model')
  ) {
    return {
      origin: 'model',
      title: 'Model Provider Error',
      message: errMsg,
      canRetry: true
    };
  }

  // Fallback to Gateway Infrastructure error
  return {
    origin: 'gateway',
    title: 'Gateway Orchestration Error',
    message: errMsg,
    canRetry: true
  };
}

function getSafeToolSummary(tc) {
  if (tc.status === 'error') {
    return tc.errorMessage || 'Execution encountered an error';
  }

  if (tc.rawSummary && tc.rawSummary !== 'Execution succeeded') {
    return tc.rawSummary;
  }

  const res = tc.result;
  if (!res) return 'Executed successfully (no output returned)';

  let data = res;
  if (res.content && Array.isArray(res.content) && res.content[0]?.text) {
    try {
      data = JSON.parse(res.content[0].text);
    } catch {
      data = res.content[0].text;
    }
  }

  if (typeof data === 'string') {
    return data.length > 80 ? `${data.slice(0, 77)}...` : data;
  }

  if (Array.isArray(data)) {
    return `Returned ${data.length} item${data.length === 1 ? '' : 's'}`;
  }

  if (typeof data === 'object' && data !== null) {
    if (data.count !== undefined) {
      return `Returned ${data.count} record${data.count === 1 ? '' : 's'}`;
    }
    if (data.orders && Array.isArray(data.orders)) {
      return `Returned ${data.orders.length} order${data.orders.length === 1 ? '' : 's'}`;
    }
    if (data.products && Array.isArray(data.products)) {
      return `Returned ${data.products.length} product${data.products.length === 1 ? '' : 's'}`;
    }
    if (data.availableQuantity !== undefined) {
      return `Available stock: ${data.availableQuantity} unit${data.availableQuantity === 1 ? '' : 's'}`;
    }
    if (data.quantity !== undefined) {
      return `Available stock: ${data.quantity} unit${data.quantity === 1 ? '' : 's'}`;
    }
    if (data.estimated_cost_usd !== undefined) {
      return `Estimated shipping: $${data.estimated_cost_usd}`;
    }
    if (data.id || data.product_id) {
      return `Entity created/found with ID #${data.id || data.product_id}`;
    }
    if (data.message) {
      return String(data.message);
    }
  }

  return 'Execution succeeded with structured data';
}

const CATALOG_PROMPT_TEMPLATES = [
  {
    id: 'orders_today',
    label: 'What orders came in today?',
    prompt: 'What orders came in today?',
    requiredToolSubstrings: ['list_orders', 'orders'],
    icon: 'order'
  },
  {
    id: 'create_product',
    label: "Create Product ($89.99)",
    prompt: "Create a product named 'Vintage Leather Jacket' with price 89.99",
    requiredToolSubstrings: ['create_product'],
    icon: 'product'
  },
  {
    id: 'stock_shipping',
    label: 'Stock + Shipping (CA)',
    prompt: 'Check stock for SKU-HOODIE-M and estimate shipping to CA',
    requiredToolSubstrings: ['get_stock', 'estimate_shipping'],
    icon: 'inventory'
  },
  {
    id: 'check_stock',
    label: 'Check Hoodie Stock',
    prompt: 'What is the current warehouse stock for SKU-HOODIE-M?',
    requiredToolSubstrings: ['get_stock'],
    icon: 'inventory'
  },
  {
    id: 'shipping_options',
    label: 'Shipping Carriers to US',
    prompt: 'What shipping methods and delivery estimates are available for destination US?',
    requiredToolSubstrings: ['shipping', 'shipping_methods'],
    icon: 'shipping'
  },
  {
    id: 'compare_stores',
    label: 'Compare Store Orders',
    prompt: "Compare today's orders between store alpha and store beta",
    requiredToolSubstrings: ['list_orders'],
    icon: 'compare'
  }
];

function deriveStarterPrompts(availableTools) {
  if (!availableTools || availableTools.length === 0) {
    return [];
  }

  const toolNames = availableTools.map(t => t.name.toLowerCase());

  return CATALOG_PROMPT_TEMPLATES.filter(template => {
    return template.requiredToolSubstrings.every(req =>
      toolNames.some(name => name.includes(req.toLowerCase()))
    );
  }).slice(0, 4);
}

function isScrolledNearBottom(element, threshold = 120) {
  if (!element) return true;
  const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
  return distanceFromBottom <= threshold;
}

function sanitizeUrl(rawUrl) {
  const trimmed = (rawUrl || '').trim();
  if (trimmed.startsWith('/') || trimmed.startsWith('#')) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return trimmed;
    }
  } catch {
    return null;
  }
  return null;
}

describe('Chat Workspace: Unit, Security, & Integration Tests', () => {

  describe('1. Capability-Driven Starter Prompts Discovery', () => {
    it('should derive starter prompts only when underlying tool capabilities exist', () => {
      const mockCatalog = [
        { name: 'woocommerce__list_orders', originalName: 'list_orders', upstreamSlug: 'woocommerce', inputSchema: {} },
        { name: 'woocommerce__create_product', originalName: 'create_product', upstreamSlug: 'woocommerce', inputSchema: {} },
        { name: 'inventory__get_stock', originalName: 'get_stock', upstreamSlug: 'inventory', inputSchema: {} },
        { name: 'shipping__estimate_shipping', originalName: 'estimate_shipping', upstreamSlug: 'shipping', inputSchema: {} }
      ];

      const prompts = deriveStarterPrompts(mockCatalog);
      assert.ok(prompts.length > 0);
      assert.ok(prompts.some(p => p.id === 'orders_today'));
      assert.ok(prompts.some(p => p.id === 'create_product'));
      assert.ok(prompts.some(p => p.id === 'stock_shipping'));
    });

    it('should omit prompts requiring missing tools (e.g. shipping missing)', () => {
      const mockCatalog = [
        { name: 'inventory__get_stock', originalName: 'get_stock', upstreamSlug: 'inventory', inputSchema: {} }
      ];

      const prompts = deriveStarterPrompts(mockCatalog);
      const hasStockShipping = prompts.some(p => p.id === 'stock_shipping');
      assert.strictEqual(hasStockShipping, false, 'Should not offer prompt requiring missing shipping tool');

      const hasCheckStock = prompts.some(p => p.id === 'check_stock');
      assert.strictEqual(hasCheckStock, true, 'Should offer prompt matching existing inventory tool');
    });

    it('should return empty prompts when tool catalog is empty or offline', () => {
      assert.deepStrictEqual(deriveStarterPrompts([]), []);
      assert.deepStrictEqual(deriveStarterPrompts(null), []);
    });
  });

  describe('2. Safe Tool Output Summarization', () => {
    it('should summarize structured order lists safely', () => {
      const tc = {
        toolName: 'woocommerce__list_orders',
        upstreamSlug: 'woocommerce',
        arguments: { created_today: true },
        status: 'success',
        result: {
          orders: [{ id: 5001 }, { id: 5002 }]
        }
      };
      assert.strictEqual(getSafeToolSummary(tc), 'Returned 2 orders');
    });

    it('should extract summary from MCP text content JSON', () => {
      const tc = {
        toolName: 'inventory__get_stock',
        status: 'success',
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ sku: 'SKU-HOODIE-M', availableQuantity: 42 })
            }
          ]
        }
      };
      assert.strictEqual(getSafeToolSummary(tc), 'Available stock: 42 units');
    });

    it('should handle shipping estimate responses', () => {
      const tc = {
        toolName: 'shipping__estimate_shipping',
        status: 'success',
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ estimated_cost_usd: '14.50' })
            }
          ]
        }
      };
      assert.strictEqual(getSafeToolSummary(tc), 'Estimated shipping: $14.50');
    });

    it('should handle failed tool calls with error message', () => {
      const tc = {
        toolName: 'woocommerce__create_product',
        status: 'error',
        errorMessage: 'Invalid regular_price format: must be decimal string'
      };
      assert.strictEqual(getSafeToolSummary(tc), 'Invalid regular_price format: must be decimal string');
    });
  });

  describe('3. Error Origin Classification (Gateway vs Model vs Upstream)', () => {
    it('should classify upstream failures when tool call returns status: error', () => {
      const toolCalls = [
        {
          toolName: 'woocommerce__list_orders',
          upstreamSlug: 'woocommerce',
          arguments: {},
          status: 'error',
          errorMessage: 'WooCommerce API connection timeout after 15000ms'
        }
      ];

      const classified = classifyChatError(new Error('Tool execution error'), toolCalls);
      assert.strictEqual(classified.origin, 'upstream');
      assert.ok(classified.title.includes('Upstream Failure (woocommerce)'));
      assert.strictEqual(classified.canRetry, true);
    });

    it('should classify 401/403 as Gateway Authorization errors without retry', () => {
      const authErr = { status: 401, message: 'Unauthorized: Authentication required via Bearer JWT' };
      const classified = classifyChatError(authErr);
      assert.strictEqual(classified.origin, 'gateway');
      assert.strictEqual(classified.title, 'Gateway Authorization Error');
      assert.strictEqual(classified.canRetry, false);
    });

    it('should classify 429 as Gateway Rate Limit with retry allowed', () => {
      const rateErr = { status: 429, message: 'Too many requests' };
      const classified = classifyChatError(rateErr);
      assert.strictEqual(classified.origin, 'gateway');
      assert.strictEqual(classified.title, 'Gateway Rate Limit Exceeded');
      assert.strictEqual(classified.canRetry, true);
    });

    it('should classify LLM provider/quota failures as Model Provider Error', () => {
      const modelErr = new Error('LLM Provider returned 503: Model overloaded');
      const classified = classifyChatError(modelErr);
      assert.strictEqual(classified.origin, 'model');
      assert.strictEqual(classified.title, 'Model Provider Error');
      assert.strictEqual(classified.canRetry, true);
    });
  });

  describe('4. Security & Sanitization: Safe Link URLs', () => {
    it('should allow valid http and https URLs', () => {
      assert.strictEqual(sanitizeUrl('https://example.com/docs'), 'https://example.com/docs');
      assert.strictEqual(sanitizeUrl('http://localhost:4000/api/tools'), 'http://localhost:4000/api/tools');
      assert.strictEqual(sanitizeUrl('/dashboard?tab=servers'), '/dashboard?tab=servers');
    });

    it('should strictly reject malicious javascript: or data: URIs', () => {
      assert.strictEqual(sanitizeUrl('javascript:alert(document.cookie)'), null);
      assert.strictEqual(sanitizeUrl('JAVASCRIPT:void(0)'), null);
      assert.strictEqual(sanitizeUrl('data:text/html,<script>alert(1)</script>'), null);
      assert.strictEqual(sanitizeUrl('vbscript:msgbox(1)'), null);
    });
  });

  describe('5. Scroll Proximity Detection', () => {
    it('should return true when user is within the bottom threshold', () => {
      const mockElement = {
        scrollHeight: 1000,
        scrollTop: 850,
        clientHeight: 100
      };
      assert.strictEqual(isScrolledNearBottom(mockElement, 120), true);
    });

    it('should return false when user has scrolled up to inspect previous tools', () => {
      const mockElement = {
        scrollHeight: 1000,
        scrollTop: 200,
        clientHeight: 100
      };
      assert.strictEqual(isScrolledNearBottom(mockElement, 120), false);
    });
  });

  describe('6. Full End-to-End Gateway Round-Trip (Authenticated Chat & Tool Attribution)', () => {
    let adminToken = '';
    let memberToken = '';

    it('should authenticate admin and verify token', async () => {
      const loginPayload = JSON.stringify({ email: 'admin@urumi.local', password: 'AdminSecurePassword123!' });
      const res = await makeHttpRequest('POST', '/api/auth/login', loginPayload);
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.token);
      assert.strictEqual(res.body.user.email, 'admin@urumi.local');
      assert.strictEqual(res.body.user.role, 'admin');
      adminToken = res.body.token;
    });

    it('should authenticate member and verify token', async () => {
      const loginPayload = JSON.stringify({ email: 'alice@urumi.local', password: 'AlicePassword123!' });
      const res = await makeHttpRequest('POST', '/api/auth/login', loginPayload);
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.token);
      assert.strictEqual(res.body.user.email, 'alice@urumi.local');
      assert.strictEqual(res.body.user.role, 'member');
      memberToken = res.body.token;
    });

    it('should execute chat round-trip with user attribution and visible tool activity (Admin)', async () => {
      const chatPayload = JSON.stringify({
        message: 'What orders came in today?',
        history: []
      });

      const res = await makeHttpRequest('POST', '/api/chat', chatPayload, adminToken);
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.reply, 'Should return model reply');
      assert.strictEqual(res.body.user.email, 'admin@urumi.local', 'Attribution must match authenticated admin');
      assert.ok(Array.isArray(res.body.toolCalls), 'Should include tool call traces');
      assert.ok(res.body.toolCalls.length > 0, 'Should have invoked at least one MCP tool');

      const toolCall = res.body.toolCalls[0];
      assert.ok(toolCall.toolName.includes('list_orders'));
      assert.strictEqual(toolCall.status, 'success');
      assert.strictEqual(toolCall.upstreamSlug, 'woocommerce');
      assert.ok(toolCall.durationMs >= 0);
    });

    it('should execute multi-step tool call round-trip (Stock + Shipping)', async () => {
      const chatPayload = JSON.stringify({
        message: 'Check stock for SKU-HOODIE-M and estimate shipping to CA',
        history: []
      });

      const res = await makeHttpRequest('POST', '/api/chat', chatPayload, adminToken);
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.reply);
      assert.strictEqual(res.body.stepCount >= 2, true, 'Multi-step should execute at least 2 steps');
      assert.strictEqual(res.body.toolCalls.length >= 2, true, 'Should execute both inventory and shipping tools');
      
      const stockTool = res.body.toolCalls.find(tc => tc.toolName.includes('get_stock'));
      const shipTool = res.body.toolCalls.find(tc => tc.toolName.includes('estimate_shipping'));
      assert.ok(stockTool, 'Inventory stock tool must be recorded');
      assert.ok(shipTool, 'Shipping estimate tool must be recorded');
    });

    it('should attribute tool calls strictly to member user context', async () => {
      const chatPayload = JSON.stringify({
        message: 'What orders came in today?',
        history: []
      });

      const res = await makeHttpRequest('POST', '/api/chat', chatPayload, memberToken);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.user.email, 'alice@urumi.local');
      assert.strictEqual(res.body.user.role, 'member');
    });

    it('should fail with 401 when unauthenticated and be classifiable as Gateway Authorization Error', async () => {
      const chatPayload = JSON.stringify({
        message: 'What orders came in today?',
        history: []
      });

      const res = await makeHttpRequest('POST', '/api/chat', chatPayload, '');
      assert.strictEqual(res.statusCode, 401);
      const classified = classifyChatError({ status: res.statusCode, message: res.body.error });
      assert.strictEqual(classified.origin, 'gateway');
      assert.strictEqual(classified.canRetry, false);
    });

    it('should fail with 400 when invalid payload is sent and be classified as Gateway Validation Error', async () => {
      const invalidPayload = JSON.stringify({
        history: []
      });

      const res = await makeHttpRequest('POST', '/api/chat', invalidPayload, adminToken);
      assert.strictEqual(res.statusCode, 400);
      const classified = classifyChatError({ status: res.statusCode, message: res.body.error });
      assert.strictEqual(classified.origin, 'gateway');
      assert.strictEqual(classified.canRetry, false);
    });
  });
});

// Helper for HTTP requests against the local gateway server
function makeHttpRequest(method, path, body = '', token = '') {
  return new Promise((resolve, reject) => {
    const headers = {
      'Content-Type': 'application/json'
    };
    if (body) {
      headers['Content-Length'] = Buffer.byteLength(body);
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request({
      hostname: '127.0.0.1',
      port: 4000,
      path,
      method,
      headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: parsed
        });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}
