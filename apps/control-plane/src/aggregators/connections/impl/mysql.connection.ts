import { ConnectionHandler, SchemaDiscoveryResult, TablePreviewResult, LoadDataInput, LoadDataResult } from '../connection-factory.service';

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

  /**
   * Infer MySQL column type from JavaScript value
   */
  private inferMySqlType(value: any): string {
    if (value === null || value === undefined) {
      return 'TEXT';
    }
    
    const type = typeof value;
    
    if (type === 'number') {
      return Number.isInteger(value) ? 'INT' : 'DECIMAL(15,2)';
    }
    if (type === 'boolean') {
      return 'TINYINT(1)';
    }
    if (type === 'object') {
      if (value instanceof Date) {
        return 'DATETIME';
      }
      // Check for ISO date string
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
        return 'DATETIME';
      }
      // Check for JSON object
      return 'JSON';
    }
    return 'VARCHAR(255)';
  }

  /**
   * Create table if it doesn't exist, based on the data schema
   */
  private async createTableIfNotExists(
    connection: any,
    database: string,
    tableName: string,
    data: any[]
  ): Promise<boolean> {
    if (!data || data.length === 0) {
      return false;
    }

    const columns = Object.keys(data[0]);
    if (columns.length === 0) {
      return false;
    }

    // Check if table already exists
    const [tables] = await connection.execute(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
      [database, tableName]
    );
    
    if (Array.isArray(tables) && tables.length > 0) {
      return false; // Table already exists
    }

    // Build CREATE TABLE statement
    const columnDefs = columns.map(col => {
      // Get a sample value to infer type
      const sampleValue = data.find(row => row[col] !== undefined && row[col] !== null)?.[col];
      const mysqlType = this.inferMySqlType(sampleValue);
      return `\`${col}\` ${mysqlType}`;
    });

    const createQuery = `CREATE TABLE \`${tableName}\` (${columnDefs.join(', ')});`;
    
    await connection.execute(createQuery);
    return true; // Table was created
  }

  async loadData(
    config: Record<string, any>,
    credentials: Record<string, string>,
    input: LoadDataInput
  ): Promise<LoadDataResult> {
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
      connectTimeout: 60000, // Longer timeout for bulk inserts
    });

    const { tableName, data, mode, conflictKey, conflictResolution, autoCreateTable } = input;

    // Validate table name to prevent SQL injection
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      await connection.end();
      throw new Error('Invalid table name');
    }

    if (!data || data.length === 0) {
      await connection.end();
      return { rowsLoaded: 0 };
    }

    try {
      // Get columns from the first row
      const columns = Object.keys(data[0]);
      if (columns.length === 0) {
        return { rowsLoaded: 0 };
      }

      // Auto-create table if it doesn't exist (if enabled)
      const tableCreated = autoCreateTable ? await this.createTableIfNotExists(connection, database, tableName, data) : false;
      if (tableCreated) {
        console.log(`[MySQL] Auto-created table "${tableName}" based on source data schema`);
      }

      const errors: Array<{ row: number; error: string }> = [];
      let rowsLoaded = 0;

      if (mode === 'insert') {
        // Simple INSERT for each row
        for (let i = 0; i < data.length; i++) {
          const row = data[i];
          const columnNames = columns.map(col => `\`${col}\``).join(', ');
          const placeholders = columns.map((_, idx) => '?').join(', ');
          const values = columns.map(col => row[col]);

          const query = `INSERT INTO \`${tableName}\` (${columnNames}) VALUES (${placeholders})`;

          try {
            await connection.execute(query, values);
            rowsLoaded++;
          } catch (err: any) {
            errors.push({
              row: i,
              error: err.message,
            });
          }
        }
      } else if (mode === 'upsert' && conflictKey && conflictKey.length > 0) {
        // UPSERT (INSERT ... ON DUPLICATE KEY UPDATE)
        const conflictColumns = conflictKey.map(col => `\`${col}\``).join(', ');

        for (let i = 0; i < data.length; i++) {
          const row = data[i];
          const columnNames = columns.map(col => `\`${col}\``).join(', ');
          const placeholders = columns.map((_, idx) => '?').join(', ');
          const values = columns.map(col => row[col]);

          // Build ON DUPLICATE KEY UPDATE clause
          let updateClause = '';
          if (conflictResolution === 'replace') {
            // Replace all non-conflict columns
            const nonConflictCols = columns.filter(col => !conflictKey.includes(col));
            updateClause = nonConflictCols.map(col => `\`${col}\` = VALUES(\`${col}\`)`).join(', ');
          } else if (conflictResolution === 'merge') {
            // Skip on conflict (no update)
            updateClause = '';
          } else {
            // Default: skip
            updateClause = '';
          }

          const query = conflictResolution === 'merge' || conflictResolution === 'skip'
            ? `INSERT INTO \`${tableName}\` (${columnNames}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE \`${conflictKey[0]}\` = \`${conflictKey[0]}\``
            : `INSERT INTO \`${tableName}\` (${columnNames}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClause}`;

          try {
            await connection.execute(query, values);
            rowsLoaded++;
          } catch (err: any) {
            errors.push({
              row: i,
              error: err.message,
            });
          }
        }
      } else if (mode === 'create') {
        // CREATE mode - truncate table first then insert
        try {
          await connection.execute(`TRUNCATE TABLE \`${tableName}\``);
        } catch (err: any) {
          // Table might not exist or can't be truncated, continue with insert
        }

        // Batch insert for better performance
        const batchSize = 100;
        for (let i = 0; i < data.length; i += batchSize) {
          const batch = data.slice(i, i + batchSize);
          const columnNames = columns.map(col => `\`${col}\``).join(', ');

          const valueStrings: string[] = [];
          const allValues: any[] = [];

          for (let j = 0; j < batch.length; j++) {
            const row = batch[j];
            const placeholders = columns.map((_, idx) => '?').join(', ');
            valueStrings.push(`(${placeholders})`);
            columns.forEach(col => allValues.push(row[col]));
          }

          const query = `INSERT INTO \`${tableName}\` (${columnNames}) VALUES ${valueStrings.join(', ')}`;

          try {
            await connection.execute(query, allValues);
            rowsLoaded += batch.length;
          } catch (err: any) {
            // If batch fails, try individual inserts
            for (let k = 0; k < batch.length; k++) {
              const row = batch[k];
              const colNames = columns.map(col => `\`${col}\``).join(', ');
              const placeholders = columns.map((_, idx) => '?').join(', ');
              const values = columns.map(col => row[col]);

              try {
                await connection.execute(`INSERT INTO \`${tableName}\` (${colNames}) VALUES (${placeholders})`, values);
                rowsLoaded++;
              } catch (rowErr: any) {
                errors.push({
                  row: i + k,
                  error: rowErr.message,
                });
              }
            }
          }
        }
      }

      await connection.end();

      return {
        rowsLoaded,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error: any) {
      await connection.end();
      throw new Error(`MySQL load data failed: ${error.message}`);
    }
  }
}
