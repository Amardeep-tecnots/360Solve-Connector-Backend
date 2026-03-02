import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ConnectorStatus, ConnectorType } from '@prisma/client';

export class ConnectorQueryDto {
  @ApiPropertyOptional({ enum: ConnectorStatus })
  @IsEnum(ConnectorStatus)
  @IsOptional()
  status?: ConnectorStatus;

  @ApiPropertyOptional({ enum: ConnectorType })
  @IsEnum(ConnectorType)
  @IsOptional()
  type?: ConnectorType;

  @ApiPropertyOptional({ description: 'Search by name' })
  @IsString()
  @IsOptional()
  search?: string;
}
