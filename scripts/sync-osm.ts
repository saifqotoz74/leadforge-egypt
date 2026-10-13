/**
 * Standalone Script: Sync Egyptian Leads from OpenStreetMap (Overpass API)
 *
 * Runs autonomously without requiring any credit card or external API key.
 * Usage:
 *   npm run sync:osm
 */

import { prisma } from '../src/lib/db';
import { runIngestionPipeline } from '../src/lib/collectors';

async function main() {
  console.log('--- Starting OpenStreetMap Egypt Lead Sync ---');

  const adminUser = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
  });

  if (!adminUser) {
    console.error('Error: No admin user found in database.');
    process.exit(1);
  }

  const openDataSource = await prisma.leadSource.findFirst({
    where: { type: 'OPEN_DATA', enabled: true },
  });

  if (!openDataSource) {
    console.error('Error: OPEN_DATA source not found or disabled.');
    process.exit(1);
  }

  console.log(`Using Source: ${openDataSource.name} (${openDataSource.id})`);
  console.log(`Triggering ingestion pipeline...`);

  const report = await runIngestionPipeline({
    prisma,
    userId: adminUser.id,
    sourceId: openDataSource.id,
    sourceName: openDataSource.name,
    sourceType: 'OPEN_DATA',
    triggerType: 'SCHEDULED',
    maxRecords: 10,
    timeoutMs: 90_000,
  });

  console.log('--- Ingestion Report ---');
  console.log('Status:       ', report.status);
  console.log('Discovered:   ', report.discovered);
  console.log('Fetched:      ', report.fetched);
  console.log('Valid Leads:  ', report.valid);
  console.log('Inserted:     ', report.inserted);
  console.log('Duplicates:   ', report.duplicates);
  console.log('Saleable:     ', report.saleable);
  console.log('Duration:     ', `${report.durationMs}ms`);

  const totalLeads = await prisma.lead.count();
  console.log(`Total Leads in Database now: ${totalLeads}`);
  console.log('--- Sync Completed Successfully ---');
}

main()
  .catch((err) => {
    console.error('Fatal sync error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
