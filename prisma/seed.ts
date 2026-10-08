import { ensureDbReady, getPgliteInstance, prisma } from '../src/lib/db';
import { seedDatabase, DEMO_CREDENTIALS } from '../src/lib/seed-data';

async function main() {
  console.log('Ensuring PostgreSQL database schema is ready...');
  await ensureDbReady();

  console.log('Seeding LeadForge Egypt database...');
  const result = await seedDatabase(prisma);

  if (result.alreadySeeded) {
    const leadsCount = await prisma.lead.count();
    const usersCount = await prisma.user.count();
    console.log(`Database already seeded (${leadsCount} leads, ${usersCount} users).`);
  } else {
    console.log(`Successfully seeded ${result.leadsCount} businesses and ${result.usersCount} users!`);
  }

  console.log('\nDemo Credentials:');
  console.log(`Admin:     ${DEMO_CREDENTIALS.admin.email} / ${DEMO_CREDENTIALS.admin.password}`);
  console.log(`Developer: ${DEMO_CREDENTIALS.developer.email} / ${DEMO_CREDENTIALS.developer.password}`);

  await prisma.$disconnect();
  const pgliteInstance = getPgliteInstance();
  if (pgliteInstance) {
    await pgliteInstance.close();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
