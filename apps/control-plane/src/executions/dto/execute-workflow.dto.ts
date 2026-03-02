import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsObject, IsBoolean } from 'class-validator';

export class ExecuteWorkflowDto {
  @ApiPropertyOptional({ description: 'Optional execution trigger context' })
  @IsOptional()
  @IsObject()
  triggerContext?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Override workflow schedule for this run' })
  @IsOptional()
  @IsString()
  scheduledFor?: string;

  @ApiPropertyOptional({ description: 'Execute immediately vs queue', default: true })
  @IsOptional()
  @IsBoolean()
  immediate?: boolean;
}
