/**
 * Code Skeleton Tool
 *
 * Extracts code skeleton (signatures only) from source files.
 * Provides configurable depth levels and token statistics.
 */

import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import type { SessionState } from "../state/session.js";
import type { ToolDefinition } from "./registry.js";
import { parseFile, hasParserSupport } from "../ast/index.js";
import { detectLanguageFromPath } from "../utils/language-detector.js";
import { countTokens } from "../utils/token-counter.js";
import type { FileStructure } from "../ast/types.js";

// Schema JSON pour MCP
export const codeSkeletonSchema = {
  type: "object" as const,
  properties: {
    filePath: {
      type: "string",
      description: "Path to the source file",
    },
    includeTypes: {
      type: "boolean",
      description: "Include type definitions and interfaces (default: true)",
    },
    includeComments: {
      type: "boolean",
      description: "Include JSDoc/docstring comments (default: true)",
    },
    depth: {
      type: "number",
      enum: [1, 2, 3],
      description:
        "Detail level: 1=signatures only, 2=+docs preview, 3=+full signatures with docs",
    },
  },
  required: ["filePath"],
};

// Schema Zod
const inputSchema = z.object({
  filePath: z.string(),
  includeTypes: z.boolean().optional().default(true),
  includeComments: z.boolean().optional().default(true),
  depth: z.number().min(1).max(3).optional().default(1),
});

/**
 * Format file structure as skeleton based on depth level
 *
 * Depth levels:
 * - 1: Signatures only (minimal)
 * - 2: Signatures + inline doc preview
 * - 3: Full signatures with complete docs
 */
function formatSkeletonByDepth(
  structure: FileStructure,
  depth: number,
  includeTypes: boolean,
  includeComments: boolean,
  language: string
): string {
  const lines: string[] = [];

  // Types/Interfaces (if includeTypes)
  if (includeTypes && structure.types?.length) {
    for (const t of structure.types) {
      const exported = t.isExported ? "export " : "";

      if (depth >= 2 && includeComments && t.documentation) {
        const doc = t.documentation.split("\n")[0];
        if (depth === 3) {
          lines.push(`/** ${t.documentation} */`);
        } else {
          lines.push(`/** ${doc} */`);
        }
      }

      lines.push(`${exported}${t.signature || `type ${t.name}`}`);
    }
    if (structure.types.length > 0) lines.push("");
  }

  // Functions (top-level only, not methods)
  const topLevelFunctions = structure.functions?.filter((f) => !f.parent) || [];
  if (topLevelFunctions.length > 0) {
    for (const fn of topLevelFunctions) {
      const exported = fn.isExported ? "export " : "";
      const asyncMod = fn.isAsync ? "async " : "";
      const sig = fn.signature || `function ${fn.name}()`;

      if (depth === 1) {
        lines.push(`${exported}${asyncMod}${sig}`);
      } else if (depth >= 2) {
        if (includeComments && fn.documentation) {
          const doc = fn.documentation.split("\n")[0];
          if (depth === 3) {
            lines.push(`/** ${fn.documentation} */`);
            lines.push(`${exported}${asyncMod}${sig}`);
          } else {
            lines.push(`${exported}${asyncMod}${sig} // ${doc}`);
          }
        } else {
          lines.push(`${exported}${asyncMod}${sig}`);
        }
      }
    }
    lines.push("");
  }

  // Classes with methods
  if (structure.classes?.length) {
    for (const cls of structure.classes) {
      const exported = cls.isExported ? "export " : "";

      if (depth >= 2 && includeComments && cls.documentation) {
        const doc = cls.documentation.split("\n")[0];
        if (depth === 3) {
          lines.push(`/** ${cls.documentation} */`);
        } else {
          lines.push(`/** ${doc} */`);
        }
      }

      lines.push(`${exported}class ${cls.name} {`);

      // Methods
      const methods =
        structure.functions?.filter((f) => f.parent === cls.name) || [];
      for (const m of methods) {
        const asyncMod = m.isAsync ? "async " : "";
        const sig = m.signature || `${m.name}()`;

        if (depth === 1) {
          lines.push(`  ${asyncMod}${sig}`);
        } else if (depth >= 2) {
          if (includeComments && m.documentation) {
            const doc = m.documentation.split("\n")[0];
            if (depth === 3) {
              lines.push(`  /** ${m.documentation} */`);
              lines.push(`  ${asyncMod}${sig}`);
            } else {
              lines.push(`  ${asyncMod}${sig} // ${doc}`);
            }
          } else {
            lines.push(`  ${asyncMod}${sig}`);
          }
        }
      }

      lines.push(`}`);
      lines.push("");
    }
  }

  // Exported variables (constants, etc.)
  const exportedVars = structure.variables?.filter((v) => v.isExported) || [];
  if (exportedVars.length > 0) {
    for (const v of exportedVars) {
      if (depth >= 2 && includeComments && v.documentation) {
        const doc = v.documentation.split("\n")[0];
        lines.push(`// ${doc}`);
      }
      lines.push(`export ${v.signature || `const ${v.name}`}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

/**
 * Execute code-skeleton tool
 */
export async function executeCodeSkeleton(
  args: unknown,
  _state: SessionState
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const input = inputSchema.parse(args);
  const workingDir = process.cwd();

  // Resolve path
  const resolvedPath = path.isAbsolute(input.filePath)
    ? path.normalize(input.filePath)
    : path.resolve(workingDir, input.filePath);

  // Read file
  let content: string;
  try {
    content = await fs.readFile(resolvedPath, "utf-8");
  } catch {
    return {
      content: [{ type: "text", text: `File not found: ${resolvedPath}` }],
    };
  }

  // Detect language
  const language = detectLanguageFromPath(resolvedPath);

  if (!hasParserSupport(language)) {
    return {
      content: [
        {
          type: "text",
          text: `Language '${language}' not supported for skeleton extraction. Supported: typescript, javascript, python, go, rust, php, swift`,
        },
      ],
    };
  }

  // Parse file
  const structure = parseFile(content, language);

  // Generate skeleton
  const skeleton = formatSkeletonByDepth(
    structure,
    input.depth,
    input.includeTypes,
    input.includeComments,
    language
  );

  // Calculate statistics
  const originalTokens = countTokens(content);
  const skeletonTokens = countTokens(skeleton);
  const savings =
    originalTokens > 0
      ? Math.round((1 - skeletonTokens / originalTokens) * 100)
      : 0;

  // Format output
  const depthLabels = ["", "signatures", "signatures+docs", "full"];
  const output = [
    `## Code Skeleton: ${input.filePath}`,
    "",
    `**Language:** ${language} | **Depth:** ${input.depth} (${depthLabels[input.depth]})`,
    `**Options:** types=${input.includeTypes}, comments=${input.includeComments}`,
    `**Tokens:** ${skeletonTokens} (was ${originalTokens}) | **Savings:** ${savings}%`,
    "",
    "```" + language,
    skeleton,
    "```",
  ].join("\n");

  return { content: [{ type: "text", text: output }] };
}

/**
 * Code Skeleton Tool Definition
 */
export const codeSkeletonTool: ToolDefinition = {
  name: "code_skeleton",
  description: `Extract code skeleton (signatures only) from a source file.

Returns function signatures, class structures, and type definitions without implementation bodies.
Perfect for understanding a file's API surface with minimal tokens.

Depth levels:
- **1** (default): Minimal signatures only
- **2**: Signatures + inline doc preview
- **3**: Full signatures with complete documentation

Options:
- **includeTypes**: Include type/interface definitions (default: true)
- **includeComments**: Include JSDoc/docstrings (default: true)

Supports: TypeScript, JavaScript, Python, Go, Rust, PHP, Swift

Examples:
- Minimal: { "filePath": "src/server.ts" }
- With docs: { "filePath": "src/server.ts", "depth": 2 }
- Full: { "filePath": "src/server.ts", "depth": 3, "includeTypes": true }`,
  inputSchema: codeSkeletonSchema,
  execute: executeCodeSkeleton,
};
