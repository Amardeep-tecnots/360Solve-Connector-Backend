import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

interface ConnectionInfo {
  socketId: string;
  tenantId: string;
  connectorId: string;
  apiKey: string;
  ip: string;
  userAgent: string;
  connectedAt: Date;
  lastHeartbeat: Date;
  systemInfo?: any;
  schema?: any;
}

@Injectable()
export class ConnectionManagerService {
  private readonly logger = new Logger(ConnectionManagerService.name);
  private readonly connections = new Map<string, ConnectionInfo>();
  private readonly HEARTBEAT_TIMEOUT = 90000; // 90 seconds

  constructor(private readonly prisma: PrismaService) {}

  async registerConnection(
    socketId: string,
    apiKey: string,
    metadata: { ip: string; userAgent: string }
  ): Promise<{ tenantId: string; connectorId: string } | null> {
    // Validate API key format first
    const keyParts = apiKey.split('_');
    if (keyParts.length !== 4 || keyParts[0] !== 'vmc') {
      return null;
    }

    const tenantId = keyParts[1];

    // Validate API key against database and find matching connector
    const connectors = await (this.prisma as any).connector.findMany({
      where: {
        tenantId,
        type: 'MINI',
        status: { in: ['OFFLINE', 'ONLINE'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    const bcrypt = require('bcrypt');
    let matchedConnector: { id: string } | null = null;

    for (const connector of connectors) {
      if (!connector.apiKeyHash) continue;
      const isValid = await bcrypt.compare(apiKey, connector.apiKeyHash);
      if (isValid) {
        matchedConnector = { id: connector.id };
        break;
      }
    }

    if (!matchedConnector) {
      this.logger.warn(`Invalid API key for tenant ${tenantId}`);
      return null;
    }

    // Allow multiple connectors per tenant; avoid duplicate for same connectorId
    const existingSameConnector = Array.from(this.connections.values()).find(
      (conn) => conn.connectorId === matchedConnector!.id,
    );

    if (existingSameConnector) {
      this.logger.warn(`Duplicate connection detected for connector ${matchedConnector.id}`);
      return null;
    }

    // Store connection
    this.connections.set(socketId, {
      socketId,
      tenantId,
      connectorId: matchedConnector.id,
      apiKey,
      ip: metadata.ip,
      userAgent: metadata.userAgent,
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
    });

    this.logger.log(`Registered connection: ${socketId} for connector ${matchedConnector.id} / tenant ${tenantId}`);
    return { tenantId, connectorId: matchedConnector.id };
  }

  async unregisterConnection(socketId: string): Promise<void> {
    const connection = this.connections.get(socketId);
    if (connection) {
      this.connections.delete(socketId);
      this.logger.log(`Unregistered connection: ${socketId}`);
    }
  }

  async updateHeartbeat(socketId: string, data: any): Promise<void> {
    const connection = this.connections.get(socketId);
    if (connection) {
      connection.lastHeartbeat = new Date();
      connection.systemInfo = data;
    }
  }

  async updateSchema(socketId: string, schema: any): Promise<void> {
    const connection = this.connections.get(socketId);
    if (connection) {
      connection.schema = schema;
      this.logger.log(`Schema updated for connection ${socketId}`);
    }
  }

  getConnection(socketId: string): ConnectionInfo | undefined {
    return this.connections.get(socketId);
  }

  getConnectionByTenant(tenantId: string): ConnectionInfo | undefined {
    return Array.from(this.connections.values()).find(
      (conn) => conn.tenantId === tenantId
    );
  }

  getAllConnections(): ConnectionInfo[] {
    return Array.from(this.connections.values());
  }

  getOnlineConnectors(tenantId: string): ConnectionInfo[] {
    return Array.from(this.connections.values()).filter(
      (conn) => conn.tenantId === tenantId
    );
  }

  async checkOfflineConnectors(): Promise<string[]> {
    const now = Date.now();
    const offline: string[] = [];

    for (const [socketId, connection] of this.connections.entries()) {
      const timeSinceHeartbeat = now - connection.lastHeartbeat.getTime();

      if (timeSinceHeartbeat > this.HEARTBEAT_TIMEOUT) {
        offline.push(socketId);
        this.connections.delete(socketId);
        this.logger.warn(`Connector ${socketId} marked as offline (no heartbeat)`);
      }
    }

    return offline;
  }

  async getConnectorStats(tenantId: string): Promise<{
    online: number;
    offline: number;
    lastHeartbeat: Date | null;
  }> {
    const connections = this.getOnlineConnectors(tenantId);
    const lastHeartbeat = connections.length > 0
      ? connections.reduce((latest, conn) => 
          conn.lastHeartbeat > latest ? conn.lastHeartbeat : latest, connections[0].lastHeartbeat)
      : null;

    return {
      online: connections.length,
      offline: 0, // TODO: Track offline connectors from database
      lastHeartbeat,
    };
  }
}
