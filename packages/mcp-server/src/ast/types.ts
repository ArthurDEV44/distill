/**
 * AST Types
 *
 * Shared type definitions for code parsing and extraction.
 */

export type SupportedLanguage =
  | "typescript"
  | "javascript"
  | "python"
  | "go"
  | "rust"
  | "php"
  | "swift"
  | "json"
  | "yaml"
  | "unknown";

export type ElementType =
  | "function"
  | "class"
  | "interface"
  | "type"
  | "variable"
  | "import"
  | "export"
  | "method";

export interface CodeElement {
  /** Type of code element */
  type: ElementType;
  /** Name of the element */
  name: string;
  /** Starting line number (1-indexed) */
  startLine: number;
  /** Ending line number (1-indexed) */
  endLine: number;
  /** Function/method signature if applicable */
  signature?: string;
  /** JSDoc/docstring content if present */
  documentation?: string;
  /** Whether this element is exported */
  isExported?: boolean;
  /** Whether this is async (for functions) */
  isAsync?: boolean;
  /** Parent element name (for methods in classes) */
  parent?: string;
}

export interface FileStructure {
  /** Detected language */
  language: SupportedLanguage;
  /** Total lines in file */
  totalLines: number;
  /** Import statements */
  imports: CodeElement[];
  /** Export statements */
  exports: CodeElement[];
  /** Function declarations */
  functions: CodeElement[];
  /** Class declarations */
  classes: CodeElement[];
  /** Interface declarations (TS) */
  interfaces: CodeElement[];
  /** Type alias declarations (TS) */
  types: CodeElement[];
  /** Variable/constant declarations */
  variables: CodeElement[];
}

export interface ExtractedContent {
  /** Extracted code content */
  content: string;
  /** Elements that were extracted */
  elements: CodeElement[];
  /** Related import statements */
  relatedImports: string[];
  /** Start line of extraction */
  startLine: number;
  /** End line of extraction */
  endLine: number;
}

export interface ExtractionTarget {
  /** Type of element to find */
  type: ElementType;
  /** Name of element to find */
  name: string;
}

export interface ExtractionOptions {
  /** Include related imports */
  includeImports: boolean;
  /** Include JSDoc/docstring comments */
  includeComments: boolean;
}

/**
 * Parser interface that all language parsers must implement
 */
export interface LanguageParser {
  /** Supported languages */
  languages: SupportedLanguage[];

  /** Parse file content and return structure */
  parse(content: string): FileStructure;

  /** Extract a specific element by target */
  extractElement(
    content: string,
    target: ExtractionTarget,
    options: ExtractionOptions
  ): ExtractedContent | null;

  /** Search for elements matching a query */
  searchElements(content: string, query: string): CodeElement[];
}

/**
 * Create an empty file structure
 */
export function createEmptyStructure(language: SupportedLanguage, totalLines: number): FileStructure {
  return {
    language,
    totalLines,
    imports: [],
    exports: [],
    functions: [],
    classes: [],
    interfaces: [],
    types: [],
    variables: [],
  };
}
