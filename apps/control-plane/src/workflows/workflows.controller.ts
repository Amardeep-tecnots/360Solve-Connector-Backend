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
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiResponse } from '@nestjs/swagger';
import { WorkflowsService } from './workflows.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { WorkflowDefinitionDto } from './dto/workflow-definition.dto';
import {
  WorkflowListResponseDto,
  WorkflowDetailResponseDto,
  WorkflowValidationResponseDto,
} from './dto/workflow-response.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantMemberGuard } from '../common/guards/tenant-member.guard';
import { TenantId } from '../common/decorators/tenant-id.decorator';

@Controller('api/workflows')
@ApiTags('Workflows')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantMemberGuard)
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Get()
  @ApiResponse({ status: 200, type: WorkflowListResponseDto })
  async findAll(
    @TenantId() tenantId: string,
    @Query('status') status?: string,
  ) {
    const workflows = await this.workflowsService.findAll(tenantId, {
      status,
    });
    return { success: true, data: workflows };
  }

  @Get(':id')
  @ApiResponse({ status: 200, type: WorkflowDetailResponseDto })
  async findOne(@Param('id') id: string, @TenantId() tenantId: string) {
    const workflow = await this.workflowsService.findOne(id, tenantId);
    return { success: true, data: workflow };
  }

  @Post()
  @ApiResponse({ status: 201, type: WorkflowDetailResponseDto })
  async create(
    @TenantId() tenantId: string,
    @Body() dto: CreateWorkflowDto,
  ) {
    const workflow = await this.workflowsService.create(tenantId, dto);
    return { success: true, data: workflow };
  }

  @Put(':id')
  @ApiResponse({ status: 200, type: WorkflowDetailResponseDto })
  async update(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @Body() dto: UpdateWorkflowDto,
  ) {
    const workflow = await this.workflowsService.update(id, tenantId, dto);
    return { success: true, data: workflow };
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @TenantId() tenantId: string) {
    await this.workflowsService.delete(id, tenantId);
    return { success: true };
  }

  @Post('validate')
  @ApiResponse({ status: 200, type: WorkflowValidationResponseDto })
  async validate(
    @TenantId() tenantId: string,
    @Body() definition: WorkflowDefinitionDto,
  ) {
    const result = await this.workflowsService.validate(
      tenantId,
      definition as any,
    );
    return {
      success: true,
      data: {
        valid: result.valid,
        errors: result.errors,
        warnings: result.warnings,
        activitiesChecked: result.activitiesChecked,
        aggregatorsVerified: result.aggregatorsVerified,
      },
    };
  }
}
