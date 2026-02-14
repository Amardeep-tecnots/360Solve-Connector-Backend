import { Injectable, Logger } from '@nestjs/common';
import { BaseActivityHandler } from '../handlers/base-activity.handler';
import { ConnectorClientService } from '../handlers/connector-client.service';
import { ExecutionContext, ActivityExecutionResult } from '../entities/activity-result.types';

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
    stateService: any,
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
      const inputData = Object.values(inputs)[0];
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
    // TODO: Implement instance retrieval from database
    // For now, return a mock instance
    return {
      id: instanceId,
      aggregator: {
        name: 'Mock Aggregator',
      },
    };
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
