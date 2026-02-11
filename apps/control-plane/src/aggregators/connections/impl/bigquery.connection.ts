import { ConnectionTester } from '../connection-factory.service';

export class BigQueryConnection implements ConnectionTester {
  async test(config: Record<string, any>, credentials: Record<string, string>): Promise<any> {
    const projectId = config.projectId || credentials.projectId;
    const clientEmail = credentials.clientEmail || credentials.client_email;
    const privateKey = credentials.privateKey || credentials.private_key;

    if (!projectId) {
      throw new Error('Missing required BigQuery config: projectId');
    }
    if (!clientEmail) {
      throw new Error('Missing required BigQuery credentials: clientEmail');
    }
    if (!privateKey) {
      throw new Error('Missing required BigQuery credentials: privateKey');
    }

    try {
      // Dynamic import to avoid loading if not needed
      const { BigQuery } = await import('@google-cloud/bigquery');

      const bigquery = new BigQuery({
        projectId,
        credentials: {
          client_email: clientEmail,
          private_key: privateKey.replace(/\\n/g, '\n'), // Handle escaped newlines
        },
      });

      // Test with a simple query - get datasets
      const [datasets] = await bigquery.getDatasets({ maxResults: 5 });

      return {
        success: true,
        projectId,
        clientEmail,
        datasetsFound: datasets.length,
        status: 'connected',
      };
    } catch (error: any) {
      throw new Error(`BigQuery connection failed: ${error.message}`);
    }
  }
}
