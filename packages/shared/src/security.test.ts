import test from 'node:test';
import assert from 'node:assert';
import { generateAPIKey, verifyAPIKeyHash, hashPassword, verifyPassword, sanitizeAuditData } from './security.js';

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
