import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EncryptionService } from '../common/services/encryption.service';
import { ConnectionFactoryService } from './connections/connection-factory.service';

@Injectable()
export class TenantAggregatorsService {
  constructor(
    private prisma: PrismaService,
    private encryptionService: EncryptionService,
    private connectionFactory: ConnectionFactoryService,
  ) {}

  async findAll(tenantId: string, options: { aggregatorId?: string }) {
    const where: any = { tenantId };
    
    if (options.aggregatorId) {
      where.aggregatorId = options.aggregatorId;
    }

    const aggregators = await this.prisma.tenantAggregator.findMany({
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
      },
      orderBy: { installedAt: 'desc' },
    });

    return {
      data: aggregators.map((ta) => ({
        id: ta.id,
        aggregatorId: ta.aggregatorId,
        name: ta.name,
        aggregatorName: ta.aggregator.name,
        aggregatorDescription: ta.aggregator.description,
        description: ta.description,
        category: ta.aggregator.category,
        type: ta.aggregator.type,
        logoUrl: ta.aggregator.logoUrl,
        configSchema: ta.aggregator.configSchema,
        status: ta.status,
        config: ta.config,
        hasCredentials: !!ta.credentials,
        lastTestAt: ta.lastTestAt,
        lastTestStatus: ta.lastTestStatus,
        lastTestError: ta.lastTestError,
        lastSyncAt: ta.lastSyncAt,
        miniConnectorId: ta.miniConnectorId,
        installedAt: ta.installedAt,
        updatedAt: ta.updatedAt,
      })),
    };
  }

  async findOne(id: string, tenantId: string) {
    const aggregator = await this.prisma.tenantAggregator.findFirst({
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
      },
    });

    if (!aggregator) {
      return null;
    }

    return {
      id: aggregator.id,
      aggregatorId: aggregator.aggregatorId,
      name: aggregator.name,
      aggregatorName: aggregator.aggregator.name,
      aggregatorDescription: aggregator.aggregator.description,
      description: aggregator.description,
      category: aggregator.aggregator.category,
      type: aggregator.aggregator.type,
      logoUrl: aggregator.aggregator.logoUrl,
      configSchema: aggregator.aggregator.configSchema,
      status: aggregator.status,
      config: aggregator.config,
      hasCredentials: !!aggregator.credentials,
      lastTestAt: aggregator.lastTestAt,
      lastTestStatus: aggregator.lastTestStatus,
      lastTestError: aggregator.lastTestError,
      lastSyncAt: aggregator.lastSyncAt,
      miniConnectorId: aggregator.miniConnectorId,
      installedAt: aggregator.installedAt,
      updatedAt: aggregator.updatedAt,
    };
  }

  async install(
    aggregatorId: string,
    tenantId: string,
    name: string,
    config?: Record<string, any>,
    credentials?: Record<string, string>,
    testConnection?: boolean,
  ) {
    // Check if aggregator exists
    const aggregator = await this.prisma.aggregator.findUnique({
      where: { id: aggregatorId },
    });

    if (!aggregator) {
      throw new NotFoundException(`Aggregator with ID "${aggregatorId}" not found`);
    }

    // Check for duplicate name
    const existing = await this.prisma.tenantAggregator.findFirst({
      where: { tenantId, aggregatorId, name },
    });

    if (existing) {
      throw new ConflictException(`Instance name "${name}" already exists for this aggregator`);
    }

    // Determine initial status and prepare data
    let initialStatus: 'UNCONFIGURED' | 'CONFIGURED' | 'ACTIVE' = 'UNCONFIGURED';
    let encryptedCredentials: string | undefined;
    const configToSave = config || {};

    if (credentials && Object.keys(credentials).length > 0) {
      encryptedCredentials = this.encryptionService.encrypt(credentials);
      initialStatus = 'CONFIGURED';
    }

    // Create tenant aggregator
    const tenantAggregator = await this.prisma.tenantAggregator.create({
      data: {
        tenantId,
        aggregatorId,
        name,
        status: initialStatus,
        config: configToSave,
        credentials: encryptedCredentials,
      },
    });

    // Fetch aggregator details separately
    const aggregatorDetails = await this.prisma.aggregator.findUnique({
      where: { id: aggregatorId },
      select: { type: true },
    });

    // Build response
    const response: any = {
      id: tenantAggregator.id,
      aggregatorId: tenantAggregator.aggregatorId,
      name: tenantAggregator.name,
      status: tenantAggregator.status,
      type: aggregatorDetails?.type || 'UNKNOWN',
      installedAt: tenantAggregator.installedAt,
      configSaved: Object.keys(configToSave).length > 0,
      credentialsSaved: !!encryptedCredentials,
    };

    // Optionally test connection immediately
    if (testConnection && encryptedCredentials) {
      try {
        const tester = await this.connectionFactory.getTester(aggregatorId);
        const metadata = await tester.test(configToSave, credentials);

        // Update status to ACTIVE on successful test
        await this.prisma.tenantAggregator.update({
          where: { id: tenantAggregator.id },
          data: {
            lastTestAt: new Date(),
            lastTestStatus: 'passed',
            lastTestError: null,
            status: 'ACTIVE',
          },
        });

        response.status = 'ACTIVE';
        response.testResult = {
          success: true,
          message: 'Connection successful',
          metadata,
        };
      } catch (error: any) {
        // Update test failure status
        await this.prisma.tenantAggregator.update({
          where: { id: tenantAggregator.id },
          data: {
            lastTestAt: new Date(),
            lastTestStatus: 'failed',
            lastTestError: error.message,
          },
        });

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
    const existing = await this.prisma.tenantAggregator.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException(`Tenant aggregator with ID "${id}" not found`);
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

    await this.prisma.tenantAggregator.delete({
      where: { id },
    });

    return { success: true };
  }

  async saveCredentials(
    id: string,
    tenantId: string,
    name: string,
    config: Record<string, any>,
    credentials: Record<string, string>,
  ) {
    // Check if exists
    const existing = await this.prisma.tenantAggregator.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException(`Tenant aggregator with ID "${id}" not found`);
    }

    // Encrypt credentials
    const encryptedCredentials = this.encryptionService.encrypt(credentials);

    // Update
    const updated = await this.prisma.tenantAggregator.update({
      where: { id },
      data: {
        name,
        config,
        credentials: encryptedCredentials,
        status: 'ACTIVE',
        lastTestStatus: null,
        lastTestError: null,
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      status: updated.status,
      hasCredentials: true,
    };
  }

  async testConnection(
    id: string,
    tenantId: string,
    credentials?: Record<string, string>,
  ) {
    // Get tenant aggregator
    const ta = await this.prisma.tenantAggregator.findFirst({
      where: { id, tenantId },
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
      throw new NotFoundException(`Tenant aggregator with ID "${id}" not found`);
    }

    // Get credentials to test
    let credsToTest: Record<string, string>;
    if (credentials) {
      credsToTest = credentials;
    } else if (ta.credentials) {
      credsToTest = this.encryptionService.decrypt(ta.credentials) as Record<string, string>;
    } else {
      throw new NotFoundException('No credentials configured for testing');
    }

    // Run test using ConnectionFactory
    const tester = await this.connectionFactory.getTester(ta.aggregatorId);
    
    try {
      const metadata = await tester.test(ta.config as Record<string, any>, credsToTest);
      
      // Update test status
      await this.prisma.tenantAggregator.update({
        where: { id },
        data: {
          lastTestAt: new Date(),
          lastTestStatus: 'passed',
          lastTestError: null,
          status: 'ACTIVE',
        },
      });

      return {
        success: true,
        message: 'Connection successful',
        metadata,
      };
    } catch (error: any) {
      // Update test status
      await this.prisma.tenantAggregator.update({
        where: { id },
        data: {
          lastTestAt: new Date(),
          lastTestStatus: 'failed',
          lastTestError: error.message,
        },
      });

      return {
        success: false,
        message: error.message,
        errorCode: error.code || 'CONNECTION_FAILED',
      };
    }
  }

  // getTester method removed - now using ConnectionFactoryService
}
