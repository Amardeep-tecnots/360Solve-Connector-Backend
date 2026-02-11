import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiProperty, ApiPropertyOptional, ApiResponse } from '@nestjs/swagger';
import { IsOptional, IsNumber } from 'class-validator';
import { SchemaDiscoveryService } from './schema-discovery.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantMemberGuard } from '../common/guards/tenant-member.guard';
import { TenantId } from '../common/decorators/tenant-id.decorator';

class PreviewTableDto {
  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsNumber()
  limit?: number;
}

class SchemaDiscoveryResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  data: any;
}

@Controller('api/tenant-aggregators')
@ApiTags('SchemaDiscovery')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantMemberGuard)
export class SchemaDiscoveryController {
  constructor(private readonly schemaDiscoveryService: SchemaDiscoveryService) {}

  @Post(':id/discover')
  @ApiResponse({ status: 200, type: SchemaDiscoveryResponseDto })
  async discover(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.schemaDiscoveryService.discover(id, tenantId);
  }

  @Get(':id/schema')
  @ApiResponse({ status: 200, type: SchemaDiscoveryResponseDto })
  async getSchema(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.schemaDiscoveryService.getSchema(id, tenantId);
  }

  @Get(':id/schema/tables')
  @ApiResponse({ status: 200, type: SchemaDiscoveryResponseDto })
  async getTables(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.schemaDiscoveryService.getTables(id, tenantId);
  }

  @Get(':id/schema/tables/:tableName')
  @ApiResponse({ status: 200, type: SchemaDiscoveryResponseDto })
  async getTable(
    @Param('id') id: string,
    @Param('tableName') tableName: string,
    @TenantId() tenantId: string
  ) {
    return this.schemaDiscoveryService.getTable(id, tenantId, tableName);
  }

  @Get(':id/schema/relationships')
  @ApiResponse({ status: 200, type: SchemaDiscoveryResponseDto })
  async getRelationships(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.schemaDiscoveryService.getRelationships(id, tenantId);
  }

  @Post(':id/schema/preview')
  @ApiResponse({ status: 200, type: SchemaDiscoveryResponseDto })
  async previewTable(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @Body() body: PreviewTableDto,
    @Query('tableName') tableName: string
  ) {
    if (!tableName) {
      throw new NotFoundException('tableName query parameter is required');
    }
    return this.schemaDiscoveryService.previewTable(id, tenantId, tableName, body.limit || 10);
  }
}
