import { Pool, PoolConfig } from 'pg';
import mysql from 'mysql2/promise';
import * as mssql from 'mssql';
import { Parser } from 'node-sql-parser';
import { CredentialVaultService } from './credential-vault.service';

interface DatabaseConfig {
  type: 'mysql' | 'postgresql' | 'mssql';
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
  private pools: Map<string, Pool | mysql.Pool | mssql.ConnectionPool> = new Map();
  private parser: Parser;

  constructor(private readonly credentialVault: CredentialVaultService) {
    this.parser = new Parser();
  }

  /**
   * Test database connection
   */
  async testConnection(config: DatabaseConfig): Promise<{ success: boolean; error?: string }> {
    try {
      if (config.type === 'mysql') {
        await this.testMySQLConnection(config);
      } else if (config.type === 'postgresql') {
        await this.testPostgreSQLConnection(config);
      } else if (config.type === 'mssql') {
        await this.testMSSQLConnection(config);
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
    // Build SQL
    const sql = this.buildQuery(query, config.type);

    // Enforce READ-ONLY
    this.enforceReadOnly(sql);

    if (config.type === 'mysql') {
      return this.executeMySQLQuery(config, sql, query.columns);
    } else if (config.type === 'postgresql') {
      return this.executePostgreSQLQuery(config, sql, query.columns);
    } else if (config.type === 'mssql') {
      return this.executeMSSQLQuery(config, sql, query.columns);
    } else {
      throw new Error(`Unsupported database type: ${config.type}`);
    }
  }

  /**
   * Get list of databases
   */
  async getDatabases(config: DatabaseConfig): Promise<string[]> {
    if (config.type === 'mysql') {
      const result = await this.executeMySQLQuery(config, 'SHOW DATABASES', ['Database']);
      return result.data.map((row: any) => row.Database);
    } else if (config.type === 'postgresql') {
      const result = await this.executePostgreSQLQuery(config, "SELECT datname FROM pg_database WHERE datistemplate = false", ['datname']);
      return result.data.map((row: any) => row.datname);
    } else if (config.type === 'mssql') {
      const result = await this.executeMSSQLQuery(config, "SELECT name FROM sys.databases", ['name']);
      return result.data.map((row: any) => row.name);
    }
    return [];
  }

  /**
   * Get tables in a database
   */
  async getTables(config: DatabaseConfig, database?: string): Promise<string[]> {
    const dbConfig = database ? { ...config, database } : config;
    
    if (dbConfig.type === 'mysql') {
      const result = await this.executeMySQLQuery(dbConfig, `
        SELECT TABLE_NAME as name
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = '${dbConfig.database}'
        ORDER BY TABLE_NAME
      `, ['name']);
      return result.data.map((row: any) => row.name);
    } else if (dbConfig.type === 'postgresql') {
      const result = await this.executePostgreSQLQuery(dbConfig, `
        SELECT table_name as name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
      `, ['name']);
      return result.data.map((row: any) => row.name);
    } else if (dbConfig.type === 'mssql') {
      const result = await this.executeMSSQLQuery(dbConfig, `
        SELECT TABLE_NAME as name
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME
      `, ['name']);
      return result.data.map((row: any) => row.name);
    }
    return [];
  }

  /**
   * Get columns in a table
   */
  async getColumns(config: DatabaseConfig, database: string, table: string): Promise<any[]> {
    const dbConfig = database ? { ...config, database } : config;

    if (dbConfig.type === 'mysql') {
      const result = await this.executeMySQLQuery(dbConfig, `
        SELECT
          COLUMN_NAME as name,
          DATA_TYPE as type,
          IS_NULLABLE = 'YES' as nullable,
          COLUMN_KEY = 'PRI' as primaryKey
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = '${dbConfig.database}' AND TABLE_NAME = '${table}'
        ORDER BY ORDINAL_POSITION
      `, ['name', 'type', 'nullable', 'primaryKey']);
      return result.data;
    } else if (dbConfig.type === 'postgresql') {
      const result = await this.executePostgreSQLQuery(dbConfig, `
        SELECT
          column_name as name,
          data_type as type,
          is_nullable = 'YES' as nullable
        FROM information_schema.columns
        WHERE table_name = '${table}'
        ORDER BY ordinal_position
      `, ['name', 'type', 'nullable']);
      return result.data;
    } else if (dbConfig.type === 'mssql') {
      const result = await this.executeMSSQLQuery(dbConfig, `
        SELECT
          COLUMN_NAME as name,
          DATA_TYPE as type,
          CASE WHEN IS_NULLABLE = 'YES' THEN 1 ELSE 0 END as nullable
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = '${table}'
        ORDER BY ORDINAL_POSITION
      `, ['name', 'type', 'nullable']);
      return result.data.map((row: any) => ({
        name: row.name,
        type: row.type,
        nullable: !!row.nullable,
        primaryKey: false
      }));
    }
    return [];
  }

  /**
   * Discover database schema
   */
  async discoverSchema(config: DatabaseConfig): Promise<SchemaInfo> {
    if (config.type === 'mysql') {
      return this.discoverMySQLSchema(config);
    } else if (config.type === 'postgresql') {
      return this.discoverPostgreSQLSchema(config);
    } else if (config.type === 'mssql') {
      return this.discoverMSSQLSchema(config);
    } else {
      throw new Error(`Unsupported database type: ${config.type}`);
    }
  }

  /**
   * Stream query results
   */
  async streamQuery(
    config: DatabaseConfig, 
    query: { table: string; columns: string[]; where?: string; orderBy?: string },
    onBatch: (rows: any[]) => void
  ): Promise<void> {
    const BATCH_SIZE = 1000;
    const baseSql = this.buildQuery(query, config.type);
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      let sql = baseSql;

      if (config.type === 'mysql' || config.type === 'postgresql') {
        sql += ` LIMIT ${BATCH_SIZE} OFFSET ${offset}`;
      } else if (config.type === 'mssql') {
        if (!/order\s+by/i.test(sql)) {
          throw new Error('Streaming for MSSQL requires an ORDER BY clause');
        }
        sql += ` OFFSET ${offset} ROWS FETCH NEXT ${BATCH_SIZE} ROWS ONLY`;
      }

      this.enforceReadOnly(sql);

      let rows: any[] = [];
      if (config.type === 'mysql') {
        const res = await this.executeMySQLQuery(config, sql, query.columns);
        rows = res.data;
      } else if (config.type === 'postgresql') {
        const res = await this.executePostgreSQLQuery(config, sql, query.columns);
        rows = res.data;
      } else if (config.type === 'mssql') {
        const res = await this.executeMSSQLQuery(config, sql, query.columns);
        rows = res.data;
      }

      if (rows.length === 0) {
        hasMore = false;
        continue;
      }

      onBatch(rows);
      offset += rows.length;

      if (rows.length < BATCH_SIZE) {
        hasMore = false;
      }
    }
  }

  /**
   * Enforce READ-ONLY queries using AST parser
   */
  private enforceReadOnly(sql: string): void {
    try {
      // Basic keyword check first
      const forbiddenKeywords = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER', 'GRANT', 'REVOKE', 'TRUNCATE'];
      const upperSql = sql.toUpperCase();
      for (const keyword of forbiddenKeywords) {
        if (upperSql.includes(keyword)) {
          // Check context using parser
          // If keyword is inside a string literal, it's fine. If it's a command, it's bad.
          // But parser will catch it.
        }
      }

      // Parse AST
      let ast;
      try {
        ast = this.parser.astify(sql);
      } catch (e) {
        // If parser fails, it might be complex SQL or dialect specific.
        // Fallback to strict keyword check if parser fails? Or reject?
        // Rejecting is safer.
        throw new Error('Failed to parse SQL query for security check');
      }

      if (Array.isArray(ast)) {
        for (const statement of ast) {
          if (statement.type !== 'select') {
            throw new Error(`READ-ONLY violation: ${statement.type} operations are not allowed`);
          }
        }
      } else if (ast.type !== 'select') {
        throw new Error(`READ-ONLY violation: ${ast.type} operations are not allowed`);
      }
    } catch (err) {
      throw new Error(`Security check failed: ${err instanceof Error ? err.message : String(err)}`);
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
   * Test MSSQL connection
   */
  private async testMSSQLConnection(config: DatabaseConfig): Promise<void> {
    const pool = await new mssql.ConnectionPool({
      server: config.host,
      port: config.port,
      user: config.username,
      password: config.password,
      database: config.database,
      options: {
        encrypt: false, // For local dev/testing mostly
        trustServerCertificate: true
      }
    }).connect();

    await pool.query('SELECT 1');
    await pool.close();
  }

  /**
   * Execute MySQL query
   */
  private async executeMySQLQuery(config: DatabaseConfig, sql: string, columns: string[]): Promise<QueryResult> {
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
      
      // Layer 3 enforcement: Set session to READ ONLY on connection
      (pool as any).pool.on('connection', (conn: any) => {
        conn.query('SET SESSION TRANSACTION READ ONLY');
      });

      this.pools.set(poolKey, pool);
    }

    const [rows] = await pool.execute(sql);

    return {
      data: rows as any[],
      rowCount: (rows as any[]).length,
      columns: columns,
    };
  }

  /**
   * Execute PostgreSQL query
   */
  private async executePostgreSQLQuery(config: DatabaseConfig, sql: string, columns: string[]): Promise<QueryResult> {
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

    const client = await pool.connect();
    try {
      await client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY'); // Layer 3 enforcement
      const result = await client.query(sql);
      return {
        data: result.rows,
        rowCount: result.rowCount || 0,
        columns: columns,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Execute MSSQL query
   */
  private async executeMSSQLQuery(config: DatabaseConfig, sql: string, columns: string[]): Promise<QueryResult> {
    const poolKey = this.getPoolKey(config);
    let pool = this.pools.get(poolKey) as mssql.ConnectionPool | undefined;

    if (!pool) {
      pool = new mssql.ConnectionPool({
        server: config.host,
        port: config.port,
        user: config.username,
        password: config.password,
        database: config.database,
        options: {
          encrypt: false,
          trustServerCertificate: true
        }
      });
      await pool.connect();
      this.pools.set(poolKey, pool);
    }

    const result = await pool.query(sql);

    return {
      data: result.recordset,
      rowCount: result.rowsAffected[0] || 0,
      columns: columns,
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
      
      // Layer 3 enforcement: Set session to READ ONLY on connection
      (pool as any).pool.on('connection', (conn: any) => {
        conn.query('SET SESSION TRANSACTION READ ONLY');
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
   * Discover MSSQL schema
   */
  private async discoverMSSQLSchema(config: DatabaseConfig): Promise<SchemaInfo> {
    const poolKey = this.getPoolKey(config);
    let pool = this.pools.get(poolKey) as mssql.ConnectionPool | undefined;

    if (!pool) {
      pool = new mssql.ConnectionPool({
        server: config.host,
        port: config.port,
        user: config.username,
        password: config.password,
        database: config.database,
        options: {
          encrypt: false,
          trustServerCertificate: true
        }
      });
      await pool.connect();
      this.pools.set(poolKey, pool);
    }

    // Get tables
    const tablesResult = await pool.query(`
      SELECT TABLE_NAME as name
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `);

    const schema: SchemaInfo = { tables: [] };

    for (const table of tablesResult.recordset) {
      // Get columns for each table
      const columnsResult = await pool.query(`
        SELECT
          COLUMN_NAME as name,
          DATA_TYPE as type,
          CASE WHEN IS_NULLABLE = 'YES' THEN 1 ELSE 0 END as nullable,
          0 as primaryKey -- Simplified for now, need complex query for PK
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = '${table.name}'
        ORDER BY ORDINAL_POSITION
      `);

      schema.tables.push({
        name: table.name,
        columns: columnsResult.recordset.map((col: any) => ({
          name: col.name,
          type: col.type,
          nullable: !!col.nullable,
          primaryKey: false // TODO: Fix PK detection
        })),
      });
    }

    return schema;
  }

  /**
   * Preview table data (First 10 rows)
   */
  async previewTable(config: DatabaseConfig, tableName: string): Promise<QueryResult> {
    return this.executeQuery(config, {
      table: tableName,
      columns: ['*'],
      limit: 10
    });
  }

  /**
   * Build SELECT query with proper identifier quoting
   */
  private buildQuery(query: {
    table: string;
    columns: string[];
    where?: string;
    limit?: number;
    orderBy?: string;
  }, type?: 'mysql' | 'postgresql' | 'mssql'): string {
    // Quote columns and table names to preserve case
    const columns = this.quoteColumns(query.columns, type);
    const table = this.quoteIdentifier(query.table, type);
    
    // MSSQL TOP syntax
    if (type === 'mssql' && query.limit) {
      let sql = `SELECT TOP ${query.limit} ${columns} FROM ${table}`;
      if (query.where) sql += ` WHERE ${query.where}`;
      if (query.orderBy) sql += ` ORDER BY ${query.orderBy}`;
      return sql;
    }

    let sql = `SELECT ${columns} FROM ${table}`;

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
   * Quote identifier based on database type
   * PostgreSQL: double quotes preserve case
   * MySQL: backticks
   * MSSQL: square brackets
   */
  private quoteIdentifier(identifier: string, type?: 'mysql' | 'postgresql' | 'mssql'): string {
    if (!identifier || identifier === '*') return identifier;
    
    switch (type) {
      case 'postgresql':
        return `"${identifier}"`;
      case 'mysql':
        return `\`${identifier}\``;
      case 'mssql':
        return `[${identifier}]`;
      default:
        return `"${identifier}"`;
    }
  }

  /**
   * Quote column names in the columns array
   */
  private quoteColumns(columns: string[], type?: 'mysql' | 'postgresql' | 'mssql'): string {
    if (!columns || columns.length === 0 || (columns.length === 1 && columns[0] === '*')) {
      return columns.join(', ');
    }
    
    return columns.map(col => {
      if (col === '*') return col;
      return this.quoteIdentifier(col, type);
    }).join(', ');
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
        } else if (pool instanceof mssql.ConnectionPool) {
          await pool.close();
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
