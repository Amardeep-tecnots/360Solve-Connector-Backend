import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Query,
  Param,
  Body,
  BadRequestException,
  NotFoundException,
  ConflictException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiProperty, ApiPropertyOptional, ApiResponse } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';
import { TenantAggregatorsService } from './tenant-aggregators.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantMemberGuard } from '../common/guards/tenant-member.guard';
import { TenantId } from '../common/decorators/tenant-id.decorator';

class InstallTenantAggregatorDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  aggregatorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  marketplaceId?: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  config?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  credentialId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  credentials?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  connectorId?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  testConnection?: boolean;
}

class UpdateTenantAggregatorDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  config?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  credentialId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  connectorId?: string;
}

class TenantAggregatorResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  aggregatorId: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  aggregatorName: string;

  @ApiPropertyOptional()
  aggregatorDescription?: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  category: string;

  @ApiProperty()
  type: string;

  @ApiPropertyOptional()
  logoUrl?: string;

  @ApiPropertyOptional()
  configSchema?: Record<string, any>;

  @ApiProperty()
  status: string;

  @ApiProperty()
  config: Record<string, any>;

  @ApiProperty()
  hasCredentials: boolean;

  @ApiPropertyOptional()
  lastTestAt?: Date;

  @ApiPropertyOptional()
  lastTestStatus?: string;

  @ApiPropertyOptional()
  lastTestError?: string;

  @ApiPropertyOptional()
  lastSyncAt?: Date;

  @ApiPropertyOptional()
  miniConnectorId?: string;

  @ApiProperty()
  installedAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

class TenantAggregatorListResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty({ type: [TenantAggregatorResponseDto] })
  data: TenantAggregatorResponseDto[];
}

class TenantAggregatorDetailResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty({ type: TenantAggregatorResponseDto })
  data: TenantAggregatorResponseDto;
}

@Controller('api/tenant-aggregators')
@ApiTags('TenantAggregators')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantMemberGuard)
export class TenantAggregatorsController {
  constructor(private readonly tenantAggregatorsService: TenantAggregatorsService) {}

  @Get()
  @ApiResponse({ status: 200, type: TenantAggregatorListResponseDto })
  async findAll(
    @TenantId() tenantId: string,
    @Query('aggregatorId') aggregatorId?: string,
  ) {
    return this.tenantAggregatorsService.findAll(tenantId, { aggregatorId });
  }

  @Get(':id')
  @ApiResponse({ status: 200, type: TenantAggregatorDetailResponseDto })
  async findOne(@Param('id') id: string, @TenantId() tenantId: string) {
    const aggregator = await this.tenantAggregatorsService.findOne(id, tenantId);
    
    if (!aggregator) {
      throw new NotFoundException(`Tenant aggregator with ID "${id}" not found`);
    }
    
    return { success: true, data: aggregator };
  }

  @Post('install')
  async install(
    @TenantId() tenantId: string,
    @Body() body: InstallTenantAggregatorDto,
  ) {
    const aggregatorId = body.aggregatorId ?? body.marketplaceId;
    if (!aggregatorId) {
      throw new BadRequestException('Missing required field: aggregatorId');
    }

    const result = await this.tenantAggregatorsService.install(
      tenantId,
      aggregatorId,
      body.name,
      body.config,
      body.credentialId,
      body.credentials,
      body.connectorId,
      body.testConnection,
    );
    
    return { success: true, data: result };
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @Body() body: UpdateTenantAggregatorDto,
  ) {
    const result = await this.tenantAggregatorsService.update(
      id,
      tenantId,
      body.name,
      body.config,
      body.credentialId,
      body.connectorId,
    );
    
    return { success: true, data: result };
  }

  @Post(':id/test')
  async testConnection(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @Body() body?: { credentials?: Record<string, string> },
  ) {
    return this.tenantAggregatorsService.testConnection(
      id,
      tenantId,
    );
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.tenantAggregatorsService.delete(id, tenantId);
  }
}
