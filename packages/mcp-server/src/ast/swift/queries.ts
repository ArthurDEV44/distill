/**
 * Swift Tree-sitter Queries
 *
 * S-expression queries for extracting Swift code elements.
 */

/**
 * Query to find all function declarations
 */
export const FUNCTION_QUERY = `
(function_declaration
  name: (simple_identifier) @name) @function
`;

/**
 * Query to find all class declarations
 */
export const CLASS_QUERY = `
(class_declaration
  name: (type_identifier) @name) @class
`;

/**
 * Query to find all struct declarations
 */
export const STRUCT_QUERY = `
(struct_declaration
  name: (type_identifier) @name) @struct
`;

/**
 * Query to find all enum declarations
 */
export const ENUM_QUERY = `
(enum_declaration
  name: (type_identifier) @name) @enum
`;

/**
 * Query to find all protocol declarations
 */
export const PROTOCOL_QUERY = `
(protocol_declaration
  name: (type_identifier) @name) @protocol
`;

/**
 * Query to find all import declarations
 */
export const IMPORT_QUERY = `
(import_declaration) @import
`;

/**
 * Query to find all extension declarations
 */
export const EXTENSION_QUERY = `
(extension_declaration) @extension
`;

/**
 * Query to find all typealias declarations
 */
export const TYPEALIAS_QUERY = `
(typealias_declaration
  name: (type_identifier) @name) @typealias
`;

/**
 * Query to find all property/variable declarations
 */
export const VARIABLE_QUERY = `
(property_declaration) @property
`;

/**
 * Query to find initializers
 */
export const INIT_QUERY = `
(init_declaration) @init
`;

/**
 * Query to find deinitializers
 */
export const DEINIT_QUERY = `
(deinit_declaration) @deinit
`;

/**
 * Combined query for all definitions
 */
export const ALL_DEFINITIONS_QUERY = `
; Import declarations
(import_declaration) @import_decl

; Function declarations
(function_declaration
  name: (simple_identifier) @func_name) @function

; Class declarations
(class_declaration
  name: (type_identifier) @class_name) @class

; Struct declarations
(struct_declaration
  name: (type_identifier) @struct_name) @struct

; Enum declarations
(enum_declaration
  name: (type_identifier) @enum_name) @enum

; Protocol declarations
(protocol_declaration
  name: (type_identifier) @protocol_name) @protocol

; Extension declarations
(extension_declaration) @extension

; Typealias declarations
(typealias_declaration
  name: (type_identifier) @typealias_name) @typealias

; Property declarations
(property_declaration) @property

; Init declarations
(init_declaration) @init

; Deinit declarations
(deinit_declaration) @deinit
`;

/**
 * Query patterns as a single object for easy access
 */
export const QUERIES = {
  function: FUNCTION_QUERY,
  class: CLASS_QUERY,
  struct: STRUCT_QUERY,
  enum: ENUM_QUERY,
  protocol: PROTOCOL_QUERY,
  import: IMPORT_QUERY,
  extension: EXTENSION_QUERY,
  typealias: TYPEALIAS_QUERY,
  variable: VARIABLE_QUERY,
  init: INIT_QUERY,
  deinit: DEINIT_QUERY,
  all: ALL_DEFINITIONS_QUERY,
} as const;
