import { Injectable, Logger } from '@nestjs/common';
import { BaseActivityHandler } from '../handlers/base-activity.handler';
import { ExecutionContext, ActivityExecutionResult } from '../entities/activity-result.types';
import { ExecutionStateService } from '../../executions/services/execution-state.service';

interface JoinConfig {
  type: 'inner' | 'left' | 'right' | 'full';
  leftActivityId: string;
  rightActivityId: string;
  joinKey: string | string[];
  rightKey?: string | string[];
}

@Injectable()
export class JoinHandlerService extends BaseActivityHandler {
  constructor(stateService: ExecutionStateService) {
    super(stateService);
  }

  async execute(
    context: ExecutionContext,
    config: JoinConfig,
    inputs?: Record<string, any>
  ): Promise<ActivityExecutionResult> {
    const startTime = Date.now();

    try {
      if (!inputs || Object.keys(inputs).length < 2) {
        throw new Error('Join activity requires at least 2 input sources');
      }

      await this.logActivityStart(context.executionId, context.activityId, config);

      const leftData = inputs[config.leftActivityId];
      const rightData = inputs[config.rightActivityId];

      if (!Array.isArray(leftData) || !Array.isArray(rightData)) {
        throw new Error('Both inputs must be arrays');
      }

      const joinedData = this.performJoin(
        leftData,
        rightData,
        config.type,
        config.joinKey,
        config.rightKey || config.joinKey
      );

      const duration = Date.now() - startTime;

      const activityResult: ActivityExecutionResult = {
        success: true,
        data: joinedData,
        metadata: {
          rowsProcessed: leftData.length + rightData.length,
          durationMs: duration,
        },
      };

      await this.logActivityComplete(context.executionId, context.activityId, activityResult, duration);

      return activityResult;

    } catch (error) {
      this.logger.error(`Join activity failed: ${error.message}`, error.stack);

      const duration = Date.now() - startTime;
      const result: ActivityExecutionResult = {
        success: false,
        error: {
          code: 'JOIN_ERROR',
          message: error.message,
          retryable: false,
        },
      };

      await this.logActivityComplete(context.executionId, context.activityId, result, duration);
      return result;
    }
  }

  private performJoin(
    left: any[],
    right: any[],
    type: 'inner' | 'left' | 'right' | 'full',
    leftKey: string | string[],
    rightKey: string | string[]
  ): any[] {
    const result: any[] = [];

    // Create lookup for right data
    const rightLookup = new Map();
    right.forEach((row) => {
      const key = this.getJoinKey(row, rightKey);
      if (!rightLookup.has(key)) {
        rightLookup.set(key, []);
      }
      rightLookup.get(key).push(row);
    });

    // Perform join based on type
    switch (type) {
      case 'inner':
        left.forEach((leftRow) => {
          const key = this.getJoinKey(leftRow, leftKey);
          const matches = rightLookup.get(key) || [];
          matches.forEach((rightRow) => {
            result.push({ ...leftRow, ...rightRow });
          });
        });
        break;

      case 'left':
        left.forEach((leftRow) => {
          const key = this.getJoinKey(leftRow, leftKey);
          const matches = rightLookup.get(key);
          if (matches && matches.length > 0) {
            matches.forEach((rightRow) => {
              result.push({ ...leftRow, ...rightRow });
            });
          } else {
            result.push(leftRow);
          }
        });
        break;

      case 'right':
        right.forEach((rightRow) => {
          const key = this.getJoinKey(rightRow, rightKey);
          const matches = left.filter((row) => this.getJoinKey(row, leftKey) === key);
          if (matches.length > 0) {
            matches.forEach((leftRow) => {
              result.push({ ...leftRow, ...rightRow });
            });
          } else {
            result.push(rightRow);
          }
        });
        break;

      case 'full':
        left.forEach((leftRow) => {
          const key = this.getJoinKey(leftRow, leftKey);
          const matches = rightLookup.get(key);
          if (matches && matches.length > 0) {
            matches.forEach((rightRow) => {
              result.push({ ...leftRow, ...rightRow });
            });
          } else {
            result.push(leftRow);
          }
        });
        right.forEach((rightRow) => {
          const key = this.getJoinKey(rightRow, rightKey);
          const matches = left.filter((row) => this.getJoinKey(row, leftKey) === key);
          if (matches.length === 0) {
            result.push(rightRow);
          }
        });
        break;
    }

    return result;
  }

  private getJoinKey(row: any, key: string | string[]): string {
    if (typeof key === 'string') {
      return String(row[key] || '');
    }
    return key.map((k) => String(row[k] || '')).join('|');
  }
}
