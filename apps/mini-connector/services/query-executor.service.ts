import { Pool, PoolConfig } from 'pg';
import mysql from 'mysql2/promise';
import { CredentialVaultService } from './credential-vault.service';

interface DatabaseConfig {
  type: 'mysql' | 'postgresql';
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

interface QueryResult {
  data: any[];
  rowCount: number;
  columns: string[];
}

interface SchemaInfo {
  tables: Array<{
    name: string;
    columns: Array<{
      name: string;
      type: string;
      nullable: boolean;
      primaryKey: boolean;
    }>;
  }>;
}

export class QueryExecutorService {
  private pools: Map<string, Pool | mysql.Pool> = new Map();

  constructor(private readonly credentialVault: CredentialVaultService) {}

  /**
   * Test database connection
   */
  async testConnection(config: DatabaseConfig): Promise<{ success: boolean; error?: string }> {
    try {
      if (config.type === 'mysql') {
        await this.testMySQLConnection(config);
      } else if (config.type === 'postgresql') {
        await this.testPostgreSQLConnection(config);
      } else {
        throw new Error(`Unsupported database type: ${config.type}`);
      }

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Execute query with READ-ONLY enforcement
   */
  async executeQuery(config: DatabaseConfig, query: {
    table: string;
    columns: string[];
    where?: string;
    limit?: number;
    orderBy?: string;
  }): Promise<QueryResult> {
    // Enforce READ-ONLY
    this.enforceReadOnly(query);

    if (config.type === 'mysql') {
      return this.executeMySQLQuery(config, query);
    } else if (config.type === 'postgresql') {
      return this.executePostgreSQLQuery(config, query);
    } else {
      throw new Error(`Unsupported database type: ${config.type}`);
    }
  }

  /**
   * Discover database schema
   */
  async discoverSchema(config: DatabaseConfig): Promise<SchemaInfo> {
    if (config.type === 'mysql') {
      return this.discoverMySQLSchema(config);
    } else if (config.type === 'postgresql') {
      return this.discoverPostgreSQLSchema(config);
    } else {
      throw new Error(`Unsupported database type: ${config.type}`);
    }
  }

  /**
   * Enforce READ-ONLY queries
   */
  private enforceReadOnly(query: any): void {
    const forbiddenKeywords = [
      'INSERT',
      'UPDATE',
      'DELETE',
      'DROP',
      'CREATE',
      'ALTER',
      'GRANT',
      'REVOKE',
      'TRUNCATE',
    ];

    const queryStr = JSON.stringify(query).toUpperCase();

    for (const keyword of forbiddenKeywords) {
      if (queryStr.includes(keyword)) {
        throw new Error(`READ-ONLY violation: ${keyword} operations are not allowed`);
      }
    }
  }

  /**
   * Test MySQL connection
   */
  private async testMySQLConnection(config: DatabaseConfig): Promise<void> {
    const connection = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.username,
      password: config.password,
      database: config.database,
    });

    await connection.ping();
    await connection.end();
  }

  /**
   * Test PostgreSQL connection
   */
  private async testPostgreSQLConnection(config: DatabaseConfig): Promise<void> {
    const poolConfig: PoolConfig = {
      host: config.host,
      port: config.port,
      user: config.username,
      password: config.password,
      database: config.database,
      max: 1,
    };

    const pool = new Pool(poolConfig);
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    await pool.end();
  }

  /**
   * Execute MySQL query
   */
  private async executeMySQLQuery(config: DatabaseConfig, query: any): Promise<QueryResult> {
    const poolKey = this.getPoolKey(config);
    let pool = this.pools.get(poolKey) as mysql.Pool | undefined;

    if (!pool) {
      pool = mysql.createPool({
        host: config.host,
        port: config.port,
        user: config.username,
        password: config.password,
        database: config.database,
        waitForConnections: true,
        connectionLimit: 10,
      });
      this.pools.set(poolKey, pool);
    }

    const sql = this.buildQuery(query);
    const [rows] = await pool.execute(sql);

    return {
      data: rows as any[],
      rowCount: (rows as any[]).length,
      columns: query.columns,
    };
  }

  /**
   * Execute PostgreSQL query
   */
  private async executePostgreSQLQuery(config: DatabaseConfig, query: any): Promise<QueryResult> {
    const poolKey = this.getPoolKey(config);
    let pool = this.pools.get(poolKey) as Pool | undefined;

    if (!pool) {
      const poolConfig: PoolConfig = {
        host: config.host,
        port: config.port,
        user: config.username,
        password: config.password,
        database: config.database,
        max: 10,
      };
      pool = new Pool(poolConfig);
      this.pools.set(poolKey, pool);
    }

    const sql = this.buildQuery(query);
    const result = await pool.query(sql);

    return {
      data: result.rows,
      rowCount: result.rowCount || 0,
      columns: query.columns,
    };
  }

  /**
   * Discover MySQL schema
   */
  private async discoverMySQLSchema(config: DatabaseConfig): Promise<SchemaInfo> {
    const poolKey = this.getPoolKey(config);
    let pool = this.pools.get(poolKey) as mysql.Pool | undefined;

    if (!pool) {
      pool = mysql.createPool({
        host: config.host,
        port: config.port,
        user: config.username,
        password: config.password,
        database: config.database,
        waitForConnections: true,
        connectionLimit: 10,
      });
      this.pools.set(poolKey, pool);
    }

    // Get tables
    const [tables] = await pool.execute(`
      SELECT TABLE_NAME as name
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME
    `, [config.database]);

    const schema: SchemaInfo = { tables: [] };

    for (const table of tables as any[]) {
      // Get columns for each table
      const [columns] = await pool.execute(`
        SELECT
          COLUMN_NAME as name,
          DATA_TYPE as type,
          IS_NULLABLE = 'YES' as nullable,
          COLUMN_KEY = 'PRI' as primaryKey
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
      `, [config.database, table.name]);

      schema.tables.push({
        name: table.name,
        columns: columns as any[],
      });
    }

    return schema;
  }

  /**
   * Discover PostgreSQL schema
   */
  private async discoverPostgreSQLSchema(config: DatabaseConfig): Promise<SchemaInfo> {
    const poolKey = this.getPoolKey(config);
    let pool = this.pools.get(poolKey) as Pool | undefined;

    if (!pool) {
      const poolConfig: PoolConfig = {
        host: config.host,
        port: config.port,
        user: config.username,
        password: config.password,
        database: config.database,
        max: 10,
      };
      pool = new Pool(poolConfig);
      this.pools.set(poolKey, pool);
    }

    // Get tables
    const tablesResult = await pool.query(`
      SELECT table_name as name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    const schema: SchemaInfo = { tables: [] };

    for (const table of tablesResult.rows) {
      // Get columns for each table
      const columnsResult = await pool.query(`
        SELECT
          column_name as name,
          data_type as type,
          is_nullable = 'YES' as nullable,
          EXISTS (
            SELECT 1 FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_name = $1
              AND kcu.column_name = column_name
              AND tc.constraint_type = 'PRIMARY KEY'
          ) as primaryKey
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [table.name]);

      schema.tables.push({
        name: table.name,
        columns: columnsResult.rows as any[],
      });
    }

    return schema;
  }

  /**
   * Build SELECT query
   */
  private buildQuery(query: {
    table: string;
    columns: string[];
    where?: string;
    limit?: number;
    orderBy?: string;
  }): string {
    const columns = query.columns.join(', ');
    let sql = `SELECT ${columns} FROM ${query.table}`;

    if (query.where) {
      sql += ` WHERE ${query.where}`;
    }

    if (query.orderBy) {
      sql += ` ORDER BY ${query.orderBy}`;
    }

    if (query.limit) {
      sql += ` LIMIT ${query.limit}`;
    }

    return sql;
  }

  /**
   * Get pool key for caching
   */
  private getPoolKey(config: DatabaseConfig): string {
    return `${config.type}:${config.host}:${config.port}:${config.database}`;
  }

  /**
   * Close all connection pools
   */
  async closeAllPools(): Promise<void> {
    for (const [key, pool] of this.pools.entries()) {
      try {
        if (pool instanceof Pool) {
          await pool.end();
        } else {
          await pool.end();
        }
        this.pools.delete(key);
      } catch (error) {
        console.error(`Failed to close pool ${key}:`, error);
      }
    }
  }
}
