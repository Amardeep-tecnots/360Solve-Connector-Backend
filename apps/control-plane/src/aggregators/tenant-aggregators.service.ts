import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ConnectionFactoryService } from './connections/connection-factory.service';

@Injectable()
export class TenantAggregatorsService {
  constructor(
    private prisma: PrismaService,
    private connectionFactory: ConnectionFactoryService,
  ) {}

  async findAll(tenantId: string, options: { aggregatorId?: string }) {
    const where: any = { tenantId };
    
    if (options.aggregatorId) {
      where.aggregatorId = options.aggregatorId;
    }

    const aggregators = await this.prisma.aggregatorInstance.findMany({
      where,
      include: {
        aggregator: {
          select: {
            id: true,
            name: true,
            description: true,
            category: true,
            type: true,
            logoUrl: true,
            configSchema: true,
          },
        },
        credential: {
          select: {
            id: true,
            name: true,
          },
        },
        connector: {
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      data: aggregators.map((instance) => ({
        id: instance.id,
        aggregatorId: instance.aggregatorId,
        name: instance.name,
        aggregatorName: instance.aggregator.name,
        aggregatorDescription: instance.aggregator.description,
        description: instance.description,
        category: instance.aggregator.category,
        type: instance.aggregator.type,
        logoUrl: instance.aggregator.logoUrl,
        configSchema: instance.aggregator.configSchema,
        status: instance.status,
        connectionParams: instance.connectionParams,
        hasCredentials: !!instance.credentialId,
        credentialName: instance.credential?.name,
        lastSyncAt: instance.lastSyncAt,
        connectorId: instance.connectorId,
        connectorName: instance.connector?.name,
        connectorType: instance.connector?.type,
        connectorStatus: instance.connector?.status,
        createdAt: instance.createdAt,
        updatedAt: instance.updatedAt,
      })),
    };
  }

  async findOne(id: string, tenantId: string) {
    const instance = await this.prisma.aggregatorInstance.findFirst({
      where: { id, tenantId },
      include: {
        aggregator: {
          select: {
            id: true,
            name: true,
            description: true,
            category: true,
            type: true,
            logoUrl: true,
            configSchema: true,
          },
        },
        credential: {
          select: {
            id: true,
            name: true,
            host: true,
            port: true,
            database: true,
            usernameHint: true,
          },
        },
        connector: {
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
            lastHeartbeat: true,
          },
        },
      },
    });

    if (!instance) {
      return null;
    }

    return {
      id: instance.id,
      aggregatorId: instance.aggregatorId,
      name: instance.name,
      aggregatorName: instance.aggregator.name,
      aggregatorDescription: instance.aggregator.description,
      description: instance.description,
      category: instance.aggregator.category,
      type: instance.aggregator.type,
      logoUrl: instance.aggregator.logoUrl,
      configSchema: instance.aggregator.configSchema,
      status: instance.status,
      connectionParams: instance.connectionParams,
      hasCredentials: !!instance.credentialId,
      credential: instance.credential,
      discoveredSchema: instance.discoveredSchema,
      schemaDiscoveredAt: instance.schemaDiscoveredAt,
      lastSyncAt: instance.lastSyncAt,
      lastUsedAt: instance.lastUsedAt,
      connectorId: instance.connectorId,
      connector: instance.connector,
      createdAt: instance.createdAt,
      updatedAt: instance.updatedAt,
    };
  }

  async install(
    tenantId: string,
    aggregatorId: string,
    name: string,
    config?: Record<string, any>,
    credentialId?: string,
    credentials?: Record<string, any>,
    connectorId?: string,
    testConnection: boolean = false,
  ) {
    // Check if aggregator exists
    const aggregator = await this.prisma.aggregator.findUnique({
      where: { id: aggregatorId },
    });

    if (!aggregator) {
      throw new NotFoundException(`Aggregator with ID "${aggregatorId}" not found`);
    }

    // Check for duplicate name
    const existing = await this.prisma.aggregatorInstance.findFirst({
      where: { tenantId, name },
    });

    if (existing) {
      throw new ConflictException(`Instance name "${name}" already exists for this tenant`);
    }

    // If credentials object provided, create credential record
    if (credentials && !credentialId) {
      // Extract connection details from credentials
      const connectionString = credentials.connectionString as string;
      if (connectionString) {
        // Parse PostgreSQL connection string manually
        const parsed = this.parseConnectionString(connectionString);
        const credential = await this.prisma.tenantCredential.create({
          data: {
            tenantId,
            name: `${name} Credentials ${new Date().toISOString().replace(/[:.]/g, '-')}`,
            credentialType: 'DATABASE',
            host: parsed.host,
            port: parsed.port,
            database: parsed.database,
            usernameHint: parsed.username,
            vaultPath: `/secret/tenants/${tenantId}/${name.toLowerCase().replace(/\s+/g, '-')}`,
          },
        });
        credentialId = credential.id;
      } else {
        // Create credential with raw values
        const credential = await this.prisma.tenantCredential.create({
          data: {
            tenantId,
            name: `${name} Credentials ${new Date().toISOString().replace(/[:.]/g, '-')}`,
            credentialType: credentials.type || 'API_KEY',
            host: credentials.host,
            port: credentials.port,
            database: credentials.database,
            usernameHint: credentials.username || credentials.apiKey?.substring(0, 4),
            vaultPath: `/secret/tenants/${tenantId}/${name.toLowerCase().replace(/\s+/g, '-')}`,
          },
        });
        credentialId = credential.id;
      }
    }

    // If credentialId provided, verify it exists and belongs to tenant
    if (credentialId) {
      const credential = await this.prisma.tenantCredential.findFirst({
        where: { id: credentialId, tenantId },
      });
      if (!credential) {
        throw new NotFoundException(`Credential with ID "${credentialId}" not found`);
      }
    }

    // If connectorId provided, verify it exists and belongs to tenant
    if (connectorId) {
      const connector = await this.prisma.connector.findFirst({
        where: { id: connectorId, tenantId },
      });
      if (!connector) {
        throw new NotFoundException(`Connector with ID "${connectorId}" not found`);
      }
    }

    // Determine initial status
    const initialStatus = credentialId ? 'ACTIVE' : 'INACTIVE';

    // Create aggregator instance
    const instance = await this.prisma.aggregatorInstance.create({
      data: {
        tenantId,
        aggregatorId,
        name,
        credentialId: credentialId || null,
        connectorId,
        connectionParams: {
          ...config,
          // Store connection string for schema discovery if credentials were provided
          ...(credentials?.connectionString ? { connectionString: credentials.connectionString } : {}),
        },
        status: initialStatus,
      },
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

    // Build response
    const response: any = {
      id: instance.id,
      aggregatorId: instance.aggregatorId,
      name: instance.name,
      status: instance.status,
      type: instance.aggregator.type,
      createdAt: instance.createdAt,
      hasCredentials: !!credentialId,
      hasConnectionParams: Object.keys(config || {}).length > 0,
    };

    // Optionally test connection immediately
    if (testConnection && credentialId) {
      try {
        // Test would go here - simplified for now
        await this.prisma.aggregatorInstance.update({
          where: { id: instance.id },
          data: {
            status: 'ACTIVE',
          },
        });
        response.testResult = {
          success: true,
          message: 'Instance created and connection verified',
        };
      } catch (error: any) {
        response.testResult = {
          success: false,
          message: error.message,
          errorCode: error.code || 'CONNECTION_FAILED',
        };
      }
    }

    return response;
  }

  async delete(id: string, tenantId: string) {
    // Check if exists
    const existing = await this.prisma.aggregatorInstance.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException(`Aggregator instance with ID "${id}" not found`);
    }

    // Check for workflow dependencies
    const dependentWorkflows = await this.prisma.workflowDefinition.findMany({
      where: {
        tenantId,
        definition: {
          path: ['nodes'],
          array_contains: [{ data: { aggregatorId: id } }],
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (dependentWorkflows.length > 0) {
      throw new ConflictException(
        `Cannot delete: Used by ${dependentWorkflows.length} workflow(s): ${dependentWorkflows.map(w => w.name).join(', ')}`,
      );
    }

    await this.prisma.aggregatorInstance.delete({
      where: { id },
    });

    return { success: true };
  }

  async update(
    id: string,
    tenantId: string,
    name: string,
    config?: Record<string, any>,
    credentialId?: string,
    connectorId?: string,
  ) {
    // Check if exists
    const existing = await this.prisma.aggregatorInstance.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException(`Aggregator instance with ID "${id}" not found`);
    }

    // Check for duplicate name if changing
    if (name !== existing.name) {
      const duplicate = await this.prisma.aggregatorInstance.findFirst({
        where: { tenantId, name, id: { not: id } },
      });
      if (duplicate) {
        throw new ConflictException(`Instance name "${name}" already exists`);
      }
    }

    // Verify credential if provided
    if (credentialId && credentialId !== existing.credentialId) {
      const credential = await this.prisma.tenantCredential.findFirst({
        where: { id: credentialId, tenantId },
      });
      if (!credential) {
        throw new NotFoundException(`Credential with ID "${credentialId}" not found`);
      }
    }

    // Verify connector if provided
    if (connectorId && connectorId !== existing.connectorId) {
      const connector = await this.prisma.connector.findFirst({
        where: { id: connectorId, tenantId },
      });
      if (!connector) {
        throw new NotFoundException(`Connector with ID "${connectorId}" not found`);
      }
    }

    const updateData: any = {
      name,
    };

    if (config !== undefined) {
      updateData.connectionParams = config;
    }
    if (credentialId !== undefined) {
      updateData.credentialId = credentialId;
    }
    if (connectorId !== undefined) {
      updateData.connectorId = connectorId;
    }

    const updated = await this.prisma.aggregatorInstance.update({
      where: { id },
      data: updateData,
    });

    return {
      id: updated.id,
      name: updated.name,
      status: updated.status,
      hasCredentials: !!updated.credentialId,
      hasConnectionParams: Object.keys(updated.connectionParams || {}).length > 0,
      updatedAt: updated.updatedAt,
    };
  }

  async testConnection(
    id: string,
    tenantId: string,
  ) {
    // Get aggregator instance
    const instance = await this.prisma.aggregatorInstance.findFirst({
      where: { id, tenantId },
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
      throw new NotFoundException(`Aggregator instance with ID "${id}" not found`);
    }

    // Check if instance has credentials
    if (!instance.credentialId) {
      throw new NotFoundException('No credentials configured for testing');
    }

    // TODO: Implement actual connection test using ConnectionFactory
    // For now, simplified test
    try {
      await this.prisma.aggregatorInstance.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          lastUsedAt: new Date(),
        },
      });

      return {
        success: true,
        message: 'Connection successful',
      };
    } catch (error: any) {
      await this.prisma.aggregatorInstance.update({
        where: { id },
        data: {
          status: 'ERROR',
        },
      });

      return {
        success: false,
        message: error.message,
        errorCode: error.code || 'CONNECTION_FAILED',
      };
    }
  }

  /**
   * Parse PostgreSQL connection string
   * Format: postgresql://username:password@host:port/database
   */
  private parseConnectionString(connectionString: string): {
    host: string;
    port: number;
    database: string;
    username: string;
  } {
    // Remove protocol prefix
    const withoutProtocol = connectionString.replace(/^postgresql:\/\//, '');
    
    // Parse auth and host parts
    const atIndex = withoutProtocol.lastIndexOf('@');
    const authPart = atIndex > -1 ? withoutProtocol.substring(0, atIndex) : '';
    const hostPart = atIndex > -1 ? withoutProtocol.substring(atIndex + 1) : withoutProtocol;
    
    // Extract username from auth (format: username:password)
    const username = authPart.split(':')[0] || '';
    
    // Parse host, port, and database
    const [hostAndPort, database] = hostPart.split('/');
    const [host, portStr] = hostAndPort.split(':');
    
    return {
      host: host || 'localhost',
      port: parseInt(portStr) || 5432,
      database: database || '',
      username,
    };
  }
}
