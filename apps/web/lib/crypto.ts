import { createHash, randomBytes } from "crypto";

/**
 * Generate a new API key with prefix
 * Format: ctxopt_proj_<32 random chars>
 */
export function generateApiKey(): string {
  const randomPart = randomBytes(24).toString("base64url"); // 32 chars
  return `ctxopt_proj_${randomPart}`;
}

/**
 * Extract the prefix from an API key for display
 * Returns first 16 chars (ctxopt_proj_xxxx)
 */
export function getKeyPrefix(key: string): string {
  return key.slice(0, 16);
}

/**
 * Hash an API key using SHA256
 * Never store raw keys, only hashes
 */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Validate API key format
 */
export function isValidApiKeyFormat(key: string): boolean {
  return /^ctxopt_proj_[A-Za-z0-9_-]{32}$/.test(key);
}
