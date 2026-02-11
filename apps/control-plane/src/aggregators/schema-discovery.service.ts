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

  async discover(aggregatorInstanceId: string, tenantId: string) {
    // Get aggregator instance
    const instance = await this.prisma.aggregatorInstance.findFirst({
      where: { id: aggregatorInstanceId, tenantId },
      include: {
        aggregator: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        credential: true,
      },
    });

    if (!instance) {
      throw new NotFoundException(`Aggregator instance with ID "${aggregatorInstanceId}" not found`);
    }

    // Check if instance has credentials
    if (!instance.credentialId) {
      throw new BadRequestException('Instance must be configured with credentials before schema discovery');
    }

    // Get connection handler
    const handler = await this.connectionFactory.getTester(instance.aggregatorId) as ConnectionHandler;

    // Build credentials from credential record and connectionParams
    // TODO: Fetch actual password from Vault using credential.vaultPath
    const connectionParams = (instance.connectionParams || {}) as Record<string, any>;
    const credentials: Record<string, any> = {
      host: instance.credential?.host,
      port: instance.credential?.port,
      database: instance.credential?.database,
      username: instance.credential?.usernameHint,
      // Connection string takes precedence if stored in connectionParams
      connectionString: connectionParams.connectionString,
      ...connectionParams,
    };

    // Discover schema
    const schemaResult = await handler.discoverSchema(connectionParams, credentials);

    // Cache the discovered schema in the instance record
    const discoveredSchemaData = {
      tables: schemaResult.tables,
      relationships: schemaResult.relationships,
      tableCount: schemaResult.tables.length,
      relationshipCount: schemaResult.relationships?.length || 0,
      discoveredAt: new Date().toISOString(),
      refreshedAt: new Date().toISOString(),
    };

    await this.prisma.aggregatorInstance.update({
      where: { id: aggregatorInstanceId },
      data: {
        discoveredSchema: discoveredSchemaData,
        schemaDiscoveredAt: new Date(),
      },
    });

    return {
      success: true,
      data: {
        aggregatorInstanceId,
        tableCount: discoveredSchemaData.tableCount,
        relationshipCount: discoveredSchemaData.relationshipCount,
        tables: discoveredSchemaData.tables,
        relationships: discoveredSchemaData.relationships,
        discoveredAt: discoveredSchemaData.discoveredAt,
        refreshedAt: discoveredSchemaData.refreshedAt,
      },
    };
  }

  async getSchema(aggregatorInstanceId: string, tenantId: string) {
    // Get aggregator instance
    const instance = await this.prisma.aggregatorInstance.findFirst({
      where: { id: aggregatorInstanceId, tenantId },
    });

    if (!instance) {
      throw new NotFoundException(`Aggregator instance with ID "${aggregatorInstanceId}" not found`);
    }

    // Get discovered schema from instance
    const schema = instance.discoveredSchema as any;

    if (!schema) {
      throw new NotFoundException('Schema not discovered yet. Call /discover endpoint first');
    }

    return {
      success: true,
      data: {
        aggregatorInstanceId,
        tableCount: schema.tableCount,
        relationshipCount: schema.relationshipCount,
        tables: schema.tables,
        relationships: schema.relationships,
        discoveredAt: schema.discoveredAt,
        refreshedAt: schema.refreshedAt,
      },
    };
  }

  async getTables(aggregatorInstanceId: string, tenantId: string) {
    // Get aggregator instance
    const instance = await this.prisma.aggregatorInstance.findFirst({
      where: { id: aggregatorInstanceId, tenantId },
    });

    if (!instance) {
      throw new NotFoundException(`Aggregator instance with ID "${aggregatorInstanceId}" not found`);
    }

    // Get discovered schema from instance
    const schema = instance.discoveredSchema as any;

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
        aggregatorInstanceId,
        tables,
      },
    };
  }

  async getTable(aggregatorInstanceId: string, tenantId: string, tableName: string) {
    // Get aggregator instance
    const instance = await this.prisma.aggregatorInstance.findFirst({
      where: { id: aggregatorInstanceId, tenantId },
    });

    if (!instance) {
      throw new NotFoundException(`Aggregator instance with ID "${aggregatorInstanceId}" not found`);
    }

    // Get discovered schema from instance
    const schema = instance.discoveredSchema as any;

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
        aggregatorInstanceId,
        tableName,
        columns: table.columns,
      },
    };
  }

  async getRelationships(aggregatorInstanceId: string, tenantId: string) {
    // Get aggregator instance
    const instance = await this.prisma.aggregatorInstance.findFirst({
      where: { id: aggregatorInstanceId, tenantId },
    });

    if (!instance) {
      throw new NotFoundException(`Aggregator instance with ID "${aggregatorInstanceId}" not found`);
    }

    // Get discovered schema from instance
    const schema = instance.discoveredSchema as any;

    if (!schema) {
      throw new NotFoundException('Schema not discovered yet. Call /discover endpoint first');
    }

    return {
      success: true,
      data: {
        aggregatorInstanceId,
        relationshipCount: schema.relationshipCount,
        relationships: schema.relationships,
      },
    };
  }

  async previewTable(
    aggregatorInstanceId: string,
    tenantId: string,
    tableName: string,
    limit: number = 10
  ) {
    // Get aggregator instance
    const instance = await this.prisma.aggregatorInstance.findFirst({
      where: { id: aggregatorInstanceId, tenantId },
      include: {
        aggregator: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        credential: {
          select: {
            host: true,
            port: true,
            database: true,
            usernameHint: true,
            vaultPath: true,
          },
        },
      },
    });

    if (!instance) {
      throw new NotFoundException(`Aggregator instance with ID "${aggregatorInstanceId}" not found`);
    }

    // Check if instance has credentials configured
    if (!instance.credentialId) {
      throw new BadRequestException('Instance must be configured with credentials');
    }

    // Validate limit
    if (limit < 1 || limit > 100) {
      throw new BadRequestException('Limit must be between 1 and 100');
    }

    // Get connection handler
    const handler = await this.connectionFactory.getTester(instance.aggregatorId) as ConnectionHandler;

    // Build credentials from credential record and connectionParams
    // TODO: Fetch actual password from Vault using credential.vaultPath
    const connectionParams = (instance.connectionParams || {}) as Record<string, any>;
    const credentials: Record<string, any> = {
      host: instance.credential?.host,
      port: instance.credential?.port,
      database: instance.credential?.database,
      username: instance.credential?.usernameHint,
      // Connection string takes precedence if stored in connectionParams
      connectionString: connectionParams.connectionString,
      ...connectionParams,
    };

    // Preview table
    const previewResult = await handler.previewTable(
      connectionParams,
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
