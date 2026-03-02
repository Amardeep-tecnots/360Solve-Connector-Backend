import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { PrismaService } from '../prisma.service';
import { WasmCompilerService, SDKMethod } from './wasm-compiler.service';
import { getQuickJS, QuickJSContext, isSuccess, newAsyncContext } from 'quickjs-emscripten';

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
 * Uses QuickJS WASM runtime for executing SDK code
 */
@Injectable()
export class SDKExecutionService {
  private readonly logger = new Logger(SDKExecutionService.name);
  
  private readonly sdkCache: Map<string, {
    code: string;
    instance: any;
    compiledAt: Date;
  }> = new Map();
  
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;

  // Comprehensive list of built-in JavaScript classes to exclude
  private readonly BUILT_IN_CLASSES = new Set([
    'Error', 'AggregateError', 'EvalError', 'RangeError', 'ReferenceError', 'SyntaxError', 'TypeError', 'URIError', 'InternalError',
    'Object', 'Array', 'Function', 'Boolean', 'Symbol', 'Number', 'BigInt', 'Math', 'Date', 'RegExp', 'Map', 'WeakMap', 'Set', 'WeakSet',
    'Promise', 'Proxy', 'WeakRef', 'FinalizationRegistry', 'Iterator', 'AsyncIterator',
    'ArrayBuffer', 'SharedArrayBuffer', 'Atomics', 'DataView', 'Float32Array', 'Float64Array', 'Int8Array', 'Int16Array', 'Int32Array', 'Uint8Array', 'Uint16Array', 'Uint32Array', 'Uint8ClampedArray', 'BigInt64Array', 'BigUint64Array',
    'JSON', 'Console', 'Navigator', 'Worker', 'XMLHttpRequest',
    'TextEncoder', 'TextDecoder', 'URL', 'URLSearchParams',
    'AbortController', 'AbortSignal', 'BroadcastChannel', 'CustomEvent', 'Event', 'EventTarget', 'FormData', 'Headers', 'MessageChannel', 'MessageEvent', 'MessagePort', 'Request', 'Response', 'DOMException',
    'Blob', 'File', 'FileReader', 'ImageData', 'ImageBitmap',
  ]);

  constructor(
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
    private readonly wasmCompiler: WasmCompilerService,
  ) {}

  private getPotentialClassNames(extractedMethods?: SDKMethod[]): string[] {
    const classNames = new Set<string>();
    if (!extractedMethods || extractedMethods.length === 0) return [];
    for (const method of extractedMethods) {
      if (method.name.includes('.')) {
        const parts = method.name.split('.');
        const potentialClassName = parts[0];
        if (!this.BUILT_IN_CLASSES.has(potentialClassName) && /^[A-Z]/.test(potentialClassName)) {
          classNames.add(potentialClassName);
        }
      }
    }
    return Array.from(classNames);
  }

  private isBuiltInClass(name: string): boolean {
    return this.BUILT_IN_CLASSES.has(name);
  }

  private extractErrorMessage(vm: QuickJSContext, error: any): string {
    try {
      if (!error) return 'Unknown error';
      const dumped = vm.dump(error);
      if (typeof dumped === 'string') return dumped;
      if (typeof dumped === 'object') return JSON.stringify(dumped);
      return String(dumped);
    } catch (e) {
      return String(error) || 'Unknown error';
    }
  }

  async getSDKInfo(aggregatorId: string): Promise<SDKInfo | null> {
    const aggregator = await this.prisma.aggregator.findUnique({ where: { id: aggregatorId } });
    if (!aggregator || !aggregator.sdkRef) return null;
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

  async executeMethod(context: SDKExecutionContext): Promise<SDKExecutionResult> {
    const startTime = Date.now();
    try {
      const { tenantId, aggregatorId, method, params, config } = context;
      this.logger.log(`Executing SDK method: ${aggregatorId}.${method}`);
      const aggregator = await this.prisma.aggregator.findUnique({ where: { id: aggregatorId } });
      const storedCredentials = (aggregator?.credentials as SDKConfig) || {};
      const mergedConfig: SDKConfig = {
        baseUrl: config?.baseUrl || storedCredentials.baseUrl,
        apiKey: config?.apiKey || storedCredentials.apiKey,
        bearerToken: config?.bearerToken || storedCredentials.bearerToken,
        timeout: config?.timeout || storedCredentials.timeout || 30000,
      };
      if (!mergedConfig.baseUrl) {
        throw new BadRequestException('No baseUrl provided. Either pass it in config or store it in the aggregator credentials.');
      }
      const sdkCode = await this.loadSDKCode(aggregatorId);
      this.sdkCache.delete(aggregatorId);
      const compiled = await this.compileSDK(aggregatorId, sdkCode);
      this.logger.debug(`Extracted SDK methods: ${JSON.stringify(compiled.methods?.map(m => m.name) || [])}`);
      if (!compiled.jsCode) throw new BadRequestException('Failed to compile SDK');
      const validation = this.wasmCompiler.validateCode(compiled.jsCode);
      if (!validation.valid) throw new BadRequestException(`SDK code validation failed: ${validation.errors?.join(', ')}`);
      const result = await this.executeInSandbox(compiled.jsCode, method, params, mergedConfig, compiled.methods);
      const executionTimeMs = Date.now() - startTime;
      this.logger.log(`SDK method executed successfully in ${executionTimeMs}ms`);
      return { success: true, data: result, executionTimeMs };
    } catch (error: any) {
      const executionTimeMs = Date.now() - startTime;
      this.logger.error(`SDK execution failed: ${error.message}`, error.stack);
      return { success: false, error: error.message, executionTimeMs };
    }
  }

  private async loadSDKCode(aggregatorId: string): Promise<string> {
    const cached = this.sdkCache.get(aggregatorId);
    if (cached && Date.now() - cached.compiledAt.getTime() < this.CACHE_TTL_MS) {
      this.logger.debug(`Using cached SDK for ${aggregatorId}`);
      return cached.code;
    }
    const aggregator = await this.prisma.aggregator.findUnique({ where: { id: aggregatorId } });
    if (!aggregator || !aggregator.sdkRef) throw new BadRequestException(`SDK not found for aggregator: ${aggregatorId}`);
    const code = await this.storage.downloadFile(aggregator.sdkRef);
    this.sdkCache.set(aggregatorId, { code, instance: null, compiledAt: new Date() });
    return code;
  }

  private async compileSDK(aggregatorId: string, code: string): Promise<{ jsCode?: string; methods?: SDKMethod[] }> {
    const cached = this.sdkCache.get(aggregatorId);
    if (cached?.instance) return cached.instance;
    const result = await this.wasmCompiler.compile(code);
    this.sdkCache.set(aggregatorId, { code, instance: result, compiledAt: new Date() });
    return result;
  }

  private getValueFromResult<T>(vm: QuickJSContext, result: { value?: T; error?: any }): T {
    if (result.error) throw new Error(`QuickJS error: ${this.extractErrorMessage(vm, result.error)}`);
    return result.value as T;
  }

  private findSdkClassInGlobals(vm: QuickJSContext, potentialClassNames: string[]): { name: string; handle: any } | null {
    const keysResult = vm.evalCode(`Object.keys(this)`);
    if (!isSuccess(keysResult)) return null;
    const globalKeys = vm.dump(keysResult.value) as string[];
    
    for (const className of potentialClassNames) {
      if (globalKeys.includes(className)) {
        const handle = vm.getProp(vm.global, className);
        if (handle && !this.isBuiltInClass(className)) {
          this.logger.debug(`Found SDK class from extracted methods: ${className}`);
          return { name: className, handle };
        }
      }
    }
    
    for (const key of globalKeys) {
      if (this.isBuiltInClass(key) || !/^[A-Z]/.test(key)) continue;
      const handle = vm.getProp(vm.global, key);
      if (handle) {
        const typeResult = vm.evalCode(`Object.prototype.toString.call(this.${key})`);
        if (isSuccess(typeResult)) {
          const typeStr = vm.dump(typeResult.value) as string;
          if (typeStr === '[object Function]') {
            this.logger.debug(`Found SDK class from globals: ${key}`);
            return { name: key, handle };
          }
        }
      }
    }
    return null;
  }

  private async executeInSandbox(jsCode: string, methodName: string, params: Record<string, any>, config?: SDKConfig, extractedMethods?: SDKMethod[]): Promise<any> {
    const ctx = await newAsyncContext();
    const vm = ctx;
    
    try {
      // Setup config
      const configStr = JSON.stringify(config || {});
      const configResult = vm.evalCode(`JSON.parse(${JSON.stringify(configStr)})`);
      const configHandle = this.getValueFromResult(vm, configResult);
      vm.setProp(vm.global, 'config', configHandle);

      const fetchConfig = config;

      // Create fetch wrapper
      const fetchWrapper = vm.newAsyncifiedFunction('fetch', async (urlHandle: any, optionsHandle: any) => {
        const url = vm.getString(urlHandle) || String(urlHandle);
        this.logger.debug(`[QuickJS Fetch] Request to: ${url}`);
        if (fetchConfig?.baseUrl && !url.startsWith(fetchConfig.baseUrl)) {
          return vm.newError(`URL not allowed: ${url}. Must start with ${fetchConfig.baseUrl}`);
        }
        let options: any = {};
        if (optionsHandle) { try { options = vm.dump(optionsHandle); } catch {} }
        const headers = new Headers(options?.headers || {});
        if (fetchConfig?.apiKey) headers.set('X-API-Key', fetchConfig.apiKey);
        if (fetchConfig?.bearerToken) headers.set('Authorization', `Bearer ${fetchConfig.bearerToken}`);
        try {
          const response = await fetch(url, { ...options, headers });
          const responseObj = vm.newObject();
          vm.setProp(responseObj, 'ok', vm.newNumber(response.ok ? 1 : 0));
          vm.setProp(responseObj, 'status', vm.newNumber(response.status));
          vm.setProp(responseObj, 'statusText', vm.newString(response.statusText));
          const jsonMethod = vm.newAsyncifiedFunction('json', async () => {
            const data = await response.json();
            const parseResult = vm.evalCode(`JSON.parse(${JSON.stringify(JSON.stringify(data))})`);
            if (isSuccess(parseResult)) return parseResult.value;
            return vm.newString(JSON.stringify(data));
          });
          vm.setProp(responseObj, 'json', jsonMethod);
          const textMethod = vm.newAsyncifiedFunction('text', async () => vm.newString(await response.text()));
          vm.setProp(responseObj, 'text', textMethod);
          return responseObj;
        } catch (error: any) {
          return vm.newError(error.message);
        }
      });
      vm.setProp(vm.global, 'fetch', fetchWrapper);

      // Setup console
      const consoleResult = vm.evalCode(`({ log: () => {}, error: () => {}, warn: () => {} })`);
      if (isSuccess(consoleResult)) vm.setProp(vm.global, 'console', consoleResult.value);

      // Setup common globals
      const globals = ['Math', 'Date', 'JSON', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Map', 'Set', 'Promise'];
      for (const g of globals) {
        const result = vm.evalCode(g);
        if (isSuccess(result)) vm.setProp(vm.global, g, result.value);
      }

      // Get potential class names BEFORE evaluating the code
      const potentialClassNames = this.getPotentialClassNames(extractedMethods);
      this.logger.debug(`Looking for SDK class. Potential names from methods: ${potentialClassNames.join(', ')}`);

      // Load SDK code - with ModuleKind.None, classes are defined directly in global scope
      this.logger.debug('Loading SDK code into QuickJS...');
      
      let evalResult = vm.evalCode(jsCode);
      
      if (!isSuccess(evalResult)) {
        const errorMsg = this.extractErrorMessage(vm, evalResult.error);
        this.logger.error(`QuickJS eval error: ${errorMsg}`);
        throw new Error(`Failed to load SDK code: ${errorMsg}`);
      }

      // Check for class in global scope
      let sdkClassName: string | null = null;
      let sdkClassHandle: any = null;

      // First try the potential class names from extracted methods
      const foundFromMethods = this.findSdkClassInGlobals(vm, potentialClassNames);
      if (foundFromMethods) {
        sdkClassName = foundFromMethods.name;
        sdkClassHandle = foundFromMethods.handle;
      }

      // If not found, try exports
      if (!sdkClassName) {
        try {
          const exportsResult = vm.getProp(vm.global, 'exports');
          if (exportsResult) {
            const exportsKeys = vm.evalCode(`Object.keys(exports)`);
            if (isSuccess(exportsKeys)) {
              const exportKeys = vm.dump(exportsKeys.value) as string[];
              for (const key of exportKeys) {
                if (!this.isBuiltInClass(key) && /^[A-Z]/.test(key)) {
                  const prop = vm.getProp(exportsResult, key);
                  if (prop) {
                    // Expose to global
                    vm.setProp(vm.global, key, prop);
                    sdkClassName = key;
                    sdkClassHandle = prop;
                    break;
                  }
                }
              }
            }
          }
        } catch (e) { this.logger.debug('No exports found'); }
      }

      // If still not found, try default export
      if (!sdkClassName) {
        try {
          const defaultExport = vm.getProp(vm.global, 'default');
          if (defaultExport) {
            const typeResult = vm.evalCode('typeof default');
            if (isSuccess(typeResult) && vm.dump(typeResult.value) === 'function') {
              vm.setProp(vm.global, 'default', defaultExport);
              sdkClassName = 'default';
              sdkClassHandle = defaultExport;
            }
          }
        } catch (e) { this.logger.debug('No default export found'); }
      }

      // Last resort: try scanning for class in code itself
      if (!sdkClassName && potentialClassNames.length > 0) {
        // Try to get the class from module scope by evaluating with export
        for (const className of potentialClassNames) {
          try {
            const testResult = vm.evalCode(`${className}`);
            if (isSuccess(testResult)) {
              const type = vm.dump(testResult.value);
              if (type === 'function') {
                const handle = vm.getProp(vm.global, className);
                if (handle) {
                  sdkClassName = className;
                  sdkClassHandle = handle;
                  break;
                }
              }
            }
          } catch (e) { /* try next */ }
        }
        
        // If still not found, try adding the class to global by evaluating assignment
        if (!sdkClassName) {
          for (const className of potentialClassNames) {
            try {
              // Try to access the class from module scope
              const accessCode = `typeof ${className}`;
              const accessResult = vm.evalCode(accessCode);
              if (isSuccess(accessResult)) {
                const type = vm.dump(accessResult.value);
                if (type === 'function') {
                  // It's a function/class - try to expose it
                  const exposeCode = `this.${className} = ${className}`;
                  vm.evalCode(exposeCode);
                  
                  const handle = vm.getProp(vm.global, className);
                  if (handle) {
                    sdkClassName = className;
                    sdkClassHandle = handle;
                    break;
                  }
                }
              }
            } catch (e) { /* try next */ }
          }
        }
      }

      if (!sdkClassName) {
        const debugResult = vm.evalCode(`Object.keys(this)`);
        const debugKeys = isSuccess(debugResult) ? vm.dump(debugResult.value) as string[] : [];
        const methodNames = extractedMethods?.map(m => m.name).join(', ') || 'none';
        this.logger.error(`Could not find SDK class. Global keys: ${debugKeys.join(', ')}`);
        this.logger.error(`Extracted methods: ${methodNames}`);
        throw new Error(`Could not find SDK class. Tried: ${potentialClassNames.join(', ')}`);
      }

      this.logger.debug(`Found SDK class: ${sdkClassName}`);

      // Create config object and instantiate
      const configObjStr = JSON.stringify({ baseUrl: config?.baseUrl, apiKey: config?.apiKey, bearerToken: config?.bearerToken, timeout: config?.timeout });
      const configHandleResult = vm.evalCode(`JSON.parse(${JSON.stringify(configObjStr)})`);
      const configObjHandle = this.getValueFromResult(vm, configHandleResult);

      let instanceHandle: any;
      const constructorResult = vm.evalCode(`new ${sdkClassName}(${configObjStr})`);
      if (!isSuccess(constructorResult)) {
        throw new Error(`Failed to instantiate SDK: ${this.extractErrorMessage(vm, constructorResult.error)}`);
      }
      instanceHandle = constructorResult.value;

      // Find and call method
      let actualMethodName = methodName;
      const methodProp = vm.getProp(instanceHandle, methodName);
      if (!methodProp) {
        if (extractedMethods && extractedMethods.length > 0) {
          const matchingMethod = extractedMethods.find(m => m.name === methodName || m.name === `${sdkClassName}.${methodName}` || m.name.endsWith(`.${methodName}`));
          if (matchingMethod) {
            const parts = matchingMethod.name.split('.');
            actualMethodName = parts[parts.length - 1];
          }
        }
        const finalMethodProp = vm.getProp(instanceHandle, actualMethodName);
        if (!finalMethodProp) {
          throw new Error(`Method '${methodName}' not found. Available: ${extractedMethods?.map(m => m.name).join(', ')}`);
        }
      }

      this.logger.debug(`Calling method: ${actualMethodName}`);
      const paramsStr = JSON.stringify(params || {});
      const paramsHandleResult = vm.evalCode(`JSON.parse(${JSON.stringify(paramsStr)})`);
      const paramsHandle = this.getValueFromResult(vm, paramsHandleResult);
      
      const methodResult = vm.callFunction(vm.getProp(instanceHandle, actualMethodName), instanceHandle, paramsHandle);
      if (!isSuccess(methodResult)) {
        throw new Error(`SDK method failed: ${this.extractErrorMessage(vm, methodResult.error)}`);
      }

      const resultValue = methodResult.value;
      
      // QuickJS handles async through asyncified functions (like fetch)
      // Just dump the result - if it's a promise, the SDK should use asyncified methods
      const result = vm.dump(resultValue);
      await ctx.dispose();
      return result;
    } catch (error: any) {
      this.logger.error(`QuickJS execution error: ${error.message}`, error.stack);
      try { await ctx.dispose(); } catch {}
      throw error;
    }
  }

  async listSDKs(tenantId: string): Promise<SDKInfo[]> {
    const aggregators = await this.prisma.aggregator.findMany({
      where: { tenantId, sdkRef: { not: null } },
      select: { id: true, name: true, createdAt: true, configSchema: true },
    });
    const sdkInfos: SDKInfo[] = [];
    for (const agg of aggregators) {
      try {
        const info = await this.getSDKInfo(agg.id);
        if (info) sdkInfos.push(info);
      } catch (error) {
        this.logger.warn(`Failed to get SDK info for ${agg.id}: ${error}`);
      }
    }
    return sdkInfos;
  }

  clearCache(): void {
    this.sdkCache.clear();
    this.logger.log('SDK cache cleared');
  }
}


