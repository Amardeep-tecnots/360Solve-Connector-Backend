import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ExecutionState, ExecutionEvent } from '../entities/execution.types';

// Type aliases for Prisma enums
const ExecutionStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  CANCELLING: 'CANCELLING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;

const ActivityStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  TIMEOUT: 'TIMEOUT',
} as const;

type ExecutionStatusType = typeof ExecutionStatus[keyof typeof ExecutionStatus];
type ActivityStatusType = typeof ActivityStatus[keyof typeof ActivityStatus];

@Injectable()
export class ExecutionStateService {
  constructor(private readonly prisma: PrismaService) {}

  async createExecution(
    tenantId: string,
    workflowId: string,
    workflowVersion: number,
    workflowHash: string,
    triggerContext?: Record<string, any>
  ) {
    return this.prisma.workflowExecution.create({
      data: {
        tenantId,
        workflowId,
        workflowVersion,
        workflowHash,
        status: ExecutionStatus.PENDING,
        currentStep: null,
      },
    });
  }

  async getExecutionState(executionId: string, tenantId: string): Promise<ExecutionState | null> {
    const execution = await this.prisma.workflowExecution.findFirst({
      where: { id: executionId, tenantId },
    });

    if (!execution) return null;

    const activities = await this.prisma.activityExecution.findMany({
      where: { executionId, tenantId },
      orderBy: [{ activityId: 'asc' }, { attempt: 'desc' }],
    });

    const latestByStep = new Map<string, (typeof activities)[number]>();
    for (const activity of activities) {
      if (!latestByStep.has(activity.activityId)) {
        latestByStep.set(activity.activityId, activity);
      }
    }

    const completedSteps: string[] = [];
    const failedSteps: string[] = [];
    const stepOutputs: Record<string, any> = {};
    let lastActivityAt = execution.startedAt;

    for (const [stepId, activity] of latestByStep.entries()) {
      if (activity.status === 'COMPLETED') completedSteps.push(stepId);
      if (activity.status === 'FAILED') failedSteps.push(stepId);
      if (activity.outputRef) {
        try {
          stepOutputs[stepId] = JSON.parse(activity.outputRef);
        } catch {
          stepOutputs[stepId] = activity.outputRef;
        }
      }
      const activityTimestamp = activity.completedAt ?? activity.startedAt;
      if (activityTimestamp > lastActivityAt) lastActivityAt = activityTimestamp;
    }

    return {
      currentStepId: execution.currentStep || null,
      completedSteps,
      failedSteps,
      stepOutputs,
      startedAt: execution.startedAt,
      lastActivityAt,
    };
  }

  async updateExecutionState(
    executionId: string,
    tenantId: string,
    state: ExecutionState
  ) {
    const current = await this.prisma.workflowExecution.findFirst({
      where: { id: executionId, tenantId },
      select: { status: true },
    });
    if (!current) return;

    const shouldUpdateStatus = current.status === ExecutionStatus.PENDING || current.status === ExecutionStatus.RUNNING;

    await this.prisma.workflowExecution.update({
      where: { id: executionId },
      data: {
        currentStep: state.currentStepId,
        status: shouldUpdateStatus ? this.determineStatus(state) : undefined,
      },
    });
  }

  async logEvent(event: ExecutionEvent) {
    await this.prisma.executionEvent.create({
      data: {
        executionId: event.executionId,
        timestamp: event.timestamp,
        eventType: event.eventType,
        payload: event.payload as any,
      },
    });
  }

  async recordActivityExecution(
    executionId: string,
    tenantId: string,
    stepId: string,
    activityType: string,
    attempt: number,
    status: ActivityStatusType,
    output?: any,
    error?: { message: string; retryable: boolean }
  ) {
    const existing = await this.prisma.activityExecution.findFirst({
      where: { executionId, tenantId, activityId: stepId, attempt },
    });

    if (existing) {
      return this.prisma.activityExecution.update({
        where: { id: existing.id },
        data: {
          status,
          outputRef: output !== undefined ? JSON.stringify(output) : undefined,
          errorMessage: error?.message,
          errorRetryable: error?.retryable,
          completedAt: status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED' ? new Date() : undefined,
        },
      });
    }

    return this.prisma.activityExecution.create({
      data: {
        executionId,
        activityId: stepId,
        tenantId,
        activityType,
        attempt,
        status,
        outputRef: output !== undefined ? JSON.stringify(output) : undefined,
        errorMessage: error?.message,
        errorRetryable: error?.retryable,
      },
    });
  }

  private determineStatus(state: ExecutionState): ExecutionStatusType {
    if (state.failedSteps.length > 0) return ExecutionStatus.FAILED;
    if (state.currentStepId) return ExecutionStatus.RUNNING;
    if (state.completedSteps.length > 0) return ExecutionStatus.RUNNING;
    return ExecutionStatus.PENDING;
  }
}
