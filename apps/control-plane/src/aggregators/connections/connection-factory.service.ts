import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { MySQLConnection } from './impl/mysql.connection';
import { PostgreSQLConnection } from './impl/postgresql.connection';
import { SalesforceConnection } from './impl/salesforce.connection';
import { BigQueryConnection } from './impl/bigquery.connection';
import { SnowflakeConnection } from './impl/snowflake.connection';
import { HubSpotConnection } from './impl/hubspot.connection';

export interface ConnectionRequest {
  aggregatorId: string;
  config: Record<string, any>;
  credentials: Record<string, string>;
  mode: 'direct' | 'mini-connector';
}

export interface ConnectionTester {
  test(config: Record<string, any>, credentials: Record<string, string>): Promise<any>;
}

export interface LoadDataInput {
  tableName: string;
  data: any[];
  mode: 'insert' | 'upsert' | 'create';
  conflictKey?: string[];
  conflictResolution?: 'replace' | 'merge' | 'skip';
  autoCreateTable?: boolean;
}

export interface LoadDataResult {
  rowsLoaded: number;
  errors?: Array<{ row: number; error: string }>;
}

export interface ConnectionHandler extends ConnectionTester {
  discoverSchema(config: Record<string, any>, credentials: Record<string, string>): Promise<SchemaDiscoveryResult>;
  previewTable(config: Record<string, any>, credentials: Record<string, string>, tableName: string, limit?: number): Promise<TablePreviewResult>;
  loadData(config: Record<string, any>, credentials: Record<string, string>, input: LoadDataInput): Promise<LoadDataResult>;
}

export interface SchemaDiscoveryResult {
  tables: Array<{
    name: string;
    columns: Array<{
      name: string;
      type: string;
      nullable: boolean;
      primaryKey?: boolean;
    }>;
  }>;
  relationships: Array<{
    fromTable: string;
    fromColumn: string;
    toTable: string;
    toColumn: string;
    constraintName: string;
  }>;
}

export interface TablePreviewResult {
  tableName: string;
  rows: Record<string, any>[];
  rowCount: number;
}

@Injectable()
export class ConnectionFactoryService {
  private testers: Map<string, ConnectionTester>;
  private handlers: Map<string, ConnectionHandler>;

  constructor(private prisma: PrismaService) {
    // Map for testers (legacy support)
    this.testers = new Map([
      ['agg-salesforce', new SalesforceConnection()],
      ['agg-bigquery', new BigQueryConnection()],
      ['agg-snowflake', new SnowflakeConnection()],
      ['agg-hubspot', new HubSpotConnection()],
      // Legacy IDs
      ['salesforce', new SalesforceConnection()],
      ['bigquery', new BigQueryConnection()],
      ['snowflake', new SnowflakeConnection()],
      ['hubspot', new HubSpotConnection()],
    ]);

    // Map for full handlers with loadData support
    this.handlers = new Map<string, ConnectionHandler>([
      ['agg-mysql', new MySQLConnection()],
      ['agg-postgres', new PostgreSQLConnection()],
      ['mysql', new MySQLConnection()],
      ['postgresql', new PostgreSQLConnection()],
    ]);
  }

  async getTester(aggregatorId: string): Promise<ConnectionTester> {
    // First check handlers (they also implement ConnectionTester)
    if (this.handlers.has(aggregatorId)) {
      return this.handlers.get(aggregatorId)!;
    }
    // Then check testers
    if (this.testers.has(aggregatorId)) {
      return this.testers.get(aggregatorId)!;
    }
    // Look up from aggregator
    return this.getHandler(aggregatorId);
  }

  async getHandler(aggregatorId: string): Promise<ConnectionHandler> {
    // First check if we have a hardcoded handler
    if (this.handlers.has(aggregatorId)) {
      return this.handlers.get(aggregatorId)!;
    }

    // Otherwise, look up the aggregator and determine connection type
    const aggregator = await this.prisma.aggregator.findUnique({
      where: { id: aggregatorId },
    });

    if (!aggregator) {
      throw new Error(`Unknown aggregator: ${aggregatorId}`);
    }

    // Map by category/type
    if (aggregator.category === 'Database') {
      if (aggregatorId.includes('mysql')) return new MySQLConnection();
      if (aggregatorId.includes('postgres')) return new PostgreSQLConnection();
    }

    if (aggregator.category === 'CRM') {
      return new SalesforceConnection() as unknown as ConnectionHandler;
    }

    if (aggregator.category === 'Data Warehouse') {
      if (aggregatorId.includes('snowflake')) return new SnowflakeConnection() as unknown as ConnectionHandler;
      if (aggregatorId.includes('bigquery')) return new BigQueryConnection() as unknown as ConnectionHandler;
    }

    // Default: try to determine from ID
    const id = aggregatorId.toLowerCase();
    if (id.includes('mysql')) return new MySQLConnection();
    if (id.includes('postgres')) return new PostgreSQLConnection();
    if (id.includes('salesforce')) return new SalesforceConnection() as unknown as ConnectionHandler;
    if (id.includes('bigquery')) return new BigQueryConnection() as unknown as ConnectionHandler;
    if (id.includes('snowflake')) return new SnowflakeConnection() as unknown as ConnectionHandler;
    if (id.includes('hubspot')) return new HubSpotConnection() as unknown as ConnectionHandler;

    throw new Error(`No connection handler implemented for aggregator: ${aggregatorId}`);
  }
}
