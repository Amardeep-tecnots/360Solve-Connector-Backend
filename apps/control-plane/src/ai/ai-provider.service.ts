import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsString, IsOptional, MinLength, IsArray, ValidateNested, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * Supported AI providers
 */
export enum AIProvider {
  OPENROUTER = 'openrouter',
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  OLLAMA = 'ollama',
}

/**
 * Available models for each provider
 * Organized by tier for smart selection
 */
export const AI_MODELS: Record<AIProvider, string[]> = {
  [AIProvider.OPENROUTER]: [
    // === FREE MODELS (Best for budget-constrained usage) ===
    // Tier 1: General purpose (Most reliable free models)
    'meta-llama/llama-3.1-8b-instruct:free', // 128K context - Most reliable free
    'meta-llama/llama-3.3-70b-instruct:free', // 128K context - Most powerful free
    
    // Tier 2: Additional free options
    'google/gemma-3-27b-it:free',            // 131K context - Multimodal
    'nvidia/nemotron-nano-12b-vl-2:free',   // 128K context - NVIDIA optimized
    'deepseek/deepseek-chat:free',           // 64K context - Good for code
    'mistralai/mistral-nemo:free',           // 128K context - Fast option
    
    // === PAID MODELS (For when funded) ===
    // Note: Anthropic models are not available via OpenRouter - use direct API or OpenAI instead
    // Premium (Enterprise) - Using OpenAI models as replacement
    'openai/gpt-4o',                        // 128K context - Best quality
    'openai/gpt-4o-mini',                   // 128K context - Cost effective
    
    // Mid-tier (Balanced)
    'google/gemini-2.0-flash',               // 1M context - Fast & capable
    'deepseek/deepseek-chat',                // 64K context - Good for code
    
    // Standard
    'openai/gpt-4-turbo',
    'mistralai/mistral-7b-instruct',
  ],
  [AIProvider.OPENAI]: [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'gpt-3.5-turbo',
  ],
  [AIProvider.ANTHROPIC]: [
    'claude-3-5-sonnet-20241022',
    'claude-3-haiku-20240307',
    'claude-3-opus-20240229',
  ],
  [AIProvider.OLLAMA]: [
    'llama2',
    'llama3',
    'mistral',
    'codellama',
    'phi3',
  ],
};

/**
 * Request options for AI completion
 */
export interface AICompletionRequest {
  model?: string;
  messages: AIMessage[];
  temperature?: number;
  maxTokens?: number;
  tools?: AITool[];
  stream?: boolean;
}

/**
 * AI Message format
 */
export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  name?: string;
  tool_calls?: any[];
  tool_call_id?: string;
}

/**
 * AI Tool definition
 */
export interface AITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: any;
  };
}

/**
 * AI Completion response
 */
export interface AICompletionResponse {
  id: string;
  model: string;
  choices: {
    message: AIMessage;
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * SDK Credentials DTO
 */
export class SDKCredentialsDto {
  @ApiProperty({ 
    description: 'Base URL of the API',
    example: 'https://api.example.com'
  })
  @IsString()
  baseUrl!: string;

  @ApiPropertyOptional({ 
    description: 'API Key for authentication',
    example: 'sk-xxxxx'
  })
  @IsOptional()
  @IsString()
  apiKey?: string;

  @ApiPropertyOptional({ 
    description: 'Bearer token for OAuth/JWT authentication',
    example: 'eyJhbGciOiJIUzI1NiIs...'
  })
  @IsOptional()
  @IsString()
  bearerToken?: string;

  @ApiPropertyOptional({ 
    description: 'Request timeout in milliseconds',
    example: 30000
  })
  @IsOptional()
  timeout?: number;
}

/**
 * AI SDK Generation request DTO
 */
export class GenerateSDKRequest {
  @ApiProperty({ 
    description: 'OpenAPI spec URL or raw JSON content',
    example: 'https://petstore.swagger.io/v2/swagger.json'
  })
  @IsString()
  openApiSpec!: string;

  @ApiPropertyOptional({ 
    description: 'Custom model to use for generation',
    example: 'openai/gpt-4o-mini'
  })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ 
    description: 'SDK class name - used as the TypeScript class name in generated SDK',
    example: 'MyAPISDK'
  })
  @IsOptional()
  @IsString()
  className?: string;

  @ApiPropertyOptional({ 
    description: 'Existing aggregator ID to link the SDK to (preserves aggregator name)',
    example: 'agg_123abc'
  })
  @IsOptional()
  @IsString()
  aggregatorId?: string;

  @ApiPropertyOptional({ 
    description: 'API credentials to store for this SDK (used when executing SDK methods)',
    type: SDKCredentialsDto
  })
  @IsOptional()
  credentials?: SDKCredentialsDto;
}

/**
 * AI Workflow Generation request DTO
 */
export class GenerateWorkflowRequest {
  @ApiProperty({ 
    description: 'Natural language description of the workflow to generate',
    example: 'Extract customer data from MySQL and sync to Salesforce contacts'
  })
  @IsString()
  @MinLength(1, { message: 'Description is required' })
  description!: string;

  @ApiProperty({ 
    description: 'Source aggregator details',
    example: { type: 'database', aggregatorId: 'agg_123', table: 'customers' }
  })
  @IsOptional()
  source?: {
    type: 'database' | 'api';
    aggregatorId?: string;
    table?: string;
  };

  @ApiProperty({ 
    description: 'Destination aggregator details',
    example: { type: 'api', aggregatorId: 'agg_456', table: 'contacts' }
  })
  @IsOptional()
  destination?: {
    type: 'database' | 'api';
    aggregatorId?: string;
    table?: string;
  };

  @ApiPropertyOptional({ 
    description: 'Field mappings between source and destination',
    example: [{ source: 'name', destination: 'FirstName' }, { source: 'email', destination: 'Email' }]
  })
  @IsOptional()
  mappings?: Array<{
    source: string;
    destination: string;
    transform?: string;
  }>;

  @ApiPropertyOptional({ 
    description: 'Custom AI model to use',
    example: 'openai/gpt-4o-mini'
  })
  @IsOptional()
  @IsString()
  model?: string;
}

/**
 * Schema column DTO for mapping requests
 */
export class SchemaColumnDto {
  @ApiProperty({ description: 'Column name', example: 'user_id' })
  @IsString()
  name!: string;

  @ApiProperty({ description: 'Column data type', example: 'varchar(255)' })
  @IsString()
  type!: string;

  @ApiPropertyOptional({ description: 'Whether column is nullable', example: false })
  @IsOptional()
  @IsBoolean()
  nullable?: boolean;
}

/**
 * Table schema DTO for mapping requests
 */
export class TableSchemaDto {
  @ApiProperty({ description: 'Table name', example: 'users' })
  @IsString()
  tableName!: string;

  @ApiProperty({ 
    description: 'Table columns', 
    type: [SchemaColumnDto],
    example: [{ name: 'id', type: 'int' }, { name: 'name', type: 'varchar(255)' }]
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SchemaColumnDto)
  columns!: SchemaColumnDto[];
}

/**
 * AI Schema Mapping request DTO
 */
export class GenerateSchemaMappingRequest {
  @ApiProperty({ description: 'Source schema', type: TableSchemaDto })
  @ValidateNested()
  @Type(() => TableSchemaDto)
  sourceSchema!: TableSchemaDto;

  @ApiProperty({ description: 'Destination schema', type: TableSchemaDto })
  @ValidateNested()
  @Type(() => TableSchemaDto)
  destinationSchema!: TableSchemaDto;

  @ApiPropertyOptional({ description: 'Optional description of transformation' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Custom model to use', example: 'openai/gpt-4o-mini' })
  @IsOptional()
  @IsString()
  model?: string;
}

@Injectable()
export class AIProviderService {
  private readonly logger = new Logger(AIProviderService.name);
  private readonly openRouterApiKey: string;
  private readonly openAiApiKey: string;
  private readonly anthropicApiKey: string;
  private readonly defaultProvider: AIProvider;
  private readonly defaultModel: string;

  constructor(private readonly configService: ConfigService) {
    // Load API keys from environment
    this.openRouterApiKey = this.configService.get<string>('OPENROUTER_API_KEY', '');
    this.openAiApiKey = this.configService.get<string>('OPENAI_API_KEY', '');
    this.anthropicApiKey = this.configService.get<string>('ANTHROPIC_API_KEY', '');

    // Set default provider
    const provider = this.configService.get<string>('AI_PROVIDER', 'openrouter').toLowerCase();
    this.defaultProvider = this.getProviderFromString(provider);
    this.defaultModel = this.configService.get<string>('AI_DEFAULT_MODEL', 'openai/gpt-4o-mini');

    this.logger.log(`AI Provider initialized: ${this.defaultProvider} with model ${this.defaultModel}`);
  }

  /**
   * Get available models for a provider
   */
  getAvailableModels(provider?: AIProvider): string[] {
    const p = provider || this.defaultProvider;
    return AI_MODELS[p] || [];
  }

  /**
   * Get all supported providers
   */
  getSupportedProviders(): { id: string; name: string; models: string[] }[] {
    return Object.values(AIProvider).map(p => ({
      id: p,
      name: p.charAt(0).toUpperCase() + p.slice(1),
      models: AI_MODELS[p] || [],
    }));
  }

  /**
   * Send a completion request to the AI provider
   */
  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    const model = request.model || this.defaultModel;
    const provider = this.getProviderFromModel(model);

    this.logger.log(`Sending completion request to ${provider}: ${model}`);

    switch (provider) {
      case AIProvider.OPENROUTER:
        return this.callOpenRouter(request, model);
      case AIProvider.OPENAI:
        return this.callOpenAI(request, model);
      case AIProvider.ANTHROPIC:
        return this.callAnthropic(request, model);
      case AIProvider.OLLAMA:
        return this.callOllama(request, model);
      default:
        throw new BadRequestException(`Unsupported AI provider: ${provider}`);
    }
  }

  /**
   * Simple text completion (no tools)
   */
  async completeText(
    prompt: string,
    systemPrompt?: string,
    options?: { model?: string; temperature?: number; maxTokens?: number }
  ): Promise<string> {
    const messages: AIMessage[] = [];
    
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await this.complete({
      model: options?.model,
      messages,
      temperature: options?.temperature ?? 0.7,
      maxTokens: options?.maxTokens ?? 4096,
    });

    return response.choices[0]?.message?.content || '';
  }

  /**
   * Call OpenRouter API
   */
  private async callOpenRouter(request: AICompletionRequest, model: string): Promise<AICompletionResponse> {
    if (!this.openRouterApiKey) {
      throw new BadRequestException('OpenRouter API key not configured. Set OPENROUTER_API_KEY in environment.');
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.openRouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': this.configService.get<string>('APP_URL', 'http://localhost:3001'),
        'X-Title': '360Solve Connector',
      },
      body: JSON.stringify({
        model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 4096,
        tools: request.tools,
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`OpenRouter API error: ${error}`);
      throw new BadRequestException(`OpenRouter API error: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Call OpenAI API directly
   */
  private async callOpenAI(request: AICompletionRequest, model: string): Promise<AICompletionResponse> {
    if (!this.openAiApiKey) {
      throw new BadRequestException('OpenAI API key not configured. Set OPENAI_API_KEY in environment.');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.openAiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 4096,
        tools: request.tools,
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`OpenAI API error: ${error}`);
      throw new BadRequestException(`OpenAI API error: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Call Anthropic API
   */
  private async callAnthropic(request: AICompletionRequest, model: string): Promise<AICompletionResponse> {
    if (!this.anthropicApiKey) {
      throw new BadRequestException('Anthropic API key not configured. Set ANTHROPIC_API_KEY in environment.');
    }

    // Convert messages to Anthropic format
    const systemMessage = request.messages.find(m => m.role === 'system');
    const otherMessages = request.messages.filter(m => m.role !== 'system');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: otherMessages,
        system: systemMessage?.content,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 4096,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Anthropic API error: ${error}`);
      throw new BadRequestException(`Anthropic API error: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Convert Anthropic response to our format
    return {
      id: data.id,
      model: data.model,
      choices: [{
        message: {
          role: 'assistant',
          content: data.content[0]?.text || '',
        },
        finish_reason: data.stop_reason,
      }],
      usage: {
        prompt_tokens: data.usage?.input_tokens || 0,
        completion_tokens: data.usage?.output_tokens || 0,
        total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      },
    };
  }

  /**
   * Call Ollama (local) API
   */
  private async callOllama(request: AICompletionRequest, model: string): Promise<AICompletionResponse> {
    const ollamaUrl = this.configService.get<string>('OLLAMA_URL', 'http://localhost:11434');
    
    const lastUserMessage = request.messages.filter(m => m.role === 'user').pop();

    const response = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt: lastUserMessage?.content || '',
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Ollama API error: ${error}`);
      throw new BadRequestException(`Ollama API error: ${response.statusText}`);
    }

    const data = await response.json();
    
    return {
      id: `ollama-${Date.now()}`,
      model,
      choices: [{
        message: {
          role: 'assistant',
          content: data.response || '',
        },
        finish_reason: 'stop',
      }],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    };
  }

  /**
   * Determine provider from model name
   * All models through OpenRouter for cost-effective access
   */
  private getProviderFromModel(model: string): AIProvider {
    // Check if it's a free tier model (these are accessed via OpenRouter)
    if (model.includes(':free')) {
      return AIProvider.OPENROUTER;
    }
    
    // Check for models that should go through OpenRouter
    if (model.startsWith('qwen/') || 
        model.startsWith('nvidia/') || 
        model.startsWith('meta-llama/') || 
        model.startsWith('google/') ||
        model.startsWith('openai/') ||
        model.startsWith('anthropic/') ||
        model.startsWith('mistralai/') ||
        model.startsWith('deepseek/') ||
        model.startsWith('stepfun/') ||
        model.startsWith('arcee-ai/') ||
        model.startsWith('z-ai/')) {
      return AIProvider.OPENROUTER;
    }
    
    // Check for direct OpenAI models
    if (['gpt-4o', 'gpt-4', 'gpt-3.5', 'gpt-oss'].some(m => model.startsWith(m))) {
      // If it's the gpt-oss variant, use OpenRouter
      if (model.startsWith('gpt-oss')) {
        return AIProvider.OPENROUTER;
      }
      return AIProvider.OPENAI;
    }
    
    // Check for direct Anthropic models
    if (model.startsWith('claude-')) {
      return AIProvider.ANTHROPIC;
    }
    
    // Default to OpenRouter for all other models (most flexible)
    return AIProvider.OPENROUTER;
  }

  /**
   * Convert string to provider enum
   */
  private getProviderFromString(provider: string): AIProvider {
    switch (provider.toLowerCase()) {
      case 'openrouter':
        return AIProvider.OPENROUTER;
      case 'openai':
        return AIProvider.OPENAI;
      case 'anthropic':
        return AIProvider.ANTHROPIC;
      case 'ollama':
        return AIProvider.OLLAMA;
      default:
        return AIProvider.OPENROUTER;
    }
  }

  /**
   * Smart model selection for SDK generation based on spec size
   * Returns the best model for the given endpoint count and spec size
   * Note: Using OpenAI models via OpenRouter for paid tier (verified to work)
   */
  selectBestModel(
    endpointCount: number,
    specSizeKB: number,
    tier: 'free' | 'paid' = 'free'
  ): { model: string; maxTokens: number; chunkSize: number; fallback?: string } {
    // Paid tier: Using OpenAI models via OpenRouter (verified to work)
    // Free tier: Using Meta Llama models (reliable free option)

    // Very small specs (< 30 endpoints)
    if (endpointCount <= 30) {
      if (tier === 'paid') {
        return {
          model: 'openai/gpt-4o-mini',
          maxTokens: 8000,
          chunkSize: 30,
          fallback: 'openai/gpt-4o',
        };
      }
      return {
        model: 'meta-llama/llama-3.1-8b-instruct:free',
        maxTokens: 8000,
        chunkSize: 30,
        fallback: 'meta-llama/llama-3.3-70b-instruct:free',
      };
    }

    // Small-medium specs (30-100 endpoints)
    if (endpointCount <= 100) {
      if (tier === 'paid') {
        return {
          model: 'openai/gpt-4o-mini',
          maxTokens: 16000,
          chunkSize: 40,
          fallback: 'openai/gpt-4o',
        };
      }
      return {
        model: 'meta-llama/llama-3.1-8b-instruct:free',
        maxTokens: 16000,
        chunkSize: 40,
        fallback: 'meta-llama/llama-3.3-70b-instruct:free',
      };
    }

    // Medium specs (100-300 endpoints)
    if (endpointCount <= 300) {
      if (tier === 'paid') {
        return {
          model: 'openai/gpt-4o',
          maxTokens: 24000,
          chunkSize: 50,
          fallback: 'openai/gpt-4o-mini',
        };
      }
      return {
        model: 'meta-llama/llama-3.3-70b-instruct:free',
        maxTokens: 24000,
        chunkSize: 50,
        fallback: 'google/gemma-3-27b-it:free',
      };
    }

    // Large specs (300-500 endpoints) - need chunking
    if (endpointCount <= 500) {
      if (tier === 'paid') {
        return {
          model: 'openai/gpt-4o',
          maxTokens: 32000,
          chunkSize: 60,
          fallback: 'openai/gpt-4o-mini',
        };
      }
      return {
        model: 'meta-llama/llama-3.3-70b-instruct:free',
        maxTokens: 32000,
        chunkSize: 60,
        fallback: 'google/gemma-3-27b-it:free',
      };
    }

    // Enterprise specs (500+ endpoints) - aggressive chunking required
    if (tier === 'paid') {
      return {
        model: 'openai/gpt-4o',
        maxTokens: 32000,
        chunkSize: 40,
        fallback: 'openai/gpt-4o-mini',
      };
    }
    return {
      model: 'meta-llama/llama-3.3-70b-instruct:free',
      maxTokens: 32000,
      chunkSize: 40,
      fallback: 'google/gemma-3-27b-it:free',
    };
  }

  /**
   * Get all available free models
   */
  getFreeModels(): string[] {
    return AI_MODELS[AIProvider.OPENROUTER].filter(m => m.includes(':free'));
  }

  /**
   * Get all paid/premium models
   */
  getPremiumModels(): string[] {
    return AI_MODELS[AIProvider.OPENROUTER].filter(m => !m.includes(':free'));
  }
}
