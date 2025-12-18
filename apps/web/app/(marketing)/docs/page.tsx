import Link from "next/link";
import { CodeBlock } from "./components/CodeBlock";

export default function DocsPage() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold tracking-tight">Documentation</h1>
        <p className="mt-4 text-xl text-muted-foreground">
          Everything you need to integrate CtxOpt with your favorite IDE and
          start optimizing your LLM token usage.
        </p>
      </div>

      {/* Quick Start */}
      <section id="quick-start">
        <h2 className="mb-6 text-2xl font-semibold">Quick Start</h2>
        <p className="mb-6 text-muted-foreground">
          Get started with CtxOpt in 3 simple steps:
        </p>

        <div className="space-y-6">
          {/* Step 1 */}
          <div className="rounded-lg border p-6">
            <div className="mb-4 flex items-center gap-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                1
              </div>
              <h3 className="text-lg font-semibold">Install the MCP Server</h3>
            </div>
            <CodeBlock
              code={`# Using npm
npm install -g @ctxopt/mcp-server

# Or using the install script
curl -fsSL https://ctxopt.dev/install.sh | bash`}
              language="bash"
            />
          </div>

          {/* Step 2 */}
          <div className="rounded-lg border p-6">
            <div className="mb-4 flex items-center gap-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                2
              </div>
              <h3 className="text-lg font-semibold">Configure your IDE</h3>
            </div>
            <p className="mb-4 text-muted-foreground">
              Add the MCP server to your IDE configuration. For Claude Code,
              edit <code className="rounded bg-muted px-1">~/.claude/mcp.json</code>:
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
          </div>

          {/* Step 3 */}
          <div className="rounded-lg border p-6">
            <div className="mb-4 flex items-center gap-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                3
              </div>
              <h3 className="text-lg font-semibold">Start saving tokens</h3>
            </div>
            <p className="text-muted-foreground">
              The MCP server will automatically analyze your context, detect
              inefficiencies, and suggest optimizations. Check your session
              stats with the <code className="rounded bg-muted px-1">session_stats</code> tool.
            </p>
          </div>
        </div>
      </section>

      {/* Documentation Sections */}
      <section>
        <h2 className="mb-6 text-2xl font-semibold">Explore the Docs</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Link
            href="/docs/mcp"
            className="group rounded-lg border p-6 transition-colors hover:border-primary"
          >
            <h3 className="mb-2 font-semibold group-hover:text-primary">
              MCP Server
            </h3>
            <p className="text-sm text-muted-foreground">
              Documentation for the MCP server, including installation,
              configuration, and available tools.
            </p>
          </Link>

          <Link
            href="/docs/guides"
            className="group rounded-lg border p-6 transition-colors hover:border-primary"
          >
            <h3 className="mb-2 font-semibold group-hover:text-primary">
              Integration Guides
            </h3>
            <p className="text-sm text-muted-foreground">
              Step-by-step guides for integrating CtxOpt with Claude Code,
              Cursor, and Windsurf.
            </p>
          </Link>

          <Link
            href="/docs/troubleshooting"
            className="group rounded-lg border p-6 transition-colors hover:border-primary"
          >
            <h3 className="mb-2 font-semibold group-hover:text-primary">
              Troubleshooting
            </h3>
            <p className="text-sm text-muted-foreground">
              Solutions to common issues and frequently asked questions.
            </p>
          </Link>
        </div>
      </section>

      {/* Need Help */}
      <section className="rounded-lg border bg-muted/30 p-6">
        <h2 className="mb-2 text-lg font-semibold">Need Help?</h2>
        <p className="text-muted-foreground">
          Can&apos;t find what you&apos;re looking for? Check the{" "}
          <Link href="/docs/troubleshooting" className="text-primary hover:underline">
            troubleshooting guide
          </Link>{" "}
          or{" "}
          <a
            href="https://github.com/ctxopt/ctxopt/issues"
            className="text-primary hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            open an issue on GitHub
          </a>
          .
        </p>
      </section>
    </div>
  );
}
