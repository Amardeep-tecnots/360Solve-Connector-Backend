import { Injectable, Logger } from '@nestjs/common';

interface ParsedDocumentation {
  success: boolean;
  endpoints: Array<{
    path: string;
    method: string;
    description?: string;
    parameters?: any[];
    responses?: any[];
  }>;
  authentication?: {
    type: string;
    details?: any;
  };
  errors?: string[];
}

@Injectable()
export class DocumentationParserService {
  private readonly logger = new Logger(DocumentationParserService.name);

  async parse(documentationUrl: string): Promise<ParsedDocumentation> {
    try {
      this.logger.log(`Parsing documentation from: ${documentationUrl}`);

      // Fetch documentation content
      // TODO: Implement actual HTTP fetch
      const content = '{}';

      // Detect format (OpenAPI/Swagger, JSON, HTML, etc.)
      const format = this.detectFormat(content);

      // Parse based on format
      let parsed: any;
      switch (format) {
        case 'openapi':
          parsed = this.parseOpenAPI(content);
          break;
        case 'json':
          parsed = this.parseJSON(content);
          break;
        case 'html':
          parsed = this.parseHTML(content);
          break;
        default:
          return {
            success: false,
            endpoints: [],
            errors: [`Unsupported documentation format: ${format}`],
          };
      }

      // Extract endpoints
      const endpoints = this.extractEndpoints(parsed);

      // Extract authentication info
      const authentication = this.extractAuthentication(parsed);

      this.logger.log(`Documentation parsed successfully: ${endpoints.length} endpoints`);

      return {
        success: true,
        endpoints,
        authentication,
      };

    } catch (error) {
      this.logger.error(`Documentation parsing failed: ${error.message}`, error.stack);
      return {
        success: false,
        errors: [error.message],
        endpoints: [],
      };
    }
  }

  private detectFormat(content: string): string {
    // Try to detect OpenAPI/Swagger
    if (content.includes('openapi') || content.includes('swagger')) {
      return 'openapi';
    }

    // Try to parse as JSON
    try {
      JSON.parse(content);
      return 'json';
    } catch {
      // Not JSON
    }

    // Default to HTML
    return 'html';
  }

  private parseOpenAPI(content: string): any {
    const spec = JSON.parse(content);
    
    // Handle both OpenAPI 3.0 and Swagger 2.0
    const paths = spec.paths || {};
    const endpoints: any[] = [];

    for (const [path, methods] of Object.entries(paths)) {
      for (const [method, details] of Object.entries(methods as any)) {
        if (['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
          endpoints.push({
            path,
            method: method.toUpperCase(),
            description: (details as any).summary || (details as any).description,
            parameters: (details as any).parameters || [],
            responses: (details as any).responses || {},
          });
        }
      }
    }

    return {
      spec,
      endpoints,
      authentication: spec.security || spec.securityDefinitions,
    };
  }

  private parseJSON(content: string): any {
    const json = JSON.parse(content);
    
    // Try to extract endpoints from JSON structure
    const endpoints: any[] = [];
    
    if (json.endpoints) {
      for (const endpoint of json.endpoints) {
        endpoints.push({
          path: endpoint.path,
          method: endpoint.method || 'GET',
          description: endpoint.description,
          parameters: endpoint.parameters || [],
          responses: endpoint.responses || [],
        });
      }
    }

    return {
      spec: json,
      endpoints,
    };
  }

  private parseHTML(content: string): any {
    // For HTML documentation, we'd need to use a parser
    // For now, return empty structure
    return {
      spec: {},
      endpoints: [],
    };
  }

  private extractEndpoints(parsed: any): any[] {
    return parsed.endpoints || [];
  }

  private extractAuthentication(parsed: any): any {
    if (parsed.authentication) {
      return {
        type: this.detectAuthType(parsed.authentication),
        details: parsed.authentication,
      };
    }
    return undefined;
  }

  private detectAuthType(auth: any): string {
    if (auth.type) return auth.type;
    if (auth.apiKey) return 'apiKey';
    if (auth.oauth2) return 'oauth2';
    if (auth.bearer) return 'bearer';
    if (auth.basic) return 'basic';
    return 'unknown';
  }
}
