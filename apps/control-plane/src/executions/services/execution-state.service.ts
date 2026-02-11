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

    // For now, reconstruct state from activity executions
    const activities = await this.prisma.activityExecution.findMany({
      where: { executionId },
    });

    const completedSteps = activities
      .filter(a => a.status === 'COMPLETED')
      .map(a => a.activityId);
    
    const failedSteps = activities
      .filter(a => a.status === 'FAILED')
      .map(a => a.activityId);

    return {
      currentStepId: execution?.currentStep || null,
      completedSteps,
      failedSteps,
      stepOutputs: {},
      startedAt: execution?.startedAt || new Date(),
      lastActivityAt: new Date(),
    };
  }

  async updateExecutionState(
    executionId: string,
    tenantId: string,
    state: ExecutionState
  ) {
    await this.prisma.workflowExecution.update({
      where: { id: executionId },
      data: {
        currentStep: state.currentStepId,
        status: this.determineStatus(state),
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
    activityId: string,
    attempt: number,
    status: ActivityStatusType,
    output?: any,
    error?: { message: string; retryable: boolean }
  ) {
    const existing = await this.prisma.activityExecution.findFirst({
      where: { executionId, activityId, attempt },
    });

    if (existing) {
      return this.prisma.activityExecution.update({
        where: { id: existing.id },
        data: {
          status,
          outputRef: output ? JSON.stringify(output) : undefined,
          errorMessage: error?.message,
          errorRetryable: error?.retryable,
          completedAt: status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED' ? new Date() : undefined,
        },
      });
    }

    return this.prisma.activityExecution.create({
      data: {
        executionId,
        activityId,
        tenantId: '', // Will be set from context
        activityType: 'extract',
        attempt,
        status,
        outputRef: output ? JSON.stringify(output) : undefined,
        errorMessage: error?.message,
        errorRetryable: error?.retryable,
      },
    });
  }

  private determineStatus(state: ExecutionState): ExecutionStatusType {
    if (state.failedSteps.length > 0) return ExecutionStatus.FAILED;
    if (state.completedSteps.length > 0) return ExecutionStatus.RUNNING;
    return ExecutionStatus.PENDING;
  }
}
