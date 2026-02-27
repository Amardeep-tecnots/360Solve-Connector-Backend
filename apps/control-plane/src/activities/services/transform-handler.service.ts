import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BaseActivityHandler } from '../handlers/base-activity.handler';
import { DataTransformService } from '../handlers/data-transform.service';
import { ExecutionContext, ActivityExecutionResult } from '../entities/activity-result.types';
import { ExecutionStateService } from '../../executions/services/execution-state.service';
import { PrismaService } from '../../prisma.service';

interface TransformConfig {
  /** JavaScript transformation code */
  code?: string;
  /** Optional mapping ID - if provided, transformCode will be loaded from the stored mapping */
  mappingId?: string;
  inputSchema?: Record<string, string>; // Optional type hints
}

@Injectable()
export class TransformHandlerService extends BaseActivityHandler {
  constructor(
    private readonly transformService: DataTransformService,
    private readonly prisma: PrismaService,
    stateService: ExecutionStateService,
  ) {
    super(stateService);
  }
 REPLACE

  async execute(
    context: ExecutionContext,
    config: TransformConfig,
    inputs?: Record<string, any>
  ): Promise<ActivityExecutionResult> {
    const startTime = Date.now();

    try {
      if (!inputs || Object.keys(inputs).length === 0) {
        throw new Error('Transform activity requires input data');
      }

      await this.logActivityStart(context.executionId, context.activityId, config);

      // Get the first input (for single input transforms)
      const inputData = Object.values(inputs)[0];
      
      // Handle different input formats:
      // 1. Direct array: [{}, {}, ...]
      // 2. Wrapped object with data property: { data: [...], columns: [...] }
      // 3. Object with error (from failed source): { error: "..." } or { data: { error: "...", status: "failed" } }
      let dataArray: any[];
      
      if (Array.isArray(inputData)) {
        dataArray = inputData;
      } else if (inputData && typeof inputData === 'object') {
        // Check if it's a wrapped response with data property
        if (Array.isArray(inputData.data)) {
          // Check for nested error in data - this is common from mini-connector-source
          if (inputData.data.error || (inputData.data.data && inputData.data.data.error)) {
            const nestedError = inputData.data.error || inputData.data.data.error;
            throw new Error(`Source data error: ${nestedError}`);
          }
          dataArray = inputData.data;
        } else if (inputData.error) {
          // This is an error response from source - propagate the error
          throw new Error(`Source data error: ${inputData.error}`);
        } else if (inputData.data && inputData.data.error) {
          // Error is nested in data property - propagate it
          throw new Error(`Source data error: ${inputData.data.error}`);
        } else {
          // Single object - wrap in array
          dataArray = [inputData];
        }
      } else {
        throw new Error('Transform input must be an array or object with data property');
      }

      if (dataArray.length === 0) {
        throw new Error('Transform input has no data to process');
      }

      // Resolve the transformation code: priority is config.code > mappingId > throw error
      let transformCode = config.code;
      
      // If no code provided, check if mappingId is provided to load transformCode from stored mapping
      if (!transformCode && config.mappingId) {
        const mappingResult = await this.getTransformCodeFromMapping(config.mappingId, context.tenantId);
        transformCode = mappingResult.transformCode;
        
        // If no transformCode but mappingRules exist, generate transformCode from mappingRules
        if (!transformCode && mappingResult.mappingRules) {
          transformCode = this.generateTransformFromMappingRules(mappingResult.mappingRules);
          this.logger.log(`Generated transformCode from mappingRules for mapping "${mappingResult.name}"`);
        }
      }

      // Throw clear error if no transformation code is available
      if (!transformCode) {
        throw new Error(
          'Transform activity requires transformation code. Provide either "config.code" or "config.mappingId" ' +
          'that references a stored mapping with transformCode or mappingRules.'
        );
      }

      // Execute transformation
      const result = await this.transformService.transform(
        dataArray,
        transformCode,
        {
          executionId: context.executionId,
          activityId: context.activityId,
        }
      );

      const duration = Date.now() - startTime;
      
      const activityResult: ActivityExecutionResult = {
        success: true,
        data: result,
        metadata: {
          rowsProcessed: Array.isArray(result) ? result.length : 1,
          durationMs: duration,
        },
      };

      await this.logActivityComplete(context.executionId, context.activityId, activityResult, duration);

      return activityResult;

    } catch (error) {
      this.logger.error(`Transform activity failed: ${error.message}`, error.stack);
      
      const duration = Date.now() - startTime;
      const result: ActivityExecutionResult = {
        success: false,
        error: {
          code: 'TRANSFORM_ERROR',
          message: error.message,
          retryable: false, // Transform errors are usually code errors
        },
      };

      await this.logActivityComplete(context.executionId, context.activityId, result, duration);
      return result;
    }
  }

  /**
   * Load transformCode and mappingRules from a stored mapping
   */
  private async getTransformCodeFromMapping(mappingId: string, tenantId: string): Promise<{ transformCode: string | null; mappingRules: any[] | null; name: string }> {
    const mapping = await this.prisma.fieldMapping.findFirst({
      where: {
        id: mappingId,
        tenantId,
        isActive: true,
      },
      select: {
        transformCode: true,
        mappingRules: true,
        name: true,
      },
    });

    if (!mapping) {
      throw new NotFoundException(
        `Mapping "${mappingId}" not found or inactive for tenant "${tenantId}"`
      );
    }

    if (mapping.transformCode) {
      this.logger.log(
        `Loaded transformCode from mapping "${mapping.name}" (${mappingId})`
      );
    } else {
      this.logger.warn(
        `Mapping "${mapping.name}" (${mappingId}) has no transformCode defined. ` +
        'Will try to generate from mappingRules if available.'
      );
    }

    return {
      transformCode: mapping.transformCode,
      mappingRules: mapping.mappingRules as any[] | null,
      name: mapping.name,
    };
  }

  /**
   * Generate transformation code from mappingRules
   * This creates JavaScript code that applies field-by-field transformations
   */
  private generateTransformFromMappingRules(mappingRules: any[]): string {
    if (!mappingRules || mappingRules.length === 0) {
      return 'return input;';
    }

    // Build transformation code from mapping rules
    const transformations: string[] = [];
    
    for (const rule of mappingRules) {
      const sourceField = rule.sourceField;
      const destField = rule.destinationField;
      const transform = rule.transform;
      const defaultValue = rule.defaultValue !== undefined ? JSON.stringify(rule.defaultValue) : 'undefined';
      
      let valueExpr = `row.${sourceField}`;
      
      // Apply transformation based on the transform type
      switch (transform) {
        case 'uppercase':
          valueExpr = `String(${valueExpr || '""'}).toUpperCase()`;
          break;
        case 'lowercase':
          valueExpr = `String(${valueExpr || '""'}).toLowerCase()`;
          break;
        case 'string-to-number':
          valueExpr = `${valueExpr} !== undefined && ${valueExpr} !== null ? Number(${valueExpr}) : ${defaultValue}`;
          break;
        case 'number-to-string':
          valueExpr = `${valueExpr} !== undefined && ${valueExpr} !== null ? String(${valueExpr}) : ${defaultValue}`;
          break;
        case 'boolean-to-string':
          valueExpr = `${valueExpr} !== undefined && ${valueExpr} !== null ? String(${valueExpr}) : ${defaultValue}`;
          break;
        case 'json-stringify':
          valueExpr = `${valueExpr} !== undefined && ${valueExpr} !== null ? JSON.stringify(${valueExpr}) : ${defaultValue}`;
          break;
        case 'json-parse':
          valueExpr = `${valueExpr} !== undefined && ${valueExpr} !== null && typeof ${valueExpr} === 'string' ? JSON.parse(${valueExpr}) : ${defaultValue}`;
          break;
        case 'date-format':
          valueExpr = `${valueExpr} !== undefined && ${valueExpr} !== null ? new Date(${valueExpr}).toISOString() : ${defaultValue}`;
          break;
        case 'direct':
        case undefined:
        case null:
        default:
          // Keep as is, just check for null/undefined
          valueExpr = `${valueExpr} !== undefined && ${valueExpr} !== null ? ${valueExpr} : ${defaultValue}`;
          break;
      }

      transformations.push(`      ${destField}: ${valueExpr}`);
    }

    const code = `return input.map(row => {
  return {
${transformations.join(',\n')}
  };
});`;

    return code;
  }
}
