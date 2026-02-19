import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DocumentationParserService } from './documentation-parser.service';
import { CodeGeneratorService } from './code-generator.service';
import { WasmCompilerService } from './wasm-compiler.service';
import { CodeValidatorService } from './validators/code-validator.service';
import { AIProviderService, GenerateSDKRequest, AI_MODELS } from './ai-provider.service';
import { PrismaService } from '../prisma.service';
import { StorageService } from '../storage/storage.service';
import { ConfigService } from '@nestjs/config';

export interface GeneratedSDK {
  id: string;
  name: string;
  code: string;
  wasmBinary?: string | Buffer | null;
  jsCode?: string;
  openApiSpec: string;
  createdAt: Date;
}

/**
 * Model selection configuration
 */
interface ModelConfig {
  model: string;
  maxTokens: number;
  chunkSize: number;
  fallback?: string;
}

@Injectable()
export class SDKGeneratorService {
  private readonly logger = new Logger(SDKGeneratorService.name);
  private readonly aiTier: 'free' | 'paid';

  constructor(
    private readonly aiProvider: AIProviderService,
    private readonly docParser: DocumentationParserService,
    private readonly codeGenerator: CodeGeneratorService,
    private readonly wasmCompiler: WasmCompilerService,
    private readonly codeValidator: CodeValidatorService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly configService: ConfigService,
  ) {
    // Determine AI tier from environment (for future upgrade path)
    this.aiTier = this.configService.get<string>('AI_TIER', 'free') as 'free' | 'paid';
    this.logger.log(`SDK Generator initialized with tier: ${this.aiTier}`);
  }

  /**
   * Generate SDK from OpenAPI spec using AI
   * Supports large specs through intelligent chunking
   */
  async generateSDK(request: GenerateSDKRequest): Promise<{
    success: boolean;
    sdkId?: string;
    code?: string;
    wasmBinary?: string | Buffer | null;
    jsCode?: string;
    errors?: string[];
    chunksProcessed?: number;
    modelUsed?: string;
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

      // Determine the class name and aggregator ID
      // Priority: 1) aggregatorId (link to existing), 2) className, 3) default
      let sdkId: string;
      let aggregatorName: string;
      
      if (request.aggregatorId) {
        // Link to existing aggregator - get its name
        const existingAgg = await this.prisma.aggregator.findUnique({
          where: { id: request.aggregatorId },
        });
        
        if (!existingAgg) {
          return { 
            success: false, 
            errors: [`Aggregator not found: ${request.aggregatorId}`] 
          };
        }
        
        sdkId = request.aggregatorId;
        aggregatorName = existingAgg.name;
        this.logger.log(`Linking SDK to existing aggregator: ${existingAgg.name}`);
      } else {
        // Create new aggregator
        // Use hyphens instead of underscores - MinIO doesn't support underscores in object names
        sdkId = `sdk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        aggregatorName = request.className || 'GeneratedSDK';
      }
      
      const className = aggregatorName;
      this.logger.log(`Generating SDK: ${className} from OpenAPI spec (tier: ${this.aiTier})`);

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
        return { success: false, errors: ['Invalid OpenAPI spec format. Please provide valid JSON.'] };
      }

      // Step 2: Analyze spec size and select appropriate model
      const paths = Object.keys(parsedSpec.paths || {});
      const endpointCount = paths.length;
      const specSizeKB = JSON.stringify(parsedSpec).length / 1024;
      
      // Get best model configuration based on spec size
      const modelConfig = this.selectModel(endpointCount, specSizeKB);
      this.logger.log(`Selected model: ${modelConfig.model} for ${endpointCount} endpoints (${specSizeKB.toFixed(1)}KB)`);

      // Step 3: Determine if chunking is needed
      let sdkCode: string;
      
      if (endpointCount <= modelConfig.chunkSize) {
        // Small spec - generate in single pass
        this.logger.log(`Small spec (${endpointCount} endpoints) - single pass generation`);
        sdkCode = await this.generateSDKWithAI(parsedSpec, className, modelConfig);
      } else {
        // Large spec - use chunking strategy
        this.logger.log(`Large spec (${endpointCount} endpoints) - chunking with ${Math.ceil(endpointCount / modelConfig.chunkSize)} chunks`);
        sdkCode = await this.generateSDKWithChunking(parsedSpec, className, modelConfig);
      }

      if (!sdkCode) {
        return { success: false, errors: ['Failed to generate SDK code with AI'] };
      }

      // Step 4: Validate the generated code
      const validation = await this.codeValidator.validate(sdkCode);
      if (!validation.valid) {
        this.logger.warn(`Generated code has validation issues: ${validation.errors?.join(', ')}`);
      }

      // Step 5: Compile to WASM
      const compiled = await this.wasmCompiler.compile(sdkCode);

      // Step 6: Save to database and storage
      // Store code in S3
      await this.storage.uploadFile(
        `tenants/global/sdks/${sdkId}/code.ts`,
        sdkCode,
        'text/typescript'
      );

      // Check if we're updating an existing aggregator or creating new
      const existingAggregator = await this.prisma.aggregator.findUnique({
        where: { id: sdkId },
      });

      if (existingAggregator) {
        // Update existing aggregator with SDK reference
        await this.prisma.aggregator.update({
          where: { id: sdkId },
          data: {
            name: className,
            description: `AI-generated SDK from OpenAPI spec (${endpointCount} endpoints)`,
            configSchema: {
              baseUrl: parsedSpec.servers?.[0]?.url || '',
              authType: 'bearer',
              endpointCount,
              modelUsed: modelConfig.model,
            },
            sdkRef: `s3://tenants/global/sdks/${sdkId}/code.ts`,
            sdkVersion: (existingAggregator.sdkVersion || 0) + 1,
          },
        });
      } else {
        // Create new aggregator
        await this.prisma.aggregator.create({
          data: {
            id: sdkId,
            tenantId: 'system',
            name: className,
            description: `AI-generated SDK from OpenAPI spec (${endpointCount} endpoints)`,
            category: 'API',
            type: 'CLOUD',
            version: '1.0.0',
            capabilities: ['read', 'query'],
            authMethods: ['apiKey', 'bearer'],
            configSchema: {
              baseUrl: parsedSpec.servers?.[0]?.url || '',
              authType: 'bearer',
              endpointCount,
              modelUsed: modelConfig.model,
            },
            sdkRef: `s3://tenants/global/sdks/${sdkId}/code.ts`,
            sdkVersion: 1,
            isPublic: false,
          },
        });
      }

      this.logger.log(`SDK generated successfully: ${sdkId}`);

      return {
        success: true,
        sdkId,
        code: sdkCode,
        wasmBinary: compiled.wasmBinary,
        modelUsed: modelConfig.model,
        chunksProcessed: Math.ceil(endpointCount / modelConfig.chunkSize),
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
   * Select the best model based on endpoint count and spec size
   */
  private selectModel(endpointCount: number, specSizeKB: number): ModelConfig {
    return this.aiProvider.selectBestModel(endpointCount, specSizeKB, this.aiTier);
  }

  /**
   * Generate SDK using chunking strategy for large specs
   */
  private async generateSDKWithChunking(
    openApiSpec: any,
    className: string,
    modelConfig: ModelConfig
  ): Promise<string> {
    const paths = Object.keys(openApiSpec.paths || {});
    const totalEndpoints = paths.length;
    const chunkSize = modelConfig.chunkSize;
    
    // Create chunks
    const chunks = this.chunkOpenApiSpec(openApiSpec, chunkSize);
    this.logger.log(`Split spec into ${chunks.length} chunks of ~${chunkSize} endpoints each`);

    // Generate SDK parts in parallel
    const sdkParts = await this.generateSDKPartsInParallel(chunks, className, modelConfig);

    // Merge all parts into single SDK
    const mergedSDK = this.mergeSDKParts(sdkParts, className);
    
    return mergedSDK;
  }

  /**
   * Split OpenAPI spec into manageable chunks
   */
  private chunkOpenApiSpec(openApiSpec: any, chunkSize: number): any[] {
    const paths = Object.keys(openApiSpec.paths || {});
    const chunks: any[] = [];
    
    for (let i = 0; i < paths.length; i += chunkSize) {
      const chunkPaths = paths.slice(i, i + chunkSize);
      const chunkNumber = Math.floor(i / chunkSize) + 1;
      
      // Create chunk with only the relevant paths
      const chunkSpec = {
        ...openApiSpec,
        paths: chunkPaths.reduce((acc: any, path: string) => {
          acc[path] = openApiSpec.paths[path];
          return acc;
        }, {}),
        info: {
          ...openApiSpec.info,
          title: `${openApiSpec.info?.title || 'API'} - Part ${chunkNumber}`,
          description: `${openApiSpec.info?.description || 'API'} - Chunk ${chunkNumber} of ${Math.ceil(paths.length / chunkSize)}`,
        }
      };
      
      chunks.push({
        spec: chunkSpec,
        chunkNumber,
        totalChunks: Math.ceil(paths.length / chunkSize),
        pathCount: chunkPaths.length,
      });
    }
    
    return chunks;
  }

  /**
   * Generate SDK parts in parallel for multiple chunks
   */
  private async generateSDKPartsInParallel(
    chunks: any[],
    className: string,
    modelConfig: ModelConfig
  ): Promise<string[]> {
    this.logger.log(`Generating ${chunks.length} SDK parts in parallel`);
    
    const generationPromises = chunks.map((chunk, index) => 
      this.generateSDKPartForChunk(chunk, className, modelConfig, index)
    );
    
    const results = await Promise.allSettled(generationPromises);
    
    const successfulParts: string[] = [];
    const errors: string[] = [];
    
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        successfulParts.push(result.value);
      } else {
        const errorMsg = result.status === 'rejected' 
          ? result.reason?.message 
          : 'Empty result';
        errors.push(`Chunk ${index + 1} failed: ${errorMsg}`);
        this.logger.error(`Failed to generate chunk ${index + 1}: ${errorMsg}`);
      }
    });
    
    if (successfulParts.length === 0) {
      throw new Error(`All chunks failed: ${errors.join(', ')}`);
    }
    
    if (errors.length > 0) {
      this.logger.warn(`Generated ${successfulParts.length}/${chunks.length} chunks successfully`);
    }
    
    return successfulParts;
  }

  /**
   * Generate SDK for a single chunk
   */
  private async generateSDKPartForChunk(
    chunk: any,
    className: string,
    modelConfig: ModelConfig,
    chunkIndex: number
  ): Promise<string> {
    const { spec, chunkNumber, totalChunks, pathCount } = chunk;
    const baseUrl = spec.servers?.[0]?.url || 'https://api.example.com';
    
    const systemPrompt = `You are an expert TypeScript developer. Generate a PARTIAL SDK class from the provided OpenAPI specification.

This is PART ${chunkNumber} of ${totalChunks} chunks.
Generate ONLY the methods for the endpoints in this chunk (${pathCount} endpoints).

Requirements:
1. Use modern TypeScript with proper types
2. Include proper error handling  
3. Use fetch API for HTTP requests
4. Include JSDoc comments
5. Handle authentication properly
6. Export all types and partial class

The partial class should be named: ${className}_Part${chunkNumber}`;

    const userPrompt = `Generate a TypeScript SDK partial class for PART ${chunkNumber} of ${totalChunks}:

Base URL: ${baseUrl}

Endpoints in this chunk (${pathCount} of total):
${Object.keys(spec.paths).map(path => {
  const methods = Object.keys(spec.paths[path]);
  return `  - ${path}: ${methods.join(', ')}`;
}).join('\n')}

OpenAPI spec for this chunk:
\`\`\`json
${JSON.stringify(spec, null, 2).slice(0, 50000)}
\`\`\`

Generate ONLY the TypeScript code for this chunk's endpoints. Include:
1. Type definitions for request/response
2. Methods for each endpoint in this chunk
3. Proper type safety
4. Error handling
5. Authentication support

IMPORTANT: This is a PARTIAL SDK. Include a comment at the top: "// PART ${chunkNumber}/${totalChunks}"
Respond ONLY with the TypeScript code, no markdown formatting.`;

    const code = await this.aiProvider.completeText(
      userPrompt,
      systemPrompt,
      {
        model: modelConfig.model,
        temperature: 0.3,
        maxTokens: modelConfig.maxTokens,
      }
    );

    return this.cleanGeneratedCode(code);
  }

  /**
   * Merge multiple SDK parts into a single cohesive SDK
   */
  private mergeSDKParts(parts: string[], className: string): string {
    if (parts.length === 0) {
      throw new Error('No SDK parts to merge');
    }
    
    if (parts.length === 1) {
      return parts[0];
    }

    this.logger.log(`Merging ${parts.length} SDK parts into single SDK`);

    // Extract types and classes from each part
    const allTypes: string[] = [];
    const allMethods: string[] = [];
    const allExports: string[] = [];
    
    for (const part of parts) {
      const cleaned = this.cleanGeneratedCode(part);
      
      // Extract type definitions (interfaces, types, enums)
      const typeMatches = cleaned.match(/(export\s+(?:interface|type|enum)\s+\w+[\s\S]*?)(?=\n(?:export|class|const|function|$))/g);
      if (typeMatches) {
        allTypes.push(...typeMatches);
      }
      
      // Extract method definitions
      const methodMatches = cleaned.match(/(?:async\s+)?(?:public\s+|private\s+|protected\s+)*(\w+)\s*\([^)]*\)\s*(?::\s*Promise<[^>]+>|\s*:\s*[^;{]+)\s*\{[\s\S]*?\n\s*\}/g);
      if (methodMatches) {
        allMethods.push(...methodMatches);
      }
    }

    // Build the merged SDK
    const mergedCode = `/**
 * Auto-generated SDK for API Integration
 * Generated using AI-powered SDK Generator
 * 
 * This SDK was generated from an OpenAPI specification using chunked processing.
 * Total parts merged: ${parts.length}
 */

${allTypes.join('\n\n')}

/**
 * Main SDK Class
 */
export class ${className} {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(config: { baseUrl: string; apiKey?: string; bearerToken?: string }) {
    this.baseUrl = config.baseUrl;
    this.headers = {
      'Content-Type': 'application/json',
    };
    
    if (config.apiKey) {
      this.headers['X-API-Key'] = config.apiKey;
    }
    if (config.bearerToken) {
      this.headers['Authorization'] = \`Bearer \${config.bearerToken}\`;
    }
  }

${allMethods.join('\n\n')}
}

export default ${className};
`;

    return mergedCode;
  }

  /**
   * Generate SDK using AI from OpenAPI spec (single chunk)
   */
  private async generateSDKWithAI(
    openApiSpec: any,
    className: string,
    modelConfig: ModelConfig
  ): Promise<string> {
    // Extract key info from the spec for the prompt
    const paths = Object.keys(openApiSpec.paths || {});
    const servers = openApiSpec.servers || [];
    const baseUrl = servers[0]?.url || 'https://api.example.com';
    
    // Build a summary of available endpoints
    const endpointsSummary = paths.map((path: string) => {
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

Available endpoints (${paths.length} total):
${endpointsSummary}

Full OpenAPI spec (JSON):
\`\`\`json
${JSON.stringify(openApiSpec, null, 2).slice(0, 80000)}
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
        model: modelConfig.model,
        temperature: 0.3,
        maxTokens: modelConfig.maxTokens,
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
    wasmBinary?: string | Buffer | null;
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
