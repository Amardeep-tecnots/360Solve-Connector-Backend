import { Module } from '@nestjs/common';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { WorkflowValidationService } from './services/workflow-validation.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [WorkflowsController],
  providers: [WorkflowsService, WorkflowValidationService, PrismaService],
  exports: [WorkflowsService, WorkflowValidationService],
})
export class WorkflowsModule {}
