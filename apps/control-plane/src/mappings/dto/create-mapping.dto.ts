import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsObject, IsBoolean, IsArray, ValidateNested, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Mapping type enum matching Prisma schema
 */
export enum MappingTypeDto {
  COLUMN = 'COLUMN',
  FIELD = 'FIELD',
  TRANSFORM = 'TRANSFORM',
  AGGREGATOR = 'AGGREGATOR',
  MINI_CONNECTOR = 'MINI_CONNECTOR',
  HYBRID = 'HYBRID',
}

/**
 * Source/Destination type enum
 */
export enum SourceTypeDto {
  DATABASE = 'database',
  SDK = 'sdk',
  AGGREGATOR = 'aggregator',
  MINI_CONNECTOR = 'mini-connector',
}

/**
 * Single mapping rule definition
 */
export class MappingRuleDto {
  @ApiProperty({ description: 'Source field path (supports nested paths like "user.address.city")' })
  @IsString()
  sourceField!: string;

  @ApiProperty({ description: 'Destination field path' })
  @IsString()
  destinationField!: string;

  @ApiPropertyOptional({ description: 'Transformation type: direct, uppercase, lowercase, date-format, number-format, custom' })
  @IsOptional()
  @IsString()
  transform?: string;

  @ApiPropertyOptional({ description: 'Transformation configuration (e.g., format string for dates)' })
  @IsOptional()
  @IsObject()
  transformConfig?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Whether the source field can be null' })
  @IsOptional()
  @IsBoolean()
  nullable?: boolean;

  @ApiPropertyOptional({ description: 'Data type of the field' })
  @IsOptional()
  @IsString()
  dataType?: string;

  @ApiPropertyOptional({ description: 'Default value if source is null' })
  @IsOptional()
  defaultValue?: any;
}

/**
 * Schema field definition for source/destination schemas
 */
export class SchemaFieldDto {
  @ApiProperty({ description: 'Field name' })
  @IsString()
  name!: string;

  @ApiProperty({ description: 'Field data type' })
  @IsString()
  type!: string;

  @ApiPropertyOptional({ description: 'Whether the field can be null' })
  @IsOptional()
  @IsBoolean()
  nullable?: boolean;

  @ApiPropertyOptional({ description: 'Whether this is a primary key' })
  @IsOptional()
  @IsBoolean()
  primaryKey?: boolean;

  @ApiPropertyOptional({ description: 'Nested fields for object types' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SchemaFieldDto)
  nested?: SchemaFieldDto[];
}

/**
 * Schema definition for source/destination
 */
export class SchemaDefinitionDto {
  @ApiProperty({ description: 'Table, endpoint, or object name' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: 'Schema type (table, endpoint, object, collection)' })
  @IsOptional()
  @IsString()
  schemaType?: string;

  @ApiProperty({ description: 'Fields in the schema', type: [SchemaFieldDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SchemaFieldDto)
  fields!: SchemaFieldDto[];
}

/**
 * Create mapping DTO
 */
export class CreateMappingDto {
  @ApiProperty({ description: 'Mapping name' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: 'Mapping description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Mapping type', enum: MappingTypeDto, default: MappingTypeDto.COLUMN })
  @IsOptional()
  @IsEnum(MappingTypeDto)
  type?: MappingTypeDto;

  // Source configuration
  @ApiPropertyOptional({ description: 'Source aggregator instance ID' })
  @IsOptional()
  @IsUUID()
  sourceInstanceId?: string;

  @ApiProperty({ description: 'Source type', enum: SourceTypeDto })
  @IsEnum(SourceTypeDto)
  sourceType!: SourceTypeDto;

  @ApiPropertyOptional({ description: 'Source connector ID (for mini-connector sources)' })
  @IsOptional()
  @IsUUID()
  sourceConnectorId?: string;

  @ApiProperty({ description: 'Source table, endpoint, or object name' })
  @IsString()
  sourceName!: string;

  @ApiProperty({ description: 'Source schema definition' })
  @IsObject()
  sourceSchema!: Record<string, any>;

  // Destination configuration
  @ApiPropertyOptional({ description: 'Destination aggregator instance ID' })
  @IsOptional()
  @IsUUID()
  destinationInstanceId?: string;

  @ApiProperty({ description: 'Destination type', enum: SourceTypeDto })
  @IsEnum(SourceTypeDto)
  destinationType!: SourceTypeDto;

  @ApiPropertyOptional({ description: 'Destination connector ID (for mini-connector destinations)' })
  @IsOptional()
  @IsUUID()
  destinationConnectorId?: string;

  @ApiProperty({ description: 'Destination table, endpoint, or object name' })
  @IsString()
  destinationName!: string;

  @ApiProperty({ description: 'Destination schema definition' })
  @IsObject()
  destinationSchema!: Record<string, any>;

  @ApiProperty({ description: 'Mapping rules', type: [MappingRuleDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MappingRuleDto)
  mappingRules!: MappingRuleDto[];

  @ApiPropertyOptional({ description: 'Custom transformation code (JavaScript function)' })
  @IsOptional()
  @IsString()
  transformCode?: string;

  @ApiPropertyOptional({ description: 'Whether the mapping is active', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * Update mapping DTO
 */
export class UpdateMappingDto {
  @ApiPropertyOptional({ description: 'Mapping name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Mapping description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Mapping type', enum: MappingTypeDto })
  @IsOptional()
  @IsEnum(MappingTypeDto)
  type?: MappingTypeDto;

  @ApiPropertyOptional({ description: 'Source aggregator instance ID' })
  @IsOptional()
  @IsUUID()
  sourceInstanceId?: string;

  @ApiPropertyOptional({ description: 'Source type', enum: SourceTypeDto })
  @IsOptional()
  @IsEnum(SourceTypeDto)
  sourceType?: SourceTypeDto;

  @ApiPropertyOptional({ description: 'Source connector ID' })
  @IsOptional()
  @IsUUID()
  sourceConnectorId?: string;

  @ApiPropertyOptional({ description: 'Source name' })
  @IsOptional()
  @IsString()
  sourceName?: string;

  @ApiPropertyOptional({ description: 'Source schema' })
  @IsOptional()
  @IsObject()
  sourceSchema?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Destination aggregator instance ID' })
  @IsOptional()
  @IsUUID()
  destinationInstanceId?: string;

  @ApiPropertyOptional({ description: 'Destination type', enum: SourceTypeDto })
  @IsOptional()
  @IsEnum(SourceTypeDto)
  destinationType?: SourceTypeDto;

  @ApiPropertyOptional({ description: 'Destination connector ID' })
  @IsOptional()
  @IsUUID()
  destinationConnectorId?: string;

  @ApiPropertyOptional({ description: 'Destination name' })
  @IsOptional()
  @IsString()
  destinationName?: string;

  @ApiPropertyOptional({ description: 'Destination schema' })
  @IsOptional()
  @IsObject()
  destinationSchema?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Mapping rules', type: [MappingRuleDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MappingRuleDto)
  mappingRules?: MappingRuleDto[];

  @ApiPropertyOptional({ description: 'Transformation code' })
  @IsOptional()
  @IsString()
  transformCode?: string;

  @ApiPropertyOptional({ description: 'Whether the mapping is active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * Query DTO for listing mappings
 */
export class MappingQueryDto {
  @ApiPropertyOptional({ description: 'Filter by source instance ID' })
  @IsOptional()
  @IsUUID()
  sourceInstanceId?: string;

  @ApiPropertyOptional({ description: 'Filter by destination instance ID' })
  @IsOptional()
  @IsUUID()
  destinationInstanceId?: string;

  @ApiPropertyOptional({ description: 'Filter by mapping type', enum: MappingTypeDto })
  @IsOptional()
  @IsEnum(MappingTypeDto)
  type?: MappingTypeDto;

  @ApiPropertyOptional({ description: 'Filter by source type', enum: SourceTypeDto })
  @IsOptional()
  @IsEnum(SourceTypeDto)
  sourceType?: string;

  @ApiPropertyOptional({ description: 'Filter by destination type', enum: SourceTypeDto })
  @IsOptional()
  @IsEnum(SourceTypeDto)
  destinationType?: string;

  @ApiPropertyOptional({ description: 'Filter by active status' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Search by name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsOptional()
  limit?: number;
}