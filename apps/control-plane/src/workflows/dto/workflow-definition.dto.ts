import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsArray, IsOptional, IsIn, ValidateNested, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

class ExtractConfigDto {
  @ApiProperty() @IsString() aggregatorInstanceId!: string;
  @ApiProperty() @IsString() table!: string;
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) columns!: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() where?: string;
  @ApiPropertyOptional() @IsOptional() limit?: number;
}

class TransformConfigDto {
  @ApiProperty({ description: 'JavaScript code to transform data' })
  @IsString()
  code!: string;
}

class LoadConfigDto {
  @ApiProperty() @IsString() aggregatorInstanceId!: string;
  @ApiProperty() @IsString() table!: string;
  @ApiProperty({ enum: ['insert', 'upsert', 'create'] })
  @IsIn(['insert', 'upsert', 'create'])
  mode!: 'insert' | 'upsert' | 'create';
  
  @ApiPropertyOptional()
  @IsOptional()
  conflictKey?: string | string[];
  
  @ApiPropertyOptional({ enum: ['replace', 'merge', 'skip'] })
  @IsOptional()
  @IsIn(['replace', 'merge', 'skip'])
  conflictResolution?: 'replace' | 'merge' | 'skip';
}

const WORKFLOW_ACTIVITY_TYPES = [
  'extract',
  'transform',
  'load',
  'filter',
  'join',
  'multi-extract',
  'multi-load',
  'sync',
  'mini-connector-source',
  'cloud-connector-source',
  'cloud-connector-sink',
] as const;

class ActivityDto {
  @ApiProperty() @IsString() id!: string;
  @ApiProperty({ enum: WORKFLOW_ACTIVITY_TYPES })
  @IsIn(WORKFLOW_ACTIVITY_TYPES as unknown as string[])
  type!: (typeof WORKFLOW_ACTIVITY_TYPES)[number];
  @ApiProperty() @IsString() name!: string;
  @ApiProperty() @IsObject() config!: Record<string, any>;
}

class WorkflowStepDto {
  @ApiProperty() @IsString() id!: string;
  @ApiProperty() @IsString() activityId!: string;
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) dependsOn!: string[];
}

export class WorkflowDefinitionDto {
  @ApiProperty({ default: '1.0' }) @IsString() version: string = '1.0';
  
  @ApiProperty({ type: [ActivityDto] })
  @ValidateNested({ each: true })
  @Type(() => ActivityDto)
  activities!: ActivityDto[];
  
  @ApiProperty({ type: [WorkflowStepDto] })
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepDto)
  steps!: WorkflowStepDto[];
  
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  schedule?: string;
}
