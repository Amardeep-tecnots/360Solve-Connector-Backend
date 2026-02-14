import { IsArray, IsInt, IsISO8601, IsOptional, IsString, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class HeartbeatDto {
  @ApiProperty({ description: 'Connector version' })
  @IsString()
  version: string;

  @ApiPropertyOptional({ description: 'CPU usage percentage (0-100)' })
  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  cpuUsage?: number;

  @ApiPropertyOptional({ description: 'Memory usage percentage (0-100)' })
  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  memoryUsage?: number;

  @ApiPropertyOptional({ description: 'Connector status (online|busy|offline)' })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'ISO timestamp from connector' })
  @IsISO8601()
  @IsOptional()
  timestamp?: string;

  @ApiPropertyOptional({ description: 'Supported aggregator types' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  supportedAggregators?: string[];

  @ApiPropertyOptional({ description: 'Job capacity' })
  @IsInt()
  @Min(0)
  @IsOptional()
  maxConcurrentJobs?: number;

  @ApiPropertyOptional({ description: 'OS Information' })
  @IsString()
  @IsOptional()
  os?: string;

  @ApiPropertyOptional({ description: 'IP Address' })
  @IsString()
  @IsOptional()
  ipAddress?: string;

  @ApiPropertyOptional({ description: 'Hostname' })
  @IsString()
  @IsOptional()
  hostname?: string;
}
