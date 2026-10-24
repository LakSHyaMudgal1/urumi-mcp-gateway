import { config } from './config.js';
import { createDatabaseAdapter } from './db/adapter.js';
import { runMigrations } from './db/migrations.js';
import { UserRepository, UpstreamRepository } from './db/repositories.js';
import { bootstrapDatabase } from './db/seed.js';
import { createApp } from './server.js';

async function main() {
  console.log(`[Urumi Gateway] Starting in ${config.NODE_ENV} mode...`);

  // Initialize Database
  const db = createDatabaseAdapter(config.DATABASE_URL);
  console.log('[Urumi Gateway] Running database migrations...');
  await runMigrations(db);

  // Bootstrap seed data
  console.log('[Urumi Gateway] Bootstrapping initial admin and default upstreams...');
  const userRepo = new UserRepository(db);
  const upstreamRepo = new UpstreamRepository(db);
  const seedResult = await bootstrapDatabase(userRepo, upstreamRepo, config);

  if (seedResult.adminCreated) {
    console.log(`[Urumi Gateway] Initial admin created: ${config.INITIAL_ADMIN_EMAIL}`);
  }
  if (seedResult.upstreamsCreated > 0) {
    console.log(`[Urumi Gateway] Registered ${seedResult.upstreamsCreated} default upstream servers.`);
  }

  // Create Express App
  const app = createApp(db, config);

  const server = app.listen(config.PORT, () => {
    console.log(`[Urumi Gateway] Server listening on http://0.0.0.0:${config.PORT}`);
    console.log(`[Urumi Gateway] Health check available at http://0.0.0.0:${config.PORT}/health`);
  });

  const shutdown = async () => {
    console.log('[Urumi Gateway] Gracefully shutting down...');
    server.close(async () => {
      await db.close();
      console.log('[Urumi Gateway] Database connection closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch(err => {
  console.error('[Urumi Gateway] Fatal startup error:', err);
  process.exit(1);
});
