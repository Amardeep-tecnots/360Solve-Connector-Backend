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
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiResponse, ApiBody } from '@nestjs/swagger';
import { ConnectorsService } from './connectors.service';
import { MiniConnectorProxyService } from './mini-connector-proxy.service';
import { CreateConnectorDto } from './dto/create-connector.dto';
import { UpdateConnectorDto } from './dto/update-connector.dto';
import { ConnectorQueryDto } from './dto/connector-query.dto';
import { ConnectorListResponseDto, ConnectorResponseDto } from './dto/connector-response.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { ValidateApiKeyDto } from './dto/validate-api-key.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantMemberGuard } from '../common/guards/tenant-member.guard';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { ConnectorApiKeyGuard } from './guards/connector-api-key.guard';

@Controller('api/connectors')
@ApiTags('Connectors')
@ApiBearerAuth()
export class ConnectorsController {
  constructor(
    private readonly connectorsService: ConnectorsService,
    private readonly miniConnectorProxyService: MiniConnectorProxyService,
  ) {}

  @Get('mini/:id/databases')
  @ApiResponse({ status: 200 })
  @UseGuards(JwtAuthGuard, TenantMemberGuard)
  async getMiniDatabases(
    @Param('id') id: string,
    @TenantId() tenantId: string,
  ) {
    const data = await this.miniConnectorProxyService.getDatabases(tenantId, id);
    return { success: true, data };
  }

  @Get('mini/:id/tables')
  @ApiResponse({ status: 200 })
  @UseGuards(JwtAuthGuard, TenantMemberGuard)
  async getMiniTables(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @Query('database') database: string,
  ) {
    if (!database) throw new BadRequestException('Database parameter is required');
    const data = await this.miniConnectorProxyService.getTables(tenantId, id, database);
    return { success: true, data };
  }

  @Get('mini/:id/columns')
  @ApiResponse({ status: 200 })
  @UseGuards(JwtAuthGuard, TenantMemberGuard)
  async getMiniColumns(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @Query('database') database: string,
    @Query('table') table: string,
  ) {
    if (!database || !table) throw new BadRequestException('Database and table parameters are required');
    const data = await this.miniConnectorProxyService.getColumns(tenantId, id, database, table);
    return { success: true, data };
  }

  @Post()
  @ApiResponse({ status: 201, type: ConnectorResponseDto })
  @UseGuards(JwtAuthGuard, TenantMemberGuard)
  async create(
    @TenantId() tenantId: string,
    @Body() createConnectorDto: CreateConnectorDto,
  ) {
    const result = await this.connectorsService.create(tenantId, createConnectorDto);
    return { success: true, data: result };
  }

  @Get()
  @ApiResponse({ status: 200, type: ConnectorListResponseDto })
  @UseGuards(JwtAuthGuard, TenantMemberGuard)
  async findAll(
    @TenantId() tenantId: string,
    @Query() query: ConnectorQueryDto,
  ) {
    const data = await this.connectorsService.findAll(tenantId, query);
    return { success: true, data };
  }

  @Get(':id')
  @ApiResponse({ status: 200, type: ConnectorResponseDto })
  @UseGuards(JwtAuthGuard, TenantMemberGuard)
  async findOne(
    @Param('id') id: string,
    @TenantId() tenantId: string,
  ) {
    const data = await this.connectorsService.findOne(id, tenantId);
    return { success: true, data };
  }

  @Put(':id')
  @ApiResponse({ status: 200, type: ConnectorResponseDto })
  @UseGuards(JwtAuthGuard, TenantMemberGuard)
  async update(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @Body() updateConnectorDto: UpdateConnectorDto,
  ) {
    const data = await this.connectorsService.update(id, tenantId, updateConnectorDto);
    return { success: true, data };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, TenantMemberGuard)
  async remove(
    @Param('id') id: string,
    @TenantId() tenantId: string,
  ) {
    await this.connectorsService.remove(id, tenantId);
    return { success: true };
  }

  @Post(':id/heartbeat')
  @ApiResponse({ status: 200, type: ConnectorResponseDto })
  @UseGuards(ConnectorApiKeyGuard)
  async heartbeat(
    @Param('id') id: string,
    @Body() heartbeatDto: HeartbeatDto,
  ) {
    const data = await this.connectorsService.heartbeat(id, heartbeatDto);
    return { success: true, data };
  }
}

// Public controller for API key validation (no auth required)
@Controller('api/public/connectors')
@ApiTags('Public Connectors')
export class PublicConnectorsController {
  constructor(private readonly connectorsService: ConnectorsService) {}

  @Post('validate-api-key')
  @ApiBody({ type: ValidateApiKeyDto })
  @ApiResponse({ status: 200, description: 'Validates API key and returns tenant info' })
  async validateApiKey(@Body() dto: ValidateApiKeyDto) {
    const result = await this.connectorsService.validateApiKey(dto.apiKey);
    return { success: true, data: result };
  }
}
