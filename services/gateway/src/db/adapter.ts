import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';

export interface DatabaseAdapter {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  healthCheck(): Promise<boolean>;
  close(): Promise<void>;
}

export class SqliteAdapter implements DatabaseAdapter {
  private db: DatabaseSync;
  private isClosed: boolean = false;

  constructor(filePath: string = ':memory:') {
    this.db = new DatabaseSync(filePath);
    // Enable WAL mode and foreign keys for durability and relational integrity
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (this.isClosed) throw new Error('Database is closed');
    // Transform Postgres style $1, $2 to ? for SQLite
    const sqliteSql = sql.replace(/\$(\d+)/g, '?');
    const stmt = this.db.prepare(sqliteSql);
    return stmt.all(...(params as any)) as T[];
  }

  async exec(sql: string): Promise<void> {
    if (this.isClosed) throw new Error('Database is closed');
    this.db.exec(sql);
  }

  async healthCheck(): Promise<boolean> {
    if (this.isClosed) return false;
    try {
      const res = this.db.prepare('SELECT 1 as healthy;').all();
      return Array.isArray(res) && res.length > 0;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    if (!this.isClosed) {
      this.db.close();
      this.isClosed = true;
    }
  }
}

export class PostgresAdapter implements DatabaseAdapter {
  private pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });
  }

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    const res = await this.pool.query(sql, params);
    return res.rows as T[];
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await this.pool.query('SELECT 1 as healthy;');
      return res.rows.length > 0;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export function createDatabaseAdapter(connectionString: string): DatabaseAdapter {
  if (connectionString.startsWith('postgres://') || connectionString.startsWith('postgresql://')) {
    return new PostgresAdapter(connectionString);
  }

  // SQLite connection string handling (e.g. "sqlite://./gateway.db" or "sqlite://:memory:")
  const path = connectionString.replace(/^sqlite:\/\//, '');
  return new SqliteAdapter(path || ':memory:');
}
