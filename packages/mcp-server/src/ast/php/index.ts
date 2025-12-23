/**
 * PHP AST Parser Module
 *
 * Exports the Tree-sitter based PHP parser.
 */

export {
  phpTreeSitterParser,
  parsePhp,
  parsePhpAsync,
  extractPhpElement,
  searchPhpElements,
  initPhpParser,
} from "./parser.js";

export { QUERIES } from "./queries.js";

export {
  getLineNumber,
  getEndLineNumber,
  extractPhpDoc,
  getVisibility,
  isPublic,
  getFunctionSignature,
  getMethodSignature,
  getClassSignature,
  createCodeElement,
} from "./utils.js";
