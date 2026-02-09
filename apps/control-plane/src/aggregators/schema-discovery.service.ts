import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EncryptionService } from '../common/services/encryption.service';
import { ConnectionFactoryService, ConnectionHandler } from './connections/connection-factory.service';

@Injectable()
export class SchemaDiscoveryService {
  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
    private connectionFactory: ConnectionFactoryService,
  ) {}

  async discover(tenantAggregatorId: string, tenantId: string) {
    // Get tenant aggregator
    const ta = await this.prisma.tenantAggregator.findFirst({
      where: { id: tenantAggregatorId, tenantId },
      include: {
        aggregator: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    if (!ta) {
      throw new NotFoundException(`Tenant aggregator with ID "${tenantAggregatorId}" not found`);
    }

    // Check if aggregator has credentials
    if (!ta.credentials) {
      throw new BadRequestException('Aggregator must be configured with credentials before schema discovery');
    }

    // Get connection handler
    const handler = await this.connectionFactory.getTester(ta.aggregatorId) as ConnectionHandler;

    // Decrypt credentials
    const credentials = this.encryptionService.decrypt(ta.credentials) as Record<string, string>;

    // Discover schema
    const schemaResult = await handler.discoverSchema(ta.config as Record<string, any>, credentials);

    // Cache the discovered schema
    const discoveredSchema = await this.prisma.discoveredSchema.upsert({
      where: { tenantAggregatorId },
      create: {
        tenantAggregatorId,
        tables: schemaResult.tables,
        tableCount: schemaResult.tables.length,
        discoveredAt: new Date(),
        refreshedAt: new Date(),
      },
      update: {
        tables: schemaResult.tables,
        tableCount: schemaResult.tables.length,
        refreshedAt: new Date(),
      },
    });

    return {
      success: true,
      data: {
        tenantAggregatorId,
        tableCount: discoveredSchema.tableCount,
        tables: discoveredSchema.tables,
        discoveredAt: discoveredSchema.discoveredAt,
        refreshedAt: discoveredSchema.refreshedAt,
      },
    };
  }

  async getSchema(tenantAggregatorId: string, tenantId: string) {
    // Get tenant aggregator
    const ta = await this.prisma.tenantAggregator.findFirst({
      where: { id: tenantAggregatorId, tenantId },
    });

    if (!ta) {
      throw new NotFoundException(`Tenant aggregator with ID "${tenantAggregatorId}" not found`);
    }

    // Get discovered schema
    const schema = await this.prisma.discoveredSchema.findUnique({
      where: { tenantAggregatorId },
    });

    if (!schema) {
      throw new NotFoundException('Schema not discovered yet. Call /discover endpoint first');
    }

    return {
      success: true,
      data: {
        tenantAggregatorId,
        tableCount: schema.tableCount,
        tables: schema.tables,
        discoveredAt: schema.discoveredAt,
        refreshedAt: schema.refreshedAt,
      },
    };
  }

  async getTables(tenantAggregatorId: string, tenantId: string) {
    // Get tenant aggregator
    const ta = await this.prisma.tenantAggregator.findFirst({
      where: { id: tenantAggregatorId, tenantId },
    });

    if (!ta) {
      throw new NotFoundException(`Tenant aggregator with ID "${tenantAggregatorId}" not found`);
    }

    // Get discovered schema
    const schema = await this.prisma.discoveredSchema.findUnique({
      where: { tenantAggregatorId },
    });

    if (!schema) {
      throw new NotFoundException('Schema not discovered yet. Call /discover endpoint first');
    }

    const tables = (schema.tables as any[]).map((t: any) => ({
      name: t.name,
      columnCount: t.columns?.length || 0,
    }));

    return {
      success: true,
      data: {
        tenantAggregatorId,
        tables,
      },
    };
  }

  async getTable(tenantAggregatorId: string, tenantId: string, tableName: string) {
    // Get tenant aggregator
    const ta = await this.prisma.tenantAggregator.findFirst({
      where: { id: tenantAggregatorId, tenantId },
    });

    if (!ta) {
      throw new NotFoundException(`Tenant aggregator with ID "${tenantAggregatorId}" not found`);
    }

    // Get discovered schema
    const schema = await this.prisma.discoveredSchema.findUnique({
      where: { tenantAggregatorId },
    });

    if (!schema) {
      throw new NotFoundException('Schema not discovered yet. Call /discover endpoint first');
    }

    // Find the table
    const tables = schema.tables as any[];
    const table = tables.find((t: any) => t.name === tableName);

    if (!table) {
      throw new NotFoundException(`Table "${tableName}" not found`);
    }

    return {
      success: true,
      data: {
        tenantAggregatorId,
        tableName,
        columns: table.columns,
      },
    };
  }

  async previewTable(
    tenantAggregatorId: string,
    tenantId: string,
    tableName: string,
    limit: number = 10
  ) {
    // Get tenant aggregator
    const ta = await this.prisma.tenantAggregator.findFirst({
      where: { id: tenantAggregatorId, tenantId },
      include: {
        aggregator: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    if (!ta) {
      throw new NotFoundException(`Tenant aggregator with ID "${tenantAggregatorId}" not found`);
    }

    // Check if aggregator has credentials
    if (!ta.credentials) {
      throw new BadRequestException('Aggregator must be configured with credentials');
    }

    // Validate limit
    if (limit < 1 || limit > 100) {
      throw new BadRequestException('Limit must be between 1 and 100');
    }

    // Get connection handler
    const handler = await this.connectionFactory.getTester(ta.aggregatorId) as ConnectionHandler;

    // Decrypt credentials
    const credentials = this.encryptionService.decrypt(ta.credentials) as Record<string, string>;

    // Preview table
    const previewResult = await handler.previewTable(
      ta.config as Record<string, any>,
      credentials,
      tableName,
      limit
    );

    return {
      success: true,
      data: previewResult,
    };
  }
}
