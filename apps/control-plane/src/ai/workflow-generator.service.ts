import { Injectable, Logger } from '@nestjs/common';
import { AIProviderService, GenerateWorkflowRequest, GenerateSchemaMappingRequest } from './ai-provider.service';
import { PrismaService } from '../prisma.service';
import { WorkflowDefinition, Activity, WorkflowStep } from '../workflows/entities/workflow-definition.types';

export interface GeneratedWorkflow {
  definition: WorkflowDefinition;
  description: string;
}

export interface SchemaMappingResult {
  mappings: Array<{
    sourceColumn: string;
    destinationColumn: string;
    transform?: string;
    type?: string;
  }>;
  recommendations: string[];
}

@Injectable()
export class WorkflowGeneratorService {
  private readonly logger = new Logger(WorkflowGeneratorService.name);

  constructor(
    private readonly aiProvider: AIProviderService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Generate a workflow from natural language description
   */
  async generateWorkflow(request: GenerateWorkflowRequest): Promise<{
    success: boolean;
    workflow?: GeneratedWorkflow;
    errors?: string[];
  }> {
    try {
      this.logger.log(`Generating workflow from: ${request.description}`);

      // Build context about the source and destination
      let sourceContext = '';
      let destContext = '';

      if (request.source.aggregatorId) {
        const sourceAgg = await this.prisma.aggregator.findUnique({
          where: { id: request.source.aggregatorId },
        });
        if (sourceAgg) {
          sourceContext = `Source: ${sourceAgg.name} (${sourceAgg.category})`;
          if (request.source.table) {
            sourceContext += `, Table: ${request.source.table}`;
          }
        }
      }

      if (request.destination.aggregatorId) {
        const destAgg = await this.prisma.aggregator.findUnique({
          where: { id: request.destination.aggregatorId },
        });
        if (destAgg) {
          destContext = `Destination: ${destAgg.name} (${destAgg.category})`;
          if (request.destination.table) {
            destContext += `, Table: ${request.destination.table}`;
          }
        }
      }

      const systemPrompt = `You are an expert in designing data integration workflows. 
Generate a workflow definition for the 360Solve Connector platform.

The workflow should:
1. Extract data from the source
2. Transform the data if needed
3. Load data to the destination

Use these activity types:
- mini-connector-source: For on-premise databases via Mini Connector
- cloud-connector-source: For cloud APIs/SaaS
- extract: For database extraction via aggregator
- transform: For data transformation (JavaScript code)
- load: For loading data to destination

Always return a valid JSON workflow definition.`;

      const userPrompt = `Generate a data integration workflow:

Description: ${request.description}

${sourceContext}
${destContext}

${request.mappings ? `Field mappings provided:\n${request.mappings.map(m => `- ${m.source} -> ${m.destination}`).join('\n')}` : ''}

Respond with a JSON workflow definition in this format:
{
  "version": "1.0",
  "activities": [
    {
      "id": "extract-1",
      "type": "mini-connector-source" | "extract" | "cloud-connector-source",
      "name": "Extract from Source",
      "config": { /* activity-specific config */ }
    },
    {
      "id": "transform-1",
      "type": "transform",
      "name": "Transform Data",
      "config": { "code": "function transform(data) { return data; }" }
    },
    {
      "id": "load-1",
      "type": "load",
      "name": "Load to Destination",
      "config": { "aggregatorInstanceId": "...", "mode": "insert" }
    }
  ],
  "steps": [
    { "id": "step-1", "activityId": "extract-1", "dependsOn": [] },
    { "id": "step-2", "activityId": "transform-1", "dependsOn": ["step-1"] },
    { "id": "step-3", "activityId": "load-1", "dependsOn": ["step-2"] }
  ]
}

Respond ONLY with the JSON, no markdown.`;

      const response = await this.aiProvider.completeText(
        userPrompt,
        systemPrompt,
        {
          model: request.model || 'openai/gpt-4o-mini',
          temperature: 0.4,
          maxTokens: 4000,
        }
      );

      // Parse the response
      let workflowDefinition: WorkflowDefinition;
      try {
        // Clean up the response
        const cleanedResponse = this.cleanJsonResponse(response);
        workflowDefinition = JSON.parse(cleanedResponse);
      } catch (parseError: any) {
        this.logger.error(`Failed to parse workflow: ${parseError.message}`);
        return {
          success: false,
          errors: ['Failed to generate valid workflow definition. Please try again.'],
        };
      }

      // Validate the workflow structure
      const validation = this.validateWorkflow(workflowDefinition);
      if (!validation.valid) {
        return {
          success: false,
          errors: validation.errors,
        };
      }

      return {
        success: true,
        workflow: {
          definition: workflowDefinition,
          description: request.description,
        },
      };

    } catch (error: any) {
      this.logger.error(`Workflow generation failed: ${error.message}`, error.stack);
      return {
        success: false,
        errors: [error.message],
      };
    }
  }

  /**
   * Generate schema mapping between source and destination
   */
  async generateSchemaMapping(request: GenerateSchemaMappingRequest): Promise<{
    success: boolean;
    mapping?: SchemaMappingResult;
    errors?: string[];
  }> {
    try {
      this.logger.log(`Generating schema mapping from ${request.sourceSchema.tableName} to ${request.destinationSchema.tableName}`);

      const systemPrompt = `You are an expert in database schema mapping and data transformation.
Generate field-level mappings between source and destination tables.
Consider:
1. Column name similarities (exact match, case-insensitive, snake_case to camelCase)
2. Data type compatibility
3. Common transformation needs (e.g., string to date, uppercase to title case)
4. Data validation rules`;

      const userPrompt = `Generate field mappings between these two tables:

Source Table: ${request.sourceSchema.tableName}
Source Columns:
${request.sourceSchema.columns.map(c => `  - ${c.name} (${c.type})${c.nullable ? ' (nullable)' : ''}`).join('\n')}

Destination Table: ${request.destinationSchema.tableName}
Destination Columns:
${request.destinationSchema.columns.map(c => `  - ${c.name} (${c.type})${c.nullable ? ' (nullable)' : ''}`).join('\n')}

${request.description ? `Additional Notes: ${request.description}` : ''}

Respond with JSON mapping:
{
  "mappings": [
    {
      "sourceColumn": "id",
      "destinationColumn": "user_id",
      "transform": "string" // optional transformation type: string, number, date, boolean, etc.
    }
  ],
  "recommendations": [
    "Consider adding data validation for email field",
    "The created_at timestamp should be transformed to ISO format"
  ]
}

Respond ONLY with the JSON, no markdown.`;

      const response = await this.aiProvider.completeText(
        userPrompt,
        systemPrompt,
        {
          model: request.model || 'openai/gpt-4o-mini',
          temperature: 0.3,
          maxTokens: 2000,
        }
      );

      // Parse the response
      let mappingResult: SchemaMappingResult;
      try {
        const cleanedResponse = this.cleanJsonResponse(response);
        mappingResult = JSON.parse(cleanedResponse);
      } catch (parseError: any) {
        return {
          success: false,
          errors: ['Failed to generate valid schema mapping.'],
        };
      }

      return {
        success: true,
        mapping: mappingResult,
      };

    } catch (error: any) {
      this.logger.error(`Schema mapping failed: ${error.message}`, error.stack);
      return {
        success: false,
        errors: [error.message],
      };
    }
  }

  /**
   * Validate workflow definition
   */
  private validateWorkflow(workflow: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!workflow.version) {
      errors.push('Missing workflow version');
    }

    if (!workflow.activities || !Array.isArray(workflow.activities)) {
      errors.push('Missing or invalid activities array');
    }

    if (!workflow.steps || !Array.isArray(workflow.steps)) {
      errors.push('Missing or invalid steps array');
    }

    // Validate each activity
    if (workflow.activities) {
      const activityIds = new Set<string>();
      for (const activity of workflow.activities) {
        if (!activity.id) {
          errors.push('Activity missing id');
        } else if (activityIds.has(activity.id)) {
          errors.push(`Duplicate activity id: ${activity.id}`);
        } else {
          activityIds.add(activity.id);
        }

        if (!activity.type) {
          errors.push(`Activity ${activity.id} missing type`);
        }
        if (!activity.name) {
          errors.push(`Activity ${activity.id} missing name`);
        }
      }
    }

    // Validate steps reference valid activities
    if (workflow.steps && workflow.activities) {
      const activityIds = new Set(workflow.activities.map((a: Activity) => a.id));
      for (const step of workflow.steps) {
        if (!activityIds.has(step.activityId)) {
          errors.push(`Step references invalid activity: ${step.activityId}`);
        }
        if (step.dependsOn) {
          for (const dep of step.dependsOn) {
            const depExists = workflow.steps.some((s: WorkflowStep) => s.id === dep);
            if (!depExists) {
              errors.push(`Step ${step.id} depends on non-existent step: ${dep}`);
            }
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Clean JSON response by removing markdown formatting
   */
  private cleanJsonResponse(response: string): string {
    let cleaned = response.trim();
    
    // Remove ```json or ``` at start
    if (cleaned.startsWith('```')) {
      const firstNewline = cleaned.indexOf('\n');
      cleaned = cleaned.slice(firstNewline + 1);
    }
    
    // Remove ``` at end
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }

    return cleaned.trim();
  }
}
