import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiResponse } from '@nestjs/swagger';
import { ExecutionsService } from './executions.service';
import { ExecuteWorkflowDto } from './dto/execute-workflow.dto';
import { ExecutionQueryDto } from './dto/execution-query.dto';
import {
  PauseExecutionDto,
  ResumeExecutionDto,
  CancelExecutionDto,
  ExecutionControlResponseDto,
} from './dto/execution-control.dto';
import {
  ExecutionListResponseDto,
  ExecutionDetailResponseDto,
  ExecutionTriggerResponseDto,
} from './dto/execution-response.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantMemberGuard } from '../common/guards/tenant-member.guard';
import { TenantId } from '../common/decorators/tenant-id.decorator';

@Controller('api')
@ApiTags('Executions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantMemberGuard)
export class ExecutionsController {
  constructor(private readonly executionsService: ExecutionsService) {}

  @Post('workflows/:id/execute')
  @ApiResponse({ status: 201, type: ExecutionTriggerResponseDto })
  async triggerWorkflow(
    @Param('id') workflowId: string,
    @TenantId() tenantId: string,
    @Body() dto: ExecuteWorkflowDto,
  ) {
    const result = await this.executionsService.triggerWorkflow(workflowId, tenantId, dto);
    return { success: true, data: result };
  }

  @Get('executions')
  @ApiResponse({ status: 200, type: ExecutionListResponseDto })
  async findAll(
    @TenantId() tenantId: string,
    @Query() query: ExecutionQueryDto,
  ) {
    const result = await this.executionsService.findAll(tenantId, query);
    return { success: true, ...result };
  }

  @Get('executions/:id')
  @ApiResponse({ status: 200, type: ExecutionDetailResponseDto })
  async findOne(
    @Param('id') executionId: string,
    @TenantId() tenantId: string,
  ) {
    const execution = await this.executionsService.findOne(executionId, tenantId);
    return { success: true, data: execution };
  }

  @Post('executions/:id/pause')
  @ApiResponse({ status: 200, type: ExecutionControlResponseDto })
  async pause(
    @Param('id') executionId: string,
    @TenantId() tenantId: string,
    @Body() dto: PauseExecutionDto,
  ) {
    const result = await this.executionsService.pauseExecution(executionId, tenantId, dto);
    return { success: true, data: result };
  }

  @Post('executions/:id/resume')
  @ApiResponse({ status: 200, type: ExecutionControlResponseDto })
  async resume(
    @Param('id') executionId: string,
    @TenantId() tenantId: string,
    @Body() dto: ResumeExecutionDto,
  ) {
    const result = await this.executionsService.resumeExecution(executionId, tenantId, dto);
    return { success: true, data: result };
  }

  @Post('executions/:id/cancel')
  @ApiResponse({ status: 200, type: ExecutionControlResponseDto })
  async cancel(
    @Param('id') executionId: string,
    @TenantId() tenantId: string,
    @Body() dto: CancelExecutionDto,
  ) {
    const result = await this.executionsService.cancelExecution(executionId, tenantId, dto);
    return { success: true, data: result };
  }
}
