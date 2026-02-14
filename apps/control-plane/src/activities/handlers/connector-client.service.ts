import { Injectable, Logger } from '@nestjs/common';
import { ExecutionContext } from '../entities/activity-result.types';

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
    // For now, simulate load operation
    this.logger.log(
      `Loading ${data.length} rows to ${instance.aggregator.name}`
    );

    // Simulate some errors for testing
    const errors = [];
    if (Math.random() < 0.1) { // 10% chance of error
      errors.push({
        row: 5,
        error: 'Duplicate key violation',
      });
    }

    return {
      rowsLoaded: data.length - errors.length,
      errors: errors.length > 0 ? errors : undefined,
    };
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
