import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ExecutionStateService } from './execution-state.service';
import { WorkflowDefinition, WorkflowStep, Activity } from '../../workflows/entities/workflow-definition.types';
import { ExecutionState, ExecutionEvent } from '../entities/execution.types';

@Injectable()
export class ExecutionOrchestratorService {
  private readonly logger = new Logger(ExecutionOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateService: ExecutionStateService,
  ) {}

  async startExecution(
    executionId: string,
    tenantId: string,
    workflowDefinition: WorkflowDefinition
  ) {
    await this.stateService.logEvent({
      executionId,
      timestamp: new Date(),
      eventType: 'EXECUTION_STARTED',
      payload: { workflowVersion: workflowDefinition.version },
    });

    const state: ExecutionState = {
      currentStepId: null,
      completedSteps: [],
      failedSteps: [],
      stepOutputs: {},
      startedAt: new Date(),
      lastActivityAt: new Date(),
    };

    // Find root steps (no dependencies)
    const rootSteps = workflowDefinition.steps.filter(
      step => step.dependsOn.length === 0
    );

    if (rootSteps.length === 0) {
      throw new Error('No root steps found in workflow');
    }

    // Start with first root step
    state.currentStepId = rootSteps[0].id;
    await this.stateService.updateExecutionState(executionId, tenantId, state);

    // Begin DAG traversal
    await this.processNextStep(executionId, tenantId, workflowDefinition, state);
  }

  async processNextStep(
    executionId: string,
    tenantId: string,
    workflowDefinition: WorkflowDefinition,
    state: ExecutionState
  ) {
    const currentStep = workflowDefinition.steps.find(
      s => s.id === state.currentStepId
    );

    if (!currentStep) {
      this.logger.warn(`Step ${state.currentStepId} not found, execution may be complete`);
      await this.completeExecution(executionId, tenantId, state);
      return;
    }

    const activity = workflowDefinition.activities.find(
      a => a.id === currentStep.activityId
    );

    if (!activity) {
      throw new Error(`Activity ${currentStep.activityId} not found`);
    }

    await this.stateService.logEvent({
      executionId,
      timestamp: new Date(),
      eventType: 'STEP_STARTED',
      payload: { stepId: currentStep.id, activityId: activity.id, type: activity.type },
    });

    // TODO: Dispatch to activity executor (Phase 4)
    // For now, simulate activity completion
    this.logger.log(`Would execute activity: ${activity.name} (${activity.type})`);
  }

  async onActivityCompleted(
    executionId: string,
    tenantId: string,
    stepId: string,
    output: any,
    workflowDefinition: WorkflowDefinition
  ) {
    const state = await this.stateService.getExecutionState(executionId, tenantId);
    if (!state) throw new Error('Execution state not found');

    // Record completion
    state.completedSteps.push(stepId);
    state.stepOutputs[stepId] = output;

    await this.stateService.logEvent({
      executionId,
      timestamp: new Date(),
      eventType: 'STEP_COMPLETED',
      payload: { stepId, activityId: workflowDefinition.steps.find(s => s.id === stepId)?.activityId },
    });

    // Find next steps (depend on this step)
    const nextSteps = workflowDefinition.steps.filter(
      step => step.dependsOn.includes(stepId) && this.canExecuteStep(step, state)
    );

    if (nextSteps.length > 0) {
      state.currentStepId = nextSteps[0].id;
      await this.stateService.updateExecutionState(executionId, tenantId, state);
      await this.processNextStep(executionId, tenantId, workflowDefinition, state);
    } else if (this.isExecutionComplete(workflowDefinition.steps, state)) {
      await this.completeExecution(executionId, tenantId, state);
    } else {
      // More steps but none ready - may be parallel branches or stuck
      await this.stateService.updateExecutionState(executionId, tenantId, state);
    }
  }

  async onActivityFailed(
    executionId: string,
    tenantId: string,
    stepId: string,
    error: Error,
    retryable: boolean,
    workflowDefinition: WorkflowDefinition
  ) {
    const state = await this.stateService.getExecutionState(executionId, tenantId);
    if (!state) throw new Error('Execution state not found');

    state.failedSteps.push(stepId);

    await this.stateService.logEvent({
      executionId,
      timestamp: new Date(),
      eventType: 'STEP_FAILED',
      payload: { stepId, error: error.message, retryable },
    });

    if (!retryable) {
      await this.failExecution(executionId, tenantId, state, error.message);
      return;
    }

    // TODO: Implement retry logic
    await this.stateService.updateExecutionState(executionId, tenantId, state);
  }

  private canExecuteStep(step: WorkflowStep, state: ExecutionState): boolean {
    return step.dependsOn.every(depId => state.completedSteps.includes(depId));
  }

  private isExecutionComplete(steps: WorkflowStep[], state: ExecutionState): boolean {
    return steps.every(step =>
      state.completedSteps.includes(step.id) || state.failedSteps.includes(step.id)
    );
  }

  private async completeExecution(
    executionId: string,
    tenantId: string,
    state: ExecutionState
  ) {
    await this.prisma.workflowExecution.update({
      where: { id: executionId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    await this.stateService.logEvent({
      executionId,
      timestamp: new Date(),
      eventType: 'EXECUTION_COMPLETED',
      payload: { completedSteps: state.completedSteps },
    });

    this.logger.log(`Execution ${executionId} completed`);
  }

  private async failExecution(
    executionId: string,
    tenantId: string,
    state: ExecutionState,
    errorMessage: string
  ) {
    await this.prisma.workflowExecution.update({
      where: { id: executionId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
      },
    });

    this.logger.error(`Execution ${executionId} failed: ${errorMessage}`);
  }
}
