import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AIProviderService } from '../ai/ai-provider.service';
import { MiniConnectorProxyService } from '../connectors/mini-connector-proxy.service';
import {
  CreateMappingDto,
  UpdateMappingDto,
  MappingQueryDto,
  MappingTypeDto,
  SourceTypeDto,
} from './dto/create-mapping.dto';
import {
  GenerateMappingDto,
  QuickGenerateMappingDto,
  ApplyMappingDto,
  ValidateMappingDto,
} from './dto/generate-mapping.dto';
import { response } from 'express';

/**
 * Mapping rule structure
 */
export interface MappingRule {
  sourceField: string;
  destinationField: string;
  transform?: string;
  transformConfig?: Record<string, any>;
  nullable?: boolean;
  dataType?: string;
  defaultValue?: any;
}

/**
 * AI-generated mapping result
 */
export interface GeneratedMappingResult {
  mappingRules: MappingRule[];
  recommendations: string[];
  transformCode?: string;
}

/**
 * Schema table column definition
 */
interface SchemaColumn {
  name: string;
  type: string;
  nullable?: boolean;
  primaryKey?: boolean;
}

/**
 * Schema table definition
 */
interface SchemaTable {
  name: string;
  columns: SchemaColumn[];
}

/**
 * Discovered schema structure
 */
interface DiscoveredSchema {
  tables?: SchemaTable[];
  [key: string]: any;
}

@Injectable()
export class MappingsService {
  private readonly logger = new Logger(MappingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiProvider: AIProviderService,
    private readonly miniConnectorProxy: MiniConnectorProxyService,
  ) {}

  // ============================================
  // CRUD Operations
  // ============================================

  /**
   * Create a new field mapping
   */
  async create(tenantId: string, dto: CreateMappingDto) {
    // Check for duplicate name
    const existing = await this.prisma.fieldMapping.findFirst({
      where: { tenantId, name: dto.name },
    });

    if (existing) {
      throw new ConflictException(`Mapping with name "${dto.name}" already exists`);
    }

    // Validate instances if provided
    if (dto.sourceInstanceId) {
      await this.validateInstance(dto.sourceInstanceId, tenantId, 'source');
    }
    if (dto.destinationInstanceId) {
      await this.validateInstance(dto.destinationInstanceId, tenantId, 'destination');
    }

    // Determine mapping type if not provided
    const type = dto.type || this.determineMappingType(dto.sourceType, dto.destinationType);

    const mapping = await this.prisma.fieldMapping.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description,
        type: type as any,
        sourceInstanceId: dto.sourceInstanceId,
        sourceType: dto.sourceType,
        sourceConnectorId: dto.sourceConnectorId,
        sourceName: dto.sourceName,
        sourceSchema: dto.sourceSchema,
        destinationInstanceId: dto.destinationInstanceId,
        destinationType: dto.destinationType,
        destinationConnectorId: dto.destinationConnectorId,
        destinationName: dto.destinationName,
        destinationSchema: dto.destinationSchema,
        mappingRules: dto.mappingRules as any,
        transformCode: dto.transformCode,
        isActive: dto.isActive ?? true,
      },
      include: {
        sourceInstance: {
          select: { id: true, name: true, aggregator: { select: { id: true, name: true, category: true } } },
        },
        destinationInstance: {
          select: { id: true, name: true, aggregator: { select: { id: true, name: true, category: true } } },
        },
      },
    });

    return this.formatMapping(mapping);
  }

  /**
   * Find all mappings with filtering
   */
  async findAll(tenantId: string, query: MappingQueryDto) {
    const { page = 1, limit = 20, ...filters } = query;

    const where: any = { tenantId };

    if (filters.sourceInstanceId) {
      where.sourceInstanceId = filters.sourceInstanceId;
    }
    if (filters.destinationInstanceId) {
      where.destinationInstanceId = filters.destinationInstanceId;
    }
    if (filters.type) {
      where.type = filters.type;
    }
    if (filters.sourceType) {
      where.sourceType = filters.sourceType;
    }
    if (filters.destinationType) {
      where.destinationType = filters.destinationType;
    }
    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [mappings, total] = await Promise.all([
      this.prisma.fieldMapping.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          sourceInstance: {
            select: { id: true, name: true, aggregator: { select: { id: true, name: true, category: true } } },
          },
          destinationInstance: {
            select: { id: true, name: true, aggregator: { select: { id: true, name: true, category: true } } },
          },
        },
      }),
      this.prisma.fieldMapping.count({ where }),
    ]);

    return {
      data: mappings.map((m) => this.formatMapping(m)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Find one mapping by ID
   */
  async findOne(id: string, tenantId: string) {
    const mapping = await this.prisma.fieldMapping.findFirst({
      where: { id, tenantId },
      include: {
        sourceInstance: {
          select: {
            id: true,
            name: true,
            aggregator: { select: { id: true, name: true, category: true, type: true } },
          },
        },
        destinationInstance: {
          select: {
            id: true,
            name: true,
            aggregator: { select: { id: true, name: true, category: true, type: true } },
          },
        },
      },
    });

    if (!mapping) {
      throw new NotFoundException(`Mapping with ID "${id}" not found`);
    }

    return this.formatMapping(mapping);
  }

  /**
   * Update a mapping
   */
  async update(id: string, tenantId: string, dto: UpdateMappingDto) {
    // Check existence
    const existing = await this.prisma.fieldMapping.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException(`Mapping with ID "${id}" not found`);
    }

    // Check for duplicate name if changing
    if (dto.name && dto.name !== existing.name) {
      const duplicate = await this.prisma.fieldMapping.findFirst({
        where: { tenantId, name: dto.name, id: { not: id } },
      });
      if (duplicate) {
        throw new ConflictException(`Mapping with name "${dto.name}" already exists`);
      }
    }

    // Validate instances if changing
    if (dto.sourceInstanceId && dto.sourceInstanceId !== existing.sourceInstanceId) {
      await this.validateInstance(dto.sourceInstanceId, tenantId, 'source');
    }
    if (dto.destinationInstanceId && dto.destinationInstanceId !== existing.destinationInstanceId) {
      await this.validateInstance(dto.destinationInstanceId, tenantId, 'destination');
    }

    // Build update data
    const updateData: any = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.type !== undefined) updateData.type = dto.type;
    if (dto.sourceInstanceId !== undefined) updateData.sourceInstanceId = dto.sourceInstanceId;
    if (dto.sourceType !== undefined) updateData.sourceType = dto.sourceType;
    if (dto.sourceConnectorId !== undefined) updateData.sourceConnectorId = dto.sourceConnectorId;
    if (dto.sourceName !== undefined) updateData.sourceName = dto.sourceName;
    if (dto.sourceSchema !== undefined) updateData.sourceSchema = dto.sourceSchema;
    if (dto.destinationInstanceId !== undefined) updateData.destinationInstanceId = dto.destinationInstanceId;
    if (dto.destinationType !== undefined) updateData.destinationType = dto.destinationType;
    if (dto.destinationConnectorId !== undefined) updateData.destinationConnectorId = dto.destinationConnectorId;
    if (dto.destinationName !== undefined) updateData.destinationName = dto.destinationName;
    if (dto.destinationSchema !== undefined) updateData.destinationSchema = dto.destinationSchema;
    if (dto.mappingRules !== undefined) updateData.mappingRules = dto.mappingRules;
    if (dto.transformCode !== undefined) updateData.transformCode = dto.transformCode;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

    // Increment version if mapping rules change
    if (dto.mappingRules !== undefined) {
      updateData.version = existing.version + 1;
      updateData.isValidated = false;
      updateData.validationErrors = null;
    }

    const updated = await this.prisma.fieldMapping.update({
      where: { id },
      data: updateData,
      include: {
        sourceInstance: {
          select: { id: true, name: true, aggregator: { select: { id: true, name: true, category: true } } },
        },
        destinationInstance: {
          select: { id: true, name: true, aggregator: { select: { id: true, name: true, category: true } } },
        },
      },
    });

    return this.formatMapping(updated);
  }

  /**
   * Delete a mapping
   */
  async delete(id: string, tenantId: string) {
    const existing = await this.prisma.fieldMapping.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException(`Mapping with ID "${id}" not found`);
    }

    await this.prisma.fieldMapping.delete({
      where: { id },
    });

    return { success: true };
  }

  // ============================================
  // AI Mapping Generation
  // ============================================

  /**
   * Generate mapping using AI
   */
  async generateMapping(tenantId: string, dto: GenerateMappingDto): Promise<{
    success: boolean;
    mapping?: any;
    generatedRules?: MappingRule[];
    recommendations?: string[];
    transformCode?: string;
    errors?: string[];
  }> {
    try {
      this.logger.log(`Generating mapping: ${dto.source.type} -> ${dto.destination.type}`);

      // Build context for AI
      const sourceContext = await this.buildSchemaContext(dto.source, tenantId);
      const destContext = await this.buildSchemaContext(dto.destination, tenantId);

      // Generate mapping using AI
      const generated = await this.generateAIMapping(
        sourceContext,
        destContext,
        dto.mappingHint,
        dto.model
      );

      if (!generated) {
        return {
          success: false,
          errors: ['Failed to generate mapping'],
        };
      }

      // Auto-generate transformCode if missing or is a placeholder
      if (!generated.transformCode || 
          generated.transformCode.includes('Optional') || 
          generated.transformCode.includes('optional') ||
          generated.transformCode.trim() === '' ||
          generated.transformCode.startsWith('//')) {
        this.logger.log('AI did not generate transformCode, auto-generating from mappingRules');
        generated.transformCode = this.generateTransformFromMappingRules(generated.mappingRules);
      }

      // Save mapping if requested
      if (dto.saveMapping !== false) {
        const mappingName = dto.name || `${dto.source.name}_to_${dto.destination.name}_${Date.now()}`;
        const mappingType = this.determineMappingType(dto.source.type, dto.destination.type);

        // Validate instance IDs before creating mapping
        // AI SDKs (IDs starting with "sdk-" or "sdk_") are in aggregators table, not aggregator_instances
        // They cannot be used as foreign keys, so we set them to null
        const validatedSourceInstanceId = await this.validateInstanceIdForMapping(
          dto.source.instanceId, 
          tenantId, 
          'source'
        );
        const validatedDestInstanceId = await this.validateInstanceIdForMapping(
          dto.destination.instanceId, 
          tenantId, 
          'destination'
        );

        const mapping = await this.prisma.fieldMapping.create({
          data: {
            tenantId,
            name: mappingName,
            description: dto.description,
            type: mappingType as any,
            sourceInstanceId: validatedSourceInstanceId,
            sourceType: dto.source.type,
            sourceConnectorId: dto.source.connectorId,
            sourceName: dto.source.name,
            sourceSchema: sourceContext.schema,
            destinationInstanceId: validatedDestInstanceId,
            destinationType: dto.destination.type,
            destinationConnectorId: dto.destination.connectorId,
            destinationName: dto.destination.name,
            destinationSchema: destContext.schema,
            mappingRules: generated.mappingRules as any,
            transformCode: generated.transformCode,
            isGenerated: true,
            isActive: true,
          },
        });

        return {
          success: true,
          mapping: this.formatMapping(mapping),
          generatedRules: generated.mappingRules,
          recommendations: generated.recommendations,
          transformCode: generated.transformCode,
        };
      }

      return {
        success: true,
        generatedRules: generated.mappingRules,
        recommendations: generated.recommendations,
        transformCode: generated.transformCode,
      };

    } catch (error: any) {
      this.logger.error(`Mapping generation failed: ${error.message}`, error.stack);
      return {
        success: false,
        errors: [error.message],
      };
    }
  }

  /**
   * Quick generate mapping from existing instances
   */
  async quickGenerateMapping(tenantId: string, dto: QuickGenerateMappingDto) {
    // Get source instance
    const sourceInstance = await this.prisma.aggregatorInstance.findFirst({
      where: { id: dto.sourceInstanceId, tenantId },
      include: {
        aggregator: { select: { id: true, name: true, category: true, type: true } },
        connector: { select: { id: true, name: true, type: true } },
      },
    });

    if (!sourceInstance) {
      throw new NotFoundException(`Source instance "${dto.sourceInstanceId}" not found`);
    }

    // Get destination instance
    const destInstance = await this.prisma.aggregatorInstance.findFirst({
      where: { id: dto.destinationInstanceId, tenantId },
      include: {
        aggregator: { select: { id: true, name: true, category: true, type: true } },
        connector: { select: { id: true, name: true, type: true } },
      },
    });

    if (!destInstance) {
      throw new NotFoundException(`Destination instance "${dto.destinationInstanceId}" not found`);
    }

    // Determine source/destination types
    const sourceType = sourceInstance.connector?.type === 'MINI' 
      ? SourceTypeDto.MINI_CONNECTOR 
      : this.getTypeFromCategory(sourceInstance.aggregator.category);
    
    const destType = destInstance.connector?.type === 'MINI'
      ? SourceTypeDto.MINI_CONNECTOR
      : this.getTypeFromCategory(destInstance.aggregator.category);

    // Get schemas from discovered schema or use provided names
    const sourceSchema = (sourceInstance.discoveredSchema as DiscoveredSchema) || {};
    const destSchema = (destInstance.discoveredSchema as DiscoveredSchema) || {};

    // If source/destination names provided, extract specific table/object schema
    let sourceFields: SchemaColumn[] = [];
    let destFields: SchemaColumn[] = [];

    if (dto.sourceName && sourceSchema.tables) {
      const table = sourceSchema.tables.find((t) => t.name === dto.sourceName);
      if (table) {
        sourceFields = table.columns || [];
      }
    } else if (sourceSchema.tables && sourceSchema.tables.length > 0) {
      // Use first table as default
      sourceFields = sourceSchema.tables[0].columns || [];
    }

    if (dto.destinationName && destSchema.tables) {
      const table = destSchema.tables.find((t) => t.name === dto.destinationName);
      if (table) {
        destFields = table.columns || [];
      }
    } else if (destSchema.tables && destSchema.tables.length > 0) {
      destFields = destSchema.tables[0].columns || [];
    }

    // Generate mapping
    const generateDto: GenerateMappingDto = {
      name: dto.name,
      description: dto.description,
      source: {
        instanceId: dto.sourceInstanceId,
        type: sourceType,
        connectorId: sourceInstance.connectorId || undefined,
        name: dto.sourceName || (sourceSchema.tables?.[0]?.name || 'unknown'),
        fields: sourceFields.map((f) => ({
          name: f.name,
          type: f.type,
          nullable: f.nullable,
        })),
      },
      destination: {
        instanceId: dto.destinationInstanceId,
        type: destType,
        connectorId: destInstance.connectorId || undefined,
        name: dto.destinationName || (destSchema.tables?.[0]?.name || 'unknown'),
        fields: destFields.map((f) => ({
          name: f.name,
          type: f.type,
          nullable: f.nullable,
        })),
      },
      mappingHint: dto.mappingHint,
      saveMapping: dto.saveMapping ?? true,
    };

    return this.generateMapping(tenantId, generateDto);
  }

  // ============================================
  // Apply Mapping
  // ============================================

  /**
   * Apply mapping to data
   */
  async applyMapping(dto: ApplyMappingDto): Promise<{
    success: boolean;
    data?: Record<string, any> | Record<string, any>[];
    errors?: string[];
  }> {
    const mapping = await this.prisma.fieldMapping.findUnique({
      where: { id: dto.mappingId },
    });

    if (!mapping) {
      throw new NotFoundException(`Mapping "${dto.mappingId}" not found`);
    }

    try {
      const rules = mapping.mappingRules as unknown as MappingRule[];
      const inputData = Array.isArray(dto.data) ? dto.data : [dto.data];
      const outputData: Record<string, any>[] = [];

      for (const row of inputData) {
        const mappedRow: Record<string, any> = {};

        for (const rule of rules) {
          // Skip if fields filter is provided and this field is not included
          if (dto.fields && !dto.fields.includes(rule.destinationField)) {
            continue;
          }

          // Get source value (support nested paths)
          const sourceValue = this.getNestedValue(row, rule.sourceField);
          
          // Apply transformation
          let value = this.applyTransformation(sourceValue, rule);

          // Handle null values
          if (value === null || value === undefined) {
            if (rule.defaultValue !== undefined) {
              value = rule.defaultValue;
            } else if (!rule.nullable) {
              value = null; // Will cause validation error if destination is not nullable
            }
          }

          // Set destination value (support nested paths)
          this.setNestedValue(mappedRow, rule.destinationField, value);
        }

        outputData.push(mappedRow);
      }

      // Update last used at
      await this.prisma.fieldMapping.update({
        where: { id: dto.mappingId },
        data: { lastUsedAt: new Date() },
      });

      return {
        success: true,
        data: Array.isArray(dto.data) ? outputData : outputData[0],
      };

    } catch (error: any) {
      this.logger.error(`Apply mapping failed: ${error.message}`, error.stack);
      return {
        success: false,
        errors: [error.message],
      };
    }
  }

  /**
   * Validate mapping
   */
  async validateMapping(tenantId: string, dto: ValidateMappingDto): Promise<{
    valid: boolean;
    errors: Array<{ field: string; message: string }>;
    warnings: Array<{ field: string; message: string }>;
  }> {
    const errors: Array<{ field: string; message: string }> = [];
    const warnings: Array<{ field: string; message: string }> = [];

    let mapping: any = null;
    let sourceSchema: any = dto.sourceSchema;
    let destSchema: any = dto.destinationSchema;
    let rules: MappingRule[] = (dto.mappingRules as MappingRule[]) || [];

    // Get existing mapping if ID provided
    if (dto.mappingId) {
      mapping = await this.prisma.fieldMapping.findFirst({
        where: { id: dto.mappingId, tenantId },
      });

      if (!mapping) {
        throw new NotFoundException(`Mapping "${dto.mappingId}" not found`);
      }

      sourceSchema = sourceSchema || mapping.sourceSchema;
      destSchema = destSchema || mapping.destinationSchema;
      rules = rules.length > 0 ? rules : (mapping.mappingRules as MappingRule[]);
    }

    // Extract field names from schemas
    const sourceFields = this.extractFieldNames(sourceSchema);
    const destFields = this.extractFieldNames(destSchema);

    // Validate each rule
    for (const rule of rules) {
      // Check source field exists
      if (!sourceFields.includes(rule.sourceField) && !rule.sourceField.includes('.')) {
        warnings.push({
          field: rule.sourceField,
          message: `Source field "${rule.sourceField}" not found in schema`,
        });
      }

      // Check destination field exists
      if (!destFields.includes(rule.destinationField) && !rule.destinationField.includes('.')) {
        warnings.push({
          field: rule.destinationField,
          message: `Destination field "${rule.destinationField}" not found in schema`,
        });
      }

      // Validate transformation
      if (rule.transform && !this.isValidTransformation(rule.transform)) {
        errors.push({
          field: rule.destinationField,
          message: `Invalid transformation type "${rule.transform}"`,
        });
      }
    }

    // Check for unmapped destination fields
    const mappedDestFields = rules.map((r) => r.destinationField);
    for (const field of destFields) {
      if (!mappedDestFields.includes(field)) {
        warnings.push({
          field,
          message: `Destination field "${field}" is not mapped`,
        });
      }
    }

    // Test with sample data if provided
    if (dto.sampleData) {
      try {
        const testResult = await this.testMappingWithData(rules, dto.sampleData);
        if (!testResult.success) {
          errors.push(...testResult.errors.map((e) => ({ field: '', message: e })));
        }
      } catch (error: any) {
        errors.push({
          field: '',
          message: `Sample data test failed: ${error.message}`,
        });
      }
    }

    // Update validation status if mapping exists
    if (mapping) {
      await this.prisma.fieldMapping.update({
        where: { id: mapping.id },
        data: {
          isValidated: errors.length === 0,
          validationErrors: errors.length > 0 ? errors : null,
        },
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  private async validateInstance(instanceId: string, tenantId: string, type: 'source' | 'destination') {
    const instance = await this.prisma.aggregatorInstance.findFirst({
      where: { id: instanceId, tenantId },
    });

    if (!instance) {
      throw new NotFoundException(`${type} instance "${instanceId}" not found`);
    }

    return instance;
  }

  /**
   * Validate instance ID for mapping creation.
   * AI SDKs (IDs starting with "sdk-" or "sdk_") exist in the aggregators table, not aggregator_instances.
   * Since they cannot be used as foreign keys, return null instead.
   * 
   * @param instanceId - The instance ID to validate
   * @param tenantId - The tenant ID
   * @param type - 'source' or 'destination' for logging purposes
   * @returns The validated instance ID or null if it cannot be used as FK
   */
  private async validateInstanceIdForMapping(
    instanceId: string | undefined, 
    tenantId: string, 
    type: 'source' | 'destination'
  ): Promise<string | null> {
    // If no instance ID, return null
    if (!instanceId) {
      return null;
    }

    // Check if it's an AI-generated SDK (cannot be used as FK to aggregator_instances)
    // These IDs start with "sdk-" or "sdk_" and exist in aggregators table
    if (instanceId.startsWith('sdk-') || instanceId.startsWith('sdk_')) {
      this.logger.log(
        `${type} instance ID "${instanceId}" is an AI SDK (stored in aggregators table), ` +
        `setting to null to avoid FK violation`
      );
      return null;
    }

    // Check if the instance exists in aggregator_instances table
    const instance = await this.prisma.aggregatorInstance.findFirst({
      where: { id: instanceId, tenantId },
      select: { id: true },
    });

    if (instance) {
      // Instance exists, use it
      return instanceId;
    }

    // Instance not found - log warning and return null
    this.logger.warn(
      `${type} instance "${instanceId}" not found in aggregator_instances, ` +
      `setting to null to avoid FK violation`
    );
    return null;
  }

  private determineMappingType(sourceType: string, destType: string): MappingTypeDto {
    if (sourceType === SourceTypeDto.MINI_CONNECTOR || destType === SourceTypeDto.MINI_CONNECTOR) {
      return MappingTypeDto.MINI_CONNECTOR;
    }
    if (sourceType === SourceTypeDto.SDK || destType === SourceTypeDto.SDK) {
      return MappingTypeDto.FIELD;
    }
    if (sourceType === SourceTypeDto.AGGREGATOR || destType === SourceTypeDto.AGGREGATOR) {
      return MappingTypeDto.AGGREGATOR;
    }
    return MappingTypeDto.COLUMN;
  }

  private getTypeFromCategory(category: string): SourceTypeDto {
    const categoryLower = category.toLowerCase();
    if (categoryLower.includes('database')) return SourceTypeDto.DATABASE;
    if (categoryLower.includes('crm') || categoryLower.includes('erp')) return SourceTypeDto.AGGREGATOR;
    if (categoryLower.includes('api') || categoryLower.includes('sdk')) return SourceTypeDto.SDK;
    return SourceTypeDto.AGGREGATOR;
  }

  private formatMapping(mapping: any) {
    return {
      id: mapping.id,
      name: mapping.name,
      description: mapping.description,
      type: mapping.type,
      version: mapping.version,
      isActive: mapping.isActive,
      isGenerated: mapping.isGenerated,
      isValidated: mapping.isValidated,
      validationErrors: mapping.validationErrors,
      // Source
      sourceInstanceId: mapping.sourceInstanceId,
      sourceInstance: mapping.sourceInstance,
      sourceType: mapping.sourceType,
      sourceConnectorId: mapping.sourceConnectorId,
      sourceName: mapping.sourceName,
      sourceSchema: mapping.sourceSchema,
      // Destination
      destinationInstanceId: mapping.destinationInstanceId,
      destinationInstance: mapping.destinationInstance,
      destinationType: mapping.destinationType,
      destinationConnectorId: mapping.destinationConnectorId,
      destinationName: mapping.destinationName,
      destinationSchema: mapping.destinationSchema,
      // Rules
      mappingRules: mapping.mappingRules,
      transformCode: mapping.transformCode,
      // Metadata
      lastUsedAt: mapping.lastUsedAt,
      createdAt: mapping.createdAt,
      updatedAt: mapping.updatedAt,
    };
  }

  private async buildSchemaContext(config: any, tenantId: string): Promise<{
    type: string;
    name: string;
    schema: Record<string, any>;
    description?: string;
  }> {
    let schema = config.schema || {};
    let name = config.name;
    let actualType = config.type;

    // If instance ID provided, get additional context including connector info
    if (config.instanceId) {
      const instance = await this.prisma.aggregatorInstance.findFirst({
        where: { id: config.instanceId, tenantId },
        include: {
          aggregator: { select: { id: true, name: true, category: true, type: true } },
          connector: { select: { id: true, name: true, type: true } },
        },
      });

      if (instance) {
        // Use discovered schema if available
        if (instance.discoveredSchema && !config.fields?.length) {
          schema = instance.discoveredSchema;
        }

        // Add aggregator context
        schema.aggregatorName = instance.aggregator.name;
        schema.aggregatorCategory = instance.aggregator.category;
        schema.aggregatorType = instance.aggregator.type;
        
        // Determine the actual type based on connector or aggregator
        // Priority: connector type > aggregator category > provided type
        if (instance.connector) {
          // This is a mini-connector based instance
          schema.connectorType = instance.connector.type;
          schema.connectorName = instance.connector.name;
          actualType = 'mini-connector';
        } else {
          // Determine type from aggregator category
          const categoryLower = instance.aggregator.category.toLowerCase();
          if (categoryLower.includes('api') || categoryLower.includes('sdk') || categoryLower.includes('rest')) {
            actualType = 'sdk';
          } else if (categoryLower.includes('database') || categoryLower.includes('sql')) {
            actualType = 'database';
          } else {
            actualType = 'aggregator';
          }
        }

        // NEW: For SDK/API types, also get fields from aggregator's configSchema
        // This enables auto schema for AI-generated SDKs
        if ((actualType === 'sdk' || actualType === 'api' || actualType === 'aggregator') && !schema.fields?.length) {
          try {
            // For AI-generated SDKs, the instance ID IS the aggregator ID (they start with "sdk-")
            // So we should query by instance.id directly, not instance.aggregatorId
            const aggregatorIdToQuery = config.instanceId?.startsWith('sdk-') 
              ? config.instanceId 
              : (instance ? instance.aggregatorId : null);
            
            if (!aggregatorIdToQuery) {
              this.logger.warn(`No aggregator ID to query for: ${config.instanceId}`);
            } else {
              this.logger.log(`Fetching aggregator configSchema for: ${aggregatorIdToQuery}`);
              
              // Fetch the full aggregator to get configSchema
              const fullAggregator = await this.prisma.aggregator.findUnique({
                where: { id: aggregatorIdToQuery },
                select: { configSchema: true, name: true },
              });
              
              if (fullAggregator?.configSchema) {
                const configSchema = fullAggregator.configSchema as Record<string, any>;
                
                // Use fields from configSchema if available
                if (configSchema.fields && Array.isArray(configSchema.fields)) {
                  this.logger.log(`Found ${configSchema.fields.length} fields in aggregator configSchema for SDK`);
                  schema.fields = configSchema.fields;
                }
                
                // Also use endpoints if available (for AI-generated SDKs)
                if (configSchema.endpoints && Array.isArray(configSchema.endpoints)) {
                  schema.endpoints = configSchema.endpoints;
                }
              }
            }
          } catch (err) {
            this.logger.warn(`Failed to fetch aggregator configSchema: ${err}`);
          }
        }
      } else if (config.instanceId?.startsWith('sdk-') && !schema.fields?.length) {
        // Fallback: If no instance found but instanceId starts with "sdk-", directly query the aggregator
        try {
          this.logger.log(`Directly fetching aggregator for SDK: ${config.instanceId}`);
          const fullAggregator = await this.prisma.aggregator.findUnique({
            where: { id: config.instanceId },
            select: { configSchema: true, name: true },
          });
          
          if (fullAggregator?.configSchema) {
            const configSchema = fullAggregator.configSchema as Record<string, any>;
            
            if (configSchema.fields && Array.isArray(configSchema.fields)) {
              this.logger.log(`Found ${configSchema.fields.length} fields in SDK aggregator configSchema`);
              schema.fields = configSchema.fields;
              schema.aggregatorName = fullAggregator.name;
            }
            
            if (configSchema.endpoints && Array.isArray(configSchema.endpoints)) {
              schema.endpoints = configSchema.endpoints;
            }
          }
        } catch (err) {
          this.logger.warn(`Failed to fetch SDK aggregator directly: ${err}`);
        }
      }
    }

    // If connector ID is provided directly (not via instance), fetch schema from mini-connector
    if (config.connectorId && !config.instanceId) {
      const connector = await this.prisma.connector.findFirst({
        where: { id: config.connectorId, tenantId },
      });

      if (connector) {
        schema.connectorType = connector.type;
        schema.connectorName = connector.name;
        actualType = 'mini-connector';

        // Auto-fetch schema from mini-connector if no fields provided
        if (!config.fields?.length && connector.type === 'MINI') {
          try {
            this.logger.log(`Fetching schema from mini-connector: ${connector.id}`);
            const fetchedSchema = await this.fetchMiniConnectorSchema(tenantId, connector.id);
            schema = { ...schema, ...fetchedSchema };
          } catch (error: any) {
            this.logger.warn(`Failed to fetch schema from mini-connector ${connector.id}: ${error.message}`);
          }
        }
      }
    }

    // If no schema fields and type is database/sdk/aggregator, try to fetch from aggregator
    if (!config.fields?.length && !schema.fields && !schema.tables) {
      const typeCategory = actualType.toLowerCase();
      
      if (typeCategory === 'database' || typeCategory === 'sdk' || typeCategory === 'aggregator') {
        // Try to find aggregator by name and get its configSchema
        try {
          this.logger.log(`Fetching schema for ${actualType}: ${name}`);
          const aggregatorSchema = await this.fetchAggregatorSchema(tenantId, name, actualType);
          if (aggregatorSchema) {
            schema = { ...schema, ...aggregatorSchema };
          }
        } catch (error: any) {
          this.logger.warn(`Failed to fetch schema for ${name}: ${error.message}`);
        }
      }
    }

    // Use provided fields if available - BUT only if they are real data fields (not placeholder "method" types)
    // For SDKs/API, we prefer to use fields from aggregator's configSchema
    if (config.fields && config.fields.length > 0) {
      // Check if the provided fields are just placeholder "method" types (not real data fields)
      const hasRealFields = config.fields.some((f: any) => 
        f.type && f.type !== 'method' && f.type !== 'password'
      );
      
      // Only use provided fields if they contain real data, otherwise prefer schema from configSchema
      if (hasRealFields || !schema.fields) {
        schema.fields = config.fields;
      } else {
        this.logger.log(`Ignoring placeholder fields from frontend, using fields from aggregator configSchema`);
      }
    }

    // Check aggregator category for SDK type detection (fallback)
    if (schema.aggregatorCategory) {
      const categoryLower = schema.aggregatorCategory.toLowerCase();
      if (categoryLower.includes('api') || categoryLower.includes('sdk') || categoryLower.includes('rest')) {
        actualType = 'sdk';
      } else if (categoryLower.includes('database') || categoryLower.includes('sql')) {
        actualType = 'database';
      }
    }

    return {
      type: actualType,
      name,
      schema,
      description: config.description,
    };
  }

  /**
   * Fetch schema from mini-connector by getting databases, tables, and columns
   */
  private async fetchMiniConnectorSchema(tenantId: string, connectorId: string): Promise<Record<string, any>> {
    try {
      // Get databases from mini-connector
      const databasesResponse: any = await this.miniConnectorProxy.getDatabases(tenantId, connectorId);
      const databases = databasesResponse?.databases || databasesResponse?.data?.databases || [];
      
      if (!databases || databases.length === 0) {
        return { tables: [] };
      }

      // Get tables from first database (or all databases)
      const tables: SchemaTable[] = [];
      
      for (const dbName of databases.slice(0, 3)) { // Limit to first 3 databases
        try {
          const tablesResponse: any = await this.miniConnectorProxy.getTables(tenantId, connectorId, dbName);
          const tableNames = tablesResponse?.tables || tablesResponse?.data?.tables || [];
          
          for (const tableName of tableNames.slice(0, 10)) { // Limit to first 10 tables per DB
            try {
              const columnsResponse: any = await this.miniConnectorProxy.getColumns(tenantId, connectorId, dbName, tableName);
              const columns = columnsResponse?.columns || columnsResponse?.data?.columns || [];
              
              tables.push({
                name: `${dbName}.${tableName}`,
                columns: columns.map((col: any) => ({
                  name: col.name || col.columnName,
                  type: col.type || col.dataType || 'string',
                  nullable: col.nullable !== false,
                  primaryKey: col.primaryKey === true,
                })),
              });
            } catch (colError) {
              // Skip tables where we can't get columns
              tables.push({
                name: `${dbName}.${tableName}`,
                columns: [],
              });
            }
          }
        } catch (tableError) {
          // Skip databases where we can't get tables
        }
      }

      return { tables };
    } catch (error: any) {
      this.logger.error(`Failed to fetch mini-connector schema: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetch schema from aggregator (for SDK, database, or aggregator types)
   * First checks aggregator instances (which have discoveredSchema), then falls back to aggregator config
   */
  private async fetchAggregatorSchema(tenantId: string, name: string, type: string): Promise<Record<string, any> | null> {
    try {
      // First, try to find an AGGREGATOR INSTANCE by name (this has discoveredSchema with tables/columns)
      const instance = await this.prisma.aggregatorInstance.findFirst({
        where: {
          tenantId,
          name: { contains: name, mode: 'insensitive' },
        },
        include: {
          aggregator: { select: { id: true, name: true, category: true, type: true } },
          connector: { select: { id: true, name: true, type: true } },
        },
      });

      if (instance) {
        this.logger.log(`Found instance by name "${name}": ${instance.id}`);
        
        // Use discovered schema if available
        if (instance.discoveredSchema) {
          return {
            ...(instance.discoveredSchema as Record<string, any>),
            aggregatorName: instance.aggregator.name,
            aggregatorCategory: instance.aggregator.category,
            aggregatorType: instance.aggregator.type,
            instanceId: instance.id,
          };
        }
        
        // If no discoveredSchema but has connector (mini-connector instance), fetch from connector
        if (instance.connectorId && instance.connector?.type === 'MINI') {
          try {
            const fetchedSchema = await this.fetchMiniConnectorSchema(tenantId, instance.connectorId);
            return {
              ...fetchedSchema,
              aggregatorName: instance.aggregator.name,
              aggregatorCategory: instance.aggregator.category,
              aggregatorType: instance.aggregator.type,
              instanceId: instance.id,
            };
          } catch (err) {
            this.logger.warn(`Failed to fetch schema from mini-connector: ${err}`);
          }
        }
      }

      // Second, try to find AGGREGATOR by name (this has configSchema with auth fields)
      const aggregator = await this.prisma.aggregator.findFirst({
        where: {
          tenantId,
          name: { contains: name, mode: 'insensitive' },
        },
      });

      if (aggregator) {
        this.logger.log(`Found aggregator by name "${name}": ${aggregator.id}`);
        return this.buildSchemaFromAggregator(aggregator);
      }

      // Third, try finding by category match
      const categoryMap: Record<string, string> = {
        'database': 'database',
        'sdk': 'api',
        'aggregator': 'crm',
      };
      
      const categorySearch = categoryMap[type] || type;
      
      // First check instances by category
      const instancesByCategory = await this.prisma.aggregatorInstance.findMany({
        where: {
          tenantId,
          aggregator: { category: { contains: categorySearch, mode: 'insensitive' } },
        },
        include: {
          aggregator: { select: { id: true, name: true, category: true, type: true } },
        },
        take: 1,
      });
      
      if (instancesByCategory.length > 0) {
        const inst = instancesByCategory[0];
        if (inst.discoveredSchema) {
          return {
            ...(inst.discoveredSchema as Record<string, any>),
            aggregatorName: inst.aggregator.name,
            aggregatorCategory: inst.aggregator.category,
            aggregatorType: inst.aggregator.type,
            instanceId: inst.id,
          };
        }
      }
      
      // Then check aggregators by category
      const aggregators = await this.prisma.aggregator.findMany({
        where: {
          tenantId,
          category: { contains: categorySearch, mode: 'insensitive' },
        },
        take: 1,
      });
      
      if (aggregators.length > 0) {
        return this.buildSchemaFromAggregator(aggregators[0]);
      }
      
      this.logger.warn(`No schema found for "${name}" with type "${type}"`);
      return null;
    } catch (error: any) {
      this.logger.warn(`Failed to fetch aggregator schema: ${error.message}`);
      return null;
    }
  }

  /**
   * Build schema object from aggregator definition
   */
  private buildSchemaFromAggregator(aggregator: any): Record<string, any> {
    const schema: Record<string, any> = {
      aggregatorName: aggregator.name,
      aggregatorCategory: aggregator.category,
      aggregatorType: aggregator.type,
    };

    // Use configSchema if available (defines API fields for SDKs)
    if (aggregator.configSchema) {
      const configSchema = aggregator.configSchema as Record<string, any>;
      
      if (configSchema.fields) {
        schema.fields = configSchema.fields.map((f: any) => ({
          name: f.name,
          type: f.type || 'string',
          nullable: f.required !== true,
          description: f.description,
        }));
      } else if (configSchema.endpoints) {
        // For API aggregators, use endpoint definitions
        schema.fields = [];
        for (const endpoint of configSchema.endpoints) {
          if (endpoint.requestFields) {
            schema.fields.push(...endpoint.requestFields.map((f: any) => ({
              name: f.name,
              type: f.type || 'string',
              nullable: f.required !== true,
            })));
          }
        }
      }
    }

    return schema;
  }

  private async generateAIMapping(
    sourceContext: any,
    destContext: any,
    hint?: string,
    model?: string
  ): Promise<GeneratedMappingResult | null> {
    // Build system prompt based on source and destination types
    const systemPrompt = this.buildSystemPrompt(sourceContext.type, destContext.type);

    // Build user prompt with schema details
    const userPrompt = this.buildUserPrompt(sourceContext, destContext, hint);
    let response = '';
    try {
      const response = await this.aiProvider.completeText(
        userPrompt,
        systemPrompt,
        {
          model: model || 'openai/gpt-4o-mini',
          temperature: 0.3,
          maxTokens: 4000,
        }
      );

      // Parse response - use enhanced JSON cleaning
      const cleanedResponse = this.cleanJsonResponse(response);
      const result = JSON.parse(cleanedResponse);

      return {
        mappingRules: result.mappings || result.mappingRules || [],
        recommendations: result.recommendations || [],
        transformCode: result.transformCode,
      };

    } catch (error: any) {
      this.logger.error(`AI mapping generation failed: ${error.message}`);
      // Log the raw response for debugging
      this.logger.error(`Raw AI response: ${response}`);
      return null;
    }
  }

  private buildSystemPrompt(sourceType: string, destType: string): string {
    const typeDescriptions: Record<string, string> = {
      database: 'a relational database table with columns',
      sdk: 'an API endpoint with request/response fields (may have nested objects)',
      aggregator: 'an aggregator object (e.g., Salesforce object, HubSpot properties)',
      'mini-connector': 'a local data source accessed via mini connector',
    };

    return `You are an expert in data mapping and transformation.
Generate field-level mappings between ${typeDescriptions[sourceType] || sourceType} and ${typeDescriptions[destType] || destType}.

Consider:
1. Field name similarities (exact match, case-insensitive, snake_case to camelCase)
2. Data type compatibility and conversion needs
3. Required vs optional fields
4. Nested object flattening for APIs
5. Array handling
6. Date/time format conversions

Available transformations:
- direct: No transformation
- uppercase/lowercase: String case conversion
- date-format: Date formatting (use transformConfig.format)
- number-format: Number formatting (use transformConfig.format)
- string-to-number: Convert string to number
- number-to-string: Convert number to string
- boolean-to-string: Convert boolean to string
- json-stringify: Convert object to JSON string
- json-parse: Parse JSON string to object
- custom: Use transformCode for custom transformation

Respond with JSON only:
{
  "mappings": [
    {
      "sourceField": "field_name",
      "destinationField": "FieldName",
      "transform": "direct",
      "transformConfig": {},
      "nullable": true,
      "dataType": "string",
      "defaultValue": null
    }
  ],
  "recommendations": ["List any recommendations or warnings"],
  "transformCode": "// Optional: custom JavaScript transformation code"
}`;
  }

  private buildUserPrompt(source: any, dest: any, hint?: string): string {
    const sourceFields = this.formatFieldsForPrompt(source.schema?.fields || source.schema?.columns || []);
    const destFields = this.formatFieldsForPrompt(dest.schema?.fields || dest.schema?.columns || []);

    return `Generate field mappings:

SOURCE: ${source.name} (${source.type})
${sourceFields}
${source.description ? `Description: ${source.description}` : ''}

DESTINATION: ${dest.name} (${dest.type})
${destFields}
${dest.description ? `Description: ${dest.description}` : ''}

${hint ? `Mapping Hint: ${hint}` : ''}

Generate the optimal field mappings. Respond with JSON only.`;
  }

  private formatFieldsForPrompt(fields: any[]): string {
    if (!fields || fields.length === 0) return 'No fields defined';

    return fields
      .map((f) => {
        let line = `- ${f.name} (${f.type})`;
        if (f.nullable) line += ' (nullable)';
        if (f.primaryKey) line += ' (PK)';
        if (f.description) line += ` - ${f.description}`;
        if (f.nested && f.nested.length > 0) {
          line += `\n  Nested: ${f.nested.map((n: any) => n.name).join(', ')}`;
        }
        return line;
      })
      .join('\n');
  }

  /**
   * Enhanced JSON cleaning method that handles:
   * - Markdown code blocks
   * - Trailing commas
   * - Extracting JSON from text with surrounding content
   * - Incomplete JSON responses
   */
  private cleanJsonResponse(response: string): string {
    let cleaned = response.trim();

    // Remove markdown code blocks
    if (cleaned.startsWith('```')) {
      const firstNewline = cleaned.indexOf('\n');
      cleaned = cleaned.slice(firstNewline + 1);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }

    // Try to find JSON object in the response (in case AI added text before/after)
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
    } else {
      // Try array format
      const arrayStart = cleaned.indexOf('[');
      const arrayEnd = cleaned.lastIndexOf(']');
      if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
        cleaned = cleaned.slice(arrayStart, arrayEnd + 1);
      }
    }

    // Fix trailing commas (common AI mistake)
    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

    // Remove any remaining non-JSON content
    // Keep only valid JSON characters
    cleaned = cleaned
      .replace(/^[^{\[]+/, '')  // Remove anything before { or [
      .replace(/[^}\]]+$/, ''); // Remove anything after } or ]

    return cleaned.trim();
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

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

  private applyTransformation(value: any, rule: MappingRule): any {
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

  private isValidTransformation(transform: string): boolean {
    const validTransforms = [
      'direct', 'uppercase', 'lowercase', 'date-format', 'number-format',
      'string-to-number', 'number-to-string', 'boolean-to-string',
      'json-stringify', 'json-parse', 'custom',
    ];
    return validTransforms.includes(transform);
  }

  private extractFieldNames(schema: any): string[] {
    if (!schema) return [];

    // Handle different schema formats
    if (schema.fields) {
      return schema.fields.map((f: any) => f.name);
    }
    if (schema.columns) {
      return schema.columns.map((c: any) => c.name);
    }
    if (Array.isArray(schema)) {
      return schema.map((f: any) => f.name);
    }

    return [];
  }

  private async testMappingWithData(rules: MappingRule[], data: any): Promise<{
    success: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];

    try {
      for (const rule of rules) {
        const value = this.getNestedValue(data, rule.sourceField);
        const transformed = this.applyTransformation(value, rule);

        // Check for required field violations
        if (!rule.nullable && (transformed === null || transformed === undefined)) {
          errors.push(`Required field "${rule.destinationField}" has no value`);
        }
      }

      return {
        success: errors.length === 0,
        errors,
      };

    } catch (error: any) {
      return {
        success: false,
        errors: [error.message],
      };
    }
  }

  /**
   * Generate transformation code from mappingRules
   * This creates JavaScript code that applies field-by-field transformations
   */
  private generateTransformFromMappingRules(mappingRules: MappingRule[]): string {
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

      // Quote field names that contain dots (e.g., "ProductsContractsSummitProductSyncRequest.id")
      const safeDestField = destField.includes('.') ? `"${destField}"` : destField;
      transformations.push(`      ${safeDestField}: ${valueExpr}`);
    }

    const code = `return input.map(row => {
  return {
${transformations.join(',\n')}
  };
});`;

    return code;
  }
}
