import { ApiProperty } from '@nestjs/swagger';
import { TenantTier, TenantStatus } from '@prisma/client';

export class TenantResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: TenantTier })
  tier: TenantTier;

  @ApiProperty({ enum: TenantStatus })
  status: TenantStatus;

  @ApiProperty()
  maxConcurrentWorkflows: number;

  @ApiProperty()
  maxJobsPerHour: number;

  @ApiProperty()
  maxConcurrentJobs: number;

  @ApiProperty()
  maxStorageGB: number;

  @ApiProperty()
  createdAt: Date;
}
