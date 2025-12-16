/**
 * Smart File Read Tool
 *
 * Reads files intelligently using AST analysis to extract only
 * relevant portions (functions, classes, types) instead of full files.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { z } from "zod";
import type { SessionState } from "../state/session.js";
import {
  parseFile,
  extractElement,
  searchElements,
  extractLines,
  formatStructureSummary,
  hasParserSupport,
  type ExtractedContent,
} from "../ast/index.js";
import { detectLanguageFromPath } from "../utils/language-detector.js";
import type { ToolDefinition } from "./registry.js";

export const smartFileReadSchema = {
  type: "object" as const,
  properties: {
    filePath: {
      type: "string",
      description: "Absolute or relative path to the file to read",
    },
    target: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["function", "class", "interface", "type", "variable", "method"],
          description: "Type of code element to extract",
        },
        name: {
          type: "string",
          description: "Name of the element to extract",
        },
      },
      required: ["type", "name"],
      description: "Specific code element to extract (function, class, etc.)",
    },
    query: {
      type: "string",
      description: "Search query to find relevant code elements by name or content",
    },
    includeImports: {
      type: "boolean",
      description: "Include related import statements (default: true)",
    },
    includeComments: {
      type: "boolean",
      description: "Include JSDoc/docstring comments (default: true)",
    },
    lines: {
      type: "object",
      properties: {
        start: {
          type: "number",
          description: "Start line number (1-indexed)",
        },
        end: {
          type: "number",
          description: "End line number (1-indexed, inclusive)",
        },
      },
      required: ["start", "end"],
      description: "Extract a specific line range",
    },
  },
  required: ["filePath"],
};

const inputSchema = z.object({
  filePath: z.string(),
  target: z
    .object({
      type: z.enum(["function", "class", "interface", "type", "variable", "method"]),
      name: z.string(),
    })
    .optional(),
  query: z.string().optional(),
  includeImports: z.boolean().optional().default(true),
  includeComments: z.boolean().optional().default(true),
  lines: z
    .object({
      start: z.number(),
      end: z.number(),
    })
    .optional(),
});

function formatExtractedContent(
  extracted: ExtractedContent,
  filePath: string,
  language: string,
  totalLines: number,
  includeImports: boolean
): string {
  const parts: string[] = [];
  const element = extracted.elements[0];

  if (element) {
    parts.push(`## Extracted: ${element.type} \`${element.name}\``);
  } else {
    parts.push(`## Extracted: lines ${extracted.startLine}-${extracted.endLine}`);
  }

  parts.push("");
  parts.push(`**File:** ${filePath}`);
  parts.push(`**Lines:** ${extracted.startLine}-${extracted.endLine} of ${totalLines}`);
  parts.push("");

  // Add related imports if present
  if (includeImports && extracted.relatedImports.length > 0) {
    parts.push("```" + language);
    parts.push("// Related imports");
    for (const imp of extracted.relatedImports) {
      parts.push(imp);
    }
    parts.push("");
    parts.push(extracted.content);
    parts.push("```");
  } else {
    parts.push("```" + language);
    parts.push(extracted.content);
    parts.push("```");
  }

  // Token savings estimate
  const extractedLines = extracted.endLine - extracted.startLine + 1;
  const savedLines = totalLines - extractedLines;
  if (savedLines > 0 && totalLines > 10) {
    const savingsPercent = Math.round((savedLines / totalLines) * 100);
    parts.push("");
    parts.push(
      `**Extracted:** ${extractedLines} lines (of ${totalLines}) - ${savingsPercent}% reduction`
    );
  }

  return parts.join("\n");
}

function formatSearchResults(
  results: ReturnType<typeof searchElements>,
  filePath: string,
  query: string
): string {
  const parts: string[] = [];

  parts.push(`## Search Results: "${query}"`);
  parts.push(`**File:** ${filePath}`);
  parts.push(`**Matches:** ${results.length}`);
  parts.push("");

  if (results.length === 0) {
    parts.push("No matches found.");
    return parts.join("\n");
  }

  for (const element of results) {
    const prefix = element.parent ? `${element.parent}.` : "";
    const exported = element.isExported ? " (exported)" : "";
    const async = element.isAsync ? " async" : "";

    parts.push(
      `- **${element.type}** \`${prefix}${element.name}\`${exported}${async} - lines ${element.startLine}-${element.endLine}`
    );

    if (element.signature) {
      parts.push(`  \`${element.signature}\``);
    }

    if (element.documentation) {
      const docPreview = element.documentation.split("\n")[0]?.slice(0, 80);
      if (docPreview) {
        parts.push(`  _${docPreview}${element.documentation.length > 80 ? "..." : ""}_`);
      }
    }
  }

  parts.push("");
  parts.push("Use `target: { type, name }` to extract a specific element.");

  return parts.join("\n");
}

export async function executeSmartFileRead(
  args: unknown,
  _state: SessionState
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const input = inputSchema.parse(args);

  // Resolve file path
  const resolvedPath = path.isAbsolute(input.filePath)
    ? input.filePath
    : path.resolve(process.cwd(), input.filePath);

  // Check if file exists
  try {
    await fs.access(resolvedPath);
  } catch {
    return {
      content: [{ type: "text", text: `File not found: ${resolvedPath}` }],
    };
  }

  // Read file content
  const content = await fs.readFile(resolvedPath, "utf-8");
  const totalLines = content.split("\n").length;

  // Detect language
  const language = detectLanguageFromPath(resolvedPath);
  const languageId = language === "typescript" ? "typescript" : language === "javascript" ? "javascript" : language;

  // Priority 1: Extract specific line range
  if (input.lines) {
    const extracted = extractLines(content, input.lines.start, input.lines.end);
    const result = formatExtractedContent(
      extracted,
      input.filePath,
      languageId,
      totalLines,
      false
    );
    return { content: [{ type: "text", text: result }] };
  }

  // Check if we have parser support
  if (!hasParserSupport(language)) {
    // Fallback: return full file with warning
    const parts: string[] = [];
    parts.push(`## File: ${input.filePath}`);
    parts.push("");
    parts.push(`**Language:** ${language} (no AST support, returning full file)`);
    parts.push(`**Lines:** ${totalLines}`);
    parts.push("");
    parts.push("```" + languageId);
    parts.push(content);
    parts.push("```");

    return { content: [{ type: "text", text: parts.join("\n") }] };
  }

  // Priority 2: Extract specific target element
  if (input.target) {
    const extracted = extractElement(content, language, input.target, {
      includeImports: input.includeImports,
      includeComments: input.includeComments,
    });

    if (!extracted) {
      return {
        content: [
          {
            type: "text",
            text: `${input.target.type} '${input.target.name}' not found in ${input.filePath}`,
          },
        ],
      };
    }

    const result = formatExtractedContent(
      extracted,
      input.filePath,
      languageId,
      totalLines,
      input.includeImports
    );
    return { content: [{ type: "text", text: result }] };
  }

  // Priority 3: Search by query
  if (input.query) {
    const results = searchElements(content, language, input.query);
    const result = formatSearchResults(results, input.filePath, input.query);
    return { content: [{ type: "text", text: result }] };
  }

  // Default: Return file structure summary
  const structure = parseFile(content, language);
  const summary = formatStructureSummary(structure, input.filePath);

  return { content: [{ type: "text", text: summary }] };
}

export const smartFileReadTool: ToolDefinition = {
  name: "smart_file_read",
  description: `Read files intelligently using AST analysis.

Instead of reading entire files, extract only what you need:
- **Without arguments**: Get file structure overview (functions, classes, types)
- **With target**: Extract a specific function, class, or type by name
- **With query**: Search for code elements matching a pattern
- **With lines**: Extract a specific line range

Supports: TypeScript, JavaScript (full AST), Python, Go, Rust (regex-based).

Examples:
- Structure: { "filePath": "src/utils.ts" }
- Extract function: { "filePath": "src/utils.ts", "target": { "type": "function", "name": "parseConfig" } }
- Search: { "filePath": "src/utils.ts", "query": "parse" }
- Lines: { "filePath": "src/utils.ts", "lines": { "start": 10, "end": 50 } }`,
  inputSchema: smartFileReadSchema,
  execute: executeSmartFileRead,
};
