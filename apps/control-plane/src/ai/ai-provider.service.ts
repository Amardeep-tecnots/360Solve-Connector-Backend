import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
 */
export const AI_MODELS: Record<AIProvider, string[]> = {
  [AIProvider.OPENROUTER]: [
    'openai/gpt-4o',
    'openai/gpt-4o-mini',
    'openai/gpt-4-turbo',
    'anthropic/claude-3.5-sonnet',
    'anthropic/claude-3-haiku',
    'meta-llama/llama-3.1-70b-instruct',
    'meta-llama/llama-3.1-8b-instruct',
    'mistralai/mistral-7b-instruct',
    'google/gemini-pro-1.5',
    'deepseek/deepseek-chat',
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
    description: 'SDK class name',
    example: 'MyAPISDK'
  })
  @IsOptional()
  @IsString()
  className?: string;
}

/**
 * AI Workflow Generation request
 */
export interface GenerateWorkflowRequest {
  /** Natural language description of the workflow */
  description: string;
  /** Source aggregator details */
  source: {
    type: 'database' | 'api';
    aggregatorId?: string;
    table?: string;
  };
  /** Destination aggregator details */
  destination: {
    type: 'database' | 'api';
    aggregatorId?: string;
    table?: string;
  };
  /** Field mappings */
  mappings?: {
    source: string;
    destination: string;
    transform?: string;
  }[];
  /** Custom model to use */
  model?: string;
}

/**
 * AI Schema Mapping request
 */
export interface GenerateSchemaMappingRequest {
  /** Source schema */
  sourceSchema: {
    tableName: string;
    columns: Array<{
      name: string;
      type: string;
      nullable?: boolean;
    }>;
  };
  /** Destination schema */
  destinationSchema: {
    tableName: string;
    columns: Array<{
      name: string;
      type: string;
      nullable?: boolean;
    }>;
  };
  /** Optional description of transformation */
  description?: string;
  /** Custom model to use */
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
   */
  private getProviderFromModel(model: string): AIProvider {
    if (model.startsWith('openai/') || model.startsWith('google/')) {
      return AIProvider.OPENROUTER;
    }
    if (model.includes('claude-') || model.startsWith('anthropic/')) {
      return AIProvider.OPENROUTER;
    }
    if (model.startsWith('meta-llama/') || model.startsWith('mistralai/') || model.startsWith('deepseek/')) {
      return AIProvider.OPENROUTER;
    }
    if (['gpt-4o', 'gpt-4', 'gpt-3.5'].some(m => model.startsWith(m))) {
      return AIProvider.OPENAI;
    }
    if (model.startsWith('claude-')) {
      return AIProvider.ANTHROPIC;
    }
    // Default to OpenRouter for unknown models
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
}
