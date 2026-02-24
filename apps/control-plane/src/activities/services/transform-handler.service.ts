import { Injectable, Logger } from '@nestjs/common';
import { BaseActivityHandler } from '../handlers/base-activity.handler';
import { DataTransformService } from '../handlers/data-transform.service';
import { ExecutionContext, ActivityExecutionResult } from '../entities/activity-result.types';
import { ExecutionStateService } from '../../executions/services/execution-state.service';

interface TransformConfig {
  code: string; // JavaScript function body
  inputSchema?: Record<string, string>; // Optional type hints
}

@Injectable()
export class TransformHandlerService extends BaseActivityHandler {
  constructor(
    private readonly transformService: DataTransformService,
    stateService: ExecutionStateService,
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
      
      // Handle different input formats:
      // 1. Direct array: [{}, {}, ...]
      // 2. Wrapped object with data property: { data: [...], columns: [...] }
      // 3. Object with error (from failed source): { error: "..." } or { data: { error: "...", status: "failed" } }
      let dataArray: any[];
      
      if (Array.isArray(inputData)) {
        dataArray = inputData;
      } else if (inputData && typeof inputData === 'object') {
        // Check if it's a wrapped response with data property
        if (Array.isArray(inputData.data)) {
          // Check for nested error in data - this is common from mini-connector-source
          if (inputData.data.error || (inputData.data.data && inputData.data.data.error)) {
            const nestedError = inputData.data.error || inputData.data.data.error;
            throw new Error(`Source data error: ${nestedError}`);
          }
          dataArray = inputData.data;
        } else if (inputData.error) {
          // This is an error response from source - propagate the error
          throw new Error(`Source data error: ${inputData.error}`);
        } else if (inputData.data && inputData.data.error) {
          // Error is nested in data property - propagate it
          throw new Error(`Source data error: ${inputData.data.error}`);
        } else {
          // Single object - wrap in array
          dataArray = [inputData];
        }
      } else {
        throw new Error('Transform input must be an array or object with data property');
      }

      if (dataArray.length === 0) {
        throw new Error('Transform input has no data to process');
      }

      // Execute transformation
      const result = await this.transformService.transform(
        dataArray,
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
