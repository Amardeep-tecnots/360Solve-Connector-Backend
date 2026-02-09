import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

type AggregatorType = 'CLOUD' | 'ON_PREMISE';
type AggregatorStatus = 'ACTIVE' | 'PAUSED' | 'ERROR' | 'UNCONFIGURED' | 'WAITING_FOR_CONNECTOR';

interface SeedAggregator {
  id: string;
  name: string;
  description: string;
  category: string;
  logoUrl?: string;
  version: string;
  capabilities: string[];
  authMethods: string[];
  configSchema: Record<string, any>;
  type: AggregatorType;
}

@Injectable()
export class AggregatorsService {
  constructor(private readonly prisma: PrismaService) {}

  private seeds: SeedAggregator[] = [
    {
      id: 'agg-salesforce',
      name: 'Salesforce',
      description: 'CRM integration for Salesforce (API key)',
      category: 'CRM',
      logoUrl: 'https://assets.example.com/logos/salesforce.png',
      version: '1.0.0',
      capabilities: ['read', 'write'],
      authMethods: ['api_key'],
      configSchema: {
        authType: 'api_key',
        fields: [
          { name: 'apiKey', label: 'API Key', type: 'password', required: true },
          { name: 'instanceUrl', label: 'Instance URL', type: 'url', required: true },
        ],
      },
      type: 'CLOUD',
    },
    {
      id: 'agg-hubspot',
      name: 'HubSpot',
      description: 'Marketing automation via HubSpot APIs',
      category: 'CRM',
      logoUrl: 'https://assets.example.com/logos/hubspot.png',
      version: '1.0.0',
      capabilities: ['read', 'write'],
      authMethods: ['oauth'],
      configSchema: {
        authType: 'oauth',
        fields: [],
        oauthConfig: { authorizeUrl: 'https://app.hubspot.com/oauth/authorize', scope: 'crm.objects.contacts.read' },
      },
      type: 'CLOUD',
    },
    {
      id: 'agg-mysql',
      name: 'MySQL',
      description: 'Database integration for MySQL',
      category: 'Database',
      logoUrl: 'https://assets.example.com/logos/mysql.png',
      version: '1.0.0',
      capabilities: ['read'],
      authMethods: ['connection_string'],
      configSchema: {
        authType: 'connection_string',
        fields: [
          { name: 'connectionString', label: 'Connection String', type: 'text', required: true, placeholder: 'mysql://user:pass@host:3306/db' },
        ],
      },
      type: 'ON_PREMISE',
    },
  ];

  private async ensureSeeds() {
    for (const seed of this.seeds) {
      await this.prisma.aggregator.upsert({
        where: { id: seed.id },
        update: {
          name: seed.name,
          description: seed.description,
          category: seed.category,
          logoUrl: seed.logoUrl,
          version: seed.version,
          capabilities: seed.capabilities,
          authMethods: seed.authMethods,
          configSchema: seed.configSchema,
          type: seed.type,
        } as any,
        create: {
          id: seed.id,
          name: seed.name,
          description: seed.description,
          category: seed.category,
          logoUrl: seed.logoUrl,
          version: seed.version,
          capabilities: seed.capabilities,
          authMethods: seed.authMethods,
          configSchema: seed.configSchema,
          type: seed.type,
          isPublic: true,
        } as any,
      });
    }
  }

  async listAggregators(tenantId: string, category?: string, search?: string) {
    await this.ensureSeeds();
    const aggregators = await this.prisma.aggregator.findMany({
      where: {
        ...(category ? { category } : {}),
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      },
      orderBy: { name: 'asc' },
    });

    const installs = await this.prisma.tenantAggregator.groupBy({
      by: ['aggregatorId'],
      where: { tenantId },
      _count: { aggregatorId: true },
    });
    const installMap = new Map(installs.map((i) => [i.aggregatorId, i._count.aggregatorId]));

    return aggregators.map((agg: any) => ({
      ...agg,
      isInstalled: installMap.has(agg.id),
      installCount: installMap.get(agg.id) || 0,
    }));
  }

  async getAggregator(tenantId: string, id: string) {
    await this.ensureSeeds();
    const agg: any = await this.prisma.aggregator.findUnique({ where: { id } });
    if (!agg) throw new NotFoundException('Aggregator not found');

    const installCount = await this.prisma.tenantAggregator.count({ where: { tenantId, aggregatorId: id } });
    return { ...agg, isInstalled: installCount > 0, installCount };
  }

  async installAggregator(tenantId: string, aggregatorId: string, name: string) {
    const agg: any = await this.prisma.aggregator.findUnique({ where: { id: aggregatorId } });
    if (!agg) throw new NotFoundException('Aggregator not found');

    const existingName = await this.prisma.tenantAggregator.findFirst({ where: { tenantId, name } });
    if (existingName) throw new BadRequestException('Aggregator instance name already used');

    const status: AggregatorStatus = agg.type === 'ON_PREMISE' ? 'WAITING_FOR_CONNECTOR' : 'UNCONFIGURED';

    return this.prisma.tenantAggregator.create({
      data: {
        tenantId,
        aggregatorId,
        name,
        status: status as any,
        config: {},
      },
    });
  }

  async listTenantAggregators(tenantId: string, aggregatorId?: string) {
    return this.prisma.tenantAggregator.findMany({
      where: { tenantId, ...(aggregatorId ? { aggregatorId } : {}) },
      orderBy: { installedAt: 'desc' },
    });
  }

  async getTenantAggregator(tenantId: string, id: string) {
    const ta = await this.prisma.tenantAggregator.findFirst({ where: { id, tenantId } });
    if (!ta) throw new NotFoundException('Tenant aggregator not found');
    return ta;
  }

  async updateCredentials(tenantId: string, id: string, name: string | undefined, credentials: Record<string, any>) {
    const existing = await this.getTenantAggregator(tenantId, id);
    return this.prisma.tenantAggregator.update({
      where: { id: existing.id },
      data: {
        ...(name ? { name } : {}),
        config: credentials,
        lastTestStatus: null,
        lastTestAt: null,
        status: 'UNCONFIGURED',
      } as any,
    });
  }

  async testConnection(tenantId: string, id: string, credentials?: Record<string, any>) {
    const existing = await this.getTenantAggregator(tenantId, id);
    // Mock test logic: succeed if credentials exist or already stored
    const hasCreds = credentials && Object.keys(credentials).length > 0;
    const success = hasCreds || (existing.config && Object.keys(existing.config as any).length > 0);

    const updated = await this.prisma.tenantAggregator.update({
      where: { id: existing.id },
      data: {
        ...(credentials ? { config: credentials } : {}),
        lastTestAt: new Date(),
        lastTestStatus: success ? 'passed' : 'failed',
        lastTestError: success ? null : 'Missing credentials',
        status: success ? 'ACTIVE' : 'ERROR',
      } as any,
    });

    return { success, tenantAggregator: updated };
  }

  async deleteTenantAggregator(tenantId: string, id: string) {
    await this.getTenantAggregator(tenantId, id);
    // TODO: check workflow dependencies before delete
    await this.prisma.tenantAggregator.delete({ where: { id } });
    return { success: true };
  }
}
