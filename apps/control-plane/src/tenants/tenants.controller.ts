import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantResponseDto } from './dto/tenant-response.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantMemberGuard } from '../common/guards/tenant-member.guard';
import { TenantId } from '../common/decorators/tenant-id.decorator';

@ApiTags('Tenants')
@Controller('api/tenants')
@UseGuards(JwtAuthGuard, TenantMemberGuard)
@ApiBearerAuth()
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get('current')
  @ApiResponse({ status: 200, type: TenantResponseDto })
  async getCurrent(@TenantId() tenantId: string) {
    const tenant = await this.tenantsService.findOne(tenantId);
    return { success: true, data: tenant };
  }

  @Put('current')
  @ApiResponse({ status: 200, type: TenantResponseDto })
  async updateCurrent(
    @TenantId() tenantId: string,
    @Body() dto: UpdateTenantDto,
  ) {
    const tenant = await this.tenantsService.update(tenantId, dto);
    return { success: true, data: tenant };
  }
}
