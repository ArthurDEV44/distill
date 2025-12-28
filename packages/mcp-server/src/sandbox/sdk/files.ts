/**
 * SDK Files Functions
 *
 * Safe file operations for sandbox use.
 * Uses host callbacks for actual file I/O.
 */

import type { HostCallbacks, FileStructure } from "../types.js";
import { codeParse } from "./code.js";
import { detectLanguageFromPath } from "../../utils/language-detector.js";

/**
 * Create files API with host callbacks
 */
export function createFilesAPI(callbacks: HostCallbacks) {
  return {
    /**
     * Read file content
     */
    read(path: string): string {
      return callbacks.readFile(path);
    },

    /**
     * Check if file exists
     */
    exists(path: string): boolean {
      return callbacks.fileExists(path);
    },

    /**
     * Find files matching glob pattern
     */
    glob(pattern: string): string[] {
      return callbacks.glob(pattern);
    },

    /**
     * Read file and parse to structure
     */
    readStructure(path: string): FileStructure {
      const content = callbacks.readFile(path);
      const language = detectLanguageFromPath(path);
      return codeParse(content, language);
    },
  };
}
