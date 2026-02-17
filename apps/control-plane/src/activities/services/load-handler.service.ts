import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BaseActivityHandler } from '../handlers/base-activity.handler';
import { ConnectorClientService } from '../handlers/connector-client.service';
import { ExecutionContext, ActivityExecutionResult } from '../entities/activity-result.types';
import { ExecutionStateService } from '../../executions/services/execution-state.service';
import { PrismaService } from '../../prisma.service';

interface LoadConfig {
  aggregatorInstanceId: string;
  table: string;
  mode: 'insert' | 'upsert' | 'create';
  conflictKey?: string | string[];
  conflictResolution?: 'replace' | 'merge' | 'skip';
  columnMappings?: { source: string; destination: string }[];
  batchSize?: number;
}

@Injectable()
export class LoadHandlerService extends BaseActivityHandler {
  constructor(
    private readonly connectorClient: ConnectorClientService,
    private readonly prisma: PrismaService,
    stateService: ExecutionStateService,
  ) {
    super(stateService);
  }

  async execute(
    context: ExecutionContext,
    config: LoadConfig,
    inputs?: Record<string, any>
  ): Promise<ActivityExecutionResult> {
    const startTime = Date.now();

    try {
      if (!inputs || Object.keys(inputs).length === 0) {
        throw new Error('Load activity requires input data');
      }

      await this.logActivityStart(context.executionId, context.activityId, config);

      // Get the first input
      let inputData = Object.values(inputs)[0];

      // Handle the case where input is wrapped in { data: [...] } or { error: ..., status: ... }
      if (inputData && typeof inputData === 'object' && !Array.isArray(inputData)) {
        // If the response has a 'data' property, use that
        if ('data' in inputData) {
          inputData = inputData.data;
        }
        // If the response has an 'error' property, the source failed
        if ('error' in inputData) {
          throw new Error(`Source activity failed: ${inputData.error}`);
        }
      }

      if (!Array.isArray(inputData)) {
        throw new Error('Load input must be an array');
      }

      // Get aggregator instance
      const instance = await this.getInstance(config.aggregatorInstanceId, context.tenantId);

      // Apply column mappings if provided
      const dataToLoad = this.applyColumnMappings(inputData, config.columnMappings);

      // Load data in batches
      const batchSize = config.batchSize || 1000;
      let totalLoaded = 0;
      const errors: any[] = [];

      for (let i = 0; i < dataToLoad.length; i += batchSize) {
        const batch = dataToLoad.slice(i, i + batchSize);
        const result = await this.connectorClient.loadData(
          instance,
          batch,
          config,
          context
        );

        totalLoaded += result.rowsLoaded;
        if (result.errors) {
          errors.push(...result.errors);
        }
      }

      const duration = Date.now() - startTime;
      
      const activityResult: ActivityExecutionResult = {
        success: errors.length === 0,
        data: {
          rowsProcessed: dataToLoad.length,
          rowsLoaded: totalLoaded,
          rowsFailed: errors.length,
        },
        error: errors.length > 0 ? {
          code: 'LOAD_PARTIAL_FAILURE',
          message: `${errors.length} rows failed to load`,
          details: errors,
          retryable: false,
        } : undefined,
        metadata: {
          rowsProcessed: dataToLoad.length,
          durationMs: duration,
          warnings: errors.length > 0 ? [`${errors.length} rows failed`] : undefined,
        },
      };

      await this.logActivityComplete(context.executionId, context.activityId, activityResult, duration);

      return activityResult;

    } catch (error) {
      this.logger.error(`Load activity failed: ${error.message}`, error.stack);
      
      const duration = Date.now() - startTime;
      const result: ActivityExecutionResult = {
        success: false,
        error: {
          code: 'LOAD_ERROR',
          message: error.message,
          retryable: this.isRetryableError(error),
        },
      };

      await this.logActivityComplete(context.executionId, context.activityId, result, duration);
      return result;
    }
  }

  private async getInstance(instanceId: string, tenantId: string) {
    // Fetch the actual aggregator instance from the database
    const instance = await this.prisma.aggregatorInstance.findFirst({
      where: { id: instanceId, tenantId },
      include: {
        aggregator: {
          select: {
            id: true,
            name: true,
            type: true,
            category: true,
          },
        },
        credential: {
          select: {
            id: true,
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
          },
        },
      },
    });

    if (!instance) {
      throw new NotFoundException(`Aggregator instance with ID "${instanceId}" not found for tenant "${tenantId}"`);
    }

    // Return the full instance with credentials info
    return instance;
  }

  private applyColumnMappings(
    data: any[],
    mappings?: { source: string; destination: string }[]
  ): any[] {
    if (!mappings || mappings.length === 0) {
      return data;
    }

    return data.map(row => {
      const mappedRow: any = {};
      mappings.forEach(mapping => {
        mappedRow[mapping.destination] = row[mapping.source];
      });
      return mappedRow;
    });
  }

  private isRetryableError(error: any): boolean {
    const retryableCodes = ['NETWORK_ERROR', 'TIMEOUT', 'DEADLOCK'];
    return retryableCodes.some(code => error.code === code);
  }
}
