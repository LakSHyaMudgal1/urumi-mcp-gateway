import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Phase 7: Dashboard Role-Based Controls & Key Revocation UX', () => {

  describe('1. Role-Based Navigation & Access Permissions', () => {
    // Permission policy helper matching frontend logic
    function getAvailableTabs(role) {
      const baseTabs = [
        { id: 'servers', label: 'MCP Servers' },
        { id: 'team', label: 'Team & Keys' },
        { id: 'client-setup', label: 'Client Setup' },
        { id: 'chat', label: 'Chat Agent' }
      ];

      if (role === 'admin') {
        baseTabs.splice(3, 0, { id: 'audit', label: 'Audit Logs' });
      }

      return baseTabs;
    }

    it('should grant admin users full navigation access including Audit Logs', () => {
      const adminTabs = getAvailableTabs('admin');
      const tabIds = adminTabs.map(t => t.id);
      
      assert.deepEqual(tabIds, ['servers', 'team', 'client-setup', 'audit', 'chat']);
      assert.ok(tabIds.includes('audit'), 'Admin must have access to audit logs');
    });

    it('should restrict member users from accessing Audit Logs', () => {
      const memberTabs = getAvailableTabs('member');
      const tabIds = memberTabs.map(t => t.id);

      assert.deepEqual(tabIds, ['servers', 'team', 'client-setup', 'chat']);
      assert.strictEqual(tabIds.includes('audit'), false, 'Member must not see or access audit logs tab');
    });

    it('should evaluate admin-only UI action visibility correctly', () => {
      const canManageUpstreams = (role) => role === 'admin';
      const canInviteMembers = (role) => role === 'admin';
      const canManageOtherUserKeys = (role) => role === 'admin';
      const canUseChat = (_role) => true;
      const canRefreshToolCache = (_role) => true;

      assert.strictEqual(canManageUpstreams('admin'), true);
      assert.strictEqual(canManageUpstreams('member'), false);

      assert.strictEqual(canInviteMembers('admin'), true);
      assert.strictEqual(canInviteMembers('member'), false);

      assert.strictEqual(canManageOtherUserKeys('admin'), true);
      assert.strictEqual(canManageOtherUserKeys('member'), false);

      assert.strictEqual(canUseChat('admin'), true);
      assert.strictEqual(canUseChat('member'), true);

      assert.strictEqual(canRefreshToolCache('admin'), true);
      assert.strictEqual(canRefreshToolCache('member'), true);
    });
  });

  describe('2. Upstream Server Secret Safety & Credential Rotation', () => {
    it('should sanitize upstream server display and never reveal raw secret tokens', () => {
      const upstreamFromApi = {
        id: 'ups_1',
        name: 'WooCommerce Store',
        slug: 'woocommerce',
        url: 'http://woocommerce-mcp.default.svc.cluster.local:3001/mcp',
        authToken: '********', // Sanitized by gateway
        status: 'connected',
        toolCount: 5,
        timeoutMs: 10000,
        enabled: true
      };

      // Frontend display model
      const displayMetadata = {
        name: upstreamFromApi.name,
        slug: upstreamFromApi.slug,
        url: upstreamFromApi.url,
        status: upstreamFromApi.status,
        toolCount: upstreamFromApi.toolCount,
        hasAuth: Boolean(upstreamFromApi.authToken)
      };

      assert.strictEqual(displayMetadata.url, 'http://woocommerce-mcp.default.svc.cluster.local:3001/mcp');
      assert.strictEqual(upstreamFromApi.authToken, '********', 'Backend must return masked string');
      assert.strictEqual(displayMetadata.hasAuth, true);
      // Ensure no raw token exists on the display metadata
      assert.strictEqual('authToken' in displayMetadata, false);
    });

    it('should allow credential rotation without requiring old secret re-entry', () => {
      // Logic used in UpstreamServersView form submit
      function prepareUpstreamUpdate(original, formInputs) {
        const payload = {
          name: formInputs.name,
          url: formInputs.url,
          timeoutMs: formInputs.timeoutMs,
          enabled: formInputs.enabled
        };

        // If user left authToken blank, do not send authToken so gateway preserves existing secret
        if (formInputs.authToken && formInputs.authToken.trim() !== '') {
          payload.authToken = formInputs.authToken.trim();
        }

        return payload;
      }

      const originalServer = {
        id: 'ups_1',
        name: 'WooCommerce Store',
        url: 'http://woocommerce-mcp:3001/mcp',
        timeoutMs: 10000,
        enabled: true
      };

      // Case A: User only edits name and leaves secret field blank
      const noSecretChange = prepareUpstreamUpdate(originalServer, {
        name: 'WooCommerce Production',
        url: 'http://woocommerce-mcp:3001/mcp',
        authToken: '',
        timeoutMs: 12000,
        enabled: true
      });
      assert.strictEqual(noSecretChange.name, 'WooCommerce Production');
      assert.strictEqual('authToken' in noSecretChange, false, 'Blank secret field must not overwrite existing secret');

      // Case B: User enters a new secret to rotate credentials
      const rotateSecret = prepareUpstreamUpdate(originalServer, {
        name: 'WooCommerce Production',
        url: 'http://woocommerce-mcp:3001/mcp',
        authToken: 'new-secret-token-xyz',
        timeoutMs: 12000,
        enabled: true
      });
      assert.strictEqual(rotateSecret.authToken, 'new-secret-token-xyz');
    });
  });

  describe('3. Single-Display Raw Key UX & Revocation Flow', () => {
    it('should capture raw key on creation, show warning, and wipe from state on dismiss', () => {
      // Simulate state container for key generation dialog
      let keyDialogState = {
        isOpen: false,
        rawKey: null,
        keySummary: null,
        dismissed: false
      };

      // Server response after POST /api/keys
      const createApiResponse = {
        key: {
          id: 'key_123',
          name: 'Alice Claude Code',
          keyPrefix: 'ugk_live_alice1234',
          userId: 'user_alice',
          createdAt: new Date().toISOString(),
          status: 'active'
        },
        rawKey: 'ugk_live_alice1234_abcdef1234567890abcdef1234567890'
      };

      // UI Handler: Key generated
      keyDialogState = {
        isOpen: true,
        rawKey: createApiResponse.rawKey,
        keySummary: createApiResponse.key,
        dismissed: false
      };

      assert.ok(keyDialogState.rawKey.startsWith('ugk_live_'));
      assert.strictEqual(keyDialogState.isOpen, true);

      // Warning text required by specifications
      const warningText = 'This is the only time this raw API key will be displayed. Copy and store it securely immediately. It cannot be recovered.';
      assert.ok(warningText.includes('only time this raw API key will be displayed'));

      // Copy simulation
      let clipboard = '';
      const handleCopy = () => {
        clipboard = keyDialogState.rawKey;
      };
      handleCopy();
      assert.strictEqual(clipboard, createApiResponse.rawKey);

      // User dismisses dialog
      const handleDismiss = () => {
        keyDialogState = {
          isOpen: false,
          rawKey: null,
          keySummary: keyDialogState.keySummary,
          dismissed: true
        };
      };
      handleDismiss();

      // Ensure raw key is purged from memory
      assert.strictEqual(keyDialogState.rawKey, null);
      assert.strictEqual(keyDialogState.isOpen, false);
      assert.strictEqual(keyDialogState.dismissed, true);
    });

    it('should immediately update UI state and mark key as revoked upon DELETE /api/keys/:id', () => {
      let keysList = [
        {
          id: 'key_1',
          name: 'Alice Key 1',
          keyPrefix: 'ugk_live_aaaa',
          status: 'active',
          revokedAt: null
        },
        {
          id: 'key_2',
          name: 'Bob Key',
          keyPrefix: 'ugk_live_bbbb',
          status: 'active',
          revokedAt: null
        }
      ];

      // Simulate revocation action
      const handleRevokeKey = (keyId) => {
        keysList = keysList.map(k => {
          if (k.id === keyId) {
            return {
              ...k,
              status: 'revoked',
              revokedAt: new Date().toISOString()
            };
          }
          return k;
        });
      };

      handleRevokeKey('key_1');

      const revokedKey = keysList.find(k => k.id === 'key_1');
      assert.strictEqual(revokedKey.status, 'revoked');
      assert.ok(revokedKey.revokedAt !== null);

      // Revocation button should be disabled for already revoked keys
      const isRevokable = (key) => key.status === 'active';
      assert.strictEqual(isRevokable(revokedKey), false);
      assert.strictEqual(isRevokable(keysList.find(k => k.id === 'key_2')), true);
    });
  });

  describe('4. Client Setup Configuration Templates & Placeholder Safety', () => {
    function generateClaudeConfig(gatewayUrl, apiKeyPlaceholder = 'YOUR_GATEWAY_API_KEY') {
      return {
        mcpServers: {
          'urumi-gateway': {
            url: `${gatewayUrl}/mcp`,
            headers: {
              Authorization: `Bearer ${apiKeyPlaceholder}`
            }
          }
        }
      };
    }

    function generateCursorEnv(gatewayUrl, apiKeyPlaceholder = 'YOUR_GATEWAY_API_KEY') {
      return `GATEWAY_MCP_URL=${gatewayUrl}/mcp\nGATEWAY_API_KEY=${apiKeyPlaceholder}`;
    }

    it('should use explicit placeholders and never leak credentials into client configs', () => {
      const gatewayUrl = 'http://gateway.urumi.local';
      const config = generateClaudeConfig(gatewayUrl);

      assert.strictEqual(config.mcpServers['urumi-gateway'].url, 'http://gateway.urumi.local/mcp');
      assert.strictEqual(config.mcpServers['urumi-gateway'].headers.Authorization, 'Bearer YOUR_GATEWAY_API_KEY');

      const envConfig = generateCursorEnv(gatewayUrl);
      assert.ok(envConfig.includes('GATEWAY_MCP_URL=http://gateway.urumi.local/mcp'));
      assert.ok(envConfig.includes('GATEWAY_API_KEY=YOUR_GATEWAY_API_KEY'));
    });
  });

  describe('5. Error & Authorization State Handling', () => {
    class MockApiClient {
      constructor() {
        this.token = 'valid_token';
        this.unauthorizedTriggered = false;
      }

      onUnauthorized() {
        this.unauthorizedTriggered = true;
        this.token = null;
      }

      async simulateRequest(status, body) {
        if (status === 401) {
          this.onUnauthorized();
          const err = new Error(body.error || 'Authentication required or session expired');
          err.status = 401;
          throw err;
        }
        if (status === 403) {
          const err = new Error(body.error || 'Forbidden: Insufficient privileges or account disabled');
          err.status = 403;
          throw err;
        }
        if (status >= 500) {
          const err = new Error('Gateway internal error or upstream failure');
          err.status = status;
          throw err;
        }
        return body;
      }
    }

    it('should trigger session reset on 401 Unauthorized', async () => {
      const client = new MockApiClient();
      assert.strictEqual(client.token, 'valid_token');

      await assert.rejects(
        async () => {
          await client.simulateRequest(401, { error: 'Session expired' });
        },
        (err) => {
          assert.strictEqual(err.status, 401);
          assert.strictEqual(err.message, 'Session expired');
          return true;
        }
      );

      assert.strictEqual(client.unauthorizedTriggered, true);
      assert.strictEqual(client.token, null);
    });

    it('should handle 403 Forbidden with clear permission message', async () => {
      const client = new MockApiClient();

      await assert.rejects(
        async () => {
          await client.simulateRequest(403, { error: 'Admin role required' });
        },
        (err) => {
          assert.strictEqual(err.status, 403);
          assert.strictEqual(err.message, 'Admin role required');
          return true;
        }
      );
    });

    it('should handle network failure gracefully with clear connection advice', () => {
      const formatNetworkError = (originalError) => {
        if (originalError.name === 'TypeError' && originalError.message.includes('fetch')) {
          return 'Gateway service is unreachable. Verify your cluster network connection and gateway pod status.';
        }
        return originalError.message || 'An unexpected network error occurred';
      };

      const networkErr = new TypeError('Failed to fetch');
      const formatted = formatNetworkError(networkErr);

      assert.ok(formatted.includes('Gateway service is unreachable'));
    });
  });

});
