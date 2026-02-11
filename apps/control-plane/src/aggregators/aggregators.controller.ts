import {
  Controller,
  Get,
  Query,
  Param,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AggregatorsService } from './aggregators.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantMemberGuard } from '../common/guards/tenant-member.guard';
import { TenantId } from '../common/decorators/tenant-id.decorator';

@Controller('api/aggregators')
@ApiTags('Aggregators')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantMemberGuard)
export class AggregatorsController {
  constructor(private readonly aggregatorsService: AggregatorsService) {}

  @Get()
  async findAll(
    @TenantId() tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
  ) {
    return this.aggregatorsService.findAll(tenantId, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      category,
      search,
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const aggregator = await this.aggregatorsService.findOne(id);
    
    if (!aggregator) {
      throw new NotFoundException(`Aggregator with ID "${id}" not found`);
    }
    
    return { success: true, data: aggregator };
  }
}
