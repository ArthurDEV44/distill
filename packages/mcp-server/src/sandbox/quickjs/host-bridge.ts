/**
 * QuickJS Host Bridge
 *
 * Creates host functions that bridge the QuickJS sandbox to the host SDK.
 * These functions are exposed via the `env` object in the sandbox.
 * Uses legacy (throwing) APIs for QuickJS compatibility.
 */

import type { QuickJSHostFunctions } from "./runtime.js";

// Import all SDK functions from the SDK module
// Use legacy APIs that throw on error for QuickJS compatibility
import {
  // Compress (legacy throwing functions)
  compressAuto,
  compressLogs,
  compressDiff,
  compressSemantic,
  // Code (legacy throwing functions)
  codeParse,
  codeExtract,
  codeSkeleton,
  // Utils
  countTokens,
  detectType,
  detectLanguage,
  // API creators - use legacy versions that throw
  createFilesAPILegacy,
  createGitAPILegacy,
  createSearchAPILegacy,
  createAnalyzeAPI,
  createPipelineAPI,
  createMultifileAPI,
  createConversationAPI,
} from "../sdk/index.js";

// Path validation
import {
  validatePath,
  validateGlobPattern,
  resolveWithinWorkingDir,
  safeReadFileSyncLegacy,
} from "../security/path-validator.js";

// Types
import type { HostCallbacks, ExtractionTarget } from "../types.js";
import type { SupportedLanguage } from "../../ast/types.js";

// Node modules
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Create host callbacks for file operations with path validation
 */
function createHostCallbacks(workingDir: string): HostCallbacks {
  return {
    readFile(filePath: string): string {
      // TOCTOU-safe: validates + re-resolves via realpath + checks in-tree
      // right before the readFileSync call.
      return safeReadFileSyncLegacy(filePath, workingDir);
    },

    fileExists(filePath: string): boolean {
      const validation = validatePath(filePath, workingDir);
      if (!validation.safe || !validation.resolvedPath) {
        return false;
      }
      // TOCTOU: if the path did not exist at validate time, an attacker may
      // have planted a symlink between validate and this call. Re-resolve
      // through realpath and refuse anything now pointing outside workingDir
      // — closes the one-bit host-filesystem oracle (CWE-362).
      // Invariant: `mustRecheckOnOpen` is true iff validatePath's realpath
      // threw (path absent), meaning containment could not be proven then.
      if (validation.mustRecheckOnOpen) {
        // `!` is the explicit form of the invariant: the guard at line 66
        // already proved `validation.resolvedPath` is defined, so this branch
        // always sees a string. Matches the PRD US-002 AC-1 wording.
        const resolved = resolveWithinWorkingDir(
          validation.resolvedPath!,
          workingDir
        );
        if (resolved === null) {
          return false;
        }
        return fs.existsSync(resolved);
      }
      // Fast path: the file existed at validate time and validatePath's
      // realpath check already confirmed it was in-tree. A residual
      // symlink-swap race here is accepted per the v0.9.1 AC.
      return fs.existsSync(validation.resolvedPath);
    },

    glob(pattern: string): string[] {
      const validation = validateGlobPattern(pattern, workingDir);
      if (!validation.safe) {
        throw new Error(validation.error || "Invalid glob pattern");
      }

      // Simple glob implementation
      const results: string[] = [];
      const basePattern = path.basename(pattern);

      function matchesPattern(filename: string, pat: string): boolean {
        if (pat === "*") return true;
        if (pat.startsWith("*.")) {
          const ext = pat.slice(1);
          return filename.endsWith(ext);
        }
        return filename === pat;
      }

      // Visited set keyed on realpath — prevents infinite recursion through
      // symlink loops (e.g. workingDir/a → workingDir/b, workingDir/b → a).
      const visitedDirs = new Set<string>();

      function walkDir(dir: string, relativePath: string = ""): void {
        let entries: fs.Dirent[];
        try {
          entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
          return; // Skip directories we can't read
        }

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relPath = path.join(relativePath, entry.name);

          if (entry.isSymbolicLink()) {
            // Refuse symlinks whose realpath escapes workingDir.
            const resolved = resolveWithinWorkingDir(fullPath, workingDir);
            if (resolved === null) continue;
            if (visitedDirs.has(resolved)) continue;

            let targetIsDir = false;
            let targetIsFile = false;
            try {
              const st = fs.statSync(resolved);
              targetIsDir = st.isDirectory();
              targetIsFile = st.isFile();
            } catch {
              continue;
            }

            if (targetIsDir) {
              if (pattern.includes("**")) {
                visitedDirs.add(resolved);
                walkDir(fullPath, relPath);
              }
            } else if (targetIsFile) {
              if (matchesPattern(entry.name, basePattern)) {
                results.push(relPath);
              }
            }
          } else if (entry.isDirectory()) {
            if (pattern.includes("**")) {
              walkDir(fullPath, relPath);
            }
          } else if (entry.isFile()) {
            if (matchesPattern(entry.name, basePattern)) {
              results.push(relPath);
            }
          }
        }
      }

      walkDir(workingDir);
      return results.slice(0, 100); // Limit results
    },
  };
}

/**
 * Create all host functions for the QuickJS sandbox
 * Uses legacy throwing APIs for compatibility with QuickJS error handling
 */
export function createHostBridge(workingDir: string): QuickJSHostFunctions {
  // Create callbacks with path validation
  const callbacks = createHostCallbacks(workingDir);

  // Create SDK APIs - use legacy versions that throw on error
  const filesAPI = createFilesAPILegacy(callbacks);
  const gitAPI = createGitAPILegacy(workingDir);
  const searchAPI = createSearchAPILegacy(workingDir, callbacks);
  const analyzeAPI = createAnalyzeAPI(workingDir, callbacks);
  const pipelineAPI = createPipelineAPI(workingDir, callbacks);
  const multifileAPI = createMultifileAPI(workingDir, callbacks);
  const conversationAPI = createConversationAPI(workingDir, callbacks);

  return {
    // Files
    __hostReadFile: (path: string): string => {
      return filesAPI.read(path);
    },

    __hostFileExists: (path: string): boolean => {
      return filesAPI.exists(path);
    },

    __hostGlob: (pattern: string): string[] => {
      return filesAPI.glob(pattern);
    },

    // Compress
    __hostCompressAuto: (content: string, hint?: string) => {
      return compressAuto(content, hint);
    },

    __hostCompressLogs: (logs: string) => {
      return compressLogs(logs);
    },

    __hostCompressDiff: (diff: string) => {
      return compressDiff(diff);
    },

    __hostCompressSemantic: (content: string, ratio?: number) => {
      return compressSemantic(content, ratio);
    },

    // Code
    __hostCodeParse: (content: string, lang: string) => {
      return codeParse(content, lang as SupportedLanguage);
    },

    __hostCodeExtract: (content: string, lang: string, targetJson: unknown) => {
      const target: ExtractionTarget =
        typeof targetJson === "string" ? JSON.parse(targetJson) : targetJson;
      return codeExtract(content, lang as SupportedLanguage, target);
    },

    __hostCodeSkeleton: (content: string, lang: string): string => {
      return codeSkeleton(content, lang as SupportedLanguage);
    },

    // Utils
    __hostCountTokens: (text: string): number => {
      return countTokens(text);
    },

    __hostDetectType: (content: string): string => {
      return detectType(content);
    },

    __hostDetectLanguage: (path: string): string => {
      return detectLanguage(path);
    },

    // Git
    __hostGitDiff: (ref?: string) => {
      return gitAPI.diff(ref);
    },

    __hostGitLog: (limit?: number) => {
      return gitAPI.log(limit);
    },

    __hostGitBlame: (file: string, line?: number) => {
      return gitAPI.blame(file, line);
    },

    __hostGitStatus: () => {
      return gitAPI.status();
    },

    __hostGitBranch: () => {
      return gitAPI.branch();
    },

    // Search
    __hostSearchGrep: (pattern: string, glob?: string) => {
      return searchAPI.grep(pattern, glob);
    },

    __hostSearchSymbols: (query: string, glob?: string) => {
      return searchAPI.symbols(query, glob);
    },

    __hostSearchFiles: (pattern: string) => {
      return searchAPI.files(pattern);
    },

    __hostSearchReferences: (symbol: string, glob?: string) => {
      return searchAPI.references(symbol, glob);
    },

    // Analyze
    __hostAnalyzeDeps: (file: string) => {
      return analyzeAPI.dependencies(file);
    },

    __hostAnalyzeCallGraph: (fn: string, file: string, depth?: number) => {
      return analyzeAPI.callGraph(fn, file, depth);
    },

    __hostAnalyzeExports: (file: string) => {
      return analyzeAPI.exports(file);
    },

    __hostAnalyzeStructure: (dir?: string, depth?: number) => {
      return analyzeAPI.structure(dir, depth);
    },

    // Pipeline
    __hostPipeline: (stepsJson: unknown) => {
      const steps =
        typeof stepsJson === "string" ? JSON.parse(stepsJson) : stepsJson;
      return pipelineAPI(steps);
    },

    __hostPipelineOverview: (dir?: string) => {
      return pipelineAPI.codebaseOverview(dir);
    },

    __hostPipelineFindUsages: (symbol: string, glob?: string) => {
      return pipelineAPI.findUsages(symbol, glob);
    },

    __hostPipelineAnalyzeDeps: (file: string, depth?: number) => {
      return pipelineAPI.analyzeDeps(file, depth);
    },

    // Multifile
    __hostMultifileCompress: (patterns: string[], optionsJson?: unknown) => {
      const options =
        typeof optionsJson === "string" ? JSON.parse(optionsJson) : optionsJson;
      return multifileAPI.compress(patterns, options);
    },

    __hostMultifileExtractShared: (patterns: string[]) => {
      return multifileAPI.extractShared(patterns);
    },

    __hostMultifileChunk: (patterns: string[], maxTokens: number) => {
      return multifileAPI.chunk(patterns, maxTokens);
    },

    __hostMultifileSkeletons: (patterns: string[], depth?: number) => {
      return multifileAPI.skeletons(patterns, depth);
    },

    __hostMultifileReadAll: (patterns: string[]) => {
      return multifileAPI.readAll(patterns);
    },

    // Conversation
    __hostConversationCompress: (messagesJson: unknown, optionsJson?: unknown) => {
      const messages =
        typeof messagesJson === "string" ? JSON.parse(messagesJson) : messagesJson;
      const options =
        typeof optionsJson === "string" ? JSON.parse(optionsJson) : optionsJson;
      return conversationAPI.compress(messages, options);
    },

    __hostConversationCreateMemory: (
      messagesJson: unknown,
      optionsJson?: unknown
    ) => {
      const messages =
        typeof messagesJson === "string" ? JSON.parse(messagesJson) : messagesJson;
      const options =
        typeof optionsJson === "string" ? JSON.parse(optionsJson) : optionsJson;
      return conversationAPI.createMemory(messages, options);
    },

    __hostConversationExtractDecisions: (messagesJson: unknown) => {
      const messages =
        typeof messagesJson === "string" ? JSON.parse(messagesJson) : messagesJson;
      return conversationAPI.extractDecisions(messages);
    },

    __hostConversationExtractCodeRefs: (messagesJson: unknown) => {
      const messages =
        typeof messagesJson === "string" ? JSON.parse(messagesJson) : messagesJson;
      return conversationAPI.extractCodeRefs(messages);
    },
  };
}
