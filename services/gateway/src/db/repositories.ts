import crypto from 'node:crypto';
import { DatabaseAdapter } from './adapter.js';
import {
  User,
  Role,
  UserStatus,
  APIKey,
  APIKeySummary,
  UpstreamServer,
  UpstreamServerSummary,
  UpstreamStatus,
  AuditLog,
  AuditFilterOptions,
  PaginatedAuditLogs
} from '@urumi/shared';
import {
  generateAPIKey,
  hashAPIKey,
  verifyAPIKeyHash,
  hashPassword,
  verifyPassword
} from '@urumi/shared';

export class UserRepository {
  constructor(private db: DatabaseAdapter) {}

  async create(input: {
    email: string;
    name: string;
    password: string;
    role?: Role;
    status?: UserStatus;
  }): Promise<User> {
    const id = `usr_${crypto.randomBytes(12).toString('hex')}`;
    const now = new Date().toISOString();
    const { hash, salt } = hashPassword(input.password);
    const role = input.role || 'member';
    const status = input.status || 'active';

    await this.db.query(
      `INSERT INTO users (id, email, name, password_hash, password_salt, role, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, input.email.toLowerCase().trim(), input.name.trim(), hash, salt, role, status, now, now]
    );

    return {
      id,
      email: input.email.toLowerCase().trim(),
      name: input.name.trim(),
      role,
      status,
      createdAt: now,
      updatedAt: now
    };
  }

  async findByEmail(email: string): Promise<(User & { passwordHash: string; passwordSalt: string }) | null> {
    const rows = await this.db.query<any>(
      `SELECT id, email, name, password_hash, password_salt, role, status, created_at, updated_at
       FROM users WHERE email = $1`,
      [email.toLowerCase().trim()]
    );

    if (!rows.length) return null;
    const r = rows[0];
    return {
      id: r.id,
      email: r.email,
      name: r.name,
      role: r.role as Role,
      status: (r.status as UserStatus) || 'active',
      passwordHash: r.password_hash,
      passwordSalt: r.password_salt,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  }

  async findById(id: string): Promise<User | null> {
    const rows = await this.db.query<any>(
      `SELECT id, email, name, role, status, created_at, updated_at
       FROM users WHERE id = $1`,
      [id]
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      id: r.id,
      email: r.email,
      name: r.name,
      role: r.role as Role,
      status: (r.status as UserStatus) || 'active',
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  }

  async listAll(): Promise<User[]> {
    const rows = await this.db.query<any>(
      `SELECT id, email, name, role, status, created_at, updated_at
       FROM users ORDER BY created_at ASC`
    );
    return rows.map(r => ({
      id: r.id,
      email: r.email,
      name: r.name,
      role: r.role as Role,
      status: (r.status as UserStatus) || 'active',
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
  }

  async update(
    id: string,
    updates: {
      name?: string;
      role?: Role;
      status?: UserStatus;
      password?: string;
    }
  ): Promise<User | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const name = updates.name !== undefined ? updates.name.trim() : existing.name;
    const role = updates.role !== undefined ? updates.role : existing.role;
    const status = updates.status !== undefined ? updates.status : existing.status;

    if (updates.password) {
      const { hash, salt } = hashPassword(updates.password);
      await this.db.query(
        `UPDATE users SET name = $1, role = $2, status = $3, password_hash = $4, password_salt = $5, updated_at = $6
         WHERE id = $7`,
        [name, role, status, hash, salt, now, id]
      );
    } else {
      await this.db.query(
        `UPDATE users SET name = $1, role = $2, status = $3, updated_at = $4
         WHERE id = $5`,
        [name, role, status, now, id]
      );
    }

    return this.findById(id);
  }

  async updateRole(id: string, role: Role): Promise<void> {
    const now = new Date().toISOString();
    await this.db.query(
      `UPDATE users SET role = $1, updated_at = $2 WHERE id = $3`,
      [role, now, id]
    );
  }

  async updateStatus(id: string, status: UserStatus): Promise<void> {
    const now = new Date().toISOString();
    await this.db.query(
      `UPDATE users SET status = $1, updated_at = $2 WHERE id = $3`,
      [status, now, id]
    );
  }

  async delete(id: string): Promise<void> {
    await this.db.query(`DELETE FROM users WHERE id = $1`, [id]);
  }
}

export class APIKeyRepository {
  constructor(private db: DatabaseAdapter) {}

  async create(userId: string, name: string, hmacSecret?: string): Promise<APIKeySummary> {
    const id = `key_${crypto.randomBytes(12).toString('hex')}`;
    const { rawKey, keyPrefix, keyHash } = generateAPIKey(hmacSecret);
    const now = new Date().toISOString();

    await this.db.query(
      `INSERT INTO api_keys (id, user_id, name, key_prefix, key_hash, last_used_at, created_at, revoked_at)
       VALUES ($1, $2, $3, $4, $5, NULL, $6, NULL)`,
      [id, userId, name.trim(), keyPrefix, keyHash, now]
    );

    return {
      id,
      userId,
      name: name.trim(),
      keyPrefix,
      lastUsedAt: null,
      createdAt: now,
      revokedAt: null,
      rawKey // Only returned once on creation
    };
  }

  async listByUserId(userId: string): Promise<APIKeySummary[]> {
    const rows = await this.db.query<any>(
      `SELECT id, user_id, name, key_prefix, last_used_at, created_at, revoked_at
       FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );

    return rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      name: r.name,
      keyPrefix: r.key_prefix,
      lastUsedAt: r.last_used_at || null,
      createdAt: r.created_at,
      revokedAt: r.revoked_at || null
    }));
  }

  async listAll(): Promise<(APIKeySummary & { userEmail: string; userName: string })[]> {
    const rows = await this.db.query<any>(
      `SELECT k.id, k.user_id, k.name, k.key_prefix, k.last_used_at, k.created_at, k.revoked_at, u.email as user_email, u.name as user_name
       FROM api_keys k
       JOIN users u ON k.user_id = u.id
       ORDER BY k.created_at DESC`
    );

    return rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      name: r.name,
      keyPrefix: r.key_prefix,
      lastUsedAt: r.last_used_at || null,
      createdAt: r.created_at,
      revokedAt: r.revoked_at || null,
      userEmail: r.user_email,
      userName: r.user_name
    }));
  }

  async findById(id: string): Promise<APIKeySummary | null> {
    const rows = await this.db.query<any>(
      `SELECT id, user_id, name, key_prefix, last_used_at, created_at, revoked_at
       FROM api_keys WHERE id = $1`,
      [id]
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      id: r.id,
      userId: r.user_id,
      name: r.name,
      keyPrefix: r.key_prefix,
      lastUsedAt: r.last_used_at || null,
      createdAt: r.created_at,
      revokedAt: r.revoked_at || null
    };
  }

  async revoke(id: string, userId?: string): Promise<boolean> {
    const now = new Date().toISOString();
    if (userId) {
      const rows = await this.db.query<any>(
        `UPDATE api_keys SET revoked_at = $1 WHERE id = $2 AND user_id = $3 AND revoked_at IS NULL`,
        [now, id, userId]
      );
      return true;
    } else {
      await this.db.query(
        `UPDATE api_keys SET revoked_at = $1 WHERE id = $2 AND revoked_at IS NULL`,
        [now, id]
      );
      return true;
    }
  }

  /**
   * Verifies an incoming raw API key on the next request.
   * If key is revoked, user is disabled, or key does not exist, immediately returns null.
   * Updates last_used_at timestamp on successful validation.
   */
  async validateKey(rawKey: string, hmacSecret?: string): Promise<{ user: User; keyId: string } | null> {
    if (!rawKey || !rawKey.startsWith('mcp_live_')) return null;

    // Check keyed hash if configured, and also try standard sha256 for backward compatibility
    const keyHashKeyed = hashAPIKey(rawKey, hmacSecret);
    const keyHashPlain = hashAPIKey(rawKey);

    const rows = await this.db.query<any>(
      `SELECT k.id as key_id, k.key_hash, k.revoked_at, u.id as user_id, u.email, u.name, u.role, u.status, u.created_at, u.updated_at
       FROM api_keys k
       JOIN users u ON k.user_id = u.id
       WHERE k.key_hash = $1 OR k.key_hash = $2`,
      [keyHashKeyed, keyHashPlain]
    );

    if (!rows.length) return null;
    const r = rows[0];

    // Constant-time hash verification to eliminate timing attacks
    const validKey =
      verifyAPIKeyHash(rawKey, r.key_hash, hmacSecret) ||
      verifyAPIKeyHash(rawKey, r.key_hash);

    if (!validKey) {
      return null;
    }

    // Immediately reject if revoked
    if (r.revoked_at !== null) {
      return null;
    }

    // Immediately reject if user is disabled
    const userStatus: UserStatus = (r.status as UserStatus) || 'active';
    if (userStatus === 'disabled') {
      return null;
    }

    // Update last_used_at timestamp asynchronously
    const now = new Date().toISOString();
    this.db.query('UPDATE api_keys SET last_used_at = $1 WHERE id = $2', [now, r.key_id]).catch(() => {});

    return {
      keyId: r.key_id,
      user: {
        id: r.user_id,
        email: r.email,
        name: r.name,
        role: r.role as Role,
        status: userStatus,
        createdAt: r.created_at,
        updatedAt: r.updated_at
      }
    };
  }
}

export class UpstreamRepository {
  constructor(private db: DatabaseAdapter) {}

  async create(server: {
    name: string;
    slug: string;
    url: string;
    authToken?: string | null;
    enabled?: boolean;
    timeoutMs?: number;
  }): Promise<UpstreamServer> {
    const id = `srv_${crypto.randomBytes(12).toString('hex')}`;
    const now = new Date().toISOString();
    const enabled = server.enabled !== false ? 1 : 0;
    const timeoutMs = server.timeoutMs || 10000;

    await this.db.query(
      `INSERT INTO upstream_servers (id, name, slug, url, auth_token, enabled, status, timeout_ms, last_checked_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, $9, $10)`,
      [id, server.name.trim(), server.slug.toLowerCase().trim(), server.url.trim(), server.authToken || null, enabled, 'connected', timeoutMs, now, now]
    );

    return {
      id,
      name: server.name.trim(),
      slug: server.slug.toLowerCase().trim(),
      url: server.url.trim(),
      authToken: server.authToken || null,
      enabled: enabled === 1,
      status: 'connected',
      timeoutMs,
      lastCheckedAt: null,
      createdAt: now,
      updatedAt: now
    };
  }

  async findBySlug(slug: string): Promise<UpstreamServer | null> {
    const rows = await this.db.query<any>(
      `SELECT id, name, slug, url, auth_token, enabled, status, timeout_ms, last_checked_at, created_at, updated_at
       FROM upstream_servers WHERE slug = $1`,
      [slug.toLowerCase().trim()]
    );
    if (!rows.length) return null;
    return this.mapRow(rows[0]);
  }

  async findById(id: string): Promise<UpstreamServer | null> {
    const rows = await this.db.query<any>(
      `SELECT id, name, slug, url, auth_token, enabled, status, timeout_ms, last_checked_at, created_at, updated_at
       FROM upstream_servers WHERE id = $1`,
      [id]
    );
    if (!rows.length) return null;
    return this.mapRow(rows[0]);
  }

  async listAll(): Promise<UpstreamServer[]> {
    const rows = await this.db.query<any>(
      `SELECT id, name, slug, url, auth_token, enabled, status, timeout_ms, last_checked_at, created_at, updated_at
       FROM upstream_servers ORDER BY created_at ASC`
    );
    return rows.map(r => this.mapRow(r));
  }

  async listEnabled(): Promise<UpstreamServer[]> {
    const rows = await this.db.query<any>(
      `SELECT id, name, slug, url, auth_token, enabled, status, timeout_ms, last_checked_at, created_at, updated_at
       FROM upstream_servers WHERE enabled = 1 ORDER BY created_at ASC`
    );
    return rows.map(r => this.mapRow(r));
  }

  async updateStatus(slug: string, status: UpstreamStatus): Promise<void> {
    const now = new Date().toISOString();
    await this.db.query(
      `UPDATE upstream_servers SET status = $1, last_checked_at = $2 WHERE slug = $3`,
      [status, now, slug.toLowerCase().trim()]
    );
  }

  async update(id: string, updates: {
    name?: string;
    url?: string;
    authToken?: string | null;
    enabled?: boolean;
    timeoutMs?: number;
  }): Promise<UpstreamServer | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const name = updates.name !== undefined ? updates.name.trim() : existing.name;
    const url = updates.url !== undefined ? updates.url.trim() : existing.url;
    // Allow rotating/clearing credential, or preserving existing when omitted
    const authToken = updates.authToken !== undefined ? (updates.authToken || null) : existing.authToken;
    const enabled = updates.enabled !== undefined ? (updates.enabled ? 1 : 0) : (existing.enabled ? 1 : 0);
    const timeoutMs = updates.timeoutMs !== undefined ? updates.timeoutMs : existing.timeoutMs;

    await this.db.query(
      `UPDATE upstream_servers
       SET name = $1, url = $2, auth_token = $3, enabled = $4, timeout_ms = $5, updated_at = $6
       WHERE id = $7`,
      [name, url, authToken, enabled, timeoutMs, now, id]
    );

    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    await this.db.query(`DELETE FROM upstream_servers WHERE id = $1`, [id]);
    return true;
  }

  /**
   * Sanitizes upstream records for API responses, masking auth tokens.
   */
  sanitize(server: UpstreamServer): UpstreamServerSummary {
    return {
      ...server,
      hasAuthToken: Boolean(server.authToken),
      authToken: server.authToken ? '********' : null
    };
  }

  private mapRow(r: any): UpstreamServer {
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      url: r.url,
      authToken: r.auth_token,
      enabled: r.enabled === 1 || r.enabled === true,
      status: r.status as UpstreamStatus,
      timeoutMs: r.timeout_ms,
      lastCheckedAt: r.last_checked_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  }
}

export class AuditRepository {
  constructor(private db: DatabaseAdapter) {}

  async create(log: Omit<AuditLog, 'id' | 'timestamp'>): Promise<AuditLog> {
    const id = `aud_${crypto.randomBytes(12).toString('hex')}`;
    const timestamp = new Date().toISOString();

    await this.db.query(
      `INSERT INTO audit_logs (
        id, timestamp, user_id, user_email, upstream_id, upstream_slug,
        tool_name, duration_ms, status, error_message, parameters_sanitized, response_summary
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        id,
        timestamp,
        log.userId,
        log.userEmail,
        log.upstreamId,
        log.upstreamSlug,
        log.toolName,
        log.durationMs,
        log.status,
        log.errorMessage || null,
        log.parametersSanitized ? JSON.stringify(log.parametersSanitized) : null,
        log.responseSummary || null
      ]
    );

    return {
      id,
      timestamp,
      ...log
    };
  }

  async listRecent(limit: number = 100): Promise<AuditLog[]> {
    const rows = await this.db.query<any>(
      `SELECT id, timestamp, user_id, user_email, upstream_id, upstream_slug,
              tool_name, duration_ms, status, error_message, parameters_sanitized, response_summary
       FROM audit_logs
       ORDER BY timestamp DESC
       LIMIT $1`,
      [limit]
    );

    return rows.map(r => this.mapRow(r));
  }

  /**
   * Filtered and paginated audit query.
   */
  async listFiltered(options: AuditFilterOptions): Promise<PaginatedAuditLogs> {
    const limit = Math.min(200, Math.max(1, options.limit || 50));
    const offset = Math.max(0, options.offset || 0);

    const conditions: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    if (options.userId) {
      conditions.push(`user_id = $${pIdx++}`);
      params.push(options.userId);
    }
    if (options.upstreamSlug) {
      conditions.push(`upstream_slug = $${pIdx++}`);
      params.push(options.upstreamSlug);
    }
    if (options.toolName) {
      conditions.push(`tool_name = $${pIdx++}`);
      params.push(options.toolName);
    }
    if (options.status) {
      conditions.push(`status = $${pIdx++}`);
      params.push(options.status);
    }
    if (options.startDate) {
      conditions.push(`timestamp >= $${pIdx++}`);
      params.push(options.startDate);
    }
    if (options.endDate) {
      conditions.push(`timestamp <= $${pIdx++}`);
      params.push(options.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count total matching
    const countRows = await this.db.query<any>(
      `SELECT COUNT(*) as total FROM audit_logs ${whereClause}`,
      params
    );
    const total = Number(countRows[0]?.total || 0);

    // Fetch paginated rows
    const dataSql = `SELECT id, timestamp, user_id, user_email, upstream_id, upstream_slug,
                            tool_name, duration_ms, status, error_message, parameters_sanitized, response_summary
                     FROM audit_logs
                     ${whereClause}
                     ORDER BY timestamp DESC
                     LIMIT $${pIdx++} OFFSET $${pIdx++}`;
    const rows = await this.db.query<any>(dataSql, [...params, limit, offset]);

    return {
      total,
      limit,
      offset,
      logs: rows.map(r => this.mapRow(r))
    };
  }

  private mapRow(r: any): AuditLog {
    return {
      id: r.id,
      timestamp: r.timestamp,
      userId: r.user_id,
      userEmail: r.user_email,
      upstreamId: r.upstream_id,
      upstreamSlug: r.upstream_slug,
      toolName: r.tool_name,
      durationMs: r.duration_ms,
      status: r.status as 'success' | 'error',
      errorMessage: r.error_message,
      parametersSanitized: r.parameters_sanitized ? JSON.parse(r.parameters_sanitized) : null,
      responseSummary: r.response_summary
    };
  }
}
