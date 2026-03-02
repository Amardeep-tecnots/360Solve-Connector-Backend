import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class PauseExecutionDto {
  @ApiPropertyOptional({ description: 'Reason for pausing' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ResumeExecutionDto {
  @ApiPropertyOptional({ description: 'Resume context' })
  @IsOptional()
  @IsString()
  context?: string;
}

export class CancelExecutionDto {
  @ApiPropertyOptional({ description: 'Reason for cancellation' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ExecutionControlResponseDto {
  @ApiProperty() success!: boolean;
  @ApiProperty() data!: {
    executionId: string;
    previousStatus: string;
    currentStatus: string;
    message: string;
  };
}
