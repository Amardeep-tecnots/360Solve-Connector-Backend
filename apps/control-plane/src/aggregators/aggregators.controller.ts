import { Body, Controller, Delete, Get, Headers, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AggregatorsService } from './aggregators.service';

@ApiTags('Aggregators')
@Controller()
export class AggregatorsController {
  constructor(private readonly service: AggregatorsService) {}

  private getTenantId(headers: Record<string, string | string[]>) {
    const tenant = headers['x-tenant-id'];
    if (Array.isArray(tenant)) return tenant[0];
    return tenant || '';
  }

  // Marketplace: list aggregators
  @Get('aggregators')
  async listAggregators(
    @Headers() headers: Record<string, string>,
    @Query('category') category?: string,
    @Query('search') search?: string,
  ) {
    const tenantId = this.getTenantId(headers);
    return this.service.listAggregators(tenantId, category, search);
  }

  // Marketplace: get aggregator detail
  @Get('aggregators/:id')
  async getAggregator(@Headers() headers: Record<string, string>, @Param('id') id: string) {
    const tenantId = this.getTenantId(headers);
    return this.service.getAggregator(tenantId, id);
  }

  // Install aggregator for tenant
  @Post('aggregators/:id/install')
  async install(
    @Headers() headers: Record<string, string>,
    @Param('id') id: string,
    @Body() body: { name: string },
  ) {
    const tenantId = this.getTenantId(headers);
    return this.service.installAggregator(tenantId, id, body?.name);
  }

  // Tenant aggregators list
  @Get('tenant-aggregators')
  async listTenantAggregators(
    @Headers() headers: Record<string, string>,
    @Query('aggregatorId') aggregatorId?: string,
  ) {
    const tenantId = this.getTenantId(headers);
    return this.service.listTenantAggregators(tenantId, aggregatorId);
  }

  // Tenant aggregator detail
  @Get('tenant-aggregators/:id')
  async getTenantAggregator(@Headers() headers: Record<string, string>, @Param('id') id: string) {
    const tenantId = this.getTenantId(headers);
    return this.service.getTenantAggregator(tenantId, id);
  }

  // Save credentials / configure
  @Put('tenant-aggregators/:id/credentials')
  async saveCredentials(
    @Headers() headers: Record<string, string>,
    @Param('id') id: string,
    @Body() body: { name?: string; credentials: Record<string, any> },
  ) {
    const tenantId = this.getTenantId(headers);
    return this.service.updateCredentials(tenantId, id, body?.name, body?.credentials || {});
  }

  // Test connection
  @Post('tenant-aggregators/:id/test')
  async test(
    @Headers() headers: Record<string, string>,
    @Param('id') id: string,
    @Body() body: { credentials?: Record<string, any> },
  ) {
    const tenantId = this.getTenantId(headers);
    return this.service.testConnection(tenantId, id, body?.credentials);
  }

  // Delete tenant aggregator
  @Delete('tenant-aggregators/:id')
  async delete(@Headers() headers: Record<string, string>, @Param('id') id: string) {
    const tenantId = this.getTenantId(headers);
    return this.service.deleteTenantAggregator(tenantId, id);
  }
}
