import { Module } from '@nestjs/common';
import { ActivityExecutorService } from './services/activity-executor.service';
import { ExtractHandlerService } from './services/extract-handler.service';
import { TransformHandlerService } from './services/transform-handler.service';
import { LoadHandlerService } from './services/load-handler.service';
import { FilterHandlerService } from './services/filter-handler.service';
import { JoinHandlerService } from './services/join-handler.service';
import { ActivitiesController } from './activities.controller';
import { ConnectorClientService } from './handlers/connector-client.service';
import { DataTransformService } from './handlers/data-transform.service';
import { ExecutionStateService } from '../executions/services/execution-state.service';
import { PrismaService } from '../prisma.service';
import { AggregatorsModule } from '../aggregators/aggregators.module';
import { AIModule } from '../ai/ai.module';

@Module({
  imports: [AggregatorsModule, AIModule],
  controllers: [ActivitiesController],
  providers: [
    ActivityExecutorService,
    ExtractHandlerService,
    TransformHandlerService,
    LoadHandlerService,
    FilterHandlerService,
    JoinHandlerService,
    ConnectorClientService,
    DataTransformService,
    ExecutionStateService,
    PrismaService,
  ],
  exports: [
    ActivityExecutorService,
    ExtractHandlerService,
    TransformHandlerService,
    LoadHandlerService,
    FilterHandlerService,
    JoinHandlerService,
  ],
})
export class ActivitiesModule {}
