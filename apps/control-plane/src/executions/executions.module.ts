import { Module } from '@nestjs/common';
import { ExecutionsController } from './executions.controller';
import { ExecutionsService } from './executions.service';
import { ActivityDispatcherService } from './services/activity-dispatcher.service';
import { ExecutionStateService } from './services/execution-state.service';
import { ExecutionOrchestratorService } from './services/execution-orchestrator.service';
import { PrismaService } from '../prisma.service';
import { ActivitiesModule } from '../activities/activities.module';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [ActivitiesModule, WebsocketModule],
  controllers: [ExecutionsController],
  providers: [
    ExecutionsService,
    ActivityDispatcherService,
    ExecutionStateService,
    ExecutionOrchestratorService,
    PrismaService,
  ],
  exports: [ExecutionsService, ExecutionStateService],
})
export class ExecutionsModule {}
