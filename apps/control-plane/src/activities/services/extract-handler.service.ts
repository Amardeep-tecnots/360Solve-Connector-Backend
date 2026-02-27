import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BaseActivityHandler } from '../handlers/base-activity.handler';
import { ConnectorClientService } from '../handlers/connector-client.service';
import { ExecutionContext, ActivityExecutionResult } from '../entities/activity-result.types';
import { ExecutionStateService } from '../../executions/services/execution-state.service';
import { PrismaService } from '../../prisma.service';
import { SDKExecutionService, SDKConfig } from '../../ai/sdk-execution.service';

interface ExtractConfig {
  aggregatorInstanceId: string;
  table?: string;
  columns?: string[];
  where?: string;
  limit?: number;
  orderBy?: string;
  /**
   * SDK-specific configuration for AI SDK aggregators
   */
  sdkMethod?: string;
  sdkConfig?: {
    baseUrl?: string;
    apiKey?: string;
    bearerToken?: string;
    timeout?: number;
  };
}

@Injectable()
export class ExtractHandlerService extends BaseActivityHandler {

  constructor(
    private readonly connectorClient: ConnectorClientService,
    private readonly prisma: PrismaService,
    private readonly sdkExecutionService: SDKExecutionService,
    stateService: ExecutionStateService,
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

      // Check if this is an AI SDK aggregator
      const isSDK = await this.isSDKAggregator(instance.aggregatorId);

      if (isSDK) {
        // Handle AI SDK extract - call SDK method to fetch data from external API
        return await this.executeSDKExtract(
          instance,
          config,
          context,
          startTime
        );
      }

      // Handle database extract (original behavior)
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

  /**
   * Check if an aggregator is an AI SDK
   * Checks:
   * 1. If aggregatorId starts with "sdk-"
   * 2. If aggregator has sdkRef field set
   */
  private async isSDKAggregator(aggregatorId: string): Promise<boolean> {
    // Check if ID starts with "sdk-" (primary check for AI SDKs)
    if (aggregatorId.startsWith('sdk-')) {
      return true;
    }
    
    // Fallback: check for sdkRef field
    const aggregator = await this.prisma.aggregator.findUnique({
      where: { id: aggregatorId },
      select: { sdkRef: true },
    });
    return !!aggregator?.sdkRef;
  }

  /**
   * Execute extract using AI SDK - fetches data from external API
   */
  private async executeSDKExtract(
    instance: any,
    config: ExtractConfig,
    context: ExecutionContext,
    startTime: number
  ): Promise<ActivityExecutionResult> {
    const { aggregatorId } = instance.aggregator;
    const method = config.sdkMethod || 'fetch';

    this.logger.log(`Executing SDK extract: ${aggregatorId}.${method}`);

    try {
      // Prepare SDK params
      const sdkParams = {
        table: config.table,
        columns: config.columns,
        where: config.where,
        limit: config.limit,
        orderBy: config.orderBy,
      };

      // Execute SDK method
      const sdkResult = await this.sdkExecutionService.executeMethod({
        tenantId: context.tenantId,
        aggregatorId,
        method,
        params: sdkParams,
        config: config.sdkConfig as SDKConfig,
      });

      const duration = Date.now() - startTime;

      if (!sdkResult.success) {
        const errorResult: ActivityExecutionResult = {
          success: false,
          error: {
            code: 'SDK_EXTRACT_ERROR',
            message: sdkResult.error || 'SDK extraction failed',
            retryable: false,
          },
        };

        await this.logActivityComplete(context.executionId, context.activityId, errorResult, duration);
        return errorResult;
      }

      // Get the extracted data
      const extractedData = sdkResult.data;
      const dataArray = Array.isArray(extractedData) ? extractedData : [extractedData];

      const activityResult: ActivityExecutionResult = {
        success: true,
        data: dataArray,
        metadata: {
          rowsProcessed: dataArray.length,
          durationMs: duration,
          bytesTransferred: JSON.stringify(dataArray).length,
          aggregatorType: 'SDK',
          sourceTable: config.table,
        },
      };

      await this.logActivityComplete(context.executionId, context.activityId, activityResult, duration);
      return activityResult;

    } catch (error: any) {
      const duration = Date.now() - startTime;
      const errorResult: ActivityExecutionResult = {
        success: false,
        error: {
          code: 'SDK_EXTRACT_ERROR',
          message: error.message,
          retryable: this.isRetryableError(error),
        },
      };

      await this.logActivityComplete(context.executionId, context.activityId, errorResult, duration);
      return errorResult;
    }
  }

  private isRetryableError(error: any): boolean {
    // Network errors, timeouts are retryable
    // Authentication errors, table not found are not retryable
    const retryableCodes = ['NETWORK_ERROR', 'TIMEOUT', 'CONNECTION_LOST'];
    return retryableCodes.some(code => error.code === code);
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
}
