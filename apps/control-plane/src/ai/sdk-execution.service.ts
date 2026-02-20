import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { PrismaService } from '../prisma.service';
import { WasmCompilerService, SDKMethod } from './wasm-compiler.service';
import * as vm from 'vm2';

export interface SDKExecutionContext {
  tenantId: string;
  aggregatorId: string;
  method: string;
  params: Record<string, any>;
  config?: SDKConfig;
}

export interface SDKConfig {
  baseUrl?: string;
  apiKey?: string;
  bearerToken?: string;
  timeout?: number;
}

export interface SDKExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  executionTimeMs: number;
}

export interface SDKInfo {
  id: string;
  name: string;
  methods: SDKMethod[];
  configSchema?: Record<string, any>;
  createdAt: Date;
}

/**
 * SDK Execution Service
 * 
 * Responsible for:
 * 1. Loading SDK code from storage
 * 2. Compiling/transpiling TypeScript to JavaScript
 * 3. Executing SDK methods in a sandboxed environment
 * 4. Returning results to activity handlers
 * 
 * This enables the generated SDK to be used internally in workflows
 * for data transfer between Mini Connector (source) and the API (destination).
 */
@Injectable()
export class SDKExecutionService {
  private readonly logger = new Logger(SDKExecutionService.name);
  
  // Cache for compiled SDKs to avoid reloading on every execution
  private readonly sdkCache: Map<string, {
    code: string;
    instance: any;
    compiledAt: Date;
  }> = new Map();
  
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
    private readonly wasmCompiler: WasmCompilerService,
  ) {}

  /**
   * Get information about an SDK
   */
  async getSDKInfo(aggregatorId: string): Promise<SDKInfo | null> {
    const aggregator = await this.prisma.aggregator.findUnique({
      where: { id: aggregatorId },
    });

    if (!aggregator || !aggregator.sdkRef) {
      return null;
    }

    // Download and compile to extract methods
    const code = await this.storage.downloadFile(aggregator.sdkRef);
    const compiled = await this.wasmCompiler.compile(code);

    return {
      id: aggregator.id,
      name: aggregator.name,
      methods: compiled.methods || [],
      configSchema: aggregator.configSchema as Record<string, any> || {},
      createdAt: aggregator.createdAt,
    };
  }

  /**
   * Execute an SDK method
   * 
   * This is the main entry point for using SDKs in workflow activities.
   * The SDK code is loaded from S3, compiled, and executed in a sandbox.
   * 
   * Credentials are retrieved from the aggregator's stored credentials (if any),
   * but can be overridden by the config passed in the request.
   */
  async executeMethod(context: SDKExecutionContext): Promise<SDKExecutionResult> {
    const startTime = Date.now();
    
    try {
      const { tenantId, aggregatorId, method, params, config } = context;

      this.logger.log(`Executing SDK method: ${aggregatorId}.${method}`);

      // Step 1: Get stored credentials from aggregator (if any)
      const aggregator = await this.prisma.aggregator.findUnique({
        where: { id: aggregatorId },
      });

      const storedCredentials = (aggregator?.credentials as SDKConfig) || {};

      // Step 2: Merge credentials - provided config takes precedence over stored
      const mergedConfig: SDKConfig = {
        baseUrl: config?.baseUrl || storedCredentials.baseUrl,
        apiKey: config?.apiKey || storedCredentials.apiKey,
        bearerToken: config?.bearerToken || storedCredentials.bearerToken,
        timeout: config?.timeout || storedCredentials.timeout || 30000,
      };

      // Validate that we have at least a baseUrl
      if (!mergedConfig.baseUrl) {
        throw new BadRequestException('No baseUrl provided. Either pass it in config or store it in the aggregator credentials.');
      }

      // Step 3: Get SDK code (from cache or storage)
      const sdkCode = await this.loadSDKCode(aggregatorId);

      // Step 4: Compile the SDK (from cache or compile)
      const compiled = await this.compileSDK(aggregatorId, sdkCode);

      if (!compiled.jsCode) {
        throw new BadRequestException('Failed to compile SDK');
      }

      // Step 5: Validate the code is safe
      const validation = this.wasmCompiler.validateCode(compiled.jsCode);
      if (!validation.valid) {
        throw new BadRequestException(`SDK code validation failed: ${validation.errors?.join(', ')}`);
      }

      // Step 6: Execute the method in sandbox with merged credentials
      const result = await this.executeInSandbox(
        compiled.jsCode,
        method,
        params,
        mergedConfig
      );

      const executionTimeMs = Date.now() - startTime;
      
      this.logger.log(`SDK method executed successfully in ${executionTimeMs}ms`);

      return {
        success: true,
        data: result,
        executionTimeMs,
      };

    } catch (error: any) {
      const executionTimeMs = Date.now() - startTime;
      this.logger.error(`SDK execution failed: ${error.message}`, error.stack);

      return {
        success: false,
        error: error.message,
        executionTimeMs,
      };
    }
  }

  /**
   * Load SDK code from storage or cache
   */
  private async loadSDKCode(aggregatorId: string): Promise<string> {
    // Check cache first
    const cached = this.sdkCache.get(aggregatorId);
    if (cached && Date.now() - cached.compiledAt.getTime() < this.CACHE_TTL_MS) {
      this.logger.debug(`Using cached SDK for ${aggregatorId}`);
      return cached.code;
    }

    // Load from storage
    const aggregator = await this.prisma.aggregator.findUnique({
      where: { id: aggregatorId },
    });

    if (!aggregator || !aggregator.sdkRef) {
      throw new BadRequestException(`SDK not found for aggregator: ${aggregatorId}`);
    }

    const code = await this.storage.downloadFile(aggregator.sdkRef);
    
    // Update cache
    this.sdkCache.set(aggregatorId, {
      code,
      instance: null,
      compiledAt: new Date(),
    });

    return code;
  }

  /**
   * Compile SDK code
   */
  private async compileSDK(aggregatorId: string, code: string): Promise<{
    jsCode?: string;
    methods?: SDKMethod[];
  }> {
    const cached = this.sdkCache.get(aggregatorId);
    
    // Already compiled?
    if (cached?.instance) {
      return cached.instance;
    }

    // Compile
    const result = await this.wasmCompiler.compile(code);
    
    // Update cache
    this.sdkCache.set(aggregatorId, {
      code,
      instance: result,
      compiledAt: new Date(),
    });

    return result;
  }

  /**
   * Execute SDK method in a sandboxed environment
   * 
   * Uses VM2 for security - provides isolation from the host system.
   * The SDK runs with limited permissions and cannot access:
   * - File system
   * - Child processes
   * - Network (except for defined endpoints)
   */
  private async executeInSandbox(
    jsCode: string,
    methodName: string,
    params: Record<string, any>,
    config?: SDKConfig
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        // Create a sandbox with the SDK code
        const sandbox = {
          // SDK will be loaded here
          __sdk_exports: null,
          __sdk_instance: null,
          
          // Console for debugging
          console: {
            log: (...args: any[]) => this.logger.debug(args.join(' ')),
            error: (...args: any[]) => this.logger.error(args.join(' ')),
            warn: (...args: any[]) => this.logger.warn(args.join(' ')),
          },
          
          // Math and basic utilities
          Math,
          Date,
          JSON,
          Array,
          Object,
          String,
          Number,
          Boolean,
          Map,
          Set,
          Promise,
          
          // Fetch for HTTP requests (with restrictions)
          fetch: async (url: string, options?: any) => {
            // Validate URL is allowed
            if (config?.baseUrl && !url.startsWith(config.baseUrl)) {
              throw new Error(`URL not allowed: ${url}. Must start with ${config.baseUrl}`);
            }
            
            // Add authentication headers
            const headers = new Headers(options?.headers || {});
            if (config?.apiKey) {
              headers.set('X-API-Key', config.apiKey);
            }
            if (config?.bearerToken) {
              headers.set('Authorization', `Bearer ${config.bearerToken}`);
            }
            
            // Apply timeout
            const timeout = config?.timeout || 30000;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            
            try {
              const response = await fetch(url, {
                ...options,
                headers,
                signal: controller.signal,
              });
              clearTimeout(timeoutId);
              
              // Return response data
              return {
                ok: response.ok,
                status: response.status,
                statusText: response.statusText,
                json: () => response.json(),
                text: () => response.text(),
              };
            } catch (error: any) {
              clearTimeout(timeoutId);
              if (error.name === 'AbortError') {
                throw new Error(`Request timeout after ${timeout}ms`);
              }
              throw error;
            }
          },
        };

        // Create VM2 script
        const script = new vm.VMScript(`
          // Load the SDK code
          ${jsCode}
          
          // Find and instantiate the SDK class
          const __sdk_exports = {};
          const __keys = Object.keys(global || this);
          
          // Try to find the class and instantiate it
          let SDKClass = null;
          for (const key of Object.keys(exports || {})) {
            if (typeof exports[key] === 'function' && !key.startsWith('_')) {
              SDKClass = exports[key];
              break;
            }
          }
          
          // If no class found in exports, try window/global
          if (!SDKClass) {
            for (const key of Object.keys(this)) {
              if (typeof this[key] === 'function' && 
                  /^[A-Z]/.test(key) && 
                  !key.startsWith('_')) {
                SDKClass = this[key];
                break;
              }
            }
          }
          
          // Create instance with config
          const __config = ${JSON.stringify(config || {})};
          let __sdk_instance = null;
          
          if (SDKClass) {
            try {
              __sdk_instance = new SDKClass(__config);
            } catch (e) {
              // If constructor fails, try calling as function
              __sdk_instance = SDKClass(__config);
            }
          }
          
          // Export the instance
          __sdk_instance;
        `);

        // Create VM context
        const vmContext = new vm.NodeVM({
          sandbox,
          timeout: config?.timeout || 30000,
          console: 'inherit',
          eval: false,
          wasm: false,
        });

        // Run the script
        const sdkInstance = vmContext.run(script);
        
        if (!sdkInstance) {
          throw new Error('Failed to instantiate SDK');
        }

        // Check if method exists
        if (typeof sdkInstance[methodName] !== 'function') {
          throw new Error(`Method '${methodName}' not found on SDK. Available: ${Object.keys(sdkInstance).filter(k => typeof sdkInstance[k] === 'function').join(', ')}`);
        }

        // Execute the method
        const methodResult = sdkInstance[methodName](params);
        
        // Handle Promise results
        if (methodResult instanceof Promise) {
          methodResult
            .then(resolve)
            .catch(reject);
        } else {
          resolve(methodResult);
        }

      } catch (error: any) {
        reject(error);
      }
    });
  }

  /**
   * List all available SDKs for a tenant
   */
  async listSDKs(tenantId: string): Promise<SDKInfo[]> {
    const aggregators = await this.prisma.aggregator.findMany({
      where: {
        tenantId,
        sdkRef: { not: null },
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
        configSchema: true,
      },
    });

    const sdkInfos: SDKInfo[] = [];
    
    for (const agg of aggregators) {
      try {
        const info = await this.getSDKInfo(agg.id);
        if (info) {
          sdkInfos.push(info);
        }
      } catch (error) {
        this.logger.warn(`Failed to get SDK info for ${agg.id}: ${error}`);
      }
    }

    return sdkInfos;
  }

  /**
   * Clear SDK cache (useful for development)
   */
  clearCache(): void {
    this.sdkCache.clear();
    this.logger.log('SDK cache cleared');
  }
}
