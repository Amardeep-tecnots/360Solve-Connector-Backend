import { ConnectionTester } from '../connection-factory.service';

export class SnowflakeConnection implements ConnectionTester {
  async test(config: Record<string, any>, credentials: Record<string, string>): Promise<any> {
    const account = credentials.account || config.account;
    const username = credentials.username || credentials.user;
    const password = credentials.password;
    const warehouse = config.warehouse || credentials.warehouse;
    const database = config.database || credentials.database;
    const schema = config.schema || credentials.schema || 'PUBLIC';

    if (!account) {
      throw new Error('Missing required Snowflake credentials: account');
    }
    if (!username) {
      throw new Error('Missing required Snowflake credentials: username');
    }
    if (!password) {
      throw new Error('Missing required Snowflake credentials: password');
    }

    try {
      // Dynamic import to avoid loading if not needed
      const snowflake = await import('snowflake-sdk');

      const connection = snowflake.createConnection({
        account,
        username,
        password,
        warehouse,
        database,
        schema,
        // Connection timeout
        timeout: 30000,
      });

      return new Promise((resolve, reject) => {
        connection.connect((err: any) => {
          if (err) {
            reject(new Error(`Snowflake connection failed: ${err.message}`));
            return;
          }

          // Test with a simple query
          connection.execute({
            sqlText: 'SELECT 1 as test, CURRENT_VERSION() as version',
            complete: (err: any, stmt: any, rows: any[]) => {
              if (err) {
                connection.destroy(() => {});
                reject(new Error(`Snowflake query failed: ${err.message}`));
                return;
              }

              connection.destroy(() => {});

              resolve({
                success: true,
                account,
                warehouse,
                database,
                schema,
                snowflakeVersion: rows[0]?.VERSION || 'unknown',
                testPassed: rows[0]?.TEST === 1,
              });
            },
          });
        });
      });
    } catch (error: any) {
      throw new Error(`Snowflake connection failed: ${error.message}`);
    }
  }
}
