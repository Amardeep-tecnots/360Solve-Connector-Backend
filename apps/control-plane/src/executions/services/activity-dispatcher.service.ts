import { Injectable, Logger } from '@nestjs/common';
import {
  Activity,
  WorkflowDefinition,
  WorkflowStep,
  MiniConnectorSourceConfig,
  LoadConfig,
  ExtractConfig,
  TransformConfig,
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
  private readonly logger = new Logger(ActivityDispatcherService.name);

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
        // For load activities, inject source metadata from previous steps
        let activityConfig = activity.config;
        
        if (activity.type === 'load') {
          const loadConfig = activityConfig as LoadConfig;
          // Only inject source metadata if not already provided
          if (!loadConfig.sourceMetadata && step.dependsOn && step.dependsOn.length > 0) {
            const sourceMetadata = await this.extractSourceMetadata(
              executionId, 
              tenantId, 
              step.dependsOn,
              workflowDefinition
            );
            if (sourceMetadata) {
              this.logger.log(`Injecting source metadata into load activity: ${JSON.stringify(sourceMetadata)}`);
              activityConfig = {
                ...loadConfig,
                sourceMetadata,
              };
            }
          }
        }

        // For transform activities, auto-inject mappingId if not provided but source/destination mapping exists
        if (activity.type === 'transform') {
          const transformConfig = activityConfig as TransformConfig;
          if (!transformConfig.mappingId && !transformConfig.code) {
            const mappingId = await this.findMappingForTransform(
              executionId,
              tenantId,
              step,
              workflowDefinition
            );
            if (mappingId) {
              this.logger.log(`Auto-injecting mappingId into transform activity: ${mappingId}`);
              activityConfig = {
                ...transformConfig,
                mappingId,
              };
            }
          }
        }

        const inputs = await this.collectStepInputs(executionId, tenantId, step);
        const result = await this.activityExecutor.executeActivity({
          executionId,
          tenantId,
          activityId: activity.id,
          stepId: step.id,
          activityType: activity.type as any,
          config: activityConfig as any,
          inputs,
        });

        if (!result.success) {
          const message = result.error?.message || 'Activity execution failed';
          throw new Error(message);
        }
        
        // Add source metadata to output for downstream activities
        const output = result.data;
        
        return output;
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

        // Check if the response indicates an error from the connector
        // Mini connector may return { data: { error: "...", status: "failed" } }
        if (response && response.data && response.data.error) {
          throw new Error(`Mini connector source error: ${response.data.error}`);
        }
        
        if (response && response.error) {
          throw new Error(`Mini connector source error: ${response.error}`);
        }

        // Wrap response with source metadata
        return {
          data: response.data || response,
          rowCount: response.rowCount,
          columns: response.columns || config.columns,
          _sourceMetadata: {
            tableName: config.table,
            columns: config.columns,
            database: config.database,
          },
        };
      }

      case 'cloud-connector-source':
      case 'cloud-connector-sink': {
        throw new Error(`Executor for activity type "${activity.type}" not implemented`);
      }

      default:
        throw new Error(`No executor registered for activity type "${activity.type}"`);
    }
  }

  /**
   * Extract source metadata from previous step outputs to inject into load activity
   */
  private async extractSourceMetadata(
    executionId: string,
    tenantId: string,
    dependsOn: string[],
    workflowDefinition: WorkflowDefinition,
  ): Promise<{ tableName?: string; columns?: string[]; schema?: Record<string, string> } | null> {
    const state = await this.stateService.getExecutionState(executionId, tenantId);
    if (!state?.stepOutputs) return null;

    // Get the first dependency's output
    for (const depStepId of dependsOn) {
      const output = state.stepOutputs[depStepId];
      if (!output) continue;

      // Check if output has _sourceMetadata attached
      if (output._sourceMetadata) {
        return output._sourceMetadata;
      }

      // Find the source activity that produced this output
      const depStep = workflowDefinition.steps.find(s => s.id === depStepId);
      if (!depStep) continue;

      const sourceActivity = workflowDefinition.activities.find(a => a.id === depStep.activityId);
      if (!sourceActivity) continue;

      // Extract metadata based on activity type
      if (sourceActivity.type === 'mini-connector-source') {
        const config = sourceActivity.config as MiniConnectorSourceConfig;
        return {
          tableName: config.table,
          columns: config.columns,
        };
      }

      if (sourceActivity.type === 'extract') {
        const config = sourceActivity.config as ExtractConfig;
        return {
          tableName: config.table,
          columns: config.columns,
        };
      }

      // For array outputs, try to infer from first row
      if (Array.isArray(output) && output.length > 0) {
        const firstRow = output[0];
        if (firstRow && typeof firstRow === 'object') {
          return {
            columns: Object.keys(firstRow),
          };
        }
      }
    }

    return null;
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

  /**
   * Find a mapping for transform activity based on source and destination configurations.
   * This looks for a mapping that matches the source table (from mini-connector-source or extract)
   * and the destination SDK/method (from load activity).
   */
  private async findMappingForTransform(
    executionId: string,
    tenantId: string,
    step: WorkflowStep,
    workflowDefinition: WorkflowDefinition,
  ): Promise<string | null> {
    try {
      // Get the Prisma service to query mappings
      const { PrismaService } = await import('../../prisma.service');
      const prisma = new PrismaService();

      // Get source activity config (from mini-connector-source or extract)
      let sourceTableName: string | undefined;
      let sourceConnectorId: string | undefined;

      if (step.dependsOn && step.dependsOn.length > 0) {
        const depStep = workflowDefinition.steps.find(s => s.id === step.dependsOn[0]);
        if (depStep) {
          const sourceActivity = workflowDefinition.activities.find(a => a.id === depStep.activityId);
          if (sourceActivity) {
            if (sourceActivity.type === 'mini-connector-source') {
              const config = sourceActivity.config as MiniConnectorSourceConfig;
              sourceTableName = config.table;
              sourceConnectorId = config.connectorId;
            } else if (sourceActivity.type === 'extract') {
              const config = sourceActivity.config as ExtractConfig;
              sourceTableName = config.table;
            }
          }
        }
      }

      // Get destination activity config (from load activity)
      // Find the load activity that depends on this transform
      let destInstanceId: string | undefined;
      let destTableName: string | undefined;

      const loadStep = workflowDefinition.steps.find(s => 
        s.dependsOn?.includes(step.id) && 
        workflowDefinition.activities.find(a => a.id === s.activityId)?.type === 'load'
      );

      if (loadStep) {
        const loadActivity = workflowDefinition.activities.find(a => a.id === loadStep.activityId);
        if (loadActivity) {
          const config = loadActivity.config as LoadConfig;
          destInstanceId = config.aggregatorInstanceId;
          destTableName = config.table;
        }
      }

      // If we have source and destination info, try to find a matching mapping
      if (sourceTableName && destInstanceId) {
        // Look for a mapping that matches source table and destination instance
        const mapping = await prisma.fieldMapping.findFirst({
          where: {
            tenantId,
            isActive: true,
            OR: [
              // Match by source name and destination instance
              {
                sourceName: sourceTableName,
                destinationInstanceId: destInstanceId,
              },
              // Or match by source connector and destination instance
              {
                sourceConnectorId: sourceConnectorId,
                destinationInstanceId: destInstanceId,
              },
            ],
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true, transformCode: true },
        });

        // Only return mapping if it has transformCode
        if (mapping && mapping.transformCode) {
          this.logger.log(`Found mapping "${mapping.id}" for transform (source: ${sourceTableName}, dest: ${destInstanceId})`);
          return mapping.id;
        }
      }

      // Also try to find any active mapping with transformCode for this tenant
      const anyMappingWithCode = await prisma.fieldMapping.findFirst({
        where: {
          tenantId,
          isActive: true,
          transformCode: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });

      if (anyMappingWithCode) {
        this.logger.log(`Using fallback mapping "${anyMappingWithCode.id}" for transform`);
        return anyMappingWithCode.id;
      }

      return null;
    } catch (error) {
      this.logger.warn(`Failed to find mapping for transform: ${error.message}`);
      return null;
    }
  }
}
