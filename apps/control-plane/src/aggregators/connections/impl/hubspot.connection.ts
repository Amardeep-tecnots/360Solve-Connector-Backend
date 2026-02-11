import { ConnectionTester } from '../connection-factory.service';

export class HubSpotConnection implements ConnectionTester {
  async test(config: Record<string, any>, credentials: Record<string, string>): Promise<any> {
    const apiKey = credentials.apiKey || credentials.accessToken || credentials.hapikey;

    if (!apiKey) {
      throw new Error('Missing required HubSpot credentials: apiKey or accessToken');
    }

    try {
      const response = await fetch('https://api.hubapi.com/integrations/v1/me', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HubSpot API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();

      return {
        success: true,
        hubId: data.hubId,
        portalId: data.portalId,
        appId: data.appId,
        accountStatus: data.status,
        apiStatus: 'connected',
      };
    } catch (error: any) {
      if (error.message.includes('HubSpot API error')) {
        throw error;
      }
      throw new Error(`HubSpot connection failed: ${error.message}`);
    }
  }
}
