import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ConnectionManagerService } from './services/connection-manager.service';
import { CommandDispatcherService } from './services/command-dispatcher.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/connectors',
})
export class ConnectorGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ConnectorGateway.name);

  constructor(
    private readonly connectionManager: ConnectionManagerService,
    private readonly commandDispatcher: CommandDispatcherService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const apiKey = client.handshake.auth.apiKey;

      if (!apiKey) {
        this.logger.warn(`Connection rejected: No API key provided`);
        client.disconnect();
        return;
      }

      // Validate API key and register connection
      const registration = await this.connectionManager.registerConnection(client, apiKey, {
        ip: client.handshake.address,
        userAgent: client.handshake.headers['user-agent'],
      });

      if (!registration) {
        this.logger.warn(`Connection rejected: Invalid API key`);
        client.disconnect();
        return;
      }

      this.logger.log(`Connector connected: ${client.id} for tenant ${registration.tenantId}`);

      // Send authentication confirmation (mini-connector expects this event)
      client.emit('authenticated', {
        status: 'connected',
        tenantId: registration.tenantId,
        connectorId: registration.connectorId,
        timestamp: new Date(),
      });

    } catch (error) {
      this.logger.error(`Connection error: ${error.message}`, error.stack);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`Connector disconnected: ${client.id}`);
    await this.connectionManager.unregisterConnection(client.id);
  }

  @SubscribeMessage('heartbeat')
  async handleHeartbeat(
    @MessageBody() data: any,
    @ConnectedSocket() client: Socket,
  ) {
    await this.connectionManager.updateHeartbeat(client.id, data);

    // Acknowledge heartbeat
    return {
      received: true,
      timestamp: new Date(),
    };
  }

  @SubscribeMessage('command:response')
  async handleCommandResponse(
    @MessageBody() data: any,
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(`Command response received from ${client.id}: ${data.commandId}`);

    // Forward response to command dispatcher
    await this.commandDispatcher.handleResponse(data.commandId, data.response);

    return {
      acknowledged: true,
    };
  }

  @SubscribeMessage('schema:discovered')
  async handleSchemaDiscovered(
    @MessageBody() data: any,
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(`Schema discovered from ${client.id}`);

    // Store schema for tenant
    await this.connectionManager.updateSchema(client.id, data.schema);

    return {
      acknowledged: true,
    };
  }
}
