import { PartialType } from '@nestjs/swagger';
import { CreateConnectorDto } from './create-connector.dto';
import { IsOptional, IsString, IsInt, IsEnum } from 'class-validator';
import { ConnectorStatus } from '@prisma/client';

export class UpdateConnectorDto extends PartialType(CreateConnectorDto) {
  @IsOptional()
  @IsEnum(ConnectorStatus)
  status?: ConnectorStatus;

  @IsOptional()
  @IsString()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  hostname?: string;

  @IsOptional()
  @IsString()
  version?: string;

  @IsOptional()
  @IsString()
  os?: string;

  @IsOptional()
  @IsInt()
  cpuUsage?: number;

  @IsOptional()
  @IsInt()
  memoryUsage?: number;
}
