import { Injectable, Logger } from '@nestjs/common';
import { ConnectionManagerService } from './connection-manager.service';
import { CommandQueueService } from './command-queue.service';

interface PendingCommand {
  id: string;
  tenantId: string;
  command: string;
  payload: any;
  createdAt: Date;
  attempts: number;
  status: 'pending' | 'sent' | 'completed' | 'failed';
}

@Injectable()
export class CommandDispatcherService {
  private readonly logger = new Logger(CommandDispatcherService.name);
  private readonly pendingCommands = new Map<string, PendingCommand>();
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 5000; // 5 seconds

  constructor(
    private readonly connectionManager: ConnectionManagerService,
    private readonly commandQueue: CommandQueueService,
  ) {}

  async dispatchCommand(
    tenantId: string,
    command: string,
    payload: any
  ): Promise<{ success: boolean; commandId: string }> {
    const commandId = `${command}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Check if connector is online
    const connection = this.connectionManager.getConnectionByTenant(tenantId);

    if (!connection) {
      // Queue command for later
      this.logger.log(`Connector offline, queuing command ${commandId}`);
      await this.commandQueue.enqueue(tenantId, commandId, command, payload);

      return {
        success: false,
        commandId,
      };
    }

    // Send command to connector
    try {
      // TODO: Actually send via socket.io
      this.logger.log(`Dispatching command ${commandId} to connector ${connection.socketId}`);

      this.pendingCommands.set(commandId, {
        id: commandId,
        tenantId,
        command,
        payload,
        createdAt: new Date(),
        attempts: 1,
        status: 'sent',
      });

      return {
        success: true,
        commandId,
      };

    } catch (error) {
      this.logger.error(`Failed to dispatch command ${commandId}: ${error.message}`);

      // Queue for retry
      await this.commandQueue.enqueue(tenantId, commandId, command, payload);

      return {
        success: false,
        commandId,
      };
    }
  }

  async handleResponse(commandId: string, response: any): Promise<void> {
    const pending = this.pendingCommands.get(commandId);

    if (!pending) {
      this.logger.warn(`Received response for unknown command: ${commandId}`);
      return;
    }

    this.logger.log(`Received response for command ${commandId}`);

    pending.status = 'completed';
    this.pendingCommands.set(commandId, pending);

    // TODO: Process response and update execution state
  }

  async retryFailedCommands(): Promise<void> {
    const now = Date.now();

    for (const [commandId, command] of this.pendingCommands.entries()) {
      if (command.status !== 'pending' && command.status !== 'sent') {
        continue;
      }

      // Check if retry delay has passed
      const timeSinceCreation = now - command.createdAt.getTime();
      const retryDelay = command.attempts * this.RETRY_DELAY;

      if (timeSinceCreation < retryDelay) {
        continue;
      }

      // Check max retries
      if (command.attempts >= this.MAX_RETRIES) {
        this.logger.error(`Command ${commandId} failed after ${this.MAX_RETRIES} attempts`);
        command.status = 'failed';
        this.pendingCommands.set(commandId, command);
        continue;
      }

      // Retry command
      this.logger.log(`Retrying command ${commandId} (attempt ${command.attempts + 1})`);

      const result = await this.dispatchCommand(command.tenantId, command.command, command.payload);

      if (result.success) {
        command.attempts++;
        command.status = 'sent';
        this.pendingCommands.set(commandId, command);
      }
    }
  }

  async processQueuedCommands(tenantId: string): Promise<void> {
    const queuedCommands = await this.commandQueue.dequeue(tenantId);

    for (const queued of queuedCommands) {
      this.logger.log(`Processing queued command ${queued.commandId}`);

      const result = await this.dispatchCommand(tenantId, queued.command, queued.payload);

      if (!result.success) {
        // Re-queue
        await this.commandQueue.enqueue(tenantId, queued.commandId, queued.command, queued.payload);
      }
    }
  }

  getPendingCommands(tenantId: string): PendingCommand[] {
    return Array.from(this.pendingCommands.values()).filter(
      (cmd) => cmd.tenantId === tenantId
    );
  }
}
