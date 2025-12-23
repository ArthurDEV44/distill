/**
 * PHP Tree-sitter Queries
 *
 * S-expression queries for extracting PHP code elements.
 */

/**
 * Query to find all function definitions
 */
export const FUNCTION_QUERY = `
(function_definition
  name: (name) @name) @function
`;

/**
 * Query to find all class declarations
 */
export const CLASS_QUERY = `
(class_declaration
  name: (name) @name) @class
`;

/**
 * Query to find all interface declarations
 */
export const INTERFACE_QUERY = `
(interface_declaration
  name: (name) @name) @interface
`;

/**
 * Query to find all trait declarations
 */
export const TRAIT_QUERY = `
(trait_declaration
  name: (name) @name) @trait
`;

/**
 * Query to find all namespace definitions
 */
export const NAMESPACE_QUERY = `
(namespace_definition
  name: (namespace_name) @name) @namespace
`;

/**
 * Query to find all use declarations (imports)
 */
export const USE_QUERY = `
(namespace_use_declaration) @use
`;

/**
 * Query to find all method declarations
 */
export const METHOD_QUERY = `
(method_declaration
  name: (name) @name) @method
`;

/**
 * Query to find all property declarations
 */
export const PROPERTY_QUERY = `
(property_declaration) @property
`;

/**
 * Query to find const declarations
 */
export const CONST_QUERY = `
(const_declaration) @const
`;

/**
 * Combined query for all definitions
 */
export const ALL_DEFINITIONS_QUERY = `
; Namespace definitions
(namespace_definition
  name: (namespace_name) @namespace_name) @namespace

; Use declarations (imports)
(namespace_use_declaration) @use_decl

; Function definitions
(function_definition
  name: (name) @func_name) @function

; Class declarations
(class_declaration
  name: (name) @class_name) @class

; Interface declarations
(interface_declaration
  name: (name) @interface_name) @interface

; Trait declarations
(trait_declaration
  name: (name) @trait_name) @trait

; Method declarations
(method_declaration
  name: (name) @method_name) @method

; Const declarations
(const_declaration) @const

; Property declarations
(property_declaration) @property
`;

/**
 * Query patterns as a single object for easy access
 */
export const QUERIES = {
  function: FUNCTION_QUERY,
  class: CLASS_QUERY,
  interface: INTERFACE_QUERY,
  trait: TRAIT_QUERY,
  namespace: NAMESPACE_QUERY,
  use: USE_QUERY,
  method: METHOD_QUERY,
  property: PROPERTY_QUERY,
  const: CONST_QUERY,
  all: ALL_DEFINITIONS_QUERY,
} as const;
