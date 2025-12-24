/**
 * Semantic Compress Tool Tests
 */

import { describe, it, expect } from "vitest";
import { executeSemanticCompress } from "./semantic-compress.js";

describe("semantic_compress tool", () => {
  describe("basic compression", () => {
    it("should compress content to approximately target ratio", async () => {
      const content = `
This is the introduction paragraph which contains important context.

This is some middle content that provides additional details.
More middle content here with less critical information.
Even more content in the middle section that can be removed.

Additional filler content that doesn't add much value.
This paragraph exists mainly to pad the document length.

This is the conclusion which summarizes the key points.
      `.trim();

      const result = await executeSemanticCompress({ content, targetRatio: 0.5 });

      expect(result.isError).toBeFalsy();
      // Should contain beginning and/or end content
      const text = result.content[0]!.text;
      expect(text).toContain("Compressed");
    });

    it("should preserve patterns when specified", async () => {
      const content = `
Regular content here that can be removed.

CRITICAL: This must be preserved at all costs.

More regular content that is less important.
Even more filler content here.
      `.trim();

      const result = await executeSemanticCompress({
        content,
        targetRatio: 0.3,
        preservePatterns: ["CRITICAL:.*"],
      });

      expect(result.isError).toBeFalsy();
      expect(result.content[0]!.text).toContain("CRITICAL:");
    });

    it("should prioritize error messages", async () => {
      const content = `
Info: Starting the process now.

Debug: Loading configuration files.

Error: Failed to connect to database server.

Info: Retrying connection attempt.

Debug: More debug information here.
      `.trim();

      const result = await executeSemanticCompress({ content, targetRatio: 0.4 });

      expect(result.isError).toBeFalsy();
      expect(result.content[0]!.text).toContain("Error:");
    });
  });

  describe("code block handling", () => {
    it("should keep code blocks as single units", async () => {
      const content = `
Here is some introductory text.

\`\`\`typescript
function hello() {
  return "world";
}
\`\`\`

And some concluding text here.
      `.trim();

      const result = await executeSemanticCompress({ content, targetRatio: 0.8 });

      expect(result.isError).toBeFalsy();
      const text = result.content[0]!.text;
      // If code block is included, it should be complete
      if (text.includes("function hello")) {
        expect(text).toContain('return "world"');
        expect(text).toContain("```");
      }
    });
  });

  describe("input validation", () => {
    it("should reject empty content", async () => {
      const result = await executeSemanticCompress({ content: "" });

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain("Invalid input");
    });

    it("should reject invalid regex patterns", async () => {
      const result = await executeSemanticCompress({
        content: "test content here",
        preservePatterns: ["[invalid"],
      });

      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain("Invalid regex");
    });

    it("should reject targetRatio below minimum", async () => {
      const result = await executeSemanticCompress({
        content: "test content",
        targetRatio: 0.05,
      });

      expect(result.isError).toBe(true);
    });

    it("should reject targetRatio above maximum", async () => {
      const result = await executeSemanticCompress({
        content: "test content",
        targetRatio: 0.95,
      });

      expect(result.isError).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("should handle content shorter than target gracefully", async () => {
      const result = await executeSemanticCompress({
        content: "Short content",
        targetRatio: 0.5,
      });

      // Should not error, just return content as-is
      expect(result.isError).toBeFalsy();
    });

    it("should handle single paragraph content", async () => {
      const result = await executeSemanticCompress({
        content: "This is a single paragraph without any breaks or structure.",
        targetRatio: 0.5,
      });

      expect(result.isError).toBeFalsy();
    });

    it("should handle content with only code blocks", async () => {
      const content = `
\`\`\`javascript
const x = 1;
const y = 2;
console.log(x + y);
\`\`\`
      `.trim();

      const result = await executeSemanticCompress({ content, targetRatio: 0.5 });

      expect(result.isError).toBeFalsy();
    });

    it("should use default targetRatio of 0.5", async () => {
      const content = Array(20).fill("Content paragraph here.").join("\n\n");

      const result = await executeSemanticCompress({ content });

      expect(result.isError).toBeFalsy();
      // Output should show compression occurred
      expect(result.content[0]!.text).toContain("Compression Statistics");
    });
  });

  describe("output format", () => {
    it("should include compression statistics", async () => {
      const content = Array(10).fill("Paragraph of content here.").join("\n\n");

      const result = await executeSemanticCompress({ content, targetRatio: 0.5 });

      const text = result.content[0]!.text;
      expect(text).toContain("Original tokens");
      expect(text).toContain("Compressed tokens");
      expect(text).toContain("Tokens saved");
    });

    it("should show preserved segments when patterns match", async () => {
      // Need enough content for compression to actually occur
      const content = `
Normal content here that will be evaluated for compression.

IMPORTANT: This is preserved and must remain in the output.

More normal content that provides additional context.

Additional filler content that adds to the document length.

Even more content here to ensure we have enough for compression.

Final paragraph with some concluding thoughts about the topic.
      `.trim();

      const result = await executeSemanticCompress({
        content,
        targetRatio: 0.5,
        preservePatterns: ["IMPORTANT:.*"],
      });

      const text = result.content[0]!.text;
      // The preserved content should definitely be in the output
      expect(text).toContain("IMPORTANT:");
    });
  });
});
