import { Injectable, Logger } from '@nestjs/common';
import { ActivityExecutionRequest, ActivityExecutionResult, ExecutionContext } from '../entities/activity-result.types';
import { ExtractHandlerService } from './extract-handler.service';
import { TransformHandlerService } from './transform-handler.service';
import { LoadHandlerService } from './load-handler.service';
import { FilterHandlerService } from './filter-handler.service';
import { JoinHandlerService } from './join-handler.service';

@Injectable()
export class ActivityExecutorService {
  private readonly logger = new Logger(ActivityExecutorService.name);

  constructor(
    private readonly extractHandler: ExtractHandlerService,
    private readonly transformHandler: TransformHandlerService,
    private readonly loadHandler: LoadHandlerService,
    private readonly filterHandler: FilterHandlerService,
    private readonly joinHandler: JoinHandlerService,
  ) {}

  async executeActivity(request: ActivityExecutionRequest): Promise<ActivityExecutionResult> {
    const context: ExecutionContext = {
      executionId: request.executionId,
      tenantId: request.tenantId,
      activityId: request.activityId,
      stepId: request.stepId,
      startTime: new Date(),
      retryCount: 0,
      maxRetries: 3,
    };

    this.logger.log(
      `Executing activity ${request.activityId} (${request.activityType}) ` +
      `for execution ${request.executionId}`
    );

    try {
      const result = await this.executeHandler(request.activityType, context, request.config, request.inputs);
      return result;
    } catch (error) {
      this.logger.error(
        `Activity execution failed: ${error.message}`,
        error.stack
      );

      return {
        success: false,
        error: {
          code: 'ACTIVITY_EXECUTION_ERROR',
          message: error.message,
          retryable: false,
        },
      };
    }
  }

  private async executeHandler(
    type: string,
    context: ExecutionContext,
    config: Record<string, any>,
    inputs?: Record<string, any>
  ): Promise<ActivityExecutionResult> {
    switch (type) {
      case 'extract':
        return this.extractHandler.execute(context, config as any, inputs);
      case 'transform':
        return this.transformHandler.execute(context, config as any, inputs);
      case 'load':
        return this.loadHandler.execute(context, config as any, inputs);
      case 'filter':
        return this.filterHandler.execute(context, config as any, inputs);
      case 'join':
        return this.joinHandler.execute(context, config as any, inputs);
      default:
        throw new Error(`Unknown activity type: ${type}`);
    }
  }

  async validateActivityConfig(
    type: string,
    config: Record<string, any>
  ): Promise<{ valid: boolean; errors?: string[] }> {
    const errors: string[] = [];

    switch (type) {
      case 'extract':
        if (!config.aggregatorInstanceId) errors.push('aggregatorInstanceId is required');
        if (!config.table) errors.push('table is required');
        if (!config.columns || !Array.isArray(config.columns) || config.columns.length === 0) {
          errors.push('columns is required and must be a non-empty array');
        }
        break;

      case 'transform':
        // Either code or mappingId must be provided
        if (!config.code && !config.mappingId) {
          errors.push('code or mappingId is required');
        }
        break;

      case 'load':
        if (!config.aggregatorInstanceId) errors.push('aggregatorInstanceId is required');
        if (!config.table) errors.push('table is required');
        if (!config.mode || !['insert', 'upsert', 'create'].includes(config.mode)) {
          errors.push('mode must be one of: insert, upsert, create');
        }
        break;

      case 'filter':
        if (!config.condition) errors.push('condition is required');
        if (!config.inputActivityId) errors.push('inputActivityId is required');
        break;

      case 'join':
        if (!config.leftActivityId) errors.push('leftActivityId is required');
        if (!config.rightActivityId) errors.push('rightActivityId is required');
        if (!config.joinKey) errors.push('joinKey is required');
        if (!config.type || !['inner', 'left', 'right', 'full'].includes(config.type)) {
          errors.push('type must be one of: inner, left, right, full');
        }
        break;

      default:
        errors.push(`Unknown activity type: ${type}`);
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
