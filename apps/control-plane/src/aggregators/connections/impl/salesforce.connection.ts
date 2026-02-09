import { ConnectionTester } from '../connection-factory.service';

export class SalesforceConnection implements ConnectionTester {
  async test(config: Record<string, any>, credentials: Record<string, string>): Promise<any> {
    const instanceUrl = credentials.instanceUrl || config.instanceUrl;
    const accessToken = credentials.accessToken || credentials.apiKey;
    const apiVersion = config.apiVersion || 'v59.0';

    if (!instanceUrl) {
      throw new Error('Missing required Salesforce credentials: instanceUrl');
    }
    if (!accessToken) {
      throw new Error('Missing required Salesforce credentials: accessToken or apiKey');
    }

    // Normalize instance URL
    const baseUrl = instanceUrl.replace(/\/$/, ''); // Remove trailing slash
    const apiUrl = `${baseUrl}/services/data/${apiVersion}/`;

    try {
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Salesforce API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();

      return {
        success: true,
        instanceUrl: baseUrl,
        apiVersion,
        apiStatus: 'connected',
        availableResources: data.length || 0,
      };
    } catch (error: any) {
      if (error.message.includes('Salesforce API error')) {
        throw error;
      }
      throw new Error(`Salesforce connection failed: ${error.message}`);
    }
  }
}
