import { Injectable, Logger } from '@nestjs/common';
import { BaseActivityHandler } from '../handlers/base-activity.handler';
import { ConnectorClientService } from '../handlers/connector-client.service';
import { ExecutionContext, ActivityExecutionResult } from '../entities/activity-result.types';

interface ExtractConfig {
  aggregatorInstanceId: string;
  table: string;
  columns: string[];
  where?: string;
  limit?: number;
  orderBy?: string;
}

@Injectable()
export class ExtractHandlerService extends BaseActivityHandler {

  constructor(
    private readonly connectorClient: ConnectorClientService,
    stateService: any,
  ) {
    super(stateService);
  }

  async execute(
    context: ExecutionContext,
    config: ExtractConfig,
    inputs?: Record<string, any>
  ): Promise<ActivityExecutionResult> {
    const startTime = Date.now();

    try {
      // Get aggregator instance from inputs or config
      const instanceId = config.aggregatorInstanceId;
      const instance = await this.getInstance(instanceId, context.tenantId);

      await this.logActivityStart(context.executionId, context.activityId, config);

      // Build query
      const query = {
        table: config.table,
        columns: config.columns,
        where: config.where,
        limit: config.limit,
        orderBy: config.orderBy,
      };

      // Execute query via connector client
      const result = await this.connectorClient.executeQuery(
        instance,
        query,
        context
      );

      const duration = Date.now() - startTime;
      
      const activityResult: ActivityExecutionResult = {
        success: true,
        data: result.data,
        metadata: {
          rowsProcessed: result.rowCount || 0,
          durationMs: duration,
          bytesTransferred: JSON.stringify(result.data).length,
        },
      };

      await this.logActivityComplete(context.executionId, context.activityId, activityResult, duration);

      return activityResult;

    } catch (error) {
      this.logger.error(`Extract activity failed: ${error.message}`, error.stack);
      
      const duration = Date.now() - startTime;
      const result: ActivityExecutionResult = {
        success: false,
        error: {
          code: 'EXTRACT_ERROR',
          message: error.message,
          retryable: this.isRetryableError(error),
        },
      };

      await this.logActivityComplete(context.executionId, context.activityId, result, duration);
      return result;
    }
  }

  private isRetryableError(error: any): boolean {
    // Network errors, timeouts are retryable
    // Authentication errors, table not found are not retryable
    const retryableCodes = ['NETWORK_ERROR', 'TIMEOUT', 'CONNECTION_LOST'];
    return retryableCodes.some(code => error.code === code);
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
}
