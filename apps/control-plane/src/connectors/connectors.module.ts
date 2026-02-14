import { Module } from '@nestjs/common';
import { ConnectorsController, PublicConnectorsController } from './connectors.controller';
import { ConnectorsService } from './connectors.service';
import { ConnectorApiKeyGuard } from './guards/connector-api-key.guard';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [ConnectorsController, PublicConnectorsController],
  providers: [ConnectorsService, PrismaService, ConnectorApiKeyGuard],
})
export class ConnectorsModule {}
