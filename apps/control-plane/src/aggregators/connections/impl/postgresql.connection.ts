import { ConnectionHandler, SchemaDiscoveryResult, TablePreviewResult, LoadDataInput, LoadDataResult } from '../connection-factory.service';

export class PostgreSQLConnection implements ConnectionHandler {
  async test(config: Record<string, any>, credentials: Record<string, string>): Promise<any> {
    // Support both connection string and individual fields
    let connectionString = credentials.connectionString || config.connectionString;

    if (!connectionString) {
      // Build connection string from individual fields
      const host = config.host || credentials.host;
      const port = config.port || credentials.port || 5432;
      const database = config.database || credentials.database;
      const user = credentials.username || credentials.user;
      const password = credentials.password;

      if (!host) {
        throw new Error('Missing required PostgreSQL config: host or connectionString');
      }
      if (!user) {
        throw new Error('Missing required PostgreSQL credentials: username');
      }
      if (!password) {
        throw new Error('Missing required PostgreSQL credentials: password');
      }
      if (!database) {
        throw new Error('Missing required PostgreSQL config: database');
      }

      connectionString = `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
      
      // Add SSL if configured
      if (config.ssl || credentials.ssl) {
        connectionString += '?sslmode=require';
      }
    }

    // Dynamic import to avoid loading if not needed
    const { Client } = await import('pg');

    const client = new Client({
      connectionString,
      // Connection timeout
      connectionTimeoutMillis: 30000,
      // Query timeout
      query_timeout: 30000,
      // SSL configuration
      ssl: config.sslMode || credentials.sslMode ? {
        rejectUnauthorized: config.sslRejectUnauthorized !== false,
      } : undefined,
    });

    try {
      await client.connect();
      
      // Test the connection with a simple query
      const result = await client.query('SELECT 1 as test, version() as version');
      
      await client.end();

      return {
        success: true,
        connectionString: connectionString.replace(/:[^:@]+@/, ':****@'), // Mask password
        postgresVersion: result.rows[0]?.version || 'unknown',
        testPassed: result.rows[0]?.test === 1,
      };
    } catch (error: any) {
      if (client) {
        await client.end().catch(() => {}); // Ignore cleanup errors
      }
      throw new Error(`PostgreSQL connection failed: ${error.message}`);
    }
  }

  async discoverSchema(config: Record<string, any>, credentials: Record<string, string>): Promise<SchemaDiscoveryResult> {
    let connectionString = credentials.connectionString || config.connectionString;

    if (!connectionString) {
      const host = config.host || credentials.host;
      const port = config.port || credentials.port || 5432;
      const database = config.database || credentials.database;
      const user = credentials.username || credentials.user;
      const password = credentials.password;

      connectionString = `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
      if (config.ssl || credentials.ssl) {
        connectionString += '?sslmode=require';
      }
    }

    const { Client } = await import('pg');
    const client = new Client({
      connectionString,
      connectionTimeoutMillis: 30000,
      query_timeout: 30000,
    });

    try {
      await client.connect();

      // Query information_schema to get tables and columns
      const result = await client.query(`
        SELECT 
          t.table_name as name,
          c.column_name as column_name,
          c.data_type as data_type,
          c.is_nullable as is_nullable,
          COALESCE(
            (SELECT 'YES' FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
             WHERE tc.table_name = t.table_name 
               AND tc.constraint_type = 'PRIMARY KEY'
               AND kcu.column_name = c.column_name
               LIMIT 1),
            'NO'
          ) as is_primary_key
        FROM information_schema.tables t
        LEFT JOIN information_schema.columns c ON t.table_name = c.table_name
        WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
        ORDER BY t.table_name, c.ordinal_position
      `);

      // Group columns by table
      const tablesMap = new Map<string, any[]>();
      for (const row of result.rows) {
        if (!tablesMap.has(row.name)) {
          tablesMap.set(row.name, []);
        }
        tablesMap.get(row.name)!.push({
          name: row.column_name,
          type: row.data_type,
          nullable: row.is_nullable === 'YES',
          primaryKey: row.is_primary_key === 'YES',
        });
      }

      // Query foreign key relationships
      const fkResult = await client.query(`
        SELECT 
          tc.table_name as from_table,
          kcu.column_name as from_column,
          ccu.table_name as to_table,
          ccu.column_name as to_column,
          tc.constraint_name as constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
          ON tc.constraint_name = kcu.constraint_name 
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' 
          AND tc.table_schema = 'public'
        ORDER BY tc.table_name, kcu.column_name
      `);

      const relationships = fkResult.rows.map((row: any) => ({
        fromTable: row.from_table,
        fromColumn: row.from_column,
        toTable: row.to_table,
        toColumn: row.to_column,
        constraintName: row.constraint_name,
      }));

      await client.end();

      return {
        tables: Array.from(tablesMap.entries()).map(([name, columns]) => ({
          name,
          columns,
        })),
        relationships,
      };
    } catch (error: any) {
      await client.end().catch(() => {});
      throw new Error(`PostgreSQL schema discovery failed: ${error.message}`);
    }
  }

  async previewTable(
    config: Record<string, any>,
    credentials: Record<string, string>,
    tableName: string,
    limit: number = 10
  ): Promise<TablePreviewResult> {
    let connectionString = credentials.connectionString || config.connectionString;

    if (!connectionString) {
      const host = config.host || credentials.host;
      const port = config.port || credentials.port || 5432;
      const database = config.database || credentials.database;
      const user = credentials.username || credentials.user;
      const password = credentials.password;

      connectionString = `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
      if (config.ssl || credentials.ssl) {
        connectionString += '?sslmode=require';
      }
    }

    const { Client } = await import('pg');
    const client = new Client({
      connectionString,
      connectionTimeoutMillis: 30000,
      query_timeout: 30000,
    });

    try {
      // Validate table name to prevent SQL injection
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
        throw new Error('Invalid table name');
      }

      await client.connect();
      const result = await client.query(`SELECT * FROM "${tableName}" LIMIT $1`, [limit]);
      await client.end();

      return {
        tableName,
        rows: result.rows,
        rowCount: result.rows.length,
      };
    } catch (error: any) {
      await client.end().catch(() => {});
      throw new Error(`PostgreSQL table preview failed: ${error.message}`);
    }
  }

  /**
   * Infer PostgreSQL column type from JavaScript value
   */
  private inferPostgresType(value: any): string {
    if (value === null || value === undefined) {
      return 'TEXT';
    }
    
    const type = typeof value;
    
    if (type === 'number') {
      return Number.isInteger(value) ? 'INTEGER' : 'NUMERIC';
    }
    if (type === 'boolean') {
      return 'BOOLEAN';
    }
    if (type === 'object') {
      if (value instanceof Date) {
        return 'TIMESTAMP';
      }
      // Check for ISO date string
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
        return 'TIMESTAMP';
      }
      // Check for JSON object
      return 'JSONB';
    }
    return 'TEXT';
  }

  /**
   * Create table if it doesn't exist, based on the data schema
   */
  private async createTableIfNotExists(
    client: any,
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
    const checkQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      );
    `;
    const result = await client.query(checkQuery, [tableName]);
    
    if (result.rows[0]?.exists) {
      return false; // Table already exists
    }

    // Build CREATE TABLE statement
    const columnDefs = columns.map(col => {
      // Get a sample value to infer type
      const sampleValue = data.find(row => row[col] !== undefined && row[col] !== null)?.[col];
      const pgType = this.inferPostgresType(sampleValue);
      return `"${col}" ${pgType}`;
    });

    const createQuery = `CREATE TABLE "${tableName}" (${columnDefs.join(', ')});`;
    
    await client.query(createQuery);
    return true; // Table was created
  }

  async loadData(
    config: Record<string, any>,
    credentials: Record<string, string>,
    input: LoadDataInput
  ): Promise<LoadDataResult> {
    let connectionString = credentials.connectionString || config.connectionString;

    if (!connectionString) {
      const host = config.host || credentials.host;
      const port = config.port || credentials.port || 5432;
      const database = config.database || credentials.database;
      const user = credentials.username || credentials.user;
      const password = credentials.password;

      connectionString = `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
      if (config.ssl || credentials.ssl) {
        connectionString += '?sslmode=require';
      }
    }

    const { Client } = await import('pg');
    const client = new Client({
      connectionString,
      connectionTimeoutMillis: 30000,
      query_timeout: 60000, // Longer timeout for bulk inserts
    });

    const { tableName, data, mode, conflictKey, conflictResolution, autoCreateTable } = input;

    // Validate table name to prevent SQL injection
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
      throw new Error('Invalid table name');
    }

    if (!data || data.length === 0) {
      return { rowsLoaded: 0 };
    }

    try {
      await client.connect();

      // Get columns from the first row
      const columns = Object.keys(data[0]);
      if (columns.length === 0) {
        return { rowsLoaded: 0 };
      }

      // Auto-create table if it doesn't exist (if enabled)
      const tableCreated = autoCreateTable ? await this.createTableIfNotExists(client, tableName, data) : false;
      if (tableCreated) {
        console.log(`[PostgreSQL] Auto-created table "${tableName}" based on source data schema`);
      }

      const errors: Array<{ row: number; error: string }> = [];
      let rowsLoaded = 0;

      if (mode === 'insert') {
        // Simple INSERT for each row
        for (let i = 0; i < data.length; i++) {
          const row = data[i];
          const columnNames = columns.map(col => `"${col}"`).join(', ');
          const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');
          const values = columns.map(col => row[col]);

          const query = `INSERT INTO "${tableName}" (${columnNames}) VALUES (${placeholders})`;

          try {
            await client.query(query, values);
            rowsLoaded++;
          } catch (err: any) {
            errors.push({
              row: i,
              error: err.message,
            });
          }
        }
      } else if (mode === 'upsert' && conflictKey && conflictKey.length > 0) {
        // UPSERT (INSERT ... ON CONFLICT)
        const conflictColumns = conflictKey.map(col => `"${col}"`).join(', ');
        
        for (let i = 0; i < data.length; i++) {
          const row = data[i];
          const columnNames = columns.map(col => `"${col}"`).join(', ');
          const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');
          const values = columns.map(col => row[col]);

          // Build ON CONFLICT clause
          let updateClause = '';
          if (conflictResolution === 'replace') {
            // Replace all non-conflict columns
            const nonConflictCols = columns.filter(col => !conflictKey.includes(col));
            updateClause = nonConflictCols.map(col => `"${col}" = EXCLUDED."${col}"`).join(', ');
          } else if (conflictResolution === 'merge') {
            // Skip on conflict
            updateClause = 'DO NOTHING';
          } else {
            // Default: skip
            updateClause = 'DO NOTHING';
          }

          const query = `
            INSERT INTO "${tableName}" (${columnNames}) 
            VALUES (${placeholders}) 
            ON CONFLICT (${conflictColumns}) 
            ${updateClause !== 'DO NOTHING' ? `DO UPDATE SET ${updateClause}` : updateClause}
          `;

          try {
            await client.query(query, values);
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
          await client.query(`TRUNCATE TABLE "${tableName}" RESTART IDENTITY CASCADE`);
        } catch (err: any) {
          // Table might not exist or can't be truncated, continue with insert
        }

        // Batch insert for better performance
        const batchSize = 100;
        for (let i = 0; i < data.length; i += batchSize) {
          const batch = data.slice(i, i + batchSize);
          const columnNames = columns.map(col => `"${col}"`).join(', ');

          const valueStrings: string[] = [];
          const allValues: any[] = [];
          
          for (let j = 0; j < batch.length; j++) {
            const row = batch[j];
            const placeholders = columns.map((_, idx) => `$${allValues.length + idx + 1}`).join(', ');
            valueStrings.push(`(${placeholders})`);
            columns.forEach(col => allValues.push(row[col]));
          }

          const query = `INSERT INTO "${tableName}" (${columnNames}) VALUES ${valueStrings.join(', ')}`;

          try {
            await client.query(query, allValues);
            rowsLoaded += batch.length;
          } catch (err: any) {
            // If batch fails, try individual inserts
            for (let k = 0; k < batch.length; k++) {
              const row = batch[k];
              const colNames = columns.map(col => `"${col}"`).join(', ');
              const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');
              const values = columns.map(col => row[col]);

              try {
                await client.query(`INSERT INTO "${tableName}" (${colNames}) VALUES (${placeholders})`, values);
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

      await client.end();

      return {
        rowsLoaded,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error: any) {
      await client.end().catch(() => {});
      throw new Error(`PostgreSQL load data failed: ${error.message}`);
    }
  }
}
