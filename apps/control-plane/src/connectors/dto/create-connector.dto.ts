import { IsString, IsEnum, IsOptional, IsArray, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConnectorType, NetworkAccessType } from '@prisma/client';

export class CreateConnectorDto {
  @ApiProperty({ description: 'Name of the connector' })
  @IsString()
  name: string;

  @ApiProperty({ enum: ConnectorType, description: 'Type of connector (CLOUD or MINI)' })
  @IsEnum(ConnectorType)
  type: ConnectorType;

  @ApiPropertyOptional({ enum: NetworkAccessType, default: NetworkAccessType.LOCAL })
  @IsEnum(NetworkAccessType)
  @IsOptional()
  networkAccess?: NetworkAccessType;

  @ApiPropertyOptional({ description: 'Supported aggregator types' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  supportedAggregators?: string[];
}
