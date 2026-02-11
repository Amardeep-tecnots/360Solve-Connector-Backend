import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { WorkflowDefinition } from '../entities/workflow-definition.types';

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
  activitiesChecked: number;
  aggregatorsVerified: string[];
}

export interface ValidationError {
  field: string;
  message: string;
}

@Injectable()
export class WorkflowValidationService {
  constructor(private readonly prisma: PrismaService) {}

  async validate(
    tenantId: string,
    definition: WorkflowDefinition,
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];
    const aggregatorsVerified: string[] = [];

    // 1. Validate DAG structure (no cycles)
    const cycleError = this.detectCycle(definition.steps);
    if (cycleError) {
      errors.push({ field: 'steps', message: cycleError });
    }

    // 2. Validate all activities have corresponding steps
    const activityIds = new Set(definition.activities.map((a) => a.id));
    const stepActivityIds = new Set(definition.steps.map((s) => s.activityId));

    for (const activityId of activityIds) {
      if (!stepActivityIds.has(activityId)) {
        errors.push({
          field: `activities.${activityId}`,
          message: `Activity "${activityId}" is not referenced by any step`,
        });
      }
    }

    // 3. Validate step dependencies exist
    for (const step of definition.steps) {
      for (const depId of step.dependsOn) {
        const depExists = definition.steps.some((s) => s.id === depId);
        if (!depExists) {
          errors.push({
            field: `steps.${step.id}.dependsOn`,
            message: `Dependency "${depId}" does not exist`,
          });
        }
      }
    }

    // 4. Validate aggregator instances exist and are accessible
    for (const activity of definition.activities) {
      if (activity.type === 'extract' || activity.type === 'load') {
        const config = activity.config as { aggregatorInstanceId: string };
        const instance = await this.prisma.aggregatorInstance.findFirst({
          where: {
            id: config.aggregatorInstanceId,
            tenantId,
          },
          include: { aggregator: true },
        });

        if (!instance) {
          errors.push({
            field: `activities.${activity.id}.config.aggregatorInstanceId`,
            message: `Aggregator instance "${config.aggregatorInstanceId}" not found`,
          });
        } else {
          aggregatorsVerified.push(instance.aggregator.name);

          // Check capabilities
          if (activity.type === 'load' && !instance.aggregator.capabilities.includes('write')) {
            warnings.push(`Aggregator "${instance.aggregator.name}" does not have 'write' capability`);
          }
        }
      }
    }

    // 5. Validate schedule format if provided
    if (definition.schedule) {
      const cronValid = this.validateCron(definition.schedule);
      if (!cronValid) {
        errors.push({
          field: 'schedule',
          message: 'Invalid cron expression format',
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      activitiesChecked: definition.activities.length,
      aggregatorsVerified: [...new Set(aggregatorsVerified)],
    };
  }

  private detectCycle(
    steps: { id: string; dependsOn: string[] }[],
  ): string | null {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const adjacency = new Map<string, string[]>();

    // Build adjacency list
    for (const step of steps) {
      adjacency.set(step.id, step.dependsOn);
    }

    const dfs = (node: string): boolean => {
      visited.add(node);
      recursionStack.add(node);

      const neighbors = adjacency.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) return true;
        } else if (recursionStack.has(neighbor)) {
          return true;
        }
      }

      recursionStack.delete(node);
      return false;
    };

    for (const step of steps) {
      if (!visited.has(step.id)) {
        if (dfs(step.id)) {
          return `Circular dependency detected involving step "${step.id}"`;
        }
      }
    }

    return null;
  }

  private validateCron(cron: string): boolean {
    // Basic cron validation (5-6 parts)
    const parts = cron.trim().split(/\s+/);
    return parts.length >= 5 && parts.length <= 6;
  }
}
