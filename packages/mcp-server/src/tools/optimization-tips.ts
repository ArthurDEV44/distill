import { z } from "zod";
import type { ServerConfig } from "../server";

export const optimizationTipsSchema = {
  type: "object" as const,
  properties: {
    focus: {
      type: "string",
      description: "Specific area to get tips for",
      enum: ["general", "prompts", "context", "cost", "performance"],
    },
  },
  required: [],
};

const inputSchema = z.object({
  focus: z
    .enum(["general", "prompts", "context", "cost", "performance"])
    .optional()
    .default("general"),
});

const TIPS = {
  general: `## Context Engineering Best Practices

### 1. Structure Your Context
- Place long documents at the **top** of your prompt
- Put instructions and queries **after** the context
- Use clear section delimiters (XML tags, markdown headers)

### 2. Be Specific
- Tell the model exactly what format you want
- Provide examples of desired output (few-shot prompting)
- Avoid ambiguous instructions

### 3. Optimize Token Usage
- Remove redundant information between messages
- Summarize conversation history for long sessions
- Use system prompts for reusable instructions

### 4. Monitor and Iterate
- Track token usage per request
- A/B test different prompt structures
- Measure output quality vs token cost`,

  prompts: `## Prompt Optimization Tips

### System Prompts
- Keep system prompts concise but complete
- Extract role definitions to system prompt (saves input tokens)
- Avoid repeating instructions in every user message

### User Messages
- Front-load the most important information
- Use structured formats (JSON, XML) for complex inputs
- Reference previous context instead of repeating it

### Few-Shot Examples
- 2-3 examples usually suffice
- Choose diverse, representative examples
- Format examples exactly like expected output

### Prompt Templates
- Create reusable templates for common tasks
- Use placeholders for variable content
- Test templates with edge cases`,

  context: `## Context Management Tips

### Long Conversations
- Summarize every 5-10 messages
- Keep only relevant message history
- Use a "memory" system prompt for key facts

### RAG (Retrieval-Augmented Generation)
- Retrieve only the most relevant chunks
- Limit context to 3-5 relevant documents
- Order by relevance, most relevant first

### Code Context
- Include only relevant files/functions
- Use file paths as references instead of full content
- Summarize unchanged files

### Multi-Agent Patterns
- Split context across specialized agents
- Each agent handles specific sub-tasks
- Reduces per-agent context size`,

  cost: `## Cost Optimization Tips

### Model Selection
- Use Haiku for simple tasks (5x cheaper than Sonnet)
- Reserve Opus for complex reasoning
- Route based on task complexity

### Caching
- Cache common prompts and responses
- Use prompt caching for repeated prefixes
- Anthropic prompt caching: 90% discount on cached tokens

### Batch Processing
- Use Batch API for non-urgent requests (50% discount)
- Group similar requests together
- Process during off-peak hours

### Output Optimization
- Set max_tokens appropriately
- Request concise responses when possible
- Output tokens cost 5x more than input`,

  performance: `## Performance Optimization Tips

### Latency Reduction
- Use streaming for better perceived performance
- Pre-compute and cache common responses
- Minimize round-trips with comprehensive prompts

### Throughput
- Use async/parallel requests when possible
- Implement request queuing for rate limits
- Monitor and respect API limits

### Reliability
- Implement exponential backoff for retries
- Handle streaming errors gracefully
- Cache responses for idempotent requests

### Context Window
- Stay under 50% of max context for best performance
- Performance degrades significantly above 80%
- Consider chunking for very long documents`,
};

export async function optimizationTips(
  args: unknown,
  _config: ServerConfig
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { focus } = inputSchema.parse(args);

  const tips = TIPS[focus];

  const result = `${tips}

---
*Tips from CtxOpt - Context Engineering Optimizer*
*Learn more at https://ctxopt.dev*`;

  return {
    content: [{ type: "text", text: result }],
  };
}
