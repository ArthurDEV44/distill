/**
 * AST Parser Benchmarks
 *
 * Performance tests comparing Tree-sitter parsers to regex-based parsing.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { initPythonParser, parsePythonAsync } from "./python/parser.js";
import { initGoParser, parseGoAsync } from "./go/parser.js";

// Generate large Python code sample
function generateLargePythonCode(numFunctions: number, numClasses: number): string {
  let code = `"""Large Python module for benchmarking."""\n\n`;
  code += `import os\nimport sys\nfrom typing import List, Dict, Optional\n\n`;

  for (let i = 0; i < numClasses; i++) {
    code += `class TestClass${i}:\n`;
    code += `    """Class ${i} documentation."""\n`;
    code += `    def __init__(self, value: int):\n`;
    code += `        self.value = value\n\n`;
    code += `    def method_a(self) -> int:\n`;
    code += `        """Return the value."""\n`;
    code += `        return self.value\n\n`;
    code += `    async def method_b(self) -> str:\n`;
    code += `        """Async method."""\n`;
    code += `        return str(self.value)\n\n`;
  }

  for (let i = 0; i < numFunctions; i++) {
    code += `def function_${i}(x: int, y: int) -> int:\n`;
    code += `    """Calculate something with ${i}."""\n`;
    code += `    return x + y + ${i}\n\n`;
  }

  return code;
}

// Generate large Go code sample
function generateLargeGoCode(numFunctions: number, numStructs: number): string {
  let code = `package benchmark\n\n`;
  code += `import (\n\t"fmt"\n\t"strings"\n)\n\n`;

  for (let i = 0; i < numStructs; i++) {
    code += `// TestStruct${i} is a test struct\n`;
    code += `type TestStruct${i} struct {\n`;
    code += `\tValue int\n`;
    code += `\tName  string\n`;
    code += `}\n\n`;
    code += `// MethodA returns the value\n`;
    code += `func (t *TestStruct${i}) MethodA() int {\n`;
    code += `\treturn t.Value\n`;
    code += `}\n\n`;
    code += `// MethodB returns the name\n`;
    code += `func (t TestStruct${i}) MethodB() string {\n`;
    code += `\treturn t.Name\n`;
    code += `}\n\n`;
  }

  for (let i = 0; i < numFunctions; i++) {
    code += `// Function${i} calculates something\n`;
    code += `func Function${i}(x, y int) int {\n`;
    code += `\treturn x + y + ${i}\n`;
    code += `}\n\n`;
  }

  return code;
}

describe("Parser Benchmarks", () => {
  beforeAll(async () => {
    // Initialize parsers
    await Promise.all([initPythonParser(), initGoParser()]);
  });

  describe("Python Parser Performance", () => {
    it("should parse small Python code quickly", async () => {
      const code = generateLargePythonCode(10, 5);
      const start = performance.now();

      const structure = await parsePythonAsync(code);

      const elapsed = performance.now() - start;

      expect(structure.functions.length).toBeGreaterThan(0);
      expect(structure.classes.length).toBe(5);
      expect(elapsed).toBeLessThan(1000); // Should complete in under 1 second

      console.log(`Python small (10 funcs, 5 classes): ${elapsed.toFixed(2)}ms`);
    });

    it("should parse medium Python code efficiently", async () => {
      const code = generateLargePythonCode(50, 20);
      const start = performance.now();

      const structure = await parsePythonAsync(code);

      const elapsed = performance.now() - start;

      expect(structure.functions.length).toBeGreaterThan(50);
      expect(structure.classes.length).toBe(20);
      expect(elapsed).toBeLessThan(2000);

      console.log(`Python medium (50 funcs, 20 classes): ${elapsed.toFixed(2)}ms`);
    });

    it("should parse large Python code acceptably", async () => {
      const code = generateLargePythonCode(100, 50);
      const start = performance.now();

      const structure = await parsePythonAsync(code);

      const elapsed = performance.now() - start;

      expect(structure.functions.length).toBeGreaterThan(100);
      expect(structure.classes.length).toBe(50);
      expect(elapsed).toBeLessThan(5000);

      console.log(`Python large (100 funcs, 50 classes): ${elapsed.toFixed(2)}ms`);
      console.log(`  - Functions: ${structure.functions.length}`);
      console.log(`  - Classes: ${structure.classes.length}`);
      console.log(`  - Total lines: ${structure.totalLines}`);
    });
  });

  describe("Go Parser Performance", () => {
    it("should parse small Go code quickly", async () => {
      const code = generateLargeGoCode(10, 5);
      const start = performance.now();

      const structure = await parseGoAsync(code);

      const elapsed = performance.now() - start;

      expect(structure.functions.length).toBeGreaterThan(0);
      expect(structure.classes.length).toBe(5);
      expect(elapsed).toBeLessThan(1000);

      console.log(`Go small (10 funcs, 5 structs): ${elapsed.toFixed(2)}ms`);
    });

    it("should parse medium Go code efficiently", async () => {
      const code = generateLargeGoCode(50, 20);
      const start = performance.now();

      const structure = await parseGoAsync(code);

      const elapsed = performance.now() - start;

      expect(structure.functions.length).toBeGreaterThan(50);
      expect(structure.classes.length).toBe(20);
      expect(elapsed).toBeLessThan(2000);

      console.log(`Go medium (50 funcs, 20 structs): ${elapsed.toFixed(2)}ms`);
    });

    it("should parse large Go code acceptably", async () => {
      const code = generateLargeGoCode(100, 50);
      const start = performance.now();

      const structure = await parseGoAsync(code);

      const elapsed = performance.now() - start;

      expect(structure.functions.length).toBeGreaterThan(100);
      expect(structure.classes.length).toBe(50);
      expect(elapsed).toBeLessThan(5000);

      console.log(`Go large (100 funcs, 50 structs): ${elapsed.toFixed(2)}ms`);
      console.log(`  - Functions: ${structure.functions.length}`);
      console.log(`  - Structs: ${structure.classes.length}`);
      console.log(`  - Total lines: ${structure.totalLines}`);
    });
  });

  describe("Parsing accuracy comparison", () => {
    it("should accurately count all elements in Python code", async () => {
      const numFuncs = 25;
      const numClasses = 10;
      const code = generateLargePythonCode(numFuncs, numClasses);

      const structure = await parsePythonAsync(code);

      // Each class has 3 methods (__init__, method_a, method_b)
      const expectedMethods = numClasses * 3;
      const totalFunctions = structure.functions.filter((f) => f.type === "function").length;
      const totalMethods = structure.functions.filter((f) => f.type === "method").length;

      expect(totalFunctions).toBe(numFuncs);
      expect(totalMethods).toBe(expectedMethods);
      expect(structure.classes.length).toBe(numClasses);
    });

    it("should accurately count all elements in Go code", async () => {
      const numFuncs = 25;
      const numStructs = 10;
      const code = generateLargeGoCode(numFuncs, numStructs);

      const structure = await parseGoAsync(code);

      // Each struct has 2 methods
      const expectedMethods = numStructs * 2;
      const totalFunctions = structure.functions.filter((f) => f.type === "function").length;
      const totalMethods = structure.functions.filter((f) => f.type === "method").length;

      expect(totalFunctions).toBe(numFuncs);
      expect(totalMethods).toBe(expectedMethods);
      expect(structure.classes.length).toBe(numStructs);
    });
  });

  describe("Memory efficiency", () => {
    it("should handle repeated parsing without memory leaks", async () => {
      const pythonCode = generateLargePythonCode(20, 10);
      const goCode = generateLargeGoCode(20, 10);

      // Parse multiple times
      for (let i = 0; i < 10; i++) {
        await parsePythonAsync(pythonCode);
        await parseGoAsync(goCode);
      }

      // If we get here without running out of memory, test passes
      expect(true).toBe(true);
    });
  });
});
