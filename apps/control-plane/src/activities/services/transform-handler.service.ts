import { Injectable, Logger } from '@nestjs/common';
import { BaseActivityHandler } from '../handlers/base-activity.handler';
import { DataTransformService } from '../handlers/data-transform.service';
import { ExecutionContext, ActivityExecutionResult } from '../entities/activity-result.types';

interface TransformConfig {
  code: string; // JavaScript function body
  inputSchema?: Record<string, string>; // Optional type hints
}

@Injectable()
export class TransformHandlerService extends BaseActivityHandler {
  constructor(
    private readonly transformService: DataTransformService,
    stateService: any,
  ) {
    super(stateService);
  }

  async execute(
    context: ExecutionContext,
    config: TransformConfig,
    inputs?: Record<string, any>
  ): Promise<ActivityExecutionResult> {
    const startTime = Date.now();

    try {
      if (!inputs || Object.keys(inputs).length === 0) {
        throw new Error('Transform activity requires input data');
      }

      await this.logActivityStart(context.executionId, context.activityId, config);

      // Get the first input (for single input transforms)
      const inputData = Object.values(inputs)[0];
      if (!Array.isArray(inputData)) {
        throw new Error('Transform input must be an array');
      }

      // Execute transformation
      const result = await this.transformService.transform(
        inputData,
        config.code,
        {
          executionId: context.executionId,
          activityId: context.activityId,
        }
      );

      const duration = Date.now() - startTime;
      
      const activityResult: ActivityExecutionResult = {
        success: true,
        data: result,
        metadata: {
          rowsProcessed: Array.isArray(result) ? result.length : 1,
          durationMs: duration,
        },
      };

      await this.logActivityComplete(context.executionId, context.activityId, activityResult, duration);

      return activityResult;

    } catch (error) {
      this.logger.error(`Transform activity failed: ${error.message}`, error.stack);
      
      const duration = Date.now() - startTime;
      const result: ActivityExecutionResult = {
        success: false,
        error: {
          code: 'TRANSFORM_ERROR',
          message: error.message,
          retryable: false, // Transform errors are usually code errors
        },
      };

      await this.logActivityComplete(context.executionId, context.activityId, result, duration);
      return result;
    }
  }
}
