import test from 'node:test';
import assert from 'node:assert';
import { SqliteAdapter } from './adapter.js';
import { runMigrations } from './migrations.js';
import {
  UserRepository,
  APIKeyRepository,
  UpstreamRepository,
  AuditRepository
} from './repositories.js';
import { bootstrapDatabase } from './seed.js';
import { loadConfig } from '../config.js';

test('Database migrations and repository CRUD lifecycle', async () => {
  const db = new SqliteAdapter(':memory:');
  await runMigrations(db);

  // 1. Health check passes on fresh DB
  const isHealthy = await db.healthCheck();
  assert.strictEqual(isHealthy, true);

  // 2. User Repository
  const userRepo = new UserRepository(db);
  const createdUser = await userRepo.create({
    email: 'engineer@company.com',
    name: 'Alice Engineer',
    password: 'Password123!',
    role: 'member'
  });

  assert.strictEqual(createdUser.email, 'engineer@company.com');
  assert.strictEqual(createdUser.role, 'member');

  const foundUser = await userRepo.findByEmail('engineer@company.com');
  assert.notStrictEqual(foundUser, null);
  assert.strictEqual(foundUser?.id, createdUser.id);

  // 3. API Key Repository & Revocation
  const apiKeyRepo = new APIKeyRepository(db);
  const keySummary = await apiKeyRepo.create(createdUser.id, 'Alice Laptop Key');

  assert.strictEqual(typeof keySummary.rawKey, 'string');
  assert.match(keySummary.rawKey!, /^mcp_live_/);
  assert.strictEqual(keySummary.revokedAt, null);

  // Validate active key
  const authResult = await apiKeyRepo.validateKey(keySummary.rawKey!);
  assert.notStrictEqual(authResult, null);
  assert.strictEqual(authResult?.user.id, createdUser.id);
  assert.strictEqual(authResult?.user.email, 'engineer@company.com');

  // Revoke key -> must take effect immediately on next request
  const revoked = await apiKeyRepo.revoke(keySummary.id);
  assert.strictEqual(revoked, true);

  const authAfterRevocation = await apiKeyRepo.validateKey(keySummary.rawKey!);
  assert.strictEqual(authAfterRevocation, null, 'Revoked key must be immediately rejected');

  // 4. Upstream Repository
  const upstreamRepo = new UpstreamRepository(db);
  const upstream = await upstreamRepo.create({
    name: 'Inventory Test',
    slug: 'inventory-test',
    url: 'http://inventory-mcp:4002/mcp',
    enabled: true,
    timeoutMs: 5000
  });

  assert.strictEqual(upstream.slug, 'inventory-test');
  assert.strictEqual(upstream.status, 'connected');

  await upstreamRepo.updateStatus('inventory-test', 'unreachable');
  const updatedUpstream = await upstreamRepo.findBySlug('inventory-test');
  assert.strictEqual(updatedUpstream?.status, 'unreachable');

  // 5. Audit Log Repository
  const auditRepo = new AuditRepository(db);
  await auditRepo.create({
    userId: createdUser.id,
    userEmail: createdUser.email,
    upstreamId: upstream.id,
    upstreamSlug: upstream.slug,
    toolName: 'inventory_check_stock',
    durationMs: 42,
    status: 'success',
    parametersSanitized: { sku: 'TEST-SKU-1' },
    responseSummary: 'Stock: 15 available'
  });

  const recentLogs = await auditRepo.listRecent(10);
  assert.strictEqual(recentLogs.length, 1);
  assert.strictEqual(recentLogs[0].toolName, 'inventory_check_stock');
  assert.strictEqual(recentLogs[0].durationMs, 42);
  assert.strictEqual(recentLogs[0].parametersSanitized?.sku, 'TEST-SKU-1');

  // 6. Bootstrap Seeding (Idempotency)
  const config = loadConfig({
    INITIAL_ADMIN_EMAIL: 'admin@platform.test',
    INITIAL_ADMIN_PASSWORD: 'AdminPasswordTest123!'
  });

  const seed1 = await bootstrapDatabase(userRepo, upstreamRepo, config);
  assert.strictEqual(seed1.adminCreated, true);
  assert.strictEqual(seed1.upstreamsCreated, 3); // woocommerce, inventory, shipping

  // Second run: should be idempotent (0 created)
  const seed2 = await bootstrapDatabase(userRepo, upstreamRepo, config);
  assert.strictEqual(seed2.adminCreated, false);
  assert.strictEqual(seed2.upstreamsCreated, 0);

  await db.close();
});
