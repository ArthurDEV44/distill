import Link from "next/link";

export default function HomePage() {
  return (
    <>
      {/* Hero Section */}
      <section className="container flex flex-col items-center gap-8 py-24 text-center">
        <div className="inline-flex items-center rounded-full border px-3 py-1 text-sm">
          <span className="mr-2 text-green-500">●</span>
          Open Source MCP Server
        </div>

        <h1 className="max-w-4xl text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
          Context Engineering
          <br />
          <span className="text-muted-foreground">for LLMs</span>
        </h1>

        <p className="max-w-2xl text-xl text-muted-foreground">
          CtxOpt is an open source MCP server that optimizes your LLM context.
          Reduce token usage by up to 60% with intelligent compression and analysis tools.
        </p>

        <div className="flex gap-4">
          <Link
            href="/docs"
            className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-8 text-lg font-medium text-primary-foreground hover:bg-primary/90"
          >
            Get Started
          </Link>
          <Link
            href="https://github.com/ctxopt/ctxopt"
            className="inline-flex h-12 items-center justify-center rounded-md border px-8 text-lg font-medium hover:bg-muted"
          >
            View on GitHub
          </Link>
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <code className="rounded bg-muted px-2 py-1">
            npx @ctxopt/mcp-server
          </code>
          <span>— one command install</span>
        </div>
      </section>

      {/* Features Section */}
      <section className="container py-24">
        <div className="grid gap-8 md:grid-cols-3">
          <div className="rounded-lg border p-6">
            <div className="mb-4 text-3xl">&#9889;</div>
            <h3 className="mb-2 text-xl font-semibold">19 Optimization Tools</h3>
            <p className="text-muted-foreground">
              Smart file reading, build output compression, log summarization,
              error deduplication, and more.
            </p>
          </div>

          <div className="rounded-lg border p-6">
            <div className="mb-4 text-3xl">&#128161;</div>
            <h3 className="mb-2 text-xl font-semibold">AST-Aware Parsing</h3>
            <p className="text-muted-foreground">
              Extract functions, classes, and types from code files.
              Supports TypeScript, Python, Go, Rust, and more.
            </p>
          </div>

          <div className="rounded-lg border p-6">
            <div className="mb-4 text-3xl">&#128295;</div>
            <h3 className="mb-2 text-xl font-semibold">Universal IDE Support</h3>
            <p className="text-muted-foreground">
              Works with Claude Code, Cursor, Windsurf, and any MCP-compatible client.
            </p>
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="border-t bg-muted/30 py-24">
        <div className="container">
          <h2 className="mb-12 text-center text-3xl font-bold">
            Quick Start
          </h2>

          <div className="grid gap-8 md:grid-cols-3">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-xl font-bold text-primary-foreground">
                1
              </div>
              <h3 className="mb-2 text-lg font-semibold">Install</h3>
              <p className="text-muted-foreground">
                Add the MCP server to your IDE config. No API key needed.
              </p>
            </div>

            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-xl font-bold text-primary-foreground">
                2
              </div>
              <h3 className="mb-2 text-lg font-semibold">Use</h3>
              <p className="text-muted-foreground">
                Call tools like smart_file_read and auto_optimize in your prompts.
              </p>
            </div>

            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-xl font-bold text-primary-foreground">
                3
              </div>
              <h3 className="mb-2 text-lg font-semibold">Save</h3>
              <p className="text-muted-foreground">
                Reduce token usage by 50-95% depending on content type.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container py-24 text-center">
        <h2 className="mb-4 text-3xl font-bold">Ready to Optimize?</h2>
        <p className="mb-8 text-xl text-muted-foreground">
          Free, open source, no account required.
        </p>
        <Link
          href="/docs"
          className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-8 text-lg font-medium text-primary-foreground hover:bg-primary/90"
        >
          Read the Docs
        </Link>
      </section>
    </>
  );
}
