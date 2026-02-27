import { Injectable, Logger } from '@nestjs/common';
import * as ts from 'typescript';
import * as vm from 'vm2';

interface CompiledWASM {
  success: boolean;
  jsCode?: string;
  wasmBinary?: Buffer | null;
  methods?: SDKMethod[];
  errors?: string[];
}

export interface SDKMethod {
  name: string;
  parameters: string[];
  returnType: string;
  description?: string;
}

@Injectable()
export class WasmCompilerService {
  private readonly logger = new Logger(WasmCompilerService.name);

  async compile(code: string): Promise<CompiledWASM> {
    try {
      this.logger.log(`Compiling TypeScript SDK to executable format`);

      const cleanCode = this.cleanCode(code);
      const classNames = this.extractClassNames(cleanCode);
      this.logger.debug(`Found SDK classes: ${classNames.join(', ')}`);

      const codeWithoutExports = this.removeExportsFromTypeScript(cleanCode, classNames);
      const transpiled = this.transpileTypeScript(codeWithoutExports);
      if (!transpiled.success) {
        return transpiled;
      }

      const methods = this.extractMethods(cleanCode);
      let processedCode = this.cleanupExportsReferences(transpiled.jsCode);
      processedCode = this.convertModernJSForQuickJS(processedCode);
      processedCode = this.exposeClassesToGlobal(processedCode, classNames);

      this.logger.debug(`Transpiled JS (first 500 chars): ${processedCode.substring(0, 500)}`);
      this.logger.log(`SDK compilation completed. Extracted ${methods.length} methods`);

      return {
        success: true,
        jsCode: processedCode,
        wasmBinary: null,
        methods,
      };

    } catch (error: any) {
      this.logger.error(`WASM compilation failed: ${error.message}`, error.stack);
      return {
        success: false,
        errors: [error.message],
      };
    }
  }

  private convertModernJSForQuickJS(jsCode: string): string {
    let processed = jsCode;
    processed = processed.replace(/(?<!this\.)#(\w+)/g, '_private_$1');
    processed = processed.replace(/(\d+)n/g, 'BigInt($1)');
    return processed;
  }

  private removeExportsFromTypeScript(code: string, classNames: string[]): string {
    let processed = code;
    processed = processed.replace(/export\s+(type\s+\w+\s*=)/g, '$1');
    processed = processed.replace(/export\s+(interface\s+\w+)/g, '$1');
    processed = processed.replace(/export\s+(class\s+\w+)/g, '$1');
    processed = processed.replace(/export\s+(function\s+\w+)/g, '$1');
    processed = processed.replace(/export\s+(const\s+\w+)/g, '$1');
    processed = processed.replace(/export\s+(let\s+\w+)/g, '$1');
    processed = processed.replace(/export\s+(var\s+\w+)/g, '$1');
    processed = processed.replace(/export\s*\{\s*[^}]*\s*\};?/g, '');
    processed = processed.replace(/export\s+default\s+/g, '');
    processed = processed.replace(/export\s*;/g, '');
    return processed;
  }

  private exposeClassesToGlobal(jsCode: string, classNames: string[]): string {
    if (!classNames || classNames.length === 0) {
      return jsCode;
    }
    const validClasses = classNames.filter(name => {
      return name && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name);
    });
    if (validClasses.length === 0) {
      return jsCode;
    }
    const exposeCode = '\n// Expose classes to global scope for QuickJS\n' +
      validClasses.map(name => `this.${name} = ${name};`).join('\n') + '\n';
    return jsCode.trim() + exposeCode;
  }

  private extractClassNames(code: string): string[] {
    const classNames: string[] = [];
    let cleanCode = code.trim();
    if (cleanCode.startsWith('```')) {
      const firstNewline = cleanCode.indexOf('\n');
      const langEnd = cleanCode.indexOf('```', firstNewline + 1);
      if (langEnd > firstNewline) {
        cleanCode = cleanCode.slice(langEnd + 3);
      }
    }
    if (cleanCode.endsWith('```')) {
      cleanCode = cleanCode.slice(0, -3);
    }
    cleanCode = cleanCode.trim();
    const exportedClassPattern = /export\s+class\s+(\w+)/g;
    let match;
    while ((match = exportedClassPattern.exec(cleanCode)) !== null) {
      classNames.push(match[1]);
    }
    if (classNames.length === 0) {
      const classPattern = /class\s+(\w+)/g;
      while ((match = classPattern.exec(cleanCode)) !== null) {
        classNames.push(match[1]);
      }
    }
    return classNames;
  }

  private transpileTypeScript(code: string): { success: boolean; jsCode?: string; errors?: string[] } {
    try {
      let cleanCode = code.trim();
      if (cleanCode.startsWith('```')) {
        const firstNewline = cleanCode.indexOf('\n');
        const langEnd = cleanCode.indexOf('```', firstNewline + 1);
        if (langEnd > firstNewline) {
          cleanCode = cleanCode.slice(langEnd + 3);
        }
      }
      if (cleanCode.endsWith('```')) {
        cleanCode = cleanCode.slice(0, -3);
      }
      cleanCode = cleanCode.trim();
      const classNames = this.extractClassNames(cleanCode);
      this.logger.debug(`Found SDK classes: ${classNames.join(', ')}`);
      const result = ts.transpileModule(cleanCode, {
        compilerOptions: {
          module: ts.ModuleKind.None,
          target: ts.ScriptTarget.ES2017,
          strict: false,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: false,
        },
      });
      if (result.diagnostics && result.diagnostics.length > 0) {
        const errors = result.diagnostics.map(d => 
          d.messageText?.toString() || 'Unknown TypeScript error'
        );
        this.logger.warn(`TypeScript transpilation warnings: ${errors.join(', ')}`);
      }
      const jsCode = result.outputText;
      return { success: true, jsCode: jsCode };
    } catch (error: any) {
      this.logger.error(`TypeScript transpilation failed: ${error.message}`);
      return { success: false, errors: [error.message] };
    }
  }

  private extractMethods(code: string): SDKMethod[] {
    const methods: SDKMethod[] = [];
    let cleanCode = code.trim();
    if (cleanCode.startsWith('```')) {
      const firstNewline = cleanCode.indexOf('\n');
      const langEnd = cleanCode.indexOf('```', firstNewline + 1);
      if (langEnd > firstNewline) {
        cleanCode = cleanCode.slice(langEnd + 3);
      }
    }
    if (cleanCode.endsWith('```')) {
      cleanCode = cleanCode.slice(0, -3);
    }
    cleanCode = cleanCode.trim();
    const classPattern = /export\s+class\s+(\w+)/g;
    let classMatch;
    const classNames: string[] = [];
    while ((classMatch = classPattern.exec(cleanCode)) !== null) {
      classNames.push(classMatch[1]);
    }
    if (classNames.length === 0) {
      const nonExportedClassPattern = /class\s+(\w+)/g;
      while ((classMatch = nonExportedClassPattern.exec(cleanCode)) !== null) {
        classNames.push(classMatch[1]);
      }
    }
    const methodPattern = /(?:async\s+)?(\w+)\s*\(([^)]*)\)\s*(?::\s*Promise<([^>]+)>|\s*:\s*([^;\n{]+))?\s*\{/g;
    let match;
    while ((match = methodPattern.exec(cleanCode)) !== null) {
      const methodName = match[1];
      if (methodName === 'constructor' || methodName.startsWith('_')) {
        continue;
      }
      const params = match[2] ? match[2].split(',').map(p => p.trim()).filter(p => p) : [];
      const returnType = match[3] || match[4] || 'any';
      if (classNames.length > 0) {
        for (const className of classNames) {
          methods.push({
            name: `${className}.${methodName}`,
            parameters: params.map(p => p.split(':')[0].trim()),
            returnType: returnType.trim(),
          });
          methods.push({
            name: methodName,
            parameters: params.map(p => p.split(':')[0].trim()),
            returnType: returnType.trim(),
          });
        }
      } else {
        methods.push({
          name: methodName,
          parameters: params.map(p => p.split(':')[0].trim()),
          returnType: returnType.trim(),
        });
      }
    }
    const seen = new Set<string>();
    const uniqueMethods: SDKMethod[] = [];
    for (const method of methods) {
      if (!seen.has(method.name)) {
        seen.add(method.name);
        uniqueMethods.push(method);
      }
    }
    return uniqueMethods;
  }

  validateCode(code: string): { valid: boolean; errors?: string[] } {
    const dangerousPatterns = [
      /process\.exit/,
      /require\s*\(\s*['"]child_process/,
      /require\s*\(\s*['"]fs/,
      /\beval\s*\(/,
      /\bFunction\s*\(/,
      /__dirname/,
      /__filename/,
    ];
    const errors: string[] = [];
    for (const pattern of dangerousPatterns) {
      if (pattern.test(code)) {
        errors.push(`Dangerous pattern detected: ${pattern.source}`);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  private cleanCode(code: string): string {
    let cleanCode = code.trim();
    if (cleanCode.startsWith('```')) {
      const firstNewline = cleanCode.indexOf('\n');
      const langEnd = cleanCode.indexOf('```', firstNewline + 1);
      if (langEnd > firstNewline) {
        cleanCode = cleanCode.slice(langEnd + 3);
      }
    }
    if (cleanCode.endsWith('```')) {
      cleanCode = cleanCode.slice(0, -3);
    }
    return cleanCode.trim();
  }

  /**
   * Clean up any remaining exports references in transpiled JavaScript
   * THE FIX: Replace exports with placeholder FIRST, then clean up broken lines, then remove placeholder
   */
  private cleanupExportsReferences(jsCode: string): string {
    let processedCode = jsCode;

    // STEP 1: Replace "exports" with a placeholder to prevent creating broken code
    const PLACEHOLDER = '__TS_EXPORT_PLACEHOLDER__';
    processedCode = processedCode.replace(/exports/g, PLACEHOLDER);

    // STEP 2: Now remove the entire Object.defineProperty line (with placeholder)
    processedCode = processedCode.replace(/Object\.defineProperty\([^)]+\);?/g, '');
    
    // Also remove any line containing __esModule
    processedCode = processedCode.replace(/.*__esModule.*/g, '');

    // STEP 3: Remove module.exports references
    processedCode = processedCode.replace(/\bmodule\.exports\b/g, '');

    // STEP 4: Remove "use strict" - can cause issues in QuickJS
    processedCode = processedCode.replace(/["']use strict["'];?/g, '');
    processedCode = processedCode.replace(/use strict;?/g, '');

    // STEP 5: Remove remaining placeholder references
    processedCode = processedCode.replace(new RegExp(PLACEHOLDER, 'g'), '');

    // STEP 6: Remove any remaining "export" keywords
    processedCode = processedCode
      .replace(/export\s+class\s+/g, 'class ')
      .replace(/export\s+function\s+/g, 'function ')
      .replace(/export\s+(const|let|var)\s+/g, '$1 ')
      .replace(/export\s*\{\s*[^}]*\s*\};/g, '')
      .replace(/export\s+default\s+/g, '')
      .replace(/export\s*;/g, '');

    // STEP 7: Clean up any empty statements caused by removals
    processedCode = processedCode.replace(/;;+/g, ';');
    processedCode = processedCode.replace(/;\s*}/g, '}');
    processedCode = processedCode.replace(/^\s*;\s*/gm, '');

    return processedCode;
  }
}
