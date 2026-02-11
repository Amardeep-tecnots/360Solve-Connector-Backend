import { ConnectionHandler, SchemaDiscoveryResult, TablePreviewResult } from '../connection-factory.service';

export class MySQLConnection implements ConnectionHandler {
  async test(config: Record<string, any>, credentials: Record<string, string>): Promise<any> {
    // Validate required fields
    if (!config.host && !credentials.host) {
      throw new Error('Missing required MySQL config: host');
    }
    if (!credentials.username && !credentials.user) {
      throw new Error('Missing required MySQL credentials: username');
    }
    if (!credentials.password) {
      throw new Error('Missing required MySQL credentials: password');
    }
    if (!config.database && !credentials.database) {
      throw new Error('Missing required MySQL config: database');
    }

    // Dynamic import to avoid loading if not needed
    const mysql = await import('mysql2/promise');

    const host = config.host || credentials.host;
    const port = config.port || credentials.port || 3306;
    const user = credentials.username || credentials.user;
    const password = credentials.password;
    const database = config.database || credentials.database;

    let connection;
    try {
      connection = await mysql.createConnection({
        host,
        port,
        user,
        password,
        database,
        // READ-ONLY mode - only allow SELECT queries
        flags: ['READONLY'],
        // Connection timeout
        connectTimeout: 30000,
        // Enable multiple statements disabled for security
        multipleStatements: false,
      });

      // Test the connection with a simple query
      const [rows] = await connection.execute('SELECT 1 as test, version() as version');
      const result = rows as any[];

      return {
        success: true,
        host,
        port,
        database,
        mysqlVersion: result[0]?.version || 'unknown',
        testPassed: result[0]?.test === 1,
      };
    } catch (error: any) {
      throw new Error(`MySQL connection failed: ${error.message}`);
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  }

  async discoverSchema(config: Record<string, any>, credentials: Record<string, string>): Promise<SchemaDiscoveryResult> {
    const host = config.host || credentials.host;
    const port = config.port || credentials.port || 3306;
    const user = credentials.username || credentials.user;
    const password = credentials.password;
    const database = config.database || credentials.database;

    const mysql = await import('mysql2/promise');
    const connection = await mysql.createConnection({
      host,
      port,
      user,
      password,
      database,
      flags: ['READONLY'],
      connectTimeout: 30000,
    });

    try {
      // Query INFORMATION_SCHEMA to get tables and columns
      const [tables] = await connection.execute(`
        SELECT 
          t.TABLE_NAME as name,
          c.COLUMN_NAME as column_name,
          c.DATA_TYPE as data_type,
          c.IS_NULLABLE as is_nullable,
          c.COLUMN_KEY as column_key
        FROM INFORMATION_SCHEMA.TABLES t
        LEFT JOIN INFORMATION_SCHEMA.COLUMNS c ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
        WHERE t.TABLE_SCHEMA = ? AND t.TABLE_TYPE = 'BASE TABLE'
        ORDER BY t.TABLE_NAME, c.ORDINAL_POSITION
      `, [database]);

      const rows = tables as any[];

      // Group columns by table
      const tablesMap = new Map<string, any[]>();
      for (const row of rows) {
        if (!tablesMap.has(row.name)) {
          tablesMap.set(row.name, []);
        }
        tablesMap.get(row.name)!.push({
          name: row.column_name,
          type: row.data_type,
          nullable: row.is_nullable === 'YES',
          primaryKey: row.column_key === 'PRI',
        });
      }

      // Query foreign key relationships
      const [fkResult] = await connection.execute(`
        SELECT 
          kcu.TABLE_NAME as from_table,
          kcu.COLUMN_NAME as from_column,
          kcu.REFERENCED_TABLE_NAME as to_table,
          kcu.REFERENCED_COLUMN_NAME as to_column,
          tc.CONSTRAINT_NAME as constraint_name
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
        JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc 
          ON kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME 
          AND kcu.TABLE_SCHEMA = tc.TABLE_SCHEMA
        WHERE kcu.TABLE_SCHEMA = ? 
          AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
          AND tc.CONSTRAINT_TYPE = 'FOREIGN KEY'
        ORDER BY kcu.TABLE_NAME, kcu.COLUMN_NAME
      `, [database]);

      const fkRows = fkResult as any[];
      const relationships = fkRows.map((row: any) => ({
        fromTable: row.from_table,
        fromColumn: row.from_column,
        toTable: row.to_table,
        toColumn: row.to_column,
        constraintName: row.constraint_name,
      }));

      return {
        tables: Array.from(tablesMap.entries()).map(([name, columns]) => ({
          name,
          columns,
        })),
        relationships,
      };
    } finally {
      await connection.end();
    }
  }

  async previewTable(
    config: Record<string, any>,
    credentials: Record<string, string>,
    tableName: string,
    limit: number = 10
  ): Promise<TablePreviewResult> {
    const host = config.host || credentials.host;
    const port = config.port || credentials.port || 3306;
    const user = credentials.username || credentials.user;
    const password = credentials.password;
    const database = config.database || credentials.database;

    const mysql = await import('mysql2/promise');
    const connection = await mysql.createConnection({
      host,
      port,
      user,
      password,
      database,
      flags: ['READONLY'],
      connectTimeout: 30000,
    });

    try {
      // Validate table name to prevent SQL injection
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
        throw new Error('Invalid table name');
      }

      const [rows] = await connection.execute(
        `SELECT * FROM \`${database}\`.\`${tableName}\` LIMIT ?`,
        [limit]
      );

      return {
        tableName,
        rows: rows as Record<string, any>[],
        rowCount: Array.isArray(rows) ? rows.length : 0,
      };
    } finally {
      await connection.end();
    }
  }
}
