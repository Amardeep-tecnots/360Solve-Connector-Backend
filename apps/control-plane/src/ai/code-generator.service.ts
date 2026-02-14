import { Injectable, Logger } from '@nestjs/common';

interface GeneratedCode {
  success: boolean;
  code?: string;
  errors?: string[];
}

@Injectable()
export class CodeGeneratorService {
  private readonly logger = new Logger(CodeGeneratorService.name);

  async generate(parsedDocs: any): Promise<GeneratedCode> {
    try {
      this.logger.log(`Generating TypeScript SDK code`);

      const endpoints = parsedDocs.endpoints || [];
      const authentication = parsedDocs.authentication;

      // Generate SDK code
      const code = this.generateSDKCode(endpoints, authentication);

      this.logger.log(`SDK code generated successfully`);

      return {
        success: true,
        code,
      };

    } catch (error) {
      this.logger.error(`Code generation failed: ${error.message}`, error.stack);
      return {
        success: false,
        errors: [error.message],
      };
    }
  }

  async generateFromSchema(schema: any): Promise<GeneratedCode> {
    try {
      this.logger.log(`Generating SDK from schema`);

      // Generate SDK code from schema
      const code = this.generateSDKFromSchema(schema);

      this.logger.log(`SDK from schema generated successfully`);

      return {
        success: true,
        code,
      };

    } catch (error) {
      this.logger.error(`SDK generation from schema failed: ${error.message}`, error.stack);
      return {
        success: false,
        errors: [error.message],
      };
    }
  }

  private generateSDKCode(endpoints: any[], authentication?: any): string {
    const className = 'GeneratedSDK';
    let code = `// Auto-generated SDK code
// DO NOT EDIT MANUALLY

import { HttpClient } from '@angular/common/http';

export class ${className} {
  private baseUrl: string;
  private http: HttpClient;

  constructor(baseUrl: string, http: HttpClient) {
    this.baseUrl = baseUrl;
    this.http = http;
  }

`;

    // Generate methods for each endpoint
    for (const endpoint of endpoints) {
      const methodName = this.getMethodName(endpoint.path, endpoint.method);
      const parameters = this.generateParameters(endpoint.parameters);
      const returnType = this.getReturnType(endpoint.responses);

      code += `  /**
   * ${endpoint.description || endpoint.method.toUpperCase() + ' ' + endpoint.path}
   */
  async ${methodName}(${parameters}): Promise<${returnType}> {
    const url = \`\${this.baseUrl}${endpoint.path}\`;
    
    // TODO: Implement actual HTTP call
    return this.http.${endpoint.method.toLowerCase()}(url).toPromise();
  }

`;
    }

    code += '}';
    return code;
  }

  private generateSDKFromSchema(schema: any): string {
    const className = 'SchemaGeneratedSDK';
    let code = `// Auto-generated SDK from schema
// DO NOT EDIT MANUALLY

import { HttpClient } from '@angular/common/http';

export class ${className} {
  private baseUrl: string;
  private http: HttpClient;

  constructor(baseUrl: string, http: HttpClient) {
    this.baseUrl = baseUrl;
    this.http = http;
  }

`;

    // Generate methods from schema
    if (schema.operations) {
      for (const operation of schema.operations) {
        const methodName = operation.name || operation.id;
        const parameters = operation.parameters ? Object.keys(operation.parameters).join(', ') : '';
        const returnType = operation.returnType || 'any';

        code += `  /**
   * ${operation.description || 'Auto-generated operation'}
   */
  async ${methodName}(${parameters}): Promise<${returnType}> {
    // TODO: Implement operation
    return {} as ${returnType};
  }

`;
      }
    }

    code += '}';
    return code;
  }

  private getMethodName(path: string, method: string): string {
    // Convert path to method name
    const parts = path.split('/').filter(p => p && !p.startsWith('{'));
    const name = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
    return method.toLowerCase() + name;
  }

  private generateParameters(parameters: any[]): string {
    if (!parameters || parameters.length === 0) {
      return '';
    }

    return parameters
      .map((param) => {
        const name = param.name || param.in;
        const type = param.type || 'any';
        return `${name}: ${type}`;
      })
      .join(', ');
  }

  private getReturnType(responses: any): string {
    if (!responses || Object.keys(responses).length === 0) {
      return 'any';
    }

    // Get the first response type
    const firstResponse = Object.values(responses)[0] as any;
    if (firstResponse && firstResponse.schema) {
      return firstResponse.schema.type || 'any';
    }

    return 'any';
  }
}
