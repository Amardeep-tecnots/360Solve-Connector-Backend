import { Injectable, Logger } from '@nestjs/common';

interface QueuedCommand {
  commandId: string;
  tenantId: string;
  command: string;
  payload: any;
  queuedAt: Date;
}

@Injectable()
export class CommandQueueService {
  private readonly logger = new Logger(CommandQueueService.name);
  private readonly queues = new Map<string, QueuedCommand[]>();

  async enqueue(
    tenantId: string,
    commandId: string,
    command: string,
    payload: any
  ): Promise<void> {
    if (!this.queues.has(tenantId)) {
      this.queues.set(tenantId, []);
    }

    const queue = this.queues.get(tenantId)!;
    queue.push({
      commandId,
      tenantId,
      command,
      payload,
      queuedAt: new Date(),
    });

    this.logger.log(`Enqueued command ${commandId} for tenant ${tenantId} (queue size: ${queue.length})`);
  }

  async dequeue(tenantId: string): Promise<QueuedCommand[]> {
    const queue = this.queues.get(tenantId);
    if (!queue || queue.length === 0) {
      return [];
    }

    const commands = [...queue];
    this.queues.set(tenantId, []);

    this.logger.log(`Dequeued ${commands.length} commands for tenant ${tenantId}`);
    return commands;
  }

  async remove(commandId: string): Promise<boolean> {
    for (const [tenantId, queue] of this.queues.entries()) {
      const index = queue.findIndex((cmd) => cmd.commandId === commandId);
      if (index !== -1) {
        queue.splice(index, 1);
        this.logger.log(`Removed command ${commandId} from queue`);
        return true;
      }
    }

    return false;
  }

  getQueueSize(tenantId: string): number {
    return this.queues.get(tenantId)?.length || 0;
  }

  getAllQueues(): { tenantId: string; size: number }[] {
    return Array.from(this.queues.entries()).map(([tenantId, queue]) => ({
      tenantId,
      size: queue.length,
    }));
  }

  async clearQueue(tenantId: string): Promise<void> {
    this.queues.delete(tenantId);
    this.logger.log(`Cleared queue for tenant ${tenantId}`);
  }
}
