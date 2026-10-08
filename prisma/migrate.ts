import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import {
  getPgliteInstance,
  PHASE1_SCHEMA_UPGRADE_SQL,
  PHASE2_SCHEMA_UPGRADE_SQL,
  PHASE3_SCHEMA_UPGRADE_SQL,
  PHASE4_SCHEMA_UPGRADE_SQL,
  prisma,
} from '../src/lib/db';

async function main() {
  console.log('Generating PostgreSQL migration SQL from prisma/schema.prisma...');
  const migrationDir = path.resolve(process.cwd(), 'prisma/migrations/0001_init');
  fs.mkdirSync(migrationDir, { recursive: true });
  const migrationFile = path.join(migrationDir, 'migration.sql');

  const sql = execSync(
    'npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script',
    { encoding: 'utf-8' }
  );

  fs.writeFileSync(migrationFile, sql, 'utf-8');
  console.log(`Saved UTF-8 migration SQL to ${migrationFile} (${sql.length} bytes)`);

  const pgliteInstance = getPgliteInstance();
  if (pgliteInstance) {
    const check = await pgliteInstance.query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'User'
      ) as exists;`
    );
    const alreadyExists = check.rows[0]?.exists;
    if (!alreadyExists) {
      console.log('Applying migration SQL to embedded PostgreSQL (PGlite)...');
      await pgliteInstance.exec(sql);
      console.log('Migration applied successfully!');
    } else {
      console.log('Applying Phase 1, Phase 2, Phase 3 & Phase 4 incremental schema upgrades to embedded PostgreSQL (PGlite)...');
      await pgliteInstance.exec(PHASE1_SCHEMA_UPGRADE_SQL);
      await pgliteInstance.exec(PHASE2_SCHEMA_UPGRADE_SQL);
      await pgliteInstance.exec(PHASE3_SCHEMA_UPGRADE_SQL);
      await pgliteInstance.exec(PHASE4_SCHEMA_UPGRADE_SQL);
      console.log('Phase 1, Phase 2, Phase 3 & Phase 4 incremental schema upgrades applied successfully!');
    }
  } else {
    console.log('External PostgreSQL configured. Running prisma db push...');
    execSync('npx prisma db push', { stdio: 'inherit' });
  }

  await prisma.$disconnect();
  if (pgliteInstance) {
    await pgliteInstance.close();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
