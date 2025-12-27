/**
 * Python Tree-sitter Parser Tests
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  pythonTreeSitterParser,
  parsePythonAsync,
  initPythonParser,
} from "./parser.js";

// Sample Python code for testing
const SAMPLE_PYTHON = `
"""Module docstring."""

import os
from typing import List, Optional
from dataclasses import dataclass

# Constants
MAX_SIZE = 100
DEBUG = True

@dataclass
class User:
    """A user class with name and age."""
    name: str
    age: int

    def greet(self) -> str:
        """Return a greeting message."""
        return f"Hello, {self.name}!"

    async def fetch_data(self) -> dict:
        """Fetch user data asynchronously."""
        return {"name": self.name, "age": self.age}


class AdminUser(User):
    """Admin user with extra permissions."""
    permissions: List[str]

    def has_permission(self, perm: str) -> bool:
        return perm in self.permissions


def calculate_sum(numbers: List[int]) -> int:
    """Calculate the sum of a list of numbers."""
    return sum(numbers)


async def fetch_users() -> List[User]:
    """Fetch all users from the database."""
    return []


def nested_function():
    def inner():
        pass
    return inner
`;

describe("Python Tree-sitter Parser", () => {
  beforeAll(async () => {
    await initPythonParser();
  });

  describe("parsePythonAsync", () => {
    it("should parse imports correctly", async () => {
      const structure = await parsePythonAsync(SAMPLE_PYTHON);

      expect(structure.language).toBe("python");
      expect(structure.imports.length).toBeGreaterThanOrEqual(3);

      const importNames = structure.imports.map((i) => i.name);
      expect(importNames).toContain("os");
    });

    it("should parse functions correctly", async () => {
      const structure = await parsePythonAsync(SAMPLE_PYTHON);

      const funcNames = structure.functions.map((f) => f.name);
      expect(funcNames).toContain("calculate_sum");
      expect(funcNames).toContain("fetch_users");
      expect(funcNames).toContain("nested_function");
    });

    it("should detect async functions", async () => {
      const structure = await parsePythonAsync(SAMPLE_PYTHON);

      const fetchUsers = structure.functions.find((f) => f.name === "fetch_users");
      expect(fetchUsers).toBeDefined();
      expect(fetchUsers?.isAsync).toBe(true);

      const calculateSum = structure.functions.find((f) => f.name === "calculate_sum");
      expect(calculateSum?.isAsync).toBeFalsy();
    });

    it("should parse classes correctly", async () => {
      const structure = await parsePythonAsync(SAMPLE_PYTHON);

      expect(structure.classes.length).toBeGreaterThanOrEqual(2);

      const classNames = structure.classes.map((c) => c.name);
      expect(classNames).toContain("User");
      expect(classNames).toContain("AdminUser");
    });

    it("should extract docstrings", async () => {
      const structure = await parsePythonAsync(SAMPLE_PYTHON, { detailed: true });

      const userClass = structure.classes.find((c) => c.name === "User");
      expect(userClass?.documentation).toContain("user class");

      const calcSum = structure.functions.find((f) => f.name === "calculate_sum");
      expect(calcSum?.documentation).toContain("sum");
    });

    it("should parse methods inside classes", async () => {
      const structure = await parsePythonAsync(SAMPLE_PYTHON);

      const methods = structure.functions.filter((f) => f.type === "method");
      expect(methods.length).toBeGreaterThanOrEqual(3);

      const methodNames = methods.map((m) => m.name);
      expect(methodNames).toContain("greet");
      expect(methodNames).toContain("fetch_data");
      expect(methodNames).toContain("has_permission");
    });

    it("should track parent class for methods", async () => {
      const structure = await parsePythonAsync(SAMPLE_PYTHON);

      const greet = structure.functions.find((f) => f.name === "greet");
      expect(greet?.parent).toBe("User");

      const hasPermission = structure.functions.find((f) => f.name === "has_permission");
      expect(hasPermission?.parent).toBe("AdminUser");
    });

    it("should parse module-level variables", async () => {
      const structure = await parsePythonAsync(SAMPLE_PYTHON);

      const varNames = structure.variables.map((v) => v.name);
      expect(varNames).toContain("MAX_SIZE");
      expect(varNames).toContain("DEBUG");
    });

    it("should return correct line numbers", async () => {
      const structure = await parsePythonAsync(SAMPLE_PYTHON);

      const userClass = structure.classes.find((c) => c.name === "User");
      expect(userClass?.startLine).toBeGreaterThan(0);
      expect(userClass?.endLine).toBeGreaterThan(userClass?.startLine ?? 0);
    });
  });

  describe("LanguageParser interface", () => {
    it("should implement parse() method", () => {
      // Note: This will return empty structure on first call if parser not initialized
      const structure = pythonTreeSitterParser.parse(SAMPLE_PYTHON);
      expect(structure).toBeDefined();
      expect(structure.language).toBe("python");
    });

    it("should implement extractElement() method", async () => {
      await initPythonParser();

      const result = pythonTreeSitterParser.extractElement(
        SAMPLE_PYTHON,
        { type: "function", name: "calculate_sum" },
        { includeImports: true, includeComments: true }
      );

      expect(result).not.toBeNull();
      expect(result?.content).toContain("def calculate_sum");
      expect(result?.elements[0]?.name).toBe("calculate_sum");
    });

    it("should implement searchElements() method", async () => {
      await initPythonParser();

      const results = pythonTreeSitterParser.searchElements(SAMPLE_PYTHON, "user");

      expect(results.length).toBeGreaterThan(0);
      const names = results.map((r) => r.name.toLowerCase());
      expect(names.some((n) => n.includes("user"))).toBe(true);
    });

    it("should return null for non-existent elements", async () => {
      await initPythonParser();

      const result = pythonTreeSitterParser.extractElement(
        SAMPLE_PYTHON,
        { type: "function", name: "non_existent_function" },
        { includeImports: false, includeComments: false }
      );

      expect(result).toBeNull();
    });
  });

  describe("Edge cases", () => {
    it("should handle empty content", async () => {
      const structure = await parsePythonAsync("");
      expect(structure.language).toBe("python");
      expect(structure.totalLines).toBe(1);
      expect(structure.functions).toHaveLength(0);
    });

    it("should handle syntax errors gracefully", async () => {
      const invalidCode = `
def broken_function(
    # Missing closing parenthesis and body
`;
      const structure = await parsePythonAsync(invalidCode);
      expect(structure).toBeDefined();
      expect(structure.language).toBe("python");
    });

    it("should handle decorated functions", async () => {
      const code = `
@decorator
def decorated_func():
    pass

@decorator1
@decorator2
async def multi_decorated():
    pass
`;
      const structure = await parsePythonAsync(code);
      const funcNames = structure.functions.map((f) => f.name);
      expect(funcNames).toContain("decorated_func");
      expect(funcNames).toContain("multi_decorated");
    });
  });
});
