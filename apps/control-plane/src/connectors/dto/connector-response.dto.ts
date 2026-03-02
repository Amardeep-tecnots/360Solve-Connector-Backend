import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConnectorStatus, ConnectorType, NetworkAccessType } from '@prisma/client';

export class ConnectorResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: ConnectorType })
  type: ConnectorType;

  @ApiProperty({ enum: ConnectorStatus })
  status: ConnectorStatus;

  @ApiProperty({ nullable: true })
  lastHeartbeat: Date | null;

  @ApiProperty({ nullable: true })
  ipAddress: string | null;

  @ApiProperty({ nullable: true })
  version: string | null;

  @ApiProperty({ enum: NetworkAccessType })
  networkAccess: NetworkAccessType;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiPropertyOptional({ description: 'API Key (only returned on creation for Mini connectors)' })
  apiKey?: string;
}

export class ConnectorListResponseDto {
  @ApiProperty({ type: [ConnectorResponseDto] })
  data: ConnectorResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}
