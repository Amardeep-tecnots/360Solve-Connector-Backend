import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ActivityExecutionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() activityId!: string;
  @ApiProperty() status!: string;
  @ApiProperty() attempt!: number;
  @ApiPropertyOptional() output?: any;
  @ApiPropertyOptional() errorMessage?: string;
  @ApiPropertyOptional() errorRetryable?: boolean;
  @ApiProperty() startedAt!: Date;
  @ApiPropertyOptional() completedAt?: Date;
}

export class ExecutionEventResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() timestamp!: Date;
  @ApiProperty() eventType!: string;
  @ApiProperty() payload!: Record<string, any>;
}

export class ExecutionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() tenantId!: string;
  @ApiProperty() workflowId!: string;
  @ApiProperty() workflowVersion!: number;
  @ApiProperty() workflowHash!: string;
  @ApiProperty() status!: string;
  @ApiPropertyOptional() currentStepId?: string;
  @ApiProperty() activities!: ActivityExecutionResponseDto[];
  @ApiProperty() events!: ExecutionEventResponseDto[];
  @ApiProperty() startedAt!: Date;
  @ApiPropertyOptional() completedAt?: Date;
  @ApiPropertyOptional() errorMessage?: string;
}

export class ExecutionListResponseDto {
  @ApiProperty() success!: boolean;
  @ApiProperty() data!: ExecutionResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() offset!: number;
}

export class ExecutionDetailResponseDto {
  @ApiProperty() success!: boolean;
  @ApiProperty() data!: ExecutionResponseDto;
}

export class ExecutionTriggerResponseDto {
  @ApiProperty() success!: boolean;
  @ApiProperty() data!: {
    executionId: string;
    status: string;
    message: string;
  };
}
