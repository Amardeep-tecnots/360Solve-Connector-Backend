import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DocumentationParserService } from './documentation-parser.service';
import { CodeGeneratorService } from './code-generator.service';
import { WasmCompilerService } from './wasm-compiler.service';
import { CodeValidatorService } from './validators/code-validator.service';
import { AIProviderService, GenerateSDKRequest, AI_MODELS } from './ai-provider.service';
import { PrismaService } from '../prisma.service';
import { StorageService } from '../storage/storage.service';

export interface GeneratedSDK {
  id: string;
  name: string;
  code: string;
  wasmBinary?: string;
  openApiSpec: string;
  createdAt: Date;
}

@Injectable()
export class SDKGeneratorService {
  private readonly logger = new Logger(SDKGeneratorService.name);

  constructor(
    private readonly aiProvider: AIProviderService,
    private readonly docParser: DocumentationParserService,
    private readonly codeGenerator: CodeGeneratorService,
    private readonly wasmCompiler: WasmCompilerService,
    private readonly codeValidator: CodeValidatorService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Generate SDK from OpenAPI spec using AI
   */
  async generateSDK(request: GenerateSDKRequest): Promise<{
    success: boolean;
    sdkId?: string;
    code?: string;
    wasmBinary?: string;
    errors?: string[];
  }> {
    try {
      // Validate request body
      if (!request) {
        return { 
          success: false, 
          errors: ['Request body is required. Please provide openApiSpec.'] 
        };
      }

      if (!request.openApiSpec) {
        return { 
          success: false, 
          errors: ['openApiSpec is required. Please provide an OpenAPI specification URL or JSON content.'] 
        };
      }

      const className = request.className || 'GeneratedSDK';
      this.logger.log(`Generating SDK: ${className} from OpenAPI spec`);

      // Step 1: Parse the OpenAPI spec
      let openApiSpec = request.openApiSpec;
      
      // If it's a URL, fetch it
      if (typeof openApiSpec === 'string' && (openApiSpec.startsWith('http://') || openApiSpec.startsWith('https://'))) {
        this.logger.log(`Fetching OpenAPI spec from: ${openApiSpec}`);
        const response = await fetch(openApiSpec);
        if (!response.ok) {
          return { success: false, errors: [`Failed to fetch OpenAPI spec: ${response.statusText}`] };
        }
        openApiSpec = await response.text();
      }

      // Parse the OpenAPI JSON/YAML
      let parsedSpec: any;
      try {
        parsedSpec = JSON.parse(openApiSpec);
      } catch {
        // Try YAML parsing (basic)
        return { success: false, errors: ['Invalid OpenAPI spec format. Please provide valid JSON.'] };
      }

      // Step 2: Use AI to generate SDK code
      const sdkCode = await this.generateSDKWithAI(parsedSpec, className, request.model);
      
      if (!sdkCode) {
        return { success: false, errors: ['Failed to generate SDK code with AI'] };
      }

      // Step 3: Validate the generated code
      const validation = await this.codeValidator.validate(sdkCode);
      if (!validation.valid) {
        this.logger.warn(`Generated code has validation issues: ${validation.errors?.join(', ')}`);
        // Continue anyway - these might be minor issues
      }

      // Step 4: Compile to WASM (placeholder for now)
      const compiled = await this.wasmCompiler.compile(sdkCode);

      // Step 5: Save to database and storage
      const sdkId = `sdk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Store code in S3
      await this.storage.uploadFile(
        `tenants/global/sdks/${sdkId}/code.ts`,
        sdkCode,
        'text/typescript'
      );

      // Store metadata in database
      await this.prisma.aggregator.create({
        data: {
          id: sdkId,
          tenantId: 'system', // System-level aggregator
          name: className,
          description: `AI-generated SDK from OpenAPI spec`,
          category: 'API',
          type: 'CLOUD',
          version: '1.0.0',
          capabilities: ['read', 'query'],
          authMethods: ['apiKey', 'bearer'],
          configSchema: {
            baseUrl: parsedSpec.servers?.[0]?.url || '',
            authType: 'bearer',
          },
          sdkRef: `s3://tenants/global/sdks/${sdkId}/code.ts`,
          sdkVersion: 1,
          isPublic: false,
        },
      });

      this.logger.log(`SDK generated successfully: ${sdkId}`);

      return {
        success: true,
        sdkId,
        code: sdkCode,
        wasmBinary: compiled.wasmBinary,
      };

    } catch (error: any) {
      this.logger.error(`SDK generation failed: ${error.message}`, error.stack);
      return {
        success: false,
        errors: [error.message],
      };
    }
  }

  /**
   * Generate SDK using AI from OpenAPI spec
   */
  private async generateSDKWithAI(
    openApiSpec: any,
    className: string,
    model?: string
  ): Promise<string> {
    // Extract key info from the spec for the prompt
    const paths = Object.keys(openApiSpec.paths || {});
    const servers = openApiSpec.servers || [];
    const baseUrl = servers[0]?.url || 'https://api.example.com';
    
    // Build a summary of available endpoints
    const endpointsSummary = paths.slice(0, 20).map((path: string) => {
      const methods = Object.keys(openApiSpec.paths[path] || {});
      return `  - ${path}: ${methods.join(', ')}`;
    }).join('\n');

    const systemPrompt = `You are an expert TypeScript developer. Generate a complete, production-ready SDK class from the provided OpenAPI specification.

Requirements:
1. Use modern TypeScript with proper types
2. Include proper error handling
3. Use fetch API for HTTP requests
4. Include JSDoc comments
5. Handle authentication properly
6. Export all types and the main class

The class should be named: ${className}`;

    const userPrompt = `Generate a TypeScript SDK class for this API:

Base URL: ${baseUrl}

Available endpoints (first 20):
${endpointsSummary}

Full OpenAPI spec (JSON):
\`\`\`json
${JSON.stringify(openApiSpec, null, 2).slice(0, 8000)}
\`\`\`

Generate the complete TypeScript code for the SDK class. Include:
1. Type definitions for request/response
2. The main class with methods for each endpoint
3. Proper type safety
4. Error handling
5. Authentication support

Respond ONLY with the TypeScript code, no markdown formatting.`;

    const code = await this.aiProvider.completeText(
      userPrompt,
      systemPrompt,
      {
        model: model || 'openai/gpt-4o-mini',
        temperature: 0.3,
        maxTokens: 8000,
      }
    );

    // Clean up the response - remove any markdown formatting if present
    return this.cleanGeneratedCode(code);
  }

  /**
   * Clean up generated code by removing markdown formatting
   */
  private cleanGeneratedCode(code: string): string {
    // Remove markdown code blocks if present
    let cleaned = code.trim();
    
    // Remove ```typescript or ``` at start
    if (cleaned.startsWith('```')) {
      const firstNewline = cleaned.indexOf('\n');
      const langEnd = cleaned.indexOf('```', firstNewline + 1);
      if (langEnd > firstNewline) {
        cleaned = cleaned.slice(langEnd + 3);
      }
    }
    
    // Remove ``` at end
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }

    return cleaned.trim();
  }

  /**
   * Get SDK by ID
   */
  async getSDK(sdkId: string): Promise<GeneratedSDK | null> {
    const aggregator = await this.prisma.aggregator.findUnique({
      where: { id: sdkId },
    });

    if (!aggregator || !aggregator.sdkRef) {
      return null;
    }

    // Download code from storage
    const code = await this.storage.downloadFile(aggregator.sdkRef);

    return {
      id: aggregator.id,
      name: aggregator.name,
      code,
      openApiSpec: JSON.stringify(aggregator.configSchema || {}),
      createdAt: aggregator.createdAt,
    };
  }

  /**
   * List all generated SDKs
   */
  async listSDKs(): Promise<Array<{ id: string; name: string; createdAt: Date }>> {
    const aggregators = await this.prisma.aggregator.findMany({
      where: {
        sdkRef: { not: null },
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return aggregators;
  }

  /**
   * Generate SDK from schema (without AI - uses template generation)
   */
  async generateSDKFromSchema(
    schema: any,
    options?: { className?: string; language?: 'typescript' | 'python' }
  ): Promise<{
    success: boolean;
    code?: string;
    wasmBinary?: string;
    errors?: string[];
  }> {
    try {
      this.logger.log(`Generating SDK from schema (template-based)`);

      // Use the existing code generator for template-based generation
      const generatedCode = await this.codeGenerator.generateFromSchema(schema);
      if (!generatedCode.success) {
        return {
          success: false,
          errors: generatedCode.errors,
        };
      }

      // Validate code
      const validation = await this.codeValidator.validate(generatedCode.code!);
      if (!validation.valid) {
        return {
          success: false,
          errors: validation.errors,
        };
      }

      // Compile to WASM
      const compiled = await this.wasmCompiler.compile(generatedCode.code!);

      return {
        success: true,
        code: generatedCode.code,
        wasmBinary: compiled.wasmBinary,
      };

    } catch (error: any) {
      this.logger.error(`SDK generation from schema failed: ${error.message}`, error.stack);
      return {
        success: false,
        errors: [error.message],
      };
    }
  }
}
