import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsArray, ValidateNested, IsUUID, IsObject, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { SourceTypeDto } from './create-mapping.dto';

/**
 * Schema field for AI mapping generation
 */
export class GenerateSchemaFieldDto {
  @ApiProperty({ description: 'Field name' })
  @IsString()
  name!: string;

  @ApiProperty({ description: 'Field data type' })
  @IsString()
  type!: string;

  @ApiPropertyOptional({ description: 'Whether the field can be null' })
  @IsOptional()
  nullable?: boolean;

  @ApiPropertyOptional({ description: 'Sample value for AI context' })
  @IsOptional()
  sampleValue?: any;

  @ApiPropertyOptional({ description: 'Field description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Nested fields for object/array types', type: [GenerateSchemaFieldDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GenerateSchemaFieldDto)
  nested?: GenerateSchemaFieldDto[];
}

/**
 * Source/Destination schema for AI mapping generation
 */
export class GenerateSchemaConfigDto {
  @ApiPropertyOptional({ description: 'Aggregator instance ID (if using existing instance)' })
  @IsOptional()
  @IsString()
  instanceId?: string;

  @ApiProperty({ description: 'Type of data source', enum: SourceTypeDto })
  @IsEnum(SourceTypeDto)
  type!: SourceTypeDto;

  @ApiPropertyOptional({ description: 'Connector ID (for mini-connector sources)' })
  @IsOptional()
  @IsString()
  connectorId?: string;

  @ApiProperty({ description: 'Table name, endpoint name, or object name' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: 'Fields in the schema', type: [GenerateSchemaFieldDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GenerateSchemaFieldDto)
  fields?: GenerateSchemaFieldDto[];

  @ApiPropertyOptional({ description: 'Full schema object (alternative to fields array)' })
  @IsOptional()
  @IsObject()
  schema?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Description of the data source for AI context' })
  @IsOptional()
  @IsString()
  description?: string;
}

/**
 * AI mapping generation request DTO
 */
export class GenerateMappingDto {
  @ApiPropertyOptional({ description: 'Name for the generated mapping' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Description for the generated mapping' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Source schema configuration' })
  @ValidateNested()
  @Type(() => GenerateSchemaConfigDto)
  source!: GenerateSchemaConfigDto;

  @ApiProperty({ description: 'Destination schema configuration' })
  @ValidateNested()
  @Type(() => GenerateSchemaConfigDto)
  destination!: GenerateSchemaConfigDto;

  @ApiPropertyOptional({ description: 'Natural language description of the desired mapping' })
  @IsOptional()
  @IsString()
  mappingHint?: string;

  @ApiPropertyOptional({ description: 'Custom AI model to use' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ description: 'Save the generated mapping automatically', default: true })
  @IsOptional()
  saveMapping?: boolean;
}

/**
 * Apply mapping request DTO
 */
export class ApplyMappingDto {
  @ApiProperty({ description: 'Mapping ID to apply' })
  @IsUUID()
  mappingId!: string;

  @ApiProperty({ description: 'Data to apply mapping to' })
  @IsObject()
  data!: Record<string, any> | Record<string, any>[];

  @ApiPropertyOptional({ description: 'Apply only specific fields' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fields?: string[];
}

/**
 * Validate mapping request DTO
 */
export class ValidateMappingDto {
  @ApiPropertyOptional({ description: 'Mapping ID to validate (if updating existing)' })
  @IsOptional()
  @IsUUID()
  mappingId?: string;

  @ApiPropertyOptional({ description: 'Source schema to validate against' })
  @IsOptional()
  @IsObject()
  sourceSchema?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Destination schema to validate against' })
  @IsOptional()
  @IsObject()
  destinationSchema?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Mapping rules to validate', type: [Object] })
  @IsOptional()
  @IsArray()
  mappingRules?: Record<string, any>[];

  @ApiPropertyOptional({ description: 'Sample data to test mapping' })
  @IsOptional()
  @IsObject()
  sampleData?: Record<string, any>;
}

/**
 * Quick mapping generation from instances
 */
export class QuickGenerateMappingDto {
  @ApiProperty({ description: 'Source aggregator instance ID' })
  @IsUUID()
  sourceInstanceId!: string;

  @ApiProperty({ description: 'Destination aggregator instance ID' })
  @IsUUID()
  destinationInstanceId!: string;

  @ApiPropertyOptional({ description: 'Source table/object name (auto-discovered if not provided)' })
  @IsOptional()
  @IsString()
  sourceName?: string;

  @ApiPropertyOptional({ description: 'Destination table/object name (auto-discovered if not provided)' })
  @IsOptional()
  @IsString()
  destinationName?: string;

  @ApiPropertyOptional({ description: 'Mapping name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Mapping description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Natural language hint for mapping generation' })
  @IsOptional()
  @IsString()
  mappingHint?: string;

  @ApiPropertyOptional({ description: 'Save mapping after generation', default: true })
  @IsOptional()
  saveMapping?: boolean;
}
