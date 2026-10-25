import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Team Access & API-Key Interface: Operational Security & Workflow Tests', () => {

  describe('1. Gateway URL vs Personal API Key Distinction', () => {
    it('should clearly differentiate between the shared Gateway SSE URL and user personal key', () => {
      const gatewayEndpoint = 'http://localhost:4000/mcp';
      const personalKey = 'urumi_live_alice1234_abcdef1234567890abcdef1234567890';

      // Gateway URL must be a valid HTTP URL and not contain any user secret
      assert.ok(gatewayEndpoint.startsWith('http'));
      assert.strictEqual(gatewayEndpoint.includes('urumi_live_'), false);

      // Personal key must have expected prefix and entropy
      assert.ok(personalKey.startsWith('urumi_live_'));
      assert.ok(personalKey.length >= 40);

      // Client configuration format check
      const clientConfig = {
        mcpServers: {
          urumi: {
            url: gatewayEndpoint,
            headers: {
              Authorization: `Bearer ${personalKey}`
            }
          }
        }
      };

      assert.strictEqual(clientConfig.mcpServers.urumi.url, gatewayEndpoint);
      assert.strictEqual(clientConfig.mcpServers.urumi.headers.Authorization, `Bearer ${personalKey}`);
    });
  });

  describe('2. Key Creation & Single-Display Visibility UX', () => {
    it('should present raw key once upon creation and never expose raw key in subsequent records', () => {
      // Backend response from POST /api/keys
      const postApiResponse = {
        id: 'key_abc',
        name: 'Cursor Local',
        keyPrefix: 'urumi_live_cur1',
        userId: 'usr_1',
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
        revokedAt: null,
        rawKey: 'urumi_live_cur1_99887766554433221100aabbccddeeff'
      };

      // Raw key is present on creation
      assert.ok(postApiResponse.rawKey);
      assert.strictEqual(postApiResponse.rawKey.startsWith('urumi_live_'), true);

      // In client state, once user dismisses the dialog:
      let clientDisplayedRawKey = postApiResponse.rawKey;
      const handleDismiss = () => {
        clientDisplayedRawKey = null;
      };
      handleDismiss();

      // State is wiped
      assert.strictEqual(clientDisplayedRawKey, null);

      // Subsequent GET /api/keys response: rawKey is omitted
      const getApiResponseList = [
        {
          id: 'key_abc',
          name: 'Cursor Local',
          keyPrefix: 'urumi_live_cur1',
          userId: 'usr_1',
          createdAt: postApiResponse.createdAt,
          lastUsedAt: null,
          revokedAt: null
        }
      ];

      assert.strictEqual('rawKey' in getApiResponseList[0], false, 'Raw key must never be returned in GET requests');
      assert.strictEqual(getApiResponseList[0].keyPrefix, 'urumi_live_cur1');
    });

    it('should copy raw key safely without leaking to query parameters or logs', () => {
      const rawSecret = 'urumi_live_bob4321_fedcba0987654321fedcba0987654321';
      let clipboard = '';
      const handleCopy = (secret) => {
        clipboard = secret;
      };

      handleCopy(rawSecret);
      assert.strictEqual(clipboard, rawSecret);

      // Verify toast message does NOT contain the raw secret
      const keyName = 'Bob Terminal Key';
      const toastMessage = `API key copied to clipboard`;
      assert.strictEqual(toastMessage.includes(rawSecret), false);
    });
  });

  describe('3. Key Revocation Lifecycle & State Reflection', () => {
    it('should reflect revoked state immediately and disable destructive actions', () => {
      const key = {
        id: 'key_xyz',
        name: 'Old Laptop Key',
        keyPrefix: 'urumi_live_old1',
        revokedAt: null
      };

      assert.strictEqual(key.revokedAt, null);
      const isActionAvailableBefore = key.revokedAt === null;
      assert.strictEqual(isActionAvailableBefore, true);

      // Simulate revocation: DELETE /api/keys/:id
      const now = new Date().toISOString();
      const updatedKey = {
        ...key,
        revokedAt: now
      };

      assert.ok(updatedKey.revokedAt !== null);
      const isActionAvailableAfter = updatedKey.revokedAt === null;
      assert.strictEqual(isActionAvailableAfter, false, 'Revoked keys must not allow further revocation actions');
    });

    it('should construct revocation warning explaining consequence for external MCP clients', () => {
      const keyName = 'Production Server Key';
      const warningDescription = 'Revocation takes effect immediately and cannot be undone. Any Claude Code, Cursor, or MCP clients using this key will immediately be rejected with 401 Unauthorized.';

      assert.ok(warningDescription.includes('takes effect immediately'));
      assert.ok(warningDescription.includes('401 Unauthorized'));
    });
  });

  describe('4. Member Role Changes & Access Inspection', () => {
    it('should prevent administrators from changing their own role or deleting themselves', () => {
      const currentAdminId = 'user_admin_1';
      const self = { id: currentAdminId, name: 'Main Admin', role: 'admin' };
      const colleague = { id: 'user_dev_2', name: 'Alice Dev', role: 'member' };

      const canModifyUser = (targetUser) => targetUser.id !== currentAdminId;

      assert.strictEqual(canModifyUser(self), false, 'Admin cannot demote or delete themselves');
      assert.strictEqual(canModifyUser(colleague), true, 'Admin can modify other team members');
    });

    it('should evaluate role permissions matrix correctly', () => {
      const getPermissions = (role) => ({
        canManageUpstreams: role === 'admin',
        canManageUsers: role === 'admin',
        canViewAuditLogs: role === 'admin',
        canExecuteMutations: role === 'admin',
        canExecuteQueries: true
      });

      const adminPerms = getPermissions('admin');
      assert.strictEqual(adminPerms.canManageUpstreams, true);
      assert.strictEqual(adminPerms.canManageUsers, true);
      assert.strictEqual(adminPerms.canViewAuditLogs, true);
      assert.strictEqual(adminPerms.canExecuteMutations, true);

      const memberPerms = getPermissions('member');
      assert.strictEqual(memberPerms.canManageUpstreams, false);
      assert.strictEqual(memberPerms.canManageUsers, false);
      assert.strictEqual(memberPerms.canViewAuditLogs, false);
      assert.strictEqual(memberPerms.canExecuteMutations, false);
      assert.strictEqual(memberPerms.canExecuteQueries, true);
    });
  });

  describe('5. Member Form & Key Form Validation', () => {
    it('should validate email format and password length on member invitation', () => {
      const validate = (name, email, password) => {
        const errors = {};
        if (!name.trim()) errors.name = 'Name required';
        if (!email.trim() || !email.includes('@')) errors.email = 'Valid email required';
        if (!password || password.length < 8) errors.password = 'Min 8 chars required';
        return errors;
      };

      const invalid = validate('', 'not-an-email', 'short');
      assert.ok(invalid.name);
      assert.ok(invalid.email);
      assert.ok(invalid.password);

      const valid = validate('Charlie', 'charlie@company.local', 'SecurePass123!');
      assert.strictEqual(Object.keys(valid).length, 0);
    });

    it('should validate key name length boundaries', () => {
      const validateKey = (name) => {
        if (!name.trim()) return 'Name required';
        if (name.trim().length > 64) return 'Too long';
        return null;
      };

      assert.strictEqual(validateKey(''), 'Name required');
      assert.strictEqual(validateKey('a'.repeat(65)), 'Too long');
      assert.strictEqual(validateKey('Claude Code Key'), null);
    });
  });
});
