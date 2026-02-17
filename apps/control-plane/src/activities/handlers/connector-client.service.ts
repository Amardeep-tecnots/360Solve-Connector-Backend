import { Injectable, Logger } from '@nestjs/common';
import { ExecutionContext } from '../entities/activity-result.types';
import { ConnectionFactoryService, ConnectionHandler } from '../../aggregators/connections/connection-factory.service';
import { PrismaService } from '../../prisma.service';

interface QueryRequest {
  table: string;
  columns: string[];
  where?: string;
  limit?: number;
  orderBy?: string;
}

interface QueryResult {
  data: any[];
  rowCount: number;
}

@Injectable()
export class ConnectorClientService {
  private readonly logger = new Logger(ConnectorClientService.name);

  constructor(
    private readonly connectionFactory: ConnectionFactoryService,
    private readonly prisma: PrismaService,
  ) {}

  async executeQuery(
    instance: any,
    query: QueryRequest,
    context: ExecutionContext
  ): Promise<QueryResult> {
    // For now, simulate query execution
    // TODO: Integrate with actual aggregator connectors
    this.logger.log(
      `Executing query on ${instance.aggregator.name}: ` +
      `SELECT ${query.columns.join(', ')} FROM ${query.table}` +
      (query.where ? ` WHERE ${query.where}` : '') +
      (query.limit ? ` LIMIT ${query.limit}` : '')
    );

    // Mock data for development
    const mockData = this.generateMockData(query);
    
    return {
      data: mockData,
      rowCount: mockData.length,
    };
  }

  async loadData(
    instance: any,
    data: any[],
    config: any,
    context: ExecutionContext
  ): Promise<{ rowsLoaded: number; errors?: any[] }> {
    try {
      // Get the aggregator instance ID (it's stored in aggregatorId on the instance)
      const aggregatorId = instance.aggregatorId || instance.aggregator?.id;
      
      if (!aggregatorId) {
        throw new Error('Aggregator ID not found in instance');
      }

      // Get the connection handler for this aggregator type
      const handler = await this.connectionFactory.getHandler(aggregatorId);

      // Get credentials from the instance's credential record
      // The instance has a credential property from the Prisma include
      let credentials: Record<string, string> = {};
      let connectionConfig: Record<string, any> = {};

      if (instance.credential) {
        // Build credentials from the stored credential record
        credentials = {
          host: instance.credential.host,
          port: String(instance.credential.port || ''),
          database: instance.credential.database,
          username: instance.credential.usernameHint,
          // Note: Actual password would need to be fetched from vault in production
          // For now, we'll check if it's in connectionParams
        };
      }

      // Get connection details from connectionParams
      if (instance.connectionParams) {
        connectionConfig = instance.connectionParams as Record<string, any>;
        // Also check for connectionString in params
        if (connectionConfig.connectionString) {
          credentials.connectionString = connectionConfig.connectionString;
        }
      }

      this.logger.log(
        `Loading ${data.length} rows to table "${config.table}" using aggregator "${aggregatorId}"`
      );

      // Call the real loadData on the connection handler
      const result = await handler.loadData(
        connectionConfig,
        credentials,
        {
          tableName: config.table,
          data: data,
          mode: config.mode || 'insert',
          conflictKey: config.conflictKey ? 
            (Array.isArray(config.conflictKey) ? config.conflictKey : [config.conflictKey]) : 
            undefined,
          conflictResolution: config.conflictResolution,
          // Auto-create table if it doesn't exist (default: true)
          autoCreateTable: config.autoCreateTable !== false,
        }
      );

      return {
        rowsLoaded: result.rowsLoaded,
        errors: result.errors,
      };
    } catch (error: any) {
      this.logger.error(`Load data failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  private generateMockData(query: QueryRequest): any[] {
    // Generate realistic mock data based on table and columns
    const data = [];
    const rows = Math.min(query.limit || 10, 100); // Cap at 100 for mock

    for (let i = 0; i < rows; i++) {
      const row: any = {};
      for (const column of query.columns) {
        if (column.includes('id')) {
          row[column] = i + 1;
        } else if (column.includes('email')) {
          row[column] = `user${i + 1}@example.com`;
        } else if (column.includes('name')) {
          row[column] = `User ${i + 1}`;
        } else if (column.includes('created') || column.includes('date')) {
          row[column] = new Date().toISOString();
        } else if (column.includes('amount') || column.includes('price')) {
          row[column] = Math.random() * 1000;
        } else {
          row[column] = `value_${i + 1}`;
        }
      }
      data.push(row);
    }

    return data;
  }
}
