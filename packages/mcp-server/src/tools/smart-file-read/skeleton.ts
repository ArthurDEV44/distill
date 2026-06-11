/**
 * Smart File Read — skeleton mode (US-011 decomposition).
 * Renders a code skeleton (signatures, depth 1-3) and runs the cold-WASM-safe
 * async parse path.
 */

import { parseFileAsync, hasParserSupport } from "../../ast/index.js";
import type { FileStructure } from "../../ast/types.js";
import { countTokens } from "../../utils/token-counter.js";
import {
  countElements,
  withStructureNote,
  parserUnavailableText,
  type OutputFormat,
  type SmartReadContext,
  type ToolResult,
} from "./support.js";

/**
 * Format file structure as a code skeleton with actual signatures.
 * Absorbs the deleted code_skeleton tool's formatSkeletonByDepth.
 *
 * Depth levels:
 * - 1: Signatures only (minimal)
 * - 2: Signatures + inline doc preview (first line of JSDoc)
 * - 3: Full signatures with complete documentation
 */
function formatSkeletonOutput(
  structure: FileStructure,
  filePath: string,
  languageId: string,
  totalLines: number,
  originalContent: string,
  depth: number = 1,
  format: OutputFormat = "plain",
): string {
  const parts: string[] = [];
  const md = format === "markdown";
  const skeletonLines: string[] = [];

  // Helper to emit a signature line with optional documentation based on depth.
  // depth 1: signature only. depth 2: signature // first-line-doc. depth 3: full /** doc */ block before signature.
  const emitWithDoc = (sig: string, doc: string | undefined, indent: string = "") => {
    if (doc && depth === 3) {
      skeletonLines.push(`${indent}/** ${doc} */`);
      skeletonLines.push(`${indent}${sig}`);
    } else if (doc && depth === 2) {
      skeletonLines.push(`${indent}${sig} // ${doc.split("\n")[0]}`);
    } else {
      skeletonLines.push(`${indent}${sig}`);
    }
  };

  // Types
  if (structure.types?.length) {
    for (const t of structure.types) {
      const exported = t.isExported ? "export " : "";
      emitWithDoc(`${exported}${t.signature || `type ${t.name}`}`, t.documentation);
    }
    skeletonLines.push("");
  }

  // Interfaces
  if (structure.interfaces?.length) {
    for (const iface of structure.interfaces) {
      const exported = iface.isExported ? "export " : "";
      emitWithDoc(`${exported}${iface.signature || `interface ${iface.name}`}`, iface.documentation);
    }
    skeletonLines.push("");
  }

  // Top-level functions (not methods)
  const topLevelFunctions = structure.functions?.filter((f) => !f.parent) || [];
  if (topLevelFunctions.length > 0) {
    for (const fn of topLevelFunctions) {
      const exported = fn.isExported ? "export " : "";
      const needsAsync = fn.isAsync && !/\basync\b/.test(fn.signature ?? "");
      const asyncMod = needsAsync ? "async " : "";
      const sig = fn.signature || `function ${fn.name}()`;
      emitWithDoc(`${exported}${asyncMod}${sig}`, fn.documentation);
    }
    skeletonLines.push("");
  }

  // Classes with methods
  if (structure.classes?.length) {
    for (const cls of structure.classes) {
      const exported = cls.isExported ? "export " : "";
      emitWithDoc(`${exported}class ${cls.name} {`, cls.documentation);

      const methods = structure.functions?.filter((f) => f.parent === cls.name) || [];
      for (const m of methods) {
        const needsAsync = m.isAsync && !/\basync\b/.test(m.signature ?? "");
        const asyncMod = needsAsync ? "async " : "";
        const sig = m.signature || `${m.name}()`;
        emitWithDoc(`${asyncMod}${sig}`, m.documentation, "  ");
      }
      skeletonLines.push("}");
      skeletonLines.push("");
    }
  }

  // Exported variables
  const exportedVars = structure.variables?.filter((v) => v.isExported) || [];
  if (exportedVars.length > 0) {
    for (const v of exportedVars) {
      emitWithDoc(`export ${v.signature || `const ${v.name}`}`, v.documentation);
    }
    skeletonLines.push("");
  }

  const skeleton = skeletonLines.join("\n").trim();

  // Token statistics (use fast approximation for very large files to avoid blocking event loop)
  const originalTokens = originalContent.length > 200_000
    ? Math.ceil(originalContent.length / 4)
    : countTokens(originalContent);
  const skeletonTokens = countTokens(skeleton);
  const savings = originalTokens > 0 ? Math.round((1 - skeletonTokens / originalTokens) * 100) : 0;
  const depthLabels = ["", "signatures", "signatures+docs", "full"];

  if (md) {
    parts.push(`## Code Skeleton: ${filePath}`);
    parts.push("");
    parts.push(`**Language:** ${languageId} | **Depth:** ${depth} (${depthLabels[depth]})`);
    parts.push(`**Tokens:** ${skeletonTokens} (was ${originalTokens}) | **Savings:** ${savings}%`);
    parts.push("");
    parts.push("```" + languageId);
    parts.push(skeleton);
    parts.push("```");
  } else {
    parts.push(`${filePath} (${languageId}, ${totalLines} lines)`);
    parts.push(`Depth: ${depth} (${depthLabels[depth]}) | Tokens: ${skeletonTokens}/${originalTokens} (${savings}% saved)`);
    parts.push("");
    parts.push(skeleton);
  }

  return parts.join("\n");
}

/** Skeleton-mode runner. Awaits Tree-sitter WASM init (US-004) so a cold session
 * returns the real structure, not a silently-empty one. */
export async function runSkeleton(ctx: SmartReadContext): Promise<ToolResult> {
  const { input, content, language, languageId, totalLines, cacheAndReturn } = ctx;

  if (!hasParserSupport(language)) {
    // Return empty skeleton for unsupported languages (not an error per US-006)
    const emptyResult = `${input.filePath} (${languageId}, ${totalLines} lines)\nNo AST support for ${languageId} — skeleton not available. Use mode "full" or "lines" instead.`;
    return cacheAndReturn(emptyResult, "skeleton");
  }

  let structure: FileStructure;
  try {
    structure = await parseFileAsync(content, language); // full AST parse for real signatures
  } catch {
    return cacheAndReturn(parserUnavailableText(input.filePath, languageId, totalLines), "skeleton");
  }

  const skeleton = formatSkeletonOutput(
    structure, input.filePath, languageId, totalLines, content, input.depth, input.format
  );
  return cacheAndReturn(
    withStructureNote(skeleton, structure, content),
    "skeleton",
    countElements(structure)
  );
}
