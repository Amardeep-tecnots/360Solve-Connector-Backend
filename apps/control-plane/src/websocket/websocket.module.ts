import { Module } from '@nestjs/common';
import { ConnectorGateway } from './gateway.gateway';
import { ConnectionManagerService } from './services/connection-manager.service';
import { CommandDispatcherService } from './services/command-dispatcher.service';
import { CommandQueueService } from './services/command-queue.service';
import { PrismaService } from '../prisma.service';

@Module({
  providers: [
    ConnectorGateway,
    ConnectionManagerService,
    CommandDispatcherService,
    CommandQueueService,
    PrismaService,
  ],
  exports: [
    ConnectorGateway,
    ConnectionManagerService,
    CommandDispatcherService,
    CommandQueueService,
  ],
})
export class WebsocketModule {}
