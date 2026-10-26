const EmbeddedPostgres = require('embedded-postgres').default;
const path = require('path');
const fs = require('fs');

const DB_DIR = path.resolve(process.cwd(), '.pgdata-disposable-test');
const PORT = 54332;
const USER = 'testuser';
const PASSWORD = 'testpassword';

async function main() {
  const isInit = !fs.existsSync(DB_DIR);
  const pg = new EmbeddedPostgres({
    port: PORT,
    databaseDir: DB_DIR,
    user: USER,
    password: PASSWORD,
    persistent: true,
  });

  if (isInit) {
    console.log('[Real PG Test Server] Initializing cluster in', DB_DIR);
    await pg.initialise();
  }

  console.log(`[Real PG Test Server] Starting PostgreSQL on port ${PORT}...`);
  await pg.start();
  console.log(`[Real PG Test Server] PostgreSQL 18.4 is ready on port ${PORT}!`);

  // Handle termination gracefully
  const shutdown = async () => {
    console.log('[Real PG Test Server] Shutting down...');
    try {
      await pg.stop();
    } catch (e) {}
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Keep alive
  setInterval(() => {}, 60000);
}

main().catch((err) => {
  console.error('[Real PG Test Server] Startup error:', err);
  process.exit(1);
});
