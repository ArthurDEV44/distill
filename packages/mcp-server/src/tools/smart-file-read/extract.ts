/**
 * Smart File Read — extract mode (US-011 decomposition).
 * Extracts a single code element by type+name and formats it. `formatExtractedContent`
 * is also reused by the entry's `lines` mode.
 */

import { extractElementAsync, type ExtractedContent } from "../../ast/index.js";
import {
  parserUnavailableText,
  type OutputFormat,
  type SmartReadContext,
  type ToolResult,
} from "./support.js";

export function formatExtractedContent(
  extracted: ExtractedContent,
  filePath: string,
  language: string,
  totalLines: number,
  includeImports: boolean,
  format: OutputFormat = "plain"
): string {
  const parts: string[] = [];
  const element = extracted.elements[0];
  const md = format === "markdown";

  if (element) {
    parts.push(md ? `## Extracted: ${element.type} \`${element.name}\`` : `[${element.type}] ${element.name}`);
  } else {
    parts.push(md ? `## Extracted: lines ${extracted.startLine}-${extracted.endLine}` : `[lines ${extracted.startLine}-${extracted.endLine}]`);
  }

  parts.push(md ? "" : `${filePath}:${extracted.startLine}-${extracted.endLine} (${language}, ${totalLines} lines)`);
  if (md) {
    parts.push(`**File:** ${filePath}`);
    parts.push(`**Lines:** ${extracted.startLine}-${extracted.endLine} of ${totalLines}`);
    parts.push("");
  }

  // Add related imports if present
  if (includeImports && extracted.relatedImports.length > 0) {
    if (md) parts.push("```" + language);
    parts.push("// Related imports");
    for (const imp of extracted.relatedImports) {
      parts.push(imp);
    }
    parts.push("");
    parts.push(extracted.content);
    if (md) parts.push("```");
  } else {
    if (md) parts.push("```" + language);
    parts.push(extracted.content);
    if (md) parts.push("```");
  }

  // Token savings estimate
  const extractedLines = extracted.endLine - extracted.startLine + 1;
  const savedLines = totalLines - extractedLines;
  if (savedLines > 0 && totalLines > 10) {
    const savingsPercent = Math.round((savedLines / totalLines) * 100);
    parts.push(md ? "" : "---");
    parts.push(
      md
        ? `**Extracted:** ${extractedLines} lines (of ${totalLines}) - ${savingsPercent}% reduction`
        : `Extracted: ${extractedLines}/${totalLines} lines (${savingsPercent}% reduction)`
    );
  }

  return parts.join("\n");
}

/** Extract-mode runner. */
export async function runExtract(ctx: SmartReadContext): Promise<ToolResult> {
  const { input, content, language, languageId, totalLines, cacheAndReturn } = ctx;

  if (!input.target) {
    return {
      content: [{ type: "text", text: "Extract mode requires 'target' param with type and name." }],
      isError: true,
    };
  }

  let extracted: ExtractedContent | null;
  try {
    extracted = await extractElementAsync(content, language, input.target, {
      includeImports: input.includeImports,
      includeComments: input.includeComments,
    });
  } catch {
    return {
      content: [{ type: "text", text: parserUnavailableText(input.filePath, languageId, totalLines) }],
      isError: true,
    };
  }

  if (!extracted) {
    return {
      content: [
        {
          type: "text",
          text: `${input.target.type} '${input.target.name}' not found in ${input.filePath}`,
        },
      ],
      isError: true,
    };
  }

  const result = formatExtractedContent(
    extracted,
    input.filePath,
    languageId,
    totalLines,
    input.includeImports,
    input.format
  );
  return cacheAndReturn(result, "extract", extracted.elements.length);
}
