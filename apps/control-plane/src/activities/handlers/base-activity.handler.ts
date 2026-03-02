import { Injectable, Logger } from '@nestjs/common';
import { ActivityExecutionRequest, ActivityExecutionResult, ExecutionContext } from '../entities/activity-result.types';
import { ExecutionStateService } from '../../executions/services/execution-state.service';

@Injectable()
export abstract class BaseActivityHandler {
  protected readonly logger: Logger;

  constructor(protected readonly stateService: ExecutionStateService) {
    this.logger = new Logger(this.constructor.name);
  }

  abstract execute(
    context: ExecutionContext,
    config: Record<string, any>,
    inputs?: Record<string, any>
  ): Promise<ActivityExecutionResult>;

  protected async logActivityStart(
    executionId: string,
    activityId: string,
    config: Record<string, any>
  ) {
    await this.stateService.logEvent({
      executionId,
      timestamp: new Date(),
      eventType: 'STEP_STARTED',
      payload: { activityId, config },
    });
  }

  protected async logActivityComplete(
    executionId: string,
    activityId: string,
    result: ActivityExecutionResult,
    duration: number
  ) {
    await this.stateService.logEvent({
      executionId,
      timestamp: new Date(),
      eventType: result.success ? 'STEP_COMPLETED' : 'STEP_FAILED',
      payload: {
        activityId,
        success: result.success,
        error: result.error,
        metadata: result.metadata,
        duration,
      },
    });
  }

  protected async createActivityExecution(
    executionId: string,
    tenantId: string,
    activityId: string,
    attempt: number = 1
  ) {
    return this.stateService.recordActivityExecution(
      executionId,
      tenantId,
      activityId,
      'extract', // Will be overridden by actual type
      attempt,
      'RUNNING'
    );
  }

  protected async completeActivityExecution(
    executionId: string,
    tenantId: string,
    activityId: string,
    result: ActivityExecutionResult,
    attempt: number = 1
  ) {
    return this.stateService.recordActivityExecution(
      executionId,
      tenantId,
      activityId,
      'extract', // Will be overridden by actual type
      attempt,
      result.success ? 'COMPLETED' : 'FAILED',
      result.data,
      result.error ? { message: result.error.message, retryable: result.error.retryable } : undefined
    );
  }
}
