import Link from "next/link";
import { CodeBlock } from "../../components/CodeBlock";

export default function ClaudeCodeGuidePage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div>
        <div className="mb-4">
          <Link
            href="/docs/guides"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            &larr; All Guides
          </Link>
        </div>
        <h1 className="text-4xl font-bold tracking-tight">Claude Code</h1>
        <p className="mt-4 text-xl text-muted-foreground">
          Integrate CtxOpt with Claude Code CLI for optimized token usage in
          your terminal.
        </p>
      </div>

      {/* Prerequisites */}
      <section>
        <h2 className="mb-4 text-2xl font-semibold">Prerequisites</h2>
        <ul className="space-y-2 text-muted-foreground">
          <li className="flex items-center gap-2">
            <svg
              className="h-4 w-4 text-green-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            Claude Code installed (
            <code className="rounded bg-muted px-1">
              npm i -g @anthropic-ai/claude-code
            </code>
            )
          </li>
          <li className="flex items-center gap-2">
            <svg
              className="h-4 w-4 text-green-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            Node.js 18+ installed
          </li>
        </ul>
      </section>

      {/* Installation */}
      <section>
        <h2 className="mb-6 text-2xl font-semibold">Installation</h2>
        <p className="mb-6 text-muted-foreground">
          Install the CtxOpt MCP server to add token optimization tools to
          Claude Code:
        </p>
        <CodeBlock
          code={`npm install -g @ctxopt/mcp-server`}
          language="bash"
        />
      </section>

      {/* Configuration */}
      <section>
        <h2 className="mb-6 text-2xl font-semibold">Configuration</h2>
        <p className="mb-4 text-muted-foreground">
          Add the MCP server to your Claude Code configuration at{" "}
          <code className="rounded bg-muted px-1">~/.claude/mcp.json</code>:
        </p>
        <CodeBlock
          code={`{
  "mcpServers": {
    "ctxopt": {
      "command": "npx",
      "args": ["@ctxopt/mcp-server"]
    }
  }
}`}
          language="json"
        />
        <p className="mt-4 text-muted-foreground">
          Restart Claude Code after adding the configuration.
        </p>
      </section>

      {/* Available Tools */}
      <section>
        <h2 className="mb-4 text-2xl font-semibold">Available Tools</h2>
        <p className="mb-4 text-muted-foreground">
          Once configured, Claude Code will have access to these optimization
          tools:
        </p>
        <div className="space-y-4">
          <div className="rounded-lg border p-4">
            <h4 className="mb-2 font-medium">smart_file_read</h4>
            <p className="text-sm text-muted-foreground">
              Read files with AST analysis, extracting only what you need.
              50-70% token savings compared to reading full files.
            </p>
          </div>

          <div className="rounded-lg border p-4">
            <h4 className="mb-2 font-medium">auto_optimize</h4>
            <p className="text-sm text-muted-foreground">
              Automatically compress build output, logs, and error messages.
              95%+ reduction for verbose output.
            </p>
          </div>

          <div className="rounded-lg border p-4">
            <h4 className="mb-2 font-medium">session_stats</h4>
            <p className="text-sm text-muted-foreground">
              View real-time token usage statistics and savings for your current
              session.
            </p>
          </div>

          <div className="rounded-lg border p-4">
            <h4 className="mb-2 font-medium">compress_context</h4>
            <p className="text-sm text-muted-foreground">
              Compress large text content like logs, stack traces, or config
              files. 40-60% reduction.
            </p>
          </div>
        </div>
        <p className="mt-4 text-muted-foreground">
          See the{" "}
          <Link href="/docs/mcp" className="text-primary hover:underline">
            MCP Server documentation
          </Link>{" "}
          for the complete list of tools.
        </p>
      </section>

      {/* Verification */}
      <section>
        <h2 className="mb-4 text-2xl font-semibold">Verification</h2>
        <p className="mb-4 text-muted-foreground">
          Verify your setup by checking the available MCP tools:
        </p>
        <CodeBlock
          code={`# Start Claude Code
claude

# Ask Claude to check MCP tools
> What MCP tools are available?

# You should see ctxopt tools listed`}
          language="bash"
        />
      </section>

      {/* Troubleshooting */}
      <section>
        <h2 className="mb-4 text-2xl font-semibold">Troubleshooting</h2>
        <div className="space-y-4">
          <div className="rounded-lg border p-4">
            <h4 className="mb-2 font-medium">MCP tools not appearing</h4>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>
                - Verify mcp.json is at{" "}
                <code className="rounded bg-muted px-1">~/.claude/mcp.json</code>
              </li>
              <li>- Restart Claude Code after configuration changes</li>
              <li>
                - Check that{" "}
                <code className="rounded bg-muted px-1">
                  npx @ctxopt/mcp-server
                </code>{" "}
                runs without errors
              </li>
            </ul>
          </div>

          <div className="rounded-lg border p-4">
            <h4 className="mb-2 font-medium">Permission errors</h4>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>
                - Try installing globally with sudo:{" "}
                <code className="rounded bg-muted px-1">
                  sudo npm i -g @ctxopt/mcp-server
                </code>
              </li>
              <li>- Or use npx which doesn&apos;t require global installation</li>
            </ul>
          </div>
        </div>
        <p className="mt-6 text-muted-foreground">
          Still having issues? Check the{" "}
          <Link
            href="/docs/troubleshooting"
            className="text-primary hover:underline"
          >
            troubleshooting guide
          </Link>{" "}
          for more help.
        </p>
      </section>
    </div>
  );
}
