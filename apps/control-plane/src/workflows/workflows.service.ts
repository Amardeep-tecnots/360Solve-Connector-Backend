import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { WorkflowValidationService } from './services/workflow-validation.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { WorkflowDefinition } from './entities/workflow-definition.types';
import { createHash } from 'crypto';

@Injectable()
export class WorkflowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validationService: WorkflowValidationService,
  ) {}

  async findAll(tenantId: string, filters?: { status?: string }) {
    return this.prisma.workflowDefinition.findMany({
      where: {
        tenantId,
        ...(filters?.status && filters.status !== 'all' && { status: filters.status as any }),
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(id: string, tenantId: string) {
    const workflow = await this.prisma.workflowDefinition.findFirst({
      where: { id, tenantId },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow with ID "${id}" not found`);
    }

    return workflow;
  }

  async create(tenantId: string, dto: CreateWorkflowDto) {
    const definition = this.normalizeDefinition(dto.definition as any);

    // Validate definition
    const validation = await this.validationService.validate(
      tenantId,
      definition,
    );

    if (!validation.valid) {
      throw new ConflictException({
        message: 'Workflow validation failed',
        errors: validation.errors,
      });
    }

    // Compute hash for immutability tracking
    const hash = this.computeHash(definition);

    return this.prisma.workflowDefinition.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description,
        definition: definition as any,
        hash,
        status: 'DRAFT',
      },
    });
  }

  async update(id: string, tenantId: string, dto: UpdateWorkflowDto) {
    const existing = await this.findOne(id, tenantId);

    // If definition is being updated, create new version
    if (dto.definition) {
      const definition = this.normalizeDefinition(dto.definition as any);

      // Validate new definition
      const validation = await this.validationService.validate(
        tenantId,
        definition,
      );

      if (!validation.valid) {
        throw new ConflictException({
          message: 'Workflow validation failed',
          errors: validation.errors,
        });
      }

      const newHash = this.computeHash(definition);

      // Check if definition actually changed
      if (newHash !== existing.hash) {
        // Create new version instead of updating
        return this.prisma.workflowDefinition.create({
          data: {
            tenantId,
            name: dto.name ?? existing.name,
            description: dto.description ?? existing.description,
            definition: definition as any,
            hash: newHash,
            version: existing.version + 1,
            status: 'DRAFT',
          },
        });
      }
    }

    // Simple metadata update (no version bump)
    const data: any = {};
    if (dto.name !== undefined) {
      data.name = dto.name;
    }
    if (dto.description !== undefined) {
      data.description = dto.description;
    }
    if (dto.isActive !== undefined) {
      data.status = dto.isActive ? 'ACTIVE' : 'INACTIVE';
    }
    return this.prisma.workflowDefinition.update({
      where: { id },
      data,
    });
  }

  async delete(id: string, tenantId: string) {
    const existing = await this.findOne(id, tenantId);

    // Check for running executions
    const runningExecutions = await this.prisma.workflowExecution.count({
      where: {
        workflowId: id,
        status: { in: ['PENDING', 'RUNNING', 'PAUSED'] },
      },
    });

    if (runningExecutions > 0) {
      throw new ConflictException(
        `Cannot delete workflow with ${runningExecutions} active execution(s)`,
      );
    }

    return this.prisma.workflowDefinition.delete({
      where: { id },
    });
  }

  async validate(tenantId: string, definition: WorkflowDefinition | any) {
    const normalized = this.normalizeDefinition(definition as any);
    return this.validationService.validate(tenantId, normalized);
  }

  private normalizeDefinition(definition: WorkflowDefinition | any): WorkflowDefinition {
    const activities = Array.isArray(definition?.activities) ? definition.activities : [];
    const steps = Array.isArray(definition?.steps) ? definition.steps : [];

    if (activities.length === 0) {
      return {
        ...definition,
        activities: [],
        steps: Array.isArray(definition?.steps) ? definition.steps : [],
      } as WorkflowDefinition;
    }

    const activityIds = new Set<string>(activities.map((a: { id: string }) => a.id));
    const existingStepIds = new Set<string>(steps.map((s: { id: string }) => s.id));
    const existingStepByActivityId = new Map<string, string>();

    for (const s of steps) {
      if (s?.activityId) existingStepByActivityId.set(s.activityId, s.id);
    }

    const ensureUniqueStepId = (base: string): string => {
      if (!existingStepIds.has(base)) {
        existingStepIds.add(base);
        return base;
      }
      let i = 1;
      while (existingStepIds.has(`${base}-${i}`)) i += 1;
      const id = `${base}-${i}`;
      existingStepIds.add(id);
      return id;
    };

    if (steps.length === 0) {
      return {
        ...definition,
        steps: activities.map((a: { id: string }) => ({
          id: `step-${a.id}`,
          activityId: a.id,
          dependsOn: [] as string[],
        })),
      } as WorkflowDefinition;
    }

    const nextSteps: Array<{ id: string; activityId: string; dependsOn: string[] }> = steps.map(
      (s: any) => ({
        id: s.id,
        activityId: s.activityId,
        dependsOn: Array.isArray(s.dependsOn) ? s.dependsOn : [],
      }),
    );

    for (const a of activities) {
      if (!existingStepByActivityId.has(a.id)) {
        const stepId = ensureUniqueStepId(`step-${a.id}`);
        existingStepByActivityId.set(a.id, stepId);
        nextSteps.push({
          id: stepId,
          activityId: a.id,
          dependsOn: [],
        });
      }
    }

    const stepIds = new Set<string>(nextSteps.map((s) => s.id));
    const normalizedSteps = nextSteps.map((s) => ({
      ...s,
      dependsOn: (s.dependsOn ?? []).map((dep: string) => {
        if (stepIds.has(dep)) return dep;
        if (activityIds.has(dep)) return existingStepByActivityId.get(dep) ?? dep;
        return dep;
      }),
    }));

    return {
      ...definition,
      steps: normalizedSteps,
    } as WorkflowDefinition;
  }

  private computeHash(definition: WorkflowDefinition | any): string {
    const normalized = JSON.stringify(definition, Object.keys(definition).sort());
    return createHash('sha256').update(normalized).digest('hex');
  }
}
