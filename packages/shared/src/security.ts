import crypto from 'node:crypto';

/**
 * Generates a cryptographically strong API key.
 * Format: `mcp_live_<prefix8>_<secret48>`
 * Returns the full raw key (to show once) and its components.
 * An optional HMAC pepper secret can be supplied for keyed hashing.
 */
export function generateAPIKey(hmacSecret?: string): { rawKey: string; keyPrefix: string; keyHash: string } {
  const randomPrefix = crypto.randomBytes(4).toString('hex'); // 8 chars
  const secret = crypto.randomBytes(24).toString('hex');       // 48 chars
  const rawKey = `mcp_live_${randomPrefix}_${secret}`;
  const keyPrefix = `mcp_live_${randomPrefix}`;
  const keyHash = hashAPIKey(rawKey, hmacSecret);

  return { rawKey, keyPrefix, keyHash };
}

/**
 * Hashes an API key using modern strong hash (Keyed HMAC-SHA256 when secret is provided, or SHA-256).
 */
export function hashAPIKey(key: string, hmacSecret?: string): string {
  if (hmacSecret) {
    return crypto.createHmac('sha256', hmacSecret).update(key.trim()).digest('hex');
  }
  return crypto.createHash('sha256').update(key.trim()).digest('hex');
}

/**
 * Constant-time hash verification to prevent timing attacks.
 */
export function verifyAPIKeyHash(providedKey: string, storedHash: string, hmacSecret?: string): boolean {
  const providedHash = hashAPIKey(providedKey, hmacSecret);
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

export interface JwtPayload {
  userId: string;
  email: string;
  name: string;
  role: 'admin' | 'member';
  status: 'active' | 'disabled';
  exp: number; // epoch seconds
  iat: number; // epoch seconds
}

/**
 * Signs a standard JWT with HMAC-SHA256.
 */
export function signJWT(
  payload: Omit<JwtPayload, 'iat' | 'exp'>,
  secret: string,
  expiresInSeconds: number = 86400 * 7 // Default 7 days
): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JwtPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds
  };

  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * Verifies and decodes a JWT with constant-time signature verification.
 */
export function verifyJWT(token: string, secret: string): JwtPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signature] = parts;

  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  if (signature.length !== expectedSig.length) return null;
  const match = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
  if (!match) return null;

  try {
    const payload: JwtPayload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export interface RateLimiterOptions {
  windowMs: number;
  max: number;
  message?: string;
  keyGenerator?: (req: any) => string;
}

/**
 * In-memory abuse prevention rate limiter middleware.
 */
export function createRateLimiter(options: RateLimiterOptions) {
  const hits = new Map<string, { count: number; resetTime: number }>();
  const windowMs = options.windowMs || 60000;
  const max = options.max || 20;

  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of hits.entries()) {
      if (record.resetTime <= now) {
        hits.delete(key);
      }
    }
  }, Math.min(windowMs, 30000));
  if (cleanupInterval.unref) cleanupInterval.unref();

  return (req: any, res: any, next: any) => {
    const key = options.keyGenerator
      ? options.keyGenerator(req)
      : (req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown');

    const now = Date.now();
    let record = hits.get(key);

    if (!record || record.resetTime <= now) {
      record = { count: 1, resetTime: now + windowMs };
      hits.set(key, record);
    } else {
      record.count++;
    }

    const remaining = Math.max(0, max - record.count);
    const retryAfter = Math.ceil((record.resetTime - now) / 1000);

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));

    if (record.count > max) {
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({
        error: options.message || 'Too many requests. Please try again later.'
      });
    }

    next();
  };
}

/**
 * Redacts sensitive tokens, API keys, credentials, and PII from arbitrary strings.
 */
export function redactSensitiveString(text: string): string {
  if (!text || typeof text !== 'string') return text;

  return text
    // Redact Bearer tokens
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
    // Redact MCP / Gateway API keys
    .replace(/mcp_live_[A-Za-z0-9_\-]+/gi, 'mcp_live_[REDACTED]')
    .replace(/ugk_live_[A-Za-z0-9_\-]+/gi, 'ugk_live_[REDACTED]')
    // Redact WooCommerce consumer keys & secrets
    .replace(/ck_[a-fA-F0-9]{30,}/g, 'ck_[REDACTED]')
    .replace(/cs_[a-fA-F0-9]{30,}/g, 'cs_[REDACTED]')
    // Redact OpenAI / LLM API keys
    .replace(/sk-[A-Za-z0-9_\-]{20,}/g, 'sk-[REDACTED]')
    // Redact embedded URL credentials (http://user:password@host)
    .replace(/(https?:\/\/)([^:\/\s]+):([^@\/\s]+)@/g, '$1[REDACTED_USER]:[REDACTED_PASS]@')
    // Redact JWT tokens (3 base64url segments separated by dots)
    .replace(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]');
}

/**
 * Sanitizes object data for audit logging to guarantee sensitive credentials,
 * authorization headers, or private customer fields are never stored in plain text.
 */
export function sanitizeAuditData(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data === 'string') {
    return redactSensitiveString(data);
  }
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
    'consumer_key',
    'jwt',
    'cookie',
    'credit_card',
    'card',
    'cvv',
    'ssn',
    'national_id'
  ];

  const sanitized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = sensitiveKeys.some(s => lowerKey.includes(s));

    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof val === 'string') {
      sanitized[key] = redactSensitiveString(val);
    } else if (typeof val === 'object' && val !== null) {
      sanitized[key] = sanitizeAuditData(val);
    } else {
      sanitized[key] = val;
    }
  }

  return sanitized;
}

/**
 * Checks if a tool is permitted for a given user role.
 * Read-only operations are accessible to all active roles ('member' & 'admin').
 * State-mutating operations require the 'admin' role.
 */
export function isToolPermittedForRole(toolName: string, role: string): boolean {
  if (role === 'admin') return true;

  // Unnamespaced base name if tool is prefixed (e.g. 'woocommerce__create_product')
  const baseName = toolName.includes('__') ? toolName.split('__')[1] : toolName;
  const lower = baseName.toLowerCase();

  // Explicit write/mutation tools reserved for admins
  if (lower === 'create_product' || lower === 'update_order_status') {
    return false;
  }

  // General mutation prefixes
  if (
    lower.startsWith('create_') ||
    lower.startsWith('update_') ||
    lower.startsWith('delete_') ||
    lower.startsWith('remove_')
  ) {
    return false;
  }

  return true;
}

