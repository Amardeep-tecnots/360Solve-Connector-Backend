import { Injectable } from '@nestjs/common';
import { Activity, WorkflowDefinition, WorkflowStep } from '../../workflows/entities/workflow-definition.types';

export interface DispatchActivityParams {
  executionId: string;
  tenantId: string;
  step: WorkflowStep;
  activity: Activity;
  workflowDefinition: WorkflowDefinition;
}

@Injectable()
export class ActivityDispatcherService {
  async dispatch(params: DispatchActivityParams): Promise<any> {
    const activityType = params.activity.type;
    throw new Error(`No executor registered for activity type "${activityType}"`);
  }
}
