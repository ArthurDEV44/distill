/**
 * AST Types
 *
 * Shared type definitions for code parsing and extraction.
 * Enhanced in 2025 for comprehensive TypeScript AST support.
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

/** Runtime list of every valid {@link SupportedLanguage}, backing {@link isSupportedLanguage}. */
const SUPPORTED_LANGUAGES = [
  "typescript",
  "javascript",
  "python",
  "go",
  "rust",
  "php",
  "swift",
  "json",
  "yaml",
  "unknown",
] as const satisfies readonly SupportedLanguage[];

/**
 * Type guard for {@link SupportedLanguage}. Use at untrusted boundaries (e.g. a
 * language string crossing the QuickJS guest→host bridge) before casting.
 */
export function isSupportedLanguage(value: string): value is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

export type ElementType =
  | "function"
  | "class"
  | "interface"
  | "type"
  | "variable"
  | "import"
  | "export"
  | "method"
  | "enum"
  | "enum-member"
  | "property"
  | "getter"
  | "setter"
  | "constructor";

export type Visibility = "public" | "private" | "protected";

/**
 * Detailed parameter information for functions/methods/constructors
 */
export interface ParameterInfo {
  /** Parameter name */
  name: string;
  /** Type annotation if present */
  type?: string;
  /** Whether the parameter is optional (has ?) */
  isOptional?: boolean;
  /** Whether this is a rest parameter (...args) */
  isRest?: boolean;
  /** Default value expression if present */
  defaultValue?: string;
  /** Parameter decorators (TypeScript) */
  decorators?: string[];
  /** Visibility modifier for constructor parameter properties */
  visibility?: Visibility;
  /** Whether parameter property is readonly */
  isReadonly?: boolean;
}

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

  // Enhanced properties (2025)

  /** Visibility modifier (public, private, protected) */
  visibility?: Visibility;
  /** Whether this is a static member */
  isStatic?: boolean;
  /** Whether this is abstract (class or method) */
  isAbstract?: boolean;
  /** Whether this is readonly (property) */
  isReadonly?: boolean;
  /** Decorators applied to this element */
  decorators?: string[];
  /** Generic type parameters (e.g., ["T", "K extends keyof T"]) */
  generics?: string[];
  /** Return type annotation */
  returnType?: string;
  /** Detailed parameter information */
  parameters?: ParameterInfo[];
  /** Child elements (class members, enum members, interface members) */
  children?: CodeElement[];
  /** Type annotation for properties/variables */
  typeAnnotation?: string;
  /** Initializer/default value expression */
  initializer?: string;
  /** Extended/implemented types (for classes/interfaces) */
  extends?: string[];
  /** Implemented interfaces (for classes) */
  implements?: string[];
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
  /** Enum declarations (TS) */
  enums: CodeElement[];
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
 * Options for parsing control
 * @deprecated The detailed option is now always true for better AST quality
 */
export interface ParseOptions {
  /** @deprecated Always extracts full details now */
  detailed?: boolean;
}

/**
 * Parser interface that all language parsers must implement
 */
export interface LanguageParser {
  /** Supported languages */
  languages: SupportedLanguage[];

  /** Parse file content and return structure */
  parse(content: string, options?: ParseOptions): FileStructure;

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
export function createEmptyStructure(
  language: SupportedLanguage,
  totalLines: number
): FileStructure {
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
    enums: [],
  };
}
