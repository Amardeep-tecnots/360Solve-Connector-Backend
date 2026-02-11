import { Module } from '@nestjs/common';
import { ExecutionsController } from './executions.controller';
import { ExecutionsService } from './executions.service';
import { ExecutionStateService } from './services/execution-state.service';
import { ExecutionOrchestratorService } from './services/execution-orchestrator.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [ExecutionsController],
  providers: [
    ExecutionsService,
    ExecutionStateService,
    ExecutionOrchestratorService,
    PrismaService,
  ],
  exports: [ExecutionsService, ExecutionStateService],
})
export class ExecutionsModule {}
