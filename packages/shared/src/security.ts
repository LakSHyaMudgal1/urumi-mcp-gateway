import crypto from 'node:crypto';

/**
 * Generates a cryptographically strong API key.
 * Format: `mcp_live_<prefix8>_<secret32>`
 * Returns the full raw key (to show once) and its components.
 */
export function generateAPIKey(): { rawKey: string; keyPrefix: string; keyHash: string } {
  const randomPrefix = crypto.randomBytes(4).toString('hex'); // 8 chars
  const secret = crypto.randomBytes(24).toString('hex');       // 48 chars
  const rawKey = `mcp_live_${randomPrefix}_${secret}`;
  const keyPrefix = `mcp_live_${randomPrefix}`;
  const keyHash = hashAPIKey(rawKey);

  return { rawKey, keyPrefix, keyHash };
}

/**
 * Hashes an API key using SHA-256.
 */
export function hashAPIKey(key: string): string {
  return crypto.createHash('sha256').update(key.trim()).digest('hex');
}

/**
 * Constant-time hash verification to prevent timing attacks.
 */
export function verifyAPIKeyHash(providedKey: string, storedHash: string): boolean {
  const providedHash = hashAPIKey(providedKey);
  if (providedHash.length !== storedHash.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(providedHash), Buffer.from(storedHash));
}

/**
 * Simple password hashing using PBKDF2 with a salt.
 */
export function hashPassword(password: string, salt: string = crypto.randomBytes(16).toString('hex')): { hash: string; salt: string } {
  const derived = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { hash: derived, salt };
}

export function verifyPassword(password: string, storedHash: string, salt: string): boolean {
  const derived = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  if (derived.length !== storedHash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(derived), Buffer.from(storedHash));
}

/**
 * Sanitizes object data for audit logging to guarantee sensitive credentials,
 * authorization headers, or private customer fields are never stored in plain text.
 */
export function sanitizeAuditData(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map(item => sanitizeAuditData(item));
  }

  const sensitiveKeys = [
    'password',
    'secret',
    'token',
    'auth',
    'authorization',
    'bearer',
    'api_key',
    'apikey',
    'consumer_secret',
    'card',
    'cvv',
    'ssn'
  ];

  const sanitized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = sensitiveKeys.some(s => lowerKey.includes(s));

    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof val === 'object' && val !== null) {
      sanitized[key] = sanitizeAuditData(val);
    } else {
      sanitized[key] = val;
    }
  }

  return sanitized;
}
