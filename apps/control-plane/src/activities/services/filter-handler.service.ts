import { Injectable, Logger } from '@nestjs/common';
import { BaseActivityHandler } from '../handlers/base-activity.handler';
import { DataTransformService } from '../handlers/data-transform.service';
import { ExecutionContext, ActivityExecutionResult } from '../entities/activity-result.types';
import { ExecutionStateService } from '../../executions/services/execution-state.service';

interface FilterConfig {
  condition: string; // JavaScript expression returning boolean
  inputActivityId: string;
}

@Injectable()
export class FilterHandlerService extends BaseActivityHandler {
  constructor(
    private readonly transformService: DataTransformService,
    stateService: ExecutionStateService,
  ) {
    super(stateService);
  }

  async execute(
    context: ExecutionContext,
    config: FilterConfig,
    inputs?: Record<string, any>
  ): Promise<ActivityExecutionResult> {
    const startTime = Date.now();

    try {
      if (!inputs || Object.keys(inputs).length === 0) {
        throw new Error('Filter activity requires input data');
      }

      await this.logActivityStart(context.executionId, context.activityId, config);

      // Get input data
      const inputData = inputs[config.inputActivityId];
      if (!Array.isArray(inputData)) {
        throw new Error('Filter input must be an array');
      }

      // Use transform service to evaluate condition
      const result = await this.transformService.transform(
        inputData,
        `return ${config.condition}`,
        {
          executionId: context.executionId,
          activityId: context.activityId,
        }
      );

      const filteredData = Array.isArray(result) ? result : inputData.filter((item: any) => result.includes(item));

      const duration = Date.now() - startTime;
      
      const activityResult: ActivityExecutionResult = {
        success: true,
        data: filteredData,
        metadata: {
          rowsProcessed: inputData.length,
          rowsFiltered: inputData.length - filteredData.length,
          durationMs: duration,
        },
      };

      await this.logActivityComplete(context.executionId, context.activityId, activityResult, duration);

      return activityResult;

    } catch (error) {
      this.logger.error(`Filter activity failed: ${error.message}`, error.stack);
      
      const duration = Date.now() - startTime;
      const result: ActivityExecutionResult = {
        success: false,
        error: {
          code: 'FILTER_ERROR',
          message: error.message,
          retryable: false,
        },
      };

      await this.logActivityComplete(context.executionId, context.activityId, result, duration);
      return result;
    }
  }
}
