import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { MappingsService } from './mappings.service';
import {
  CreateMappingDto,
  UpdateMappingDto,
  MappingQueryDto,
} from './dto/create-mapping.dto';
import {
  GenerateMappingDto,
  QuickGenerateMappingDto,
  ApplyMappingDto,
  ValidateMappingDto,
} from './dto/generate-mapping.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantMemberGuard } from '../common/guards/tenant-member.guard';
import { TenantId } from '../common/decorators/tenant-id.decorator';

@ApiTags('Field Mappings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantMemberGuard)
@Controller('mappings')
export class MappingsController {
  constructor(private readonly mappingsService: MappingsService) {}

  // ============================================
  // CRUD Endpoints
  // ============================================

  @Post()
  @ApiOperation({ summary: 'Create a new field mapping' })
  @ApiResponse({ status: 201, description: 'Mapping created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 409, description: 'Mapping with this name already exists' })
  async create(@TenantId() tenantId: string, @Body() dto: CreateMappingDto) {
    return this.mappingsService.create(tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all field mappings' })
  @ApiResponse({ status: 200, description: 'List of mappings' })
  async findAll(@TenantId() tenantId: string, @Query() query: MappingQueryDto) {
    return this.mappingsService.findAll(tenantId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a field mapping by ID' })
  @ApiParam({ name: 'id', description: 'Mapping ID' })
  @ApiResponse({ status: 200, description: 'Mapping details' })
  @ApiResponse({ status: 404, description: 'Mapping not found' })
  async findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.mappingsService.findOne(id, tenantId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a field mapping' })
  @ApiParam({ name: 'id', description: 'Mapping ID' })
  @ApiResponse({ status: 200, description: 'Mapping updated successfully' })
  @ApiResponse({ status: 404, description: 'Mapping not found' })
  @ApiResponse({ status: 409, description: 'Mapping name already exists' })
  async update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMappingDto,
  ) {
    return this.mappingsService.update(id, tenantId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a field mapping' })
  @ApiParam({ name: 'id', description: 'Mapping ID' })
  @ApiResponse({ status: 204, description: 'Mapping deleted successfully' })
  @ApiResponse({ status: 404, description: 'Mapping not found' })
  async delete(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.mappingsService.delete(id, tenantId);
  }

  // ============================================
  // AI Generation Endpoints
  // ============================================

  @Post('generate')
  @ApiOperation({ summary: 'Generate field mapping using AI' })
  @ApiResponse({ status: 200, description: 'Mapping generated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async generateMapping(@TenantId() tenantId: string, @Body() dto: GenerateMappingDto) {
    return this.mappingsService.generateMapping(tenantId, dto);
  }

  @Post('generate/quick')
  @ApiOperation({ summary: 'Quick generate mapping from existing instances' })
  @ApiResponse({ status: 200, description: 'Mapping generated successfully' })
  @ApiResponse({ status: 404, description: 'Source or destination instance not found' })
  async quickGenerateMapping(@TenantId() tenantId: string, @Body() dto: QuickGenerateMappingDto) {
    return this.mappingsService.quickGenerateMapping(tenantId, dto);
  }

  // ============================================
  // Apply & Validate Endpoints
  // ============================================

  @Post('apply')
  @ApiOperation({ summary: 'Apply a mapping to data' })
  @ApiResponse({ status: 200, description: 'Mapping applied successfully' })
  @ApiResponse({ status: 404, description: 'Mapping not found' })
  async applyMapping(@Body() dto: ApplyMappingDto) {
    return this.mappingsService.applyMapping(dto);
  }

  @Post('validate')
  @ApiOperation({ summary: 'Validate a mapping' })
  @ApiResponse({ status: 200, description: 'Validation result' })
  @ApiResponse({ status: 404, description: 'Mapping not found' })
  async validateMapping(@TenantId() tenantId: string, @Body() dto: ValidateMappingDto) {
    return this.mappingsService.validateMapping(tenantId, dto);
  }

  // ============================================
  // Utility Endpoints
  // ============================================

  @Get('instance/:instanceId/available')
  @ApiOperation({ summary: 'Get available mappings for an instance' })
  @ApiParam({ name: 'instanceId', description: 'Aggregator instance ID' })
  @ApiResponse({ status: 200, description: 'List of available mappings' })
  async getAvailableMappings(
    @TenantId() tenantId: string,
    @Param('instanceId') instanceId: string,
  ) {
    return this.mappingsService.findAll(tenantId, {
      sourceInstanceId: instanceId,
      isActive: true,
    });
  }
}