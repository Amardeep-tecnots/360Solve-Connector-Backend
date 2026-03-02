import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WorkflowActivityResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() type!: string;
  @ApiProperty() name!: string;
  @ApiProperty() config!: Record<string, any>;
}

export class WorkflowStepResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() activityId!: string;
  @ApiProperty({ type: [String] }) dependsOn!: string[];
}

export class WorkflowDefinitionResponseDto {
  @ApiProperty() version!: string;
  @ApiProperty({ type: [WorkflowActivityResponseDto] }) activities!: WorkflowActivityResponseDto[];
  @ApiProperty({ type: [WorkflowStepResponseDto] }) steps!: WorkflowStepResponseDto[];
  @ApiPropertyOptional() schedule?: string;
}

export class WorkflowResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty() version!: number;
  @ApiProperty() hash!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() description?: string;
  @ApiProperty() definition!: WorkflowDefinitionResponseDto;
  @ApiProperty() status!: string;
  @ApiProperty() isActive!: boolean;
  @ApiPropertyOptional() schedule?: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiPropertyOptional() deprecatedAfter?: Date;
  @ApiPropertyOptional() forceCancelAfter?: Date;
}

export class WorkflowListResponseDto {
  @ApiProperty() success!: boolean;
  @ApiProperty({ type: [WorkflowResponseDto] }) data!: WorkflowResponseDto[];
}

export class WorkflowDetailResponseDto {
  @ApiProperty() success!: boolean;
  @ApiProperty({ type: WorkflowResponseDto }) data!: WorkflowResponseDto;
}

export class ValidationErrorDto {
  @ApiProperty() field!: string;
  @ApiProperty() message!: string;
}

export class WorkflowValidationDataDto {
  @ApiProperty() valid!: boolean;
  @ApiProperty({ type: [ValidationErrorDto] }) errors!: ValidationErrorDto[];
  @ApiProperty({ type: [String] }) warnings!: string[];
  @ApiProperty() activitiesChecked!: number;
  @ApiProperty({ type: [String] }) aggregatorsVerified!: string[];
}

export class WorkflowValidationResponseDto {
  @ApiProperty() success!: boolean;
  @ApiProperty({ type: WorkflowValidationDataDto }) data!: WorkflowValidationDataDto;
}
