import test from 'node:test';
import assert from 'node:assert';
import {
  generateAPIKey,
  verifyAPIKeyHash,
  hashPassword,
  verifyPassword,
  sanitizeAuditData,
  signJWT,
  verifyJWT
} from './security.js';

test('API Key generation and constant-time verification', () => {
  const { rawKey, keyPrefix, keyHash } = generateAPIKey();

  assert.match(rawKey, /^mcp_live_[a-f0-9]{8}_[a-f0-9]{48}$/);
  assert.strictEqual(rawKey.startsWith(keyPrefix), true);
  assert.strictEqual(keyHash.length, 64); // SHA-256 hex length

  // Verification succeeds with matching key
  assert.strictEqual(verifyAPIKeyHash(rawKey, keyHash), true);

  // Verification fails with tampered key
  assert.strictEqual(verifyAPIKeyHash(rawKey + 'x', keyHash), false);
  assert.strictEqual(verifyAPIKeyHash('mcp_live_00000000_11111111', keyHash), false);
});

test('Password hashing and verification with salt', () => {
  const password = 'SuperSecretPassword123!';
  const { hash, salt } = hashPassword(password);

  assert.strictEqual(verifyPassword(password, hash, salt), true);
  assert.strictEqual(verifyPassword('WrongPassword', hash, salt), false);
});

test('Audit data sanitizer redacts sensitive fields recursively', () => {
  const payload = {
    userId: 'user_123',
    authToken: 'bearer-secret-token',
    user: {
      password: 'mypassword',
      email: 'user@example.com',
      payment: {
        card_number: '4111222233334444',
        cvv: '123'
      }
    },
    metadata: {
      sku: 'HOODIE-BLU-M',
      quantity: 2
    }
  };

  const sanitized = sanitizeAuditData(payload) as any;

  assert.strictEqual(sanitized.userId, 'user_123');
  assert.strictEqual(sanitized.authToken, '[REDACTED]');
  assert.strictEqual(sanitized.user.password, '[REDACTED]');
  assert.strictEqual(sanitized.user.email, 'user@example.com');
  assert.strictEqual(sanitized.user.payment.card_number, '[REDACTED]');
  assert.strictEqual(sanitized.user.payment.cvv, '[REDACTED]');
  assert.strictEqual(sanitized.metadata.sku, 'HOODIE-BLU-M');
  assert.strictEqual(sanitized.metadata.quantity, 2);
});

test('Keyed API Key generation and verification with HMAC secret', () => {
  const hmacSecret = 'gateway-internal-hmac-secret-12345';
  const { rawKey, keyPrefix, keyHash } = generateAPIKey(hmacSecret);

  assert.strictEqual(rawKey.startsWith(keyPrefix), true);
  assert.strictEqual(keyHash.length, 64);

  // Verifies with same HMAC secret
  assert.strictEqual(verifyAPIKeyHash(rawKey, keyHash, hmacSecret), true);

  // Fails with wrong HMAC secret or default SHA-256
  assert.strictEqual(verifyAPIKeyHash(rawKey, keyHash, 'wrong-secret'), false);
  assert.strictEqual(verifyAPIKeyHash(rawKey, keyHash), false);
});

test('JWT Signing and Verification lifecycle', () => {
  const secret = 'jwt-super-secret-key-32-chars-minimum!';
  const token = signJWT(
    {
      userId: 'usr_test_123',
      email: 'member@urumi.local',
      name: 'Test Member',
      role: 'member',
      status: 'active'
    },
    secret,
    3600 // 1 hour
  );

  assert.strictEqual(typeof token, 'string');
  assert.strictEqual(token.split('.').length, 3);

  // Successful verification
  const payload = verifyJWT(token, secret);
  assert.ok(payload);
  assert.strictEqual(payload.userId, 'usr_test_123');
  assert.strictEqual(payload.email, 'member@urumi.local');
  assert.strictEqual(payload.role, 'member');
  assert.strictEqual(payload.status, 'active');

  // Verification fails on wrong secret
  assert.strictEqual(verifyJWT(token, 'different-wrong-secret-here-12345!'), null);

  // Verification fails on tampered token
  const tampered = token.slice(0, -5) + 'xxxxx';
  assert.strictEqual(verifyJWT(tampered, secret), null);

  // Expired token fails
  const expiredToken = signJWT(
    {
      userId: 'usr_expired',
      email: 'expired@urumi.local',
      name: 'Expired User',
      role: 'member',
      status: 'active'
    },
    secret,
    -10 // Already expired 10 seconds ago
  );
  assert.strictEqual(verifyJWT(expiredToken, secret), null);
});

test('redactSensitiveString scrubs credentials, tokens, and sensitive patterns', () => {
  const input = 'Call failed with Bearer eyJhbGciOiJIUzI1NiJ9.test and mcp_live_1234abcd_secret123456789012345678901234 and ck_0123456789abcdef0123456789abcdef01234567 and http://admin:superSecret@internal.cluster/test';
  const scrubbed = sanitizeAuditData(input) as string;

  assert.strictEqual(scrubbed.includes('eyJhbGci'), false);
  assert.strictEqual(scrubbed.includes('secret1234567890'), false);
  assert.strictEqual(scrubbed.includes('ck_0123456789'), false);
  assert.strictEqual(scrubbed.includes('superSecret'), false);
  assert.ok(scrubbed.includes('[REDACTED]'));
  assert.ok(scrubbed.includes('[REDACTED_PASS]'));
});

test('isToolPermittedForRole enforces admin-only mutations and member queries', async () => {
  const { isToolPermittedForRole } = await import('./security.js');

  // Admin has access to all tools
  assert.strictEqual(isToolPermittedForRole('create_product', 'admin'), true);
  assert.strictEqual(isToolPermittedForRole('woocommerce__create_product', 'admin'), true);
  assert.strictEqual(isToolPermittedForRole('update_order_status', 'admin'), true);
  assert.strictEqual(isToolPermittedForRole('list_products', 'admin'), true);
  assert.strictEqual(isToolPermittedForRole('inventory__get_stock', 'admin'), true);

  // Member has access to read/inquiry tools
  assert.strictEqual(isToolPermittedForRole('list_products', 'member'), true);
  assert.strictEqual(isToolPermittedForRole('woocommerce__list_orders', 'member'), true);
  assert.strictEqual(isToolPermittedForRole('get_order', 'member'), true);
  assert.strictEqual(isToolPermittedForRole('inventory__get_stock', 'member'), true);
  assert.strictEqual(isToolPermittedForRole('shipping__estimate_shipping', 'member'), true);

  // Member is strictly forbidden from mutating tools
  assert.strictEqual(isToolPermittedForRole('create_product', 'member'), false);
  assert.strictEqual(isToolPermittedForRole('woocommerce__create_product', 'member'), false);
  assert.strictEqual(isToolPermittedForRole('update_order_status', 'member'), false);
  assert.strictEqual(isToolPermittedForRole('woocommerce__update_order_status', 'member'), false);
  assert.strictEqual(isToolPermittedForRole('delete_product', 'member'), false);
});

