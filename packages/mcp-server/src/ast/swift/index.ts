/**
 * Swift AST Parser Module
 *
 * Exports all Swift parsing functionality.
 */

export {
  swiftTreeSitterParser,
  parseSwift,
  parseSwiftAsync,
  extractSwiftElement,
  searchSwiftElements,
  initSwiftParser,
} from "./parser.js";

export { QUERIES } from "./queries.js";

export {
  getLineNumber,
  getEndLineNumber,
  extractSwiftDoc,
  getAccessLevel,
  isPublic,
  isAsync,
  isStatic,
  getFunctionSignature,
  getMethodSignature,
  getClassSignature,
  getStructSignature,
  getProtocolSignature,
  getEnumSignature,
  getExtensionSignature,
  getTypealiasSignature,
  getImportPath,
  getVariableSignature,
  createCodeElement,
} from "./utils.js";

export type { SwiftAccessLevel } from "./utils.js";
