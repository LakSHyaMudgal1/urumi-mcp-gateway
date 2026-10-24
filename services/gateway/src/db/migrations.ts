import { DatabaseAdapter } from './adapter.js';

export const INITIAL_MIGRATION = `
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

export async function runMigrations(db: DatabaseAdapter): Promise<void> {
  const statements = INITIAL_MIGRATION.split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const stmt of statements) {
    await db.exec(stmt + ';');
  }
}
