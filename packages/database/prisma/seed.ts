import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const sampleAggregators = [
  {
    id: 'agg-salesforce',
    name: 'Salesforce',
    description: 'CRM and customer success platform',
    category: 'CRM',
    type: 'CLOUD',
    version: '1.0.0',
    capabilities: ['read', 'write', 'bulk'],
    authMethods: ['oauth', 'api_key'],
    configSchema: {
      authType: 'oauth',
      fields: [
        {
          name: 'instanceUrl',
          label: 'Instance URL',
          type: 'url',
          required: true,
          placeholder: 'https://yourinstance.salesforce.com',
          helpText: 'Your Salesforce instance URL'
        }
      ],
      oauthConfig: {
        authorizeUrl: 'https://login.salesforce.com/services/oauth2/authorize',
        tokenUrl: 'https://login.salesforce.com/services/oauth2/token',
        scope: 'api refresh_token'
      }
    },
    documentationUrl: 'https://developer.salesforce.com/docs',
    isPublic: true,
  },
  {
    id: 'agg-mysql',
    name: 'MySQL',
    description: 'Relational database management system',
    category: 'Database',
    type: 'CLOUD',
    version: '1.0.0',
    capabilities: ['read', 'write', 'streaming'],
    authMethods: ['basic'],
    configSchema: {
      authType: 'basic',
      fields: [
        { name: 'host', label: 'Host', type: 'text', required: true, placeholder: 'localhost' },
        { name: 'port', label: 'Port', type: 'number', required: true, placeholder: '3306' },
        { name: 'username', label: 'Username', type: 'text', required: true },
        { name: 'password', label: 'Password', type: 'password', required: true },
        { name: 'database', label: 'Database', type: 'text', required: true, helpText: 'Database name' }
      ]
    },
    isPublic: true,
  },
  {
    id: 'agg-postgres',
    name: 'PostgreSQL',
    description: 'Advanced open-source relational database',
    category: 'Database',
    type: 'CLOUD',
    version: '1.0.0',
    capabilities: ['read', 'write', 'streaming', 'cdc'],
    authMethods: ['basic', 'connection_string'],
    configSchema: {
      authType: 'connection_string',
      fields: [
        {
          name: 'connectionString',
          label: 'Connection String',
          type: 'password',
          required: true,
          placeholder: 'postgresql://user:pass@host:5432/db',
          helpText: 'Full PostgreSQL connection string'
        }
      ]
    },
    isPublic: true,
  },
  {
    id: 'agg-hubspot',
    name: 'HubSpot',
    description: 'Marketing, sales, and service platform',
    category: 'CRM',
    type: 'CLOUD',
    version: '1.0.0',
    capabilities: ['read', 'write', 'bulk'],
    authMethods: ['api_key'],
    configSchema: {
      authType: 'api_key',
      fields: [
        {
          name: 'apiKey',
          label: 'Private App Token',
          type: 'password',
          required: true,
          helpText: 'Create a private app in HubSpot settings'
        }
      ]
    },
    isPublic: true,
  },
  {
    id: 'agg-snowflake',
    name: 'Snowflake',
    description: 'Cloud data warehouse platform',
    category: 'Data Warehouse',
    type: 'CLOUD',
    version: '1.0.0',
    capabilities: ['read', 'write', 'bulk'],
    authMethods: ['basic'],
    configSchema: {
      authType: 'basic',
      fields: [
        { name: 'account', label: 'Account', type: 'text', required: true, helpText: 'Your Snowflake account identifier' },
        { name: 'username', label: 'Username', type: 'text', required: true },
        { name: 'password', label: 'Password', type: 'password', required: true },
        { name: 'warehouse', label: 'Warehouse', type: 'text', required: true },
        { name: 'database', label: 'Database', type: 'text', required: true },
        { name: 'schema', label: 'Schema', type: 'text', required: false, placeholder: 'PUBLIC' }
      ]
    },
    isPublic: true,
  },
  {
    id: 'agg-bigquery',
    name: 'BigQuery',
    description: 'Connect to Google BigQuery',
    category: 'Data Warehouse',
    type: 'CLOUD',
    version: '1.0.0',
    capabilities: ['read', 'write', 'bulk'],
    authMethods: ['service_account'],
    configSchema: {
      authType: 'service_account',
      fields: [
        { name: 'projectId', label: 'Project ID', type: 'text', required: true, helpText: 'Your Google Cloud project ID' },
        { name: 'keyFile', label: 'Service Account Key', type: 'textarea', required: true, helpText: 'Paste the contents of your service account JSON key file' }
      ]
    },
    isPublic: true,
  },
];

async function main() {
  console.log('Start seeding aggregators...');

  for (const agg of sampleAggregators) {
    await prisma.aggregator.upsert({
      where: { id: agg.id as string },
      update: agg as any,
      create: agg as any
    });
    console.log(`Upserted aggregator: ${agg.name}`);
  }
  
  console.log(`✅ Seeded ${sampleAggregators.length} aggregators`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
