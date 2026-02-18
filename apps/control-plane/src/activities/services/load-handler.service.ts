import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { BaseActivityHandler } from '../handlers/base-activity.handler';
import { ConnectorClientService } from '../handlers/connector-client.service';
import { ExecutionContext, ActivityExecutionResult } from '../entities/activity-result.types';
import { ExecutionStateService } from '../../executions/services/execution-state.service';
import { PrismaService } from '../../prisma.service';

interface LoadConfig {
  aggregatorInstanceId: string;
  table?: string;
  mode: 'insert' | 'upsert' | 'create';
  conflictKey?: string | string[];
  conflictResolution?: 'replace' | 'merge' | 'skip';
  columnMappings?: { source: string; destination: string }[];
  batchSize?: number;
  /** 
   * Source metadata from previous activity to infer table name.
   * When table is not provided, it will be inferred from source metadata.
   */
  sourceMetadata?: {
    tableName?: string;
    columns?: string[];
  };
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

      // Resolve the actual table name - this is the key fix for the "undefined" bug
      const resolvedTableName = this.resolveTableName(config, inputData);
      
      // Update config with resolved table name for connector client
      const loadConfig = {
        ...config,
        table: resolvedTableName,
      };

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
          loadConfig,
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

  /**
   * Resolve the actual table name for the load operation.
   * Priority:
   * 1. Explicitly provided table name in config
   * 2. Source metadata from config
   * 3. Source metadata from input data (_sourceMetadata)
   * 4. Infer from input data structure (first row keys)
   * 5. Throw error if nothing available
   */
  private resolveTableName(config: LoadConfig, inputData: any): string {
    // 1. Use explicitly provided table name
    if (config.table && config.table !== 'undefined') {
      return config.table;
    }

    // 2. Use source metadata from config if provided
    if (config.sourceMetadata?.tableName) {
      return config.sourceMetadata.tableName;
    }

    // 3. Try to infer from input data - check for _sourceMetadata in wrapped response
    if (Array.isArray(inputData) && inputData.length > 0) {
      const firstRow = inputData[0];
      
      if (firstRow && typeof firstRow === 'object') {
        // Check for _sourceMetadata (set by dispatcher)
        const sourceMeta = firstRow as any;
        if (sourceMeta._sourceMetadata?.tableName) {
          return sourceMeta._sourceMetadata.tableName;
        }
        
        // Check for common table name fields
        const tableNameFields = ['_table', 'tableName', 'table', '__table'];
        for (const field of tableNameFields) {
          if (firstRow[field]) {
            return firstRow[field];
          }
        }
        
        // Check for metadata in a nested structure
        if (firstRow._metadata?.tableName) {
          return firstRow._metadata.tableName;
        }
      }
    }

    // 4. Also check if the entire input has _sourceMetadata (when input is wrapped)
    if (inputData && typeof inputData === 'object' && !Array.isArray(inputData)) {
      const inputAny = inputData as any;
      if (inputAny._sourceMetadata?.tableName) {
        return inputAny._sourceMetadata.tableName;
      }
    }

    // 5. Throw clear error instead of using undefined
    throw new BadRequestException(
      'Table name is required for load activity. Provide it in config.table, ' +
      'config.sourceMetadata.tableName, or ensure the source data includes table metadata.'
    );
  }
}
