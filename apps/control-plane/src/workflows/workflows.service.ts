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
    // Validate definition
    const validation = await this.validationService.validate(
      tenantId,
      dto.definition as WorkflowDefinition,
    );

    if (!validation.valid) {
      throw new ConflictException({
        message: 'Workflow validation failed',
        errors: validation.errors,
      });
    }

    // Compute hash for immutability tracking
    const hash = this.computeHash(dto.definition);

    return this.prisma.workflowDefinition.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description,
        definition: dto.definition as any,
        hash,
        status: 'DRAFT',
      },
    });
  }

  async update(id: string, tenantId: string, dto: UpdateWorkflowDto) {
    const existing = await this.findOne(id, tenantId);

    // If definition is being updated, create new version
    if (dto.definition) {
      // Validate new definition
      const validation = await this.validationService.validate(
        tenantId,
        dto.definition as WorkflowDefinition,
      );

      if (!validation.valid) {
        throw new ConflictException({
          message: 'Workflow validation failed',
          errors: validation.errors,
        });
      }

      const newHash = this.computeHash(dto.definition);

      // Check if definition actually changed
      if (newHash !== existing.hash) {
        // Create new version instead of updating
        return this.prisma.workflowDefinition.create({
          data: {
            tenantId,
            name: dto.name ?? existing.name,
            description: dto.description ?? existing.description,
            definition: dto.definition as any,
            hash: newHash,
            version: existing.version + 1,
            status: 'DRAFT',
          },
        });
      }
    }

    // Simple metadata update (no version bump)
    return this.prisma.workflowDefinition.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
      },
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
    return this.validationService.validate(tenantId, definition as WorkflowDefinition);
  }

  private computeHash(definition: WorkflowDefinition | any): string {
    const normalized = JSON.stringify(definition, Object.keys(definition).sort());
    return createHash('sha256').update(normalized).digest('hex');
  }
}
