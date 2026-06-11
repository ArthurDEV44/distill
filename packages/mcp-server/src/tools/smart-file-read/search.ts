/**
 * Smart File Read — search mode (US-011 decomposition).
 * Finds code elements matching a query and formats the match list.
 */

import { searchElementsAsync } from "../../ast/index.js";
import {
  parserUnavailableText,
  type OutputFormat,
  type SmartReadContext,
  type ToolResult,
} from "./support.js";

function formatSearchResults(
  results: Awaited<ReturnType<typeof searchElementsAsync>>,
  filePath: string,
  query: string,
  format: OutputFormat = "plain"
): string {
  const parts: string[] = [];
  const md = format === "markdown";

  parts.push(md ? `## Search Results: "${query}"` : `Search: "${query}" in ${filePath}`);
  if (md) {
    parts.push(`**File:** ${filePath}`);
    parts.push(`**Matches:** ${results.length}`);
    parts.push("");
  } else {
    parts.push(`Matches: ${results.length}`);
  }

  if (results.length === 0) {
    parts.push("No matches found.");
    return parts.join("\n");
  }

  for (const element of results) {
    const prefix = element.parent ? `${element.parent}.` : "";
    const exported = element.isExported ? " (exported)" : "";
    const async = element.isAsync ? " async" : "";

    if (md) {
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
    } else {
      parts.push(`${element.type} ${prefix}${element.name}${exported}${async} (${element.startLine}-${element.endLine})`);
    }
  }

  if (md) {
    parts.push("");
    parts.push("Use `target: { type, name }` to extract a specific element.");
  }

  return parts.join("\n");
}

/** Search-mode runner. */
export async function runSearch(ctx: SmartReadContext): Promise<ToolResult> {
  const { input, content, language, languageId, totalLines, cacheAndReturn } = ctx;

  if (!input.query) {
    return {
      content: [{ type: "text", text: "Search mode requires 'query' param." }],
      isError: true,
    };
  }

  let results: Awaited<ReturnType<typeof searchElementsAsync>>;
  try {
    results = await searchElementsAsync(content, language, input.query);
  } catch {
    return {
      content: [{ type: "text", text: parserUnavailableText(input.filePath, languageId, totalLines) }],
      isError: true,
    };
  }

  const result = formatSearchResults(results, input.filePath, input.query, input.format);
  return cacheAndReturn(result, "search", results.length);
}
