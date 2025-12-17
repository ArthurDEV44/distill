import { randomBytes, createHash } from "crypto";
import {
  API_KEY_PREFIX,
  API_KEY_LENGTH,
  API_KEY_DISPLAY_PREFIX_LENGTH,
} from "@ctxopt/shared";

/**
 * Result of generating a new API key
 */
export interface GeneratedApiKey {
  /** Full API key (e.g., "ctx_Abc123XyZ789...") - only returned once at creation */
  key: string;
  /** SHA-256 hash of the key (64 hex chars) - stored in database */
  hash: string;
  /** Display prefix (e.g., "ctx_abc12345...") - stored for identification */
  prefix: string;
}

/**
 * Generates a new API key with cryptographically secure random bytes
 *
 * Algorithm:
 * 1. Generate 32 random bytes using crypto.randomBytes
 * 2. Encode as base64url (URL-safe, no padding)
 * 3. Prepend the "ctx_" prefix
 * 4. Calculate SHA-256 hash for storage
 * 5. Extract display prefix (first 12 chars)
 *
 * @returns Object containing the full key, hash, and display prefix
 */
export function generateApiKey(): GeneratedApiKey {
  // Step 1: Generate 32 cryptographically secure random bytes
  const bytes = randomBytes(API_KEY_LENGTH);

  // Step 2: Encode as base64url (URL-safe alphabet, no padding)
  const base64url = bytes.toString("base64url");

  // Step 3: Add the prefix
  const key = `${API_KEY_PREFIX}${base64url}`;

  // Step 4: Calculate SHA-256 hash
  const hash = hashApiKey(key);

  // Step 5: Extract display prefix
  const prefix = extractKeyPrefix(key);

  return { key, hash, prefix };
}

/**
 * Calculates the SHA-256 hash of an API key
 *
 * @param key - The full API key
 * @returns 64-character hexadecimal hash string
 */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Extracts the display prefix from an API key
 *
 * @param key - The full API key
 * @returns First N characters for display (e.g., "ctx_abc12345...")
 */
export function extractKeyPrefix(key: string): string {
  return key.substring(0, API_KEY_DISPLAY_PREFIX_LENGTH);
}

/**
 * Validates that a string looks like a CtxOpt API key
 *
 * @param key - The string to validate
 * @returns true if the string has the correct format
 */
export function isValidApiKeyFormat(key: string): boolean {
  // Must start with the prefix
  if (!key.startsWith(API_KEY_PREFIX)) {
    return false;
  }

  // After prefix, should be base64url encoded (approximately 43 chars for 32 bytes)
  const afterPrefix = key.slice(API_KEY_PREFIX.length);
  const base64urlRegex = /^[A-Za-z0-9_-]+$/;

  return afterPrefix.length >= 40 && base64urlRegex.test(afterPrefix);
}
