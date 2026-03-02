import { EventEmitter } from 'events';
import { WebSocketService } from './websocket-client.service';
import { QueryExecutorService } from './query-executor.service';
import { OfflineQueueService } from './offline-queue.service';
import { SettingsService } from './settings.service';
import { CredentialVaultService } from './credential-vault.service';

export class CommandOrchestratorService extends EventEmitter {
  private activeCommands = 0;

  constructor(
    private readonly webSocketService: WebSocketService,
    private readonly queryExecutorService: QueryExecutorService,
    private readonly offlineQueueService: OfflineQueueService,
    private readonly settingsService: SettingsService,
    private readonly credentialVaultService: CredentialVaultService
  ) {
    super();
    this.setupListeners();
  }

  private setupListeners() {
    this.webSocketService.on('command', this.handleCommand.bind(this));
    this.webSocketService.on('connected', this.processOfflineQueue.bind(this));
  }

  getActiveCommandCount(): number {
    return this.activeCommands;
  }

  private async handleCommand(command: any) {
    console.log('[CommandOrchestrator] Handling command:', command.commandId);
    this.activeCommands++;
    const { commandId, executionId, activityId, payload } = command;

    try {
      // 1. Deduplication
      if (this.offlineQueueService.hasExecuted(commandId)) {
        console.log('[CommandOrchestrator] Command already executed, returning cached result');
        const cachedResult = this.offlineQueueService.getCheckResult(commandId);
        if (cachedResult) {
          try {
            this.webSocketService.sendCommandResponse(commandId, cachedResult);
          } catch (e) {
            console.error('[CommandOrchestrator] Failed to send cached response:', e);
          }
        }
        return;
      }

      try {
        // 2. Resolve Connection
        // Payload should contain connectionId or we use the first available one
        let aggregatorId = payload.connectionId;
        let aggregator;

        if (aggregatorId) {
          aggregator = this.settingsService.getAggregatorById(aggregatorId);
        } else {
          const aggregators = this.settingsService.getAggregators();
          if (aggregators.length > 0) {
            aggregator = aggregators[0];
            console.log('[CommandOrchestrator] No connectionId provided, using default:', aggregator.name);
          }
        }

        if (!aggregator) {
          throw new Error('No valid database connection found');
        }

        const credentials = await this.credentialVaultService.retrieveCredentials(aggregator.credentialId);
        if (!credentials) {
          throw new Error(`Credentials not found for connection: ${aggregator.name}`);
        }

        const dbConfig: any = {
          type: aggregator.type,
          host: aggregator.host,
          port: aggregator.port,
          database: aggregator.database,
          username: credentials.username!,
          password: (credentials as any).password!,
        };

        // 3. Execute
        console.log('[CommandOrchestrator] Executing operation:', command.operation || 'query', 'on:', aggregator.name);
        
        let result;
        const operation = command.operation || 'query';

        if (operation === 'query') {
            this.emit('command:start', { commandId, executionId, activityId, query: payload.query });
        }

        const startTime = Date.now();
        
        switch (operation) {
          case 'get-databases':
            result = await this.queryExecutorService.getDatabases(dbConfig);
            break;
          case 'get-tables':
            result = await this.queryExecutorService.getTables(dbConfig, payload.database);
            break;
          case 'get-columns':
            result = await this.queryExecutorService.getColumns(dbConfig, payload.database, payload.table);
            break;
          case 'query':
          default:
             result = await this.queryExecutorService.executeQuery(dbConfig, payload.query);
             break;
        }

        const duration = Date.now() - startTime;

        // 4. Record Execution
        this.offlineQueueService.recordExecution(commandId, executionId, result);

        // 5. Send Response
        console.log('[CommandOrchestrator] Sending response for command:', commandId);
        this.webSocketService.sendCommandResponse(commandId, result);
        
        if (operation === 'query') {
            this.emit('command:success', { commandId, duration, rowCount: (result as any).rowCount });
        }

  } catch (error) {
    console.error('[CommandOrchestrator] Execution failed:', error);
    const errorResult = {
      error: error instanceof Error ? error.message : String(error),
      status: 'failed'
    };
    
    // We still record failed executions to prevent infinite retry loops if the query is bad
    // But maybe we should distinguish between "system error" and "query error"
    // For now, record it.
    this.offlineQueueService.recordExecution(commandId, executionId, errorResult);
    
    try {
      this.webSocketService.sendCommandResponse(commandId, errorResult);
    } catch (e) {
      console.error('[CommandOrchestrator] Failed to send error response:', e);
      // Queue it?
      this.offlineQueueService.enqueueResult(commandId, executionId, activityId, errorResult);
    }
    
    this.emit('command:error', { commandId, error: errorResult.error });
  }
    } finally {
      this.activeCommands--;
    }
  }

  private async processOfflineQueue() {
    console.log('[CommandOrchestrator] Processing offline queue...');
    const queued = this.offlineQueueService.getQueuedResults();
    if (queued.length === 0) return;

    console.log(`[CommandOrchestrator] Found ${queued.length} queued results`);
    
    for (const item of queued) {
      try {
        this.webSocketService.sendCommandResponse(item.commandId, item.result);
        this.offlineQueueService.removeResult(item.id);
        console.log('[CommandOrchestrator] Sent queued result for:', item.commandId);
      } catch (e) {
        console.error('[CommandOrchestrator] Failed to send queued result:', item.commandId);
        this.offlineQueueService.incrementRetry(item.id);
      }
    }
  }
}
