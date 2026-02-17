import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { CommandDispatcherService } from '../websocket/services/command-dispatcher.service';
import { PrismaService } from '../prisma.service';

@Injectable()
export class MiniConnectorProxyService {
  private readonly logger = new Logger(MiniConnectorProxyService.name);

  constructor(
    private readonly commandDispatcher: CommandDispatcherService,
    private readonly prisma: PrismaService,
  ) {}

  async getDatabases(tenantId: string, connectorId: string) {
    return this.sendCommand(tenantId, connectorId, 'get-databases', {});
  }

  async getTables(tenantId: string, connectorId: string, database: string) {
    return this.sendCommand(tenantId, connectorId, 'get-tables', { database });
  }

  async getColumns(tenantId: string, connectorId: string, database: string, table: string) {
    return this.sendCommand(tenantId, connectorId, 'get-columns', { database, table });
  }

  private async sendCommand(tenantId: string, connectorId: string, command: string, payload: any) {
    // Validate connector exists and belongs to tenant
    const connector = await (this.prisma as any).connector.findFirst({
        where: { id: connectorId, tenantId },
    });

    if (!connector) {
        throw new NotFoundException(`Connector ${connectorId} not found`);
    }

    try {
        const response = await this.commandDispatcher.dispatchCommandAndWait(
            tenantId,
            command,
            payload,
            10000,
            connectorId
        );
        return response;
    } catch (error) {
        this.logger.error(`Failed to execute ${command} on connector ${connectorId}: ${error.message}`);
        throw new BadRequestException(`Failed to execute command on connector: ${error.message}`);
    }
  }
}
