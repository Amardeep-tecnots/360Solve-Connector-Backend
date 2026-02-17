import { Module } from '@nestjs/common';
import { ConnectorsController, PublicConnectorsController } from './connectors.controller';
import { ConnectorsService } from './connectors.service';
import { MiniConnectorProxyService } from './mini-connector-proxy.service';
import { ConnectorApiKeyGuard } from './guards/connector-api-key.guard';
import { PrismaService } from '../prisma.service';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [WebsocketModule],
  controllers: [ConnectorsController, PublicConnectorsController],
  providers: [ConnectorsService, PrismaService, ConnectorApiKeyGuard, MiniConnectorProxyService],
})
export class ConnectorsModule {}
