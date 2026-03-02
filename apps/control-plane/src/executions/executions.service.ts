import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ExecutionStateService } from './services/execution-state.service';
import { ExecutionOrchestratorService } from './services/execution-orchestrator.service';
import { ExecuteWorkflowDto } from './dto/execute-workflow.dto';
import { ExecutionQueryDto } from './dto/execution-query.dto';
import { PauseExecutionDto, ResumeExecutionDto, CancelExecutionDto } from './dto/execution-control.dto';
import { WorkflowDefinition } from '../workflows/entities/workflow-definition.types';

@Injectable()
export class ExecutionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateService: ExecutionStateService,
    private readonly orchestrator: ExecutionOrchestratorService,
  ) {}

  async findAll(tenantId: string, query: ExecutionQueryDto) {
    const where: any = { tenantId };

    if (query.workflowId) where.workflowId = query.workflowId;
    if (query.status) where.status = query.status;
    if (query.startDate || query.endDate) {
      where.startedAt = {};
      if (query.startDate) where.startedAt.gte = new Date(query.startDate);
      if (query.endDate) where.startedAt.lte = new Date(query.endDate);
    }

    const [data, total] = await Promise.all([
      this.prisma.workflowExecution.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: query.offset,
        take: query.limit,
        include: {
          activities: true,
          _count: { select: { events: true } },
        },
      }),
      this.prisma.workflowExecution.count({ where }),
    ]);

    return { data, total, limit: query.limit, offset: query.offset };
  }

  async findOne(executionId: string, tenantId: string) {
    const execution = await this.prisma.workflowExecution.findFirst({
      where: { id: executionId, tenantId },
      include: {
        activities: { orderBy: { startedAt: 'asc' } },
        events: { orderBy: { timestamp: 'asc' } },
      },
    });

    if (!execution) {
      throw new NotFoundException(`Execution with ID "${executionId}" not found`);
    }

    return execution;
  }

  async triggerWorkflow(
    workflowId: string,
    tenantId: string,
    dto: ExecuteWorkflowDto
  ) {
    // Get workflow definition
    const workflow = await this.prisma.workflowDefinition.findFirst({
      where: { id: workflowId, tenantId },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow with ID "${workflowId}" not found`);
    }

    if (workflow.status !== 'ACTIVE') {
      throw new ConflictException(`Workflow is not active (status: ${workflow.status})`);
    }

    // Create execution record
    const execution = await this.stateService.createExecution(
      tenantId,
      workflowId,
      workflow.version,
      workflow.hash,
      dto.triggerContext
    );

    // Start orchestration (async - don't wait)
    this.orchestrator.startExecution(
      execution.id,
      tenantId,
      workflow.definition as unknown as WorkflowDefinition
    ).catch(error => {
      console.error(`Failed to start execution ${execution.id}:`, error);
    });

    return {
      executionId: execution.id,
      status: execution.status,
      message: 'Workflow execution triggered successfully',
    };
  }

  async pauseExecution(executionId: string, tenantId: string, dto: PauseExecutionDto) {
    const execution = await this.findOne(executionId, tenantId);

    if (!['PENDING', 'RUNNING'].includes(execution.status)) {
      throw new ConflictException(`Cannot pause execution with status: ${execution.status}`);
    }

    const previousStatus = execution.status;

    await this.prisma.workflowExecution.update({
      where: { id: executionId },
      data: { status: 'PAUSED' },
    });

    await this.stateService.logEvent({
      executionId,
      timestamp: new Date(),
      eventType: 'EXECUTION_PAUSED',
      payload: { reason: dto.reason, previousStatus },
    });

    return {
      executionId,
      previousStatus,
      currentStatus: 'PAUSED',
      message: 'Execution paused successfully',
    };
  }

  async resumeExecution(executionId: string, tenantId: string, dto: ResumeExecutionDto) {
    const execution = await this.findOne(executionId, tenantId);

    if (execution.status !== 'PAUSED') {
      throw new ConflictException(`Cannot resume execution with status: ${execution.status}`);
    }

    await this.prisma.workflowExecution.update({
      where: { id: executionId },
      data: { status: 'RUNNING' },
    });

    await this.stateService.logEvent({
      executionId,
      timestamp: new Date(),
      eventType: 'EXECUTION_RESUMED',
      payload: { context: dto.context },
    });

    // Resume orchestration from current state
    const state = await this.stateService.getExecutionState(executionId, tenantId);
    if (state) {
      // Get workflow definition from the execution's workflow relation
      const workflowDef = await this.prisma.workflowDefinition.findFirst({
        where: { 
          id: execution.workflowId, 
          version: execution.workflowVersion 
        },
      });
      
      if (workflowDef) {
        this.orchestrator.processNextStep(
          executionId,
          tenantId,
          workflowDef.definition as unknown as WorkflowDefinition,
          state
        ).catch(console.error);
      }
    }

    return {
      executionId,
      previousStatus: 'PAUSED',
      currentStatus: 'RUNNING',
      message: 'Execution resumed successfully',
    };
  }

  async cancelExecution(executionId: string, tenantId: string, dto: CancelExecutionDto) {
    const execution = await this.findOne(executionId, tenantId);

    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(execution.status)) {
      throw new ConflictException(`Cannot cancel execution with status: ${execution.status}`);
    }

    const previousStatus = execution.status;

    await this.prisma.workflowExecution.update({
      where: { id: executionId },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });

    await this.stateService.logEvent({
      executionId,
      timestamp: new Date(),
      eventType: 'EXECUTION_CANCELLED',
      payload: { reason: dto.reason, previousStatus },
    });

    return {
      executionId,
      previousStatus,
      currentStatus: 'CANCELLED',
      message: 'Execution cancelled successfully',
    };
  }
}
