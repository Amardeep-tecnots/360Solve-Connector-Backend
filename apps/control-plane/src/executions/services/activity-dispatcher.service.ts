import { Injectable } from '@nestjs/common';
import {
  Activity,
  WorkflowDefinition,
  WorkflowStep,
  MiniConnectorSourceConfig,
} from '../../workflows/entities/workflow-definition.types';
import { ActivityExecutorService } from '../../activities/services/activity-executor.service';
import { CommandDispatcherService } from '../../websocket/services/command-dispatcher.service';
import { ExecutionStateService } from './execution-state.service';

export interface DispatchActivityParams {
  executionId: string;
  tenantId: string;
  step: WorkflowStep;
  activity: Activity;
  workflowDefinition: WorkflowDefinition;
}

@Injectable()
export class ActivityDispatcherService {
  constructor(
    private readonly activityExecutor: ActivityExecutorService,
    private readonly commandDispatcher: CommandDispatcherService,
    private readonly stateService: ExecutionStateService,
  ) {}

  async dispatch(params: DispatchActivityParams): Promise<any> {
    const { executionId, tenantId, step, activity, workflowDefinition } = params;

    switch (activity.type) {
      case 'extract':
      case 'transform':
      case 'load':
      case 'filter':
      case 'join': {
        const inputs = await this.collectStepInputs(executionId, tenantId, step);
        const result = await this.activityExecutor.executeActivity({
          executionId,
          tenantId,
          activityId: activity.id,
          stepId: step.id,
          activityType: activity.type as any,
          config: activity.config as any,
          inputs,
        });

        if (!result.success) {
          const message = result.error?.message || 'Activity execution failed';
          throw new Error(message);
        }
        return result.data;
      }

      case 'mini-connector-source': {
        const config = activity.config as MiniConnectorSourceConfig;

        // Build query payload for Mini Connector
        const payload = {
          // The Mini Connector selects its local DB connection; we route to the correct connector instance
          query: {
            table: config.table,
            columns: Array.isArray(config.columns) ? config.columns : ['*'],
            where: config.where,
            limit: config.limit,
          },
        };

        const TIMEOUT_MS = 30000;
        const response = await this.commandDispatcher.dispatchCommandAndWait<any>(
          tenantId,
          'query',
          payload,
          TIMEOUT_MS,
          config.connectorId,
        );

        return response;
      }

      case 'cloud-connector-source':
      case 'cloud-connector-sink': {
        throw new Error(`Executor for activity type "${activity.type}" not implemented`);
      }

      default:
        throw new Error(`No executor registered for activity type "${activity.type}"`);
    }
  }

  private async collectStepInputs(
    executionId: string,
    tenantId: string,
    step: WorkflowStep,
  ): Promise<Record<string, any> | undefined> {
    if (!step.dependsOn || step.dependsOn.length === 0) return undefined;
    const state = await this.stateService.getExecutionState(executionId, tenantId);
    if (!state) return undefined;

    const inputs: Record<string, any> = {};
    for (const depStepId of step.dependsOn) {
      if (state.stepOutputs && depStepId in state.stepOutputs) {
        inputs[depStepId] = state.stepOutputs[depStepId];
      }
    }
    return Object.keys(inputs).length > 0 ? inputs : undefined;
  }
}
