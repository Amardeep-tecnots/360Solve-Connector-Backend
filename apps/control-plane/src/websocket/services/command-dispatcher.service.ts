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
  private readonly responseEmitters = new Map<string, (response: any) => void>();
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 5000; // 5 seconds

  constructor(
    private readonly connectionManager: ConnectionManagerService,
    private readonly commandQueue: CommandQueueService,
  ) {}

  async dispatchCommand(
    tenantId: string,
    command: string,
    payload: any,
    connectorId?: string
  ): Promise<{ success: boolean; commandId: string }> {
    const commandId = `${command}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Check if connector is online
    let connection;
    if (connectorId) {
      connection = this.connectionManager.getConnectionByConnectorId(connectorId);
    } else {
      connection = this.connectionManager.getConnectionByTenant(tenantId);
    }

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
      this.logger.log(`Dispatching command ${commandId} to connector ${connection.socketId}`);

      const message = {
        commandId,
        executionId: commandId, // Simple 1:1 mapping for now
        activityId: `act_${Date.now()}`,
        operation: command, // 'query', etc.
        payload // { query: { ... }, connectionId: ... }
      };

      const sent = this.connectionManager.sendMessage(connection.socketId, 'command', message);

      if (!sent) {
        throw new Error('Socket not connected or message failed to send');
      }

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
    // Check if there is a waiting promise
    const emitter = this.responseEmitters.get(commandId);
    if (emitter) {
      emitter(response);
      this.responseEmitters.delete(commandId);
    }

    const pending = this.pendingCommands.get(commandId);

    if (!pending) {
      this.logger.warn(`Received response for unknown command: ${commandId}`);
      return;
    }

    this.logger.log(`Received response for command ${commandId}`);

    pending.status = 'completed';
    this.pendingCommands.set(commandId, pending);

    // TODO: Process response and update execution state
    // Maybe emit an event or call ExecutionOrchestrator
  }

  async dispatchCommandAndWait<T>(
    tenantId: string,
    command: string,
    payload: any,
    timeoutMs: number = 10000,
    connectorId?: string
  ): Promise<T> {
    const result = await this.dispatchCommand(tenantId, command, payload, connectorId);

    if (!result.success) {
      throw new Error(`Failed to dispatch command: ${result.commandId}`);
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.responseEmitters.delete(result.commandId);
        reject(new Error(`Command ${result.commandId} timed out`));
      }, timeoutMs);

      this.responseEmitters.set(result.commandId, (response) => {
        clearTimeout(timeout);
        resolve(response);
      });
    });
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
