/**
 * QuickJS WebAssembly Runtime
 *
 * Creates an isolated sandbox using QuickJS compiled to WebAssembly.
 * Provides complete isolation from the host environment.
 *
 * @see https://github.com/sebastianwessel/quickjs
 */

import variant from "@jitl/quickjs-ng-wasmfile-release-sync";
import { loadQuickJs, type SandboxOptions } from "@sebastianwessel/quickjs";

/**
 * Options for creating a QuickJS sandbox runtime
 */
export interface QuickJSRuntimeOptions {
  /** Execution timeout in milliseconds */
  timeout: number;
  /** Memory limit in MB */
  memoryLimit: number;
  /** Working directory for the sandbox */
  workingDir: string;
}

/**
 * Result from sandbox execution
 */
export interface QuickJSExecutionResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  logs?: string[];
}

/**
 * Host functions that will be exposed to the sandbox via env
 */
export interface QuickJSHostFunctions {
  // Files
  __hostReadFile: (path: string) => string;
  __hostFileExists: (path: string) => boolean;
  __hostGlob: (pattern: string) => string[];

  // Compress
  __hostCompressAuto: (content: string, hint?: string) => unknown;
  __hostCompressLogs: (logs: string) => unknown;
  __hostCompressDiff: (diff: string) => unknown;
  __hostCompressSemantic: (content: string, ratio?: number) => unknown;

  // Code
  __hostCodeParse: (content: string, lang: string) => unknown;
  __hostCodeExtract: (content: string, lang: string, target: unknown) => unknown;
  __hostCodeSkeleton: (content: string, lang: string) => string;

  // Utils
  __hostCountTokens: (text: string) => number;
  __hostDetectType: (content: string) => string;
  __hostDetectLanguage: (path: string) => string;

  // Git
  __hostGitDiff: (ref?: string) => unknown;
  __hostGitLog: (limit?: number) => unknown;
  __hostGitBlame: (file: string, line?: number) => unknown;
  __hostGitStatus: () => unknown;
  __hostGitBranch: () => unknown;

  // Search
  __hostSearchGrep: (pattern: string, glob?: string) => unknown;
  __hostSearchSymbols: (query: string, glob?: string) => unknown;
  __hostSearchFiles: (pattern: string) => unknown;
  __hostSearchReferences: (symbol: string, glob?: string) => unknown;

  // Analyze
  __hostAnalyzeDeps: (file: string) => unknown;
  __hostAnalyzeCallGraph: (fn: string, file: string, depth?: number) => unknown;
  __hostAnalyzeExports: (file: string) => unknown;
  __hostAnalyzeStructure: (dir?: string, depth?: number) => unknown;

  // Pipeline
  __hostPipeline: (steps: unknown[]) => unknown;
  __hostPipelineOverview: (dir?: string) => unknown;
  __hostPipelineFindUsages: (symbol: string, glob?: string) => unknown;
  __hostPipelineAnalyzeDeps: (file: string, depth?: number) => unknown;

  // Multifile
  __hostMultifileCompress: (patterns: string[], options?: unknown) => unknown;
  __hostMultifileExtractShared: (patterns: string[]) => unknown;
  __hostMultifileChunk: (patterns: string[], maxTokens: number) => unknown;
  __hostMultifileSkeletons: (patterns: string[], depth?: number) => unknown;
  __hostMultifileReadAll: (patterns: string[]) => unknown;

  // Conversation
  __hostConversationCompress: (messages: unknown[], options?: unknown) => unknown;
  __hostConversationCreateMemory: (messages: unknown[], options?: unknown) => unknown;
  __hostConversationExtractDecisions: (messages: unknown[]) => unknown;
  __hostConversationExtractCodeRefs: (messages: unknown[]) => unknown;
}

// Singleton for the loaded QuickJS runtime (expensive to load)
let quickJSLoader: ReturnType<typeof loadQuickJs> | null = null;

/**
 * Get or create the QuickJS loader (singleton pattern)
 */
async function getQuickJSLoader() {
  if (!quickJSLoader) {
    quickJSLoader = loadQuickJs(variant);
  }
  return quickJSLoader;
}

/**
 * Create a QuickJS sandbox runtime with the given options
 */
export async function createQuickJSRuntime(options: QuickJSRuntimeOptions) {
  const { runSandboxed } = await getQuickJSLoader();

  return {
    /**
     * Execute code in the sandbox with host functions exposed via env
     */
    async execute(
      code: string,
      hostFunctions: QuickJSHostFunctions
    ): Promise<QuickJSExecutionResult> {
      const logs: string[] = [];

      const sandboxOptions: SandboxOptions = {
        // Security: Disable all external access
        allowFetch: false,
        allowFs: false,

        // Resource limits
        executionTimeout: options.timeout,
        memoryLimit: options.memoryLimit * 1024 * 1024, // Convert MB to bytes

        // Custom console to capture logs
        console: {
          log: (...args) => logs.push(args.map(String).join(" ")),
          error: (...args) => logs.push(`[ERROR] ${args.map(String).join(" ")}`),
          warn: (...args) => logs.push(`[WARN] ${args.map(String).join(" ")}`),
          info: (...args) => logs.push(`[INFO] ${args.map(String).join(" ")}`),
          debug: (...args) => logs.push(`[DEBUG] ${args.map(String).join(" ")}`),
        },

        // Expose host functions via env
        // The env object is accessible as `env` in the sandbox
        env: {
          WORKING_DIR: options.workingDir,
          ...hostFunctions,
        },
      };

      try {
        const result = await runSandboxed(
          async ({ evalCode }) => evalCode(code),
          sandboxOptions
        );

        if (result.ok) {
          return {
            ok: true,
            data: result.data,
            logs,
          };
        } else {
          const rawError = result.error;
          const errorMsg = typeof rawError === 'object' && rawError !== null && 'message' in (rawError as object)
            ? String((rawError as { message: unknown }).message)
            : String(rawError);
          return {
            ok: false,
            error: errorMsg,
            logs,
          };
        }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          logs,
        };
      }
    },
  };
}

/**
 * Generate the SDK wrapper code that runs inside the sandbox.
 * This creates a `ctx` object that maps to host functions exposed via env.
 */
export function generateGuestSDKCode(): string {
  return `
// SDK wrapper - maps ctx methods to host functions via env
const ctx = {
  files: {
    read: (path) => env.__hostReadFile(path),
    exists: (path) => env.__hostFileExists(path),
    glob: (pattern) => env.__hostGlob(pattern),
  },

  compress: {
    auto: (content, hint) => env.__hostCompressAuto(content, hint),
    logs: (logs) => env.__hostCompressLogs(logs),
    diff: (diff) => env.__hostCompressDiff(diff),
    semantic: (content, ratio) => env.__hostCompressSemantic(content, ratio),
  },

  code: {
    parse: (content, lang) => env.__hostCodeParse(content, lang),
    extract: (content, lang, target) => env.__hostCodeExtract(content, lang, JSON.stringify(target)),
    skeleton: (content, lang) => env.__hostCodeSkeleton(content, lang),
  },

  utils: {
    countTokens: (text) => env.__hostCountTokens(text),
    detectType: (content) => env.__hostDetectType(content),
    detectLanguage: (path) => env.__hostDetectLanguage(path),
  },

  git: {
    diff: (ref) => env.__hostGitDiff(ref),
    log: (limit) => env.__hostGitLog(limit),
    blame: (file, line) => env.__hostGitBlame(file, line),
    status: () => env.__hostGitStatus(),
    branch: () => env.__hostGitBranch(),
  },

  search: {
    grep: (pattern, glob) => env.__hostSearchGrep(pattern, glob),
    symbols: (query, glob) => env.__hostSearchSymbols(query, glob),
    files: (pattern) => env.__hostSearchFiles(pattern),
    references: (symbol, glob) => env.__hostSearchReferences(symbol, glob),
  },

  analyze: {
    dependencies: (file) => env.__hostAnalyzeDeps(file),
    callGraph: (fn, file, depth) => env.__hostAnalyzeCallGraph(fn, file, depth),
    exports: (file) => env.__hostAnalyzeExports(file),
    structure: (dir, depth) => env.__hostAnalyzeStructure(dir, depth),
  },

  pipeline: Object.assign(
    (steps) => env.__hostPipeline(JSON.stringify(steps)),
    {
      codebaseOverview: (dir) => env.__hostPipelineOverview(dir),
      findUsages: (symbol, glob) => env.__hostPipelineFindUsages(symbol, glob),
      analyzeDeps: (file, depth) => env.__hostPipelineAnalyzeDeps(file, depth),
    }
  ),

  multifile: {
    compress: (patterns, options) => env.__hostMultifileCompress(patterns, JSON.stringify(options)),
    extractShared: (patterns) => env.__hostMultifileExtractShared(patterns),
    chunk: (patterns, maxTokens) => env.__hostMultifileChunk(patterns, maxTokens),
    skeletons: (patterns, depth) => env.__hostMultifileSkeletons(patterns, depth),
    readAll: (patterns) => env.__hostMultifileReadAll(patterns),
  },

  conversation: {
    compress: (messages, options) => env.__hostConversationCompress(JSON.stringify(messages), JSON.stringify(options)),
    createMemory: (messages, options) => env.__hostConversationCreateMemory(JSON.stringify(messages), JSON.stringify(options)),
    extractDecisions: (messages) => env.__hostConversationExtractDecisions(JSON.stringify(messages)),
    extractCodeRefs: (messages) => env.__hostConversationExtractCodeRefs(JSON.stringify(messages)),
  },

  // Fluent pipeline builder (ctx.pipe)
  pipe: (() => {
    // Language detection for parse step
    const _langMap = {
      '.ts': 'typescript', '.tsx': 'typescript', '.js': 'typescript', '.jsx': 'typescript',
      '.py': 'python', '.go': 'go', '.rs': 'rust', '.php': 'php', '.swift': 'swift',
    };
    function _detectLang(filePath) {
      const ext = '.' + filePath.split('.').pop();
      return _langMap[ext] || 'typescript';
    }

    // Available step types for error messages
    const _availableSteps = [
      'glob', 'exclude', 'read', 'parse', 'filter', 'map', 'flatMap',
      'take', 'skip', 'sort', 'unique', 'compress', 'tap', 'recover'
    ];

    // Execute a single pipeline step
    function _execStep(step, input, stepIndex) {
      switch (step.type) {
        case 'glob':
          return env.__hostGlob(step.pattern);
        case 'exclude': {
          const regex = typeof step.pattern === 'string'
            ? new RegExp(step.pattern.replace(/\\./g, '\\\\.').replace(/\\*/g, '.*'))
            : step.pattern;
          return input.filter(f => !regex.test(f));
        }
        case 'read': {
          const results = [];
          for (const file of input) {
            results.push({ path: file, content: env.__hostReadFile(file) });
          }
          return results;
        }
        case 'parse': {
          const results = [];
          for (const file of input) {
            const lang = step.language || _detectLang(file.path);
            const structure = env.__hostCodeParse(file.content, lang);
            results.push({ path: file.path, content: file.content, structure });
          }
          return results;
        }
        case 'filter':
          return input.filter(step.predicate);
        case 'map':
          return input.map(step.fn);
        case 'flatMap':
          return input.flatMap(step.fn);
        case 'take':
          return input.slice(0, step.count);
        case 'skip':
          return input.slice(step.count);
        case 'sort': {
          const sorted = [...input];
          step.compareFn ? sorted.sort(step.compareFn) : sorted.sort();
          return sorted;
        }
        case 'unique': {
          const seen = new Set();
          return input.filter(item => {
            const key = step.keyFn ? step.keyFn(item) : JSON.stringify(item);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        }
        case 'compress': {
          const content = typeof input === 'string' ? input : JSON.stringify(input, null, 2);
          const mode = (step.options && step.options.mode) || 'auto';
          if (mode === 'semantic') return env.__hostCompressSemantic(content, step.options && step.options.ratio);
          if (mode === 'logs') return env.__hostCompressLogs(content);
          if (mode === 'diff') return env.__hostCompressDiff(content);
          return env.__hostCompressAuto(content);
        }
        case 'tap':
          step.fn(input);
          return input;
        case 'recover':
          // Handled in build loop
          return input;
        default:
          throw 'Error: ctx.pipe.' + step.type + ' is not available. Available: ' + _availableSteps.join(', ');
      }
    }

    // Immutable pipeline builder class
    class PipelineGuest {
      constructor(steps, initialData) {
        this._steps = Object.freeze(steps || []);
        this._initialData = initialData;
      }
      _withStep(step) { return new PipelineGuest([...this._steps, step], this._initialData); }

      // Source
      glob(pattern) { return this._withStep({ type: 'glob', pattern }); }

      // Transforms
      exclude(pattern) { return this._withStep({ type: 'exclude', pattern }); }
      read() { return this._withStep({ type: 'read' }); }
      parse(language) { return this._withStep({ type: 'parse', language }); }
      filter(predicate) { return this._withStep({ type: 'filter', predicate }); }
      map(fn) { return this._withStep({ type: 'map', fn }); }
      flatMap(fn) { return this._withStep({ type: 'flatMap', fn }); }
      take(count) { return this._withStep({ type: 'take', count }); }
      skip(count) { return this._withStep({ type: 'skip', count }); }
      sort(compareFn) { return this._withStep({ type: 'sort', compareFn }); }
      unique(keyFn) { return this._withStep({ type: 'unique', keyFn }); }
      compress(options) { return this._withStep({ type: 'compress', options: options || { mode: 'auto' } }); }
      tap(fn) { return this._withStep({ type: 'tap', fn }); }
      recover(fn) { return this._withStep({ type: 'recover', fn }); }

      // Inspection
      getSteps() { return this._steps; }

      // Execution
      build() {
        if (this._steps.length === 0 && this._initialData === undefined) {
          throw 'Pipeline is empty — add at least one step before calling build()';
        }
        const startTime = Date.now();
        let data = this._initialData;
        let itemsProcessed = 0;

        for (let i = 0; i < this._steps.length; i++) {
          const step = this._steps[i];
          try {
            data = _execStep(step, data, i);
          } catch (e) {
            // Check for recover step
            const nextStep = this._steps[i + 1];
            if (nextStep && nextStep.type === 'recover') {
              data = nextStep.fn({ code: 'STEP_ERROR', message: String(e), step: i, stepType: step.type });
              i++; // Skip recover step
              continue;
            }
            throw 'Pipeline error at step ' + i + ' (' + step.type + '): ' + String(e);
          }
          if (Array.isArray(data)) itemsProcessed = data.length;
        }

        return {
          data,
          stats: { stepsExecuted: this._steps.length, itemsProcessed, executionTimeMs: Date.now() - startTime, errors: [] },
        };
      }
    }

    // Factory
    return {
      create() { return new PipelineGuest([]); },
      from(pattern) { return new PipelineGuest([]).glob(pattern); },
      fromData(data) { return new PipelineGuest([], [...data]); },
      presets: {
        codebaseOverview: (dir) => env.__hostPipelineOverview(dir),
        findUsages: (symbol, glob) => env.__hostPipelineFindUsages(symbol, glob),
        analyzeDeps: (file, depth) => env.__hostPipelineAnalyzeDeps(file, depth),
      },
    };
  })(),
};
`;
}
