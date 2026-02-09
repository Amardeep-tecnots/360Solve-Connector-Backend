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

export interface ConnectionHandler extends ConnectionTester {
  discoverSchema(config: Record<string, any>, credentials: Record<string, string>): Promise<SchemaDiscoveryResult>;
  previewTable(config: Record<string, any>, credentials: Record<string, string>, tableName: string, limit?: number): Promise<TablePreviewResult>;
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
}

export interface TablePreviewResult {
  tableName: string;
  rows: Record<string, any>[];
  rowCount: number;
}

@Injectable()
export class ConnectionFactoryService {
  private testers: Map<string, ConnectionTester>;

  constructor(private prisma: PrismaService) {
    this.testers = new Map([
      ['agg-mysql', new MySQLConnection()],
      ['agg-postgres', new PostgreSQLConnection()],
      ['agg-salesforce', new SalesforceConnection()],
      ['agg-bigquery', new BigQueryConnection()],
      ['agg-snowflake', new SnowflakeConnection()],
      ['agg-hubspot', new HubSpotConnection()],
      // Legacy IDs for backward compatibility
      ['mysql', new MySQLConnection()],
      ['postgresql', new PostgreSQLConnection()],
      ['salesforce', new SalesforceConnection()],
      ['bigquery', new BigQueryConnection()],
      ['snowflake', new SnowflakeConnection()],
      ['hubspot', new HubSpotConnection()],
    ]);
  }

  async getTester(aggregatorId: string): Promise<ConnectionTester> {
    // First check if we have a hardcoded tester
    if (this.testers.has(aggregatorId)) {
      return this.testers.get(aggregatorId)!;
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
      return new SalesforceConnection();
    }

    if (aggregator.category === 'Data Warehouse') {
      if (aggregatorId.includes('snowflake')) return new SnowflakeConnection();
      if (aggregatorId.includes('bigquery')) return new BigQueryConnection();
    }

    // Default: try to determine from ID
    const id = aggregatorId.toLowerCase();
    if (id.includes('mysql')) return new MySQLConnection();
    if (id.includes('postgres')) return new PostgreSQLConnection();
    if (id.includes('salesforce')) return new SalesforceConnection();
    if (id.includes('bigquery')) return new BigQueryConnection();
    if (id.includes('snowflake')) return new SnowflakeConnection();
    if (id.includes('hubspot')) return new HubSpotConnection();

    throw new Error(`No connection tester implemented for aggregator: ${aggregatorId}`);
  }
}
