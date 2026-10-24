import { DatabaseAdapter } from './adapter.js';

export interface Migration {
  version: number;
  name: string;
  up: (db: DatabaseAdapter) => Promise<void>;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: '001_initial_schema',
    up: async (db: DatabaseAdapter) => {
      const sql = `
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  password_salt VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'member',
  created_at VARCHAR(64) NOT NULL,
  updated_at VARCHAR(64) NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  name VARCHAR(100) NOT NULL,
  key_prefix VARCHAR(32) NOT NULL,
  key_hash VARCHAR(128) UNIQUE NOT NULL,
  created_at VARCHAR(64) NOT NULL,
  revoked_at VARCHAR(64),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);

CREATE TABLE IF NOT EXISTS upstream_servers (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(64) UNIQUE NOT NULL,
  url VARCHAR(500) NOT NULL,
  auth_token VARCHAR(500),
  enabled INT NOT NULL DEFAULT 1,
  status VARCHAR(32) NOT NULL DEFAULT 'connected',
  timeout_ms INT NOT NULL DEFAULT 10000,
  last_checked_at VARCHAR(64),
  created_at VARCHAR(64) NOT NULL,
  updated_at VARCHAR(64) NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(64) PRIMARY KEY,
  timestamp VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  user_email VARCHAR(255) NOT NULL,
  upstream_id VARCHAR(64) NOT NULL,
  upstream_slug VARCHAR(64) NOT NULL,
  tool_name VARCHAR(100) NOT NULL,
  duration_ms INT NOT NULL,
  status VARCHAR(32) NOT NULL,
  error_message TEXT,
  parameters_sanitized TEXT,
  response_summary TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_upstream ON audit_logs(upstream_slug);
`;
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      for (const stmt of statements) {
        await db.exec(stmt + ';');
      }
    }
  },
  {
    version: 2,
    name: '002_user_status_and_api_key_last_used',
    up: async (db: DatabaseAdapter) => {
      // Add status column to users if not present
      try {
        await db.exec(`ALTER TABLE users ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'active';`);
      } catch {
        // Ignore if already added
      }

      // Add last_used_at to api_keys if not present
      try {
        await db.exec(`ALTER TABLE api_keys ADD COLUMN last_used_at VARCHAR(64);`);
      } catch {
        // Ignore if already added
      }
    }
  },
  {
    version: 3,
    name: '003_multistore_provisioning',
    up: async (db: DatabaseAdapter) => {
      const sql = `
CREATE TABLE IF NOT EXISTS stores (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(64) UNIQUE NOT NULL,
  owner_id VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'provisioning',
  store_url VARCHAR(500) NOT NULL,
  admin_url VARCHAR(500) NOT NULL,
  namespace VARCHAR(100) NOT NULL,
  mcp_server_url VARCHAR(500) NOT NULL,
  upstream_slug VARCHAR(64) NOT NULL,
  failure_reason TEXT,
  timeout_at VARCHAR(64),
  created_at VARCHAR(64) NOT NULL,
  updated_at VARCHAR(64) NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_stores_slug ON stores(slug);
CREATE INDEX IF NOT EXISTS idx_stores_owner ON stores(owner_id);
CREATE INDEX IF NOT EXISTS idx_stores_status ON stores(status);
`;
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      for (const stmt of statements) {
        await db.exec(stmt + ';');
      }
    }
  }
];

export async function runMigrations(db: DatabaseAdapter): Promise<void> {
  // Ensure schema_migrations table exists
  await db.exec(`
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  applied_at VARCHAR(64) NOT NULL
);
`);

  // Query already applied migrations
  const appliedRows = await db.query<{ version: number }>('SELECT version FROM schema_migrations;');
  const appliedVersions = new Set(appliedRows.map(r => Number(r.version)));

  // Run pending migrations in ascending order
  const pending = MIGRATIONS.filter(m => !appliedVersions.has(m.version)).sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    await migration.up(db);
    const now = new Date().toISOString();
    await db.query(
      'INSERT INTO schema_migrations (version, name, applied_at) VALUES ($1, $2, $3);',
      [migration.version, migration.name, now]
    );
  }
}
