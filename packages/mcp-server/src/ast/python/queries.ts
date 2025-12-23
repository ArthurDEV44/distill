/**
 * Python Tree-sitter Queries
 *
 * S-expression queries for extracting Python code elements.
 * Tree-sitter uses a query language similar to Lisp S-expressions.
 */

/**
 * Query to find all function definitions (including async)
 * Captures:
 * - @function: the function_definition node
 * - @name: the function name
 */
export const FUNCTION_QUERY = `
(function_definition
  name: (identifier) @name) @function
`;

/**
 * Query to find all class definitions
 * Captures:
 * - @class: the class_definition node
 * - @name: the class name
 */
export const CLASS_QUERY = `
(class_definition
  name: (identifier) @name) @class
`;

/**
 * Query to find all import statements
 * Captures:
 * - @import: the import statement node
 */
export const IMPORT_QUERY = `
[
  (import_statement) @import
  (import_from_statement) @import
]
`;

/**
 * Query to find all decorated definitions
 * Captures:
 * - @decorator: the decorator node
 * - @definition: the decorated definition (function or class)
 */
export const DECORATED_QUERY = `
(decorated_definition
  (decorator) @decorator
  definition: [
    (function_definition) @function
    (class_definition) @class
  ])
`;

/**
 * Query to find all assignments at module level (variables)
 * Captures:
 * - @variable: the assignment node
 * - @name: the variable name
 */
export const VARIABLE_QUERY = `
(module
  (expression_statement
    (assignment
      left: (identifier) @name) @variable))
`;

/**
 * Query to find all type aliases (using TypeAlias or simple assignment with type annotation)
 * Captures:
 * - @type_alias: the type alias definition
 */
export const TYPE_ALIAS_QUERY = `
(module
  (type_alias_statement
    name: (type) @name) @type_alias)
`;

/**
 * Query to find class methods
 * Captures:
 * - @method: the function_definition node inside a class
 * - @name: the method name
 * - @class_name: the parent class name
 */
export const METHOD_QUERY = `
(class_definition
  name: (identifier) @class_name
  body: (block
    (function_definition
      name: (identifier) @method_name) @method))
`;

/**
 * Combined query for all top-level definitions
 * This is more efficient than running multiple queries
 */
export const ALL_DEFINITIONS_QUERY = `
; Functions at module level
(module
  (function_definition
    name: (identifier) @func_name) @function)

; Decorated functions at module level
(module
  (decorated_definition
    (function_definition
      name: (identifier) @decorated_func_name) @decorated_function))

; Classes at module level
(module
  (class_definition
    name: (identifier) @class_name) @class)

; Decorated classes at module level
(module
  (decorated_definition
    (class_definition
      name: (identifier) @decorated_class_name) @decorated_class))

; Import statements
(import_statement) @import
(import_from_statement) @import_from

; Module-level variables
(module
  (expression_statement
    (assignment
      left: (identifier) @var_name) @variable))
`;

/**
 * Query patterns as a single object for easy access
 */
export const QUERIES = {
  function: FUNCTION_QUERY,
  class: CLASS_QUERY,
  import: IMPORT_QUERY,
  decorated: DECORATED_QUERY,
  variable: VARIABLE_QUERY,
  typeAlias: TYPE_ALIAS_QUERY,
  method: METHOD_QUERY,
  all: ALL_DEFINITIONS_QUERY,
} as const;
