import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { BaseActivityHandler } from '../handlers/base-activity.handler';
import { ConnectorClientService } from '../handlers/connector-client.service';
import { ExecutionContext, ActivityExecutionResult } from '../entities/activity-result.types';
import { ExecutionStateService } from '../../executions/services/execution-state.service';
import { PrismaService } from '../../prisma.service';
import { SDKExecutionService, SDKConfig } from '../../ai/sdk-execution.service';

interface LoadConfig {
  aggregatorInstanceId?: string;
  /** SDK ID for AI SDK loads - used when loading to AI SDK endpoints */
  sdkId?: string;
  table?: string;
  mode: 'insert' | 'upsert' | 'create';
  conflictKey?: string | string[];
  conflictResolution?: 'replace' | 'merge' | 'skip';
  columnMappings?: { source: string; destination: string }[];
  /**
   * Mapping ID to use for field transformations.
   * If provided, the mapping will be loaded from the field_mappings table
   * and applied to transform the data before loading.
   */
  mappingId?: string;
  batchSize?: number;
  /** 
   * Source metadata from previous activity to infer table name.
   * When table is not provided, it will be inferred from source metadata.
   */
  sourceMetadata?: {
    tableName?: string;
    columns?: string[];
  };
  /**
   * SDK-specific configuration for AI SDK aggregators
   */
  sdkMethod?: string;
  /** Alternative to sdkMethod - used as fallback when sdkMethod is not provided */
  method?: string;
  sdkConfig?: {
    baseUrl?: string;
    apiKey?: string;
    bearerToken?: string;
    timeout?: number;
  };
}

@Injectable()
export class LoadHandlerService extends BaseActivityHandler {
  constructor(
    private readonly connectorClient: ConnectorClientService,
    private readonly prisma: PrismaService,
    private readonly sdkExecutionService: SDKExecutionService,
    stateService: ExecutionStateService,
  ) {
    super(stateService);
  }

  async execute(
    context: ExecutionContext,
    config: LoadConfig,
    inputs?: Record<string, any>
  ): Promise<ActivityExecutionResult> {
    const startTime = Date.now();

    try {
      if (!inputs || Object.keys(inputs).length === 0) {
        throw new Error('Load activity requires input data');
      }

      await this.logActivityStart(context.executionId, context.activityId, config);

      // Get the first input
      let inputData = Object.values(inputs)[0];

      // Handle the case where input is wrapped in { data: [...] } or { error: ..., status: ... }
      if (inputData && typeof inputData === 'object' && !Array.isArray(inputData)) {
        // If the response has a 'data' property, use that
        if ('data' in inputData) {
          inputData = inputData.data;
        }
        // If the response has an 'error' property, the source failed
        if ('error' in inputData) {
          throw new Error(`Source activity failed: ${inputData.error}`);
        }
      }

      if (!Array.isArray(inputData)) {
        throw new Error('Load input must be an array');
      }

      // DEBUG: Log config details
      this.logger.log(`[LOAD DEBUG] aggregatorInstanceId: ${config.aggregatorInstanceId}`);
      this.logger.log(`[LOAD DEBUG] sdkId: ${config.sdkId}`);

      // Check if this is an AI SDK load via sdkId
      const isSDK = this.isSDKLoad(config);
      
      this.logger.log(`[LOAD DEBUG] isSDKLoad result: ${isSDK}`);

      if (isSDK) {
        // Handle AI SDK load - call SDK method to send data to external API
        return await this.executeSDKLoad(
          inputData,
          config,
          context,
          startTime
        );
      }

      // For non-SDK loads, we need an aggregator instance
      if (!config.aggregatorInstanceId) {
        throw new Error('aggregatorInstanceId is required for database load');
      }

      // Get aggregator instance
      const instance = await this.getInstance(config.aggregatorInstanceId, context.tenantId);

      // DEBUG: Log aggregator details
      this.logger.log(`[LOAD DEBUG] aggregatorId from instance: ${instance.aggregatorId}`);
      this.logger.log(`[LOAD DEBUG] aggregatorName: ${instance.aggregator?.name}`);
      this.logger.log(`[LOAD DEBUG] aggregatorCategory: ${instance.aggregator?.category}`);

      // Handle database load (original behavior)
      // Resolve the actual table name - this is the key fix for the "undefined" bug
      const resolvedTableName = this.resolveTableName(config, inputData);
      
      // Update config with resolved table name for connector client
      const loadConfig = {
        ...config,
        table: resolvedTableName,
      };

      // Apply stored mapping if mappingId is provided
      let mappedData = inputData;
      if (config.mappingId) {
        mappedData = await this.applyStoredMapping(inputData, config.mappingId, context.tenantId);
      }

      // Apply column mappings if provided (takes precedence over stored mapping)
      const dataToLoad = this.applyColumnMappings(mappedData, config.columnMappings);

      // Load data in batches
      const batchSize = config.batchSize || 1000;
      let totalLoaded = 0;
      const errors: any[] = [];

      for (let i = 0; i < dataToLoad.length; i += batchSize) {
        const batch = dataToLoad.slice(i, i + batchSize);
        const result = await this.connectorClient.loadData(
          instance,
          batch,
          loadConfig,
          context
        );

        totalLoaded += result.rowsLoaded;
        if (result.errors) {
          errors.push(...result.errors);
        }
      }

      const duration = Date.now() - startTime;
      
      const activityResult: ActivityExecutionResult = {
        success: errors.length === 0,
        data: {
          rowsProcessed: dataToLoad.length,
          rowsLoaded: totalLoaded,
          rowsFailed: errors.length,
        },
        error: errors.length > 0 ? {
          code: 'LOAD_PARTIAL_FAILURE',
          message: `${errors.length} rows failed to load`,
          details: errors,
          retryable: false,
        } : undefined,
        metadata: {
          rowsProcessed: dataToLoad.length,
          durationMs: duration,
          warnings: errors.length > 0 ? [`${errors.length} rows failed`] : undefined,
        },
      };

      await this.logActivityComplete(context.executionId, context.activityId, activityResult, duration);

      return activityResult;

    } catch (error) {
      this.logger.error(`Load activity failed: ${error.message}`, error.stack);
      
      const duration = Date.now() - startTime;
      const result: ActivityExecutionResult = {
        success: false,
        error: {
          code: 'LOAD_ERROR',
          message: error.message,
          retryable: this.isRetryableError(error),
        },
      };

      await this.logActivityComplete(context.executionId, context.activityId, result, duration);
      return result;
    }
  }

  /**
   * Check if this is an SDK load
   * Checks:
   * 1. If sdkId starts with "sdk-"
   * 2. If aggregatorInstanceId starts with "sdk-"
   */
  private isSDKLoad(config: LoadConfig): boolean {
    // Check sdkId first (primary for AI SDK loads)
    if (config.sdkId && config.sdkId.startsWith('sdk-')) {
      this.logger.log(`[LOAD DEBUG] SDK detected via sdkId: ${config.sdkId}`);
      return true;
    }

    // Check aggregatorInstanceId
    if (config.aggregatorInstanceId && config.aggregatorInstanceId.startsWith('sdk-')) {
      this.logger.log(`[LOAD DEBUG] SDK detected via aggregatorInstanceId: ${config.aggregatorInstanceId}`);
      return true;
    }

    return false;
  }

  /**
   * Execute load using AI SDK - sends data to external API
   */
  private async executeSDKLoad(
    inputData: any[],
    config: LoadConfig,
    context: ExecutionContext,
    startTime: number
  ): Promise<ActivityExecutionResult> {
    // Use sdkId or aggregatorInstanceId as the aggregatorId
    const sdkId = config.sdkId || config.aggregatorInstanceId;
    // Priority: sdkMethod > method > default 'create'
    const method = config.sdkMethod || config.method || 'create';
    const batchSize = config.batchSize || 100;
    
    this.logger.log(`[LOAD DEBUG] SDK method resolution: sdkMethod=${config.sdkMethod}, method=${config.method}, final=${method}`);

    this.logger.log(`Executing SDK load: ${sdkId}.${method} with ${inputData.length} rows`);

    let totalLoaded = 0;
    const errors: any[] = [];

    // Process data in batches
    for (let i = 0; i < inputData.length; i += batchSize) {
      const batch = inputData.slice(i, i + batchSize);

      try {
        // Prepare SDK params - wrap data in appropriate format
        const sdkParams = {
          data: batch,
          table: config.table,
        };

        // Execute SDK method
        const sdkResult = await this.sdkExecutionService.executeMethod({
          tenantId: context.tenantId,
          aggregatorId: sdkId,
          method,
          params: sdkParams,
          config: config.sdkConfig as SDKConfig,
        });

        if (!sdkResult.success) {
          errors.push({
            batch: Math.floor(i / batchSize) + 1,
            error: sdkResult.error,
          });
        } else {
          // Count successful records - use returned count or assume all
          const rowsInBatch = batch.length;
          totalLoaded += rowsInBatch;
        }
      } catch (error: any) {
        errors.push({
          batch: Math.floor(i / batchSize) + 1,
          error: error.message,
        });
      }
    }

    const duration = Date.now() - startTime;

    const activityResult: ActivityExecutionResult = {
      success: errors.length === 0,
      data: {
        rowsProcessed: inputData.length,
        rowsLoaded: totalLoaded,
        rowsFailed: errors.length,
      },
      error: errors.length > 0 ? {
        code: 'SDK_LOAD_PARTIAL_FAILURE',
        message: `${errors.length} batches failed to load via SDK`,
        details: errors,
        retryable: false,
      } : undefined,
      metadata: {
        rowsProcessed: inputData.length,
        durationMs: duration,
        aggregatorType: 'SDK',
        warnings: errors.length > 0 ? [`${errors.length} batches failed`] : undefined,
      },
    };

    await this.logActivityComplete(context.executionId, context.activityId, activityResult, duration);
    return activityResult;
  }

  private async getInstance(instanceId: string, tenantId: string) {
    // Fetch the actual aggregator instance from the database
    const instance = await this.prisma.aggregatorInstance.findFirst({
      where: { id: instanceId, tenantId },
      include: {
        aggregator: {
          select: {
            id: true,
            name: true,
            type: true,
            category: true,
          },
        },
        credential: {
          select: {
            id: true,
            host: true,
            port: true,
            database: true,
            usernameHint: true,
          },
        },
        connector: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    if (!instance) {
      throw new NotFoundException(`Aggregator instance with ID "${instanceId}" not found for tenant "${tenantId}"`);
    }

    // Return the full instance with credentials info
    return instance;
  }

  private applyColumnMappings(
    data: any[],
    mappings?: { source: string; destination: string }[]
  ): any[] {
    if (!mappings || mappings.length === 0) {
      return data;
    }

    return data.map(row => {
      const mappedRow: any = {};
      mappings.forEach(mapping => {
        mappedRow[mapping.destination] = row[mapping.source];
      });
      return mappedRow;
    });
  }

  private isRetryableError(error: any): boolean {
    const retryableCodes = ['NETWORK_ERROR', 'TIMEOUT', 'DEADLOCK'];
    return retryableCodes.some(code => error.code === code);
  }

  /**
   * Apply a stored field mapping to transform data
   */
  private async applyStoredMapping(
    data: any[],
    mappingId: string,
    tenantId: string
  ): Promise<any[]> {
    // Load the mapping from database
    const mapping = await this.prisma.fieldMapping.findFirst({
      where: {
        id: mappingId,
        tenantId,
        isActive: true,
      },
    });

    if (!mapping) {
      this.logger.warn(`Mapping "${mappingId}" not found or inactive, skipping mapping`);
      return data;
    }

    const rules = mapping.mappingRules as Array<{
      sourceField: string;
      destinationField: string;
      transform?: string;
      transformConfig?: Record<string, any>;
      nullable?: boolean;
      defaultValue?: any;
    }>;

    if (!rules || rules.length === 0) {
      this.logger.warn(`Mapping "${mappingId}" has no rules, skipping mapping`);
      return data;
    }

    // Apply mapping rules to each row
    const mappedData = data.map((row) => {
      const mappedRow: any = {};

      for (const rule of rules) {
        // Get source value (support nested paths)
        const sourceValue = this.getNestedValue(row, rule.sourceField);

        // Apply transformation
        let value = this.applyTransformation(sourceValue, rule);

        // Handle null values
        if (value === null || value === undefined) {
          if (rule.defaultValue !== undefined) {
            value = rule.defaultValue;
          }
        }

        // Set destination value (support nested paths)
        this.setNestedValue(mappedRow, rule.destinationField, value);
      }

      return mappedRow;
    });

    // Update last used timestamp
    await this.prisma.fieldMapping.update({
      where: { id: mappingId },
      data: { lastUsedAt: new Date() },
    });

    this.logger.log(`Applied mapping "${mapping.name}" to ${mappedData.length} rows`);
    return mappedData;
  }

  /**
   * Get a nested value from an object using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * Set a nested value in an object using dot notation
   */
  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;

    const target = keys.reduce((current, key) => {
      if (!current[key]) {
        current[key] = {};
      }
      return current[key];
    }, obj);

    target[lastKey] = value;
  }

  /**
   * Apply a transformation to a value based on the mapping rule
   */
  private applyTransformation(value: any, rule: any): any {
    if (value === null || value === undefined) {
      return value;
    }

    switch (rule.transform) {
      case 'uppercase':
        return String(value).toUpperCase();
      case 'lowercase':
        return String(value).toLowerCase();
      case 'string-to-number':
        return Number(value);
      case 'number-to-string':
        return String(value);
      case 'boolean-to-string':
        return String(value);
      case 'json-stringify':
        return JSON.stringify(value);
      case 'json-parse':
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      case 'date-format':
        try {
          const date = new Date(value);
          const format = rule.transformConfig?.format || 'ISO';
          if (format === 'ISO') return date.toISOString();
          return date.toLocaleDateString();
        } catch {
          return value;
        }
      case 'number-format':
        try {
          const format = rule.transformConfig?.format || '0.00';
          return Number(value).toFixed(format.split('.')[1]?.length || 0);
        } catch {
          return value;
        }
      case 'direct':
      default:
        return value;
    }
  }

  /**
   * Resolve the actual table name for the load operation.
   * Priority:
   * 1. Explicitly provided table name in config
   * 2. Source metadata from config
   * 3. Source metadata from input data (_sourceMetadata)
   * 4. Infer from input data structure (first row keys)
   * 5. Throw error if nothing available
   */
  private resolveTableName(config: LoadConfig, inputData: any): string {
    // 1. Use explicitly provided table name
    if (config.table && config.table !== 'undefined') {
      return config.table;
    }

    // 2. Use source metadata from config if provided
    if (config.sourceMetadata?.tableName) {
      return config.sourceMetadata.tableName;
    }

    // 3. Try to infer from input data - check for _sourceMetadata in wrapped response
    if (Array.isArray(inputData) && inputData.length > 0) {
      const firstRow = inputData[0];
      
      if (firstRow && typeof firstRow === 'object') {
        // Check for _sourceMetadata (set by dispatcher)
        const sourceMeta = firstRow as any;
        if (sourceMeta._sourceMetadata?.tableName) {
          return sourceMeta._sourceMetadata.tableName;
        }
        
        // Check for common table name fields
        const tableNameFields = ['_table', 'tableName', 'table', '__table'];
        for (const field of tableNameFields) {
          if (firstRow[field]) {
            return firstRow[field];
          }
        }
        
        // Check for metadata in a nested structure
        if (firstRow._metadata?.tableName) {
          return firstRow._metadata.tableName;
        }
      }
    }

    // 4. Also check if the entire input has _sourceMetadata (when input is wrapped)
    if (inputData && typeof inputData === 'object' && !Array.isArray(inputData)) {
      const inputAny = inputData as any;
      if (inputAny._sourceMetadata?.tableName) {
        return inputAny._sourceMetadata.tableName;
      }
    }

    // 5. Throw clear error instead of using undefined
    throw new BadRequestException(
      'Table name is required for load activity. Provide it in config.table, ' +
      'config.sourceMetadata.tableName, or ensure the source data includes table metadata.'
    );
  }
}
