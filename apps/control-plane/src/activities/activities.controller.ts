import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { ActivityExecutorService } from './services/activity-executor.service';
import { ActivityExecutionRequest, ActivityExecutionResult } from './entities/activity-result.types';

@Controller('activities')
export class ActivitiesController {
  constructor(private readonly executorService: ActivityExecutorService) {}

  @Post('execute')
  async executeActivity(@Body() request: ActivityExecutionRequest): Promise<ActivityExecutionResult> {
    return this.executorService.executeActivity(request);
  }

  @Post('validate')
  async validateActivity(
    @Body() body: { type: string; config: Record<string, any> }
  ): Promise<{ valid: boolean; errors?: string[] }> {
    return this.executorService.validateActivityConfig(body.type, body.config);
  }

  @Get('health')
  async healthCheck(): Promise<{ status: string; timestamp: Date }> {
    return {
      status: 'ok',
      timestamp: new Date(),
    };
  }
}
