import { PrismaClient, TenantTier, TenantStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Seed default aggregators
  const aggregators = [
    {
      id: 'agg-postgres',
      name: 'PostgreSQL',
      description: 'Connect to PostgreSQL databases',
      category: 'Database',
      capabilities: ['read', 'write', 'bulk'],
      authMethods: ['credentials'],
      isPublic: true,
    },
    {
      id: 'agg-mysql',
      name: 'MySQL',
      description: 'Connect to MySQL databases',
      category: 'Database',
      capabilities: ['read', 'write', 'bulk'],
      authMethods: ['credentials'],
      isPublic: true,
    },
    {
      id: 'agg-salesforce',
      name: 'Salesforce',
      description: 'Connect to Salesforce CRM',
      category: 'CRM',
      capabilities: ['read', 'write', 'bulk'],
      authMethods: ['oauth2', 'api_key'],
      isPublic: true,
    },
    {
      id: 'agg-hubspot',
      name: 'HubSpot',
      description: 'Connect to HubSpot CRM',
      category: 'CRM',
      capabilities: ['read', 'write'],
      authMethods: ['api_key', 'oauth2'],
      isPublic: true,
    },
    {
      id: 'agg-snowflake',
      name: 'Snowflake',
      description: 'Connect to Snowflake data warehouse',
      category: 'Data Warehouse',
      capabilities: ['read', 'write', 'bulk'],
      authMethods: ['credentials'],
      isPublic: true,
    },
    {
      id: 'agg-bigquery',
      name: 'BigQuery',
      description: 'Connect to Google BigQuery',
      category: 'Data Warehouse',
      capabilities: ['read', 'write', 'bulk'],
      authMethods: ['service_account'],
      isPublic: true,
    },
  ];

  for (const aggregator of aggregators) {
    await prisma.aggregator.upsert({
      where: { id: aggregator.id },
      update: aggregator,
      create: aggregator,
    });
  }

  console.log('✅ Seeded aggregators');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
