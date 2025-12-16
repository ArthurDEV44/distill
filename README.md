# CtxOpt - Context Engineering Optimizer

> Optimize your LLM token usage with intelligent context engineering.

## Features

- **Real-time Token Analysis** - Count tokens and estimate costs on every request
- **Smart Suggestions** - AI-powered recommendations to reduce context size
- **IDE Integration** - Works with Claude Code, Cursor, Windsurf
- **MCP Server** - Native integration with Model Context Protocol
- **Dashboard** - Visualize usage, costs, and optimization opportunities

## Installation

### Quick Install (Recommended)

```bash
# Linux / macOS / WSL
curl -fsSL https://ctxopt.dev/install.sh | bash

# Windows PowerShell
irm https://ctxopt.dev/install.ps1 | iex
```

The installer will:
1. Install `@ctxopt/mcp-server` globally
2. Auto-detect and configure your IDEs (Claude Code, Cursor, Windsurf)
3. Verify the installation

### Manual Install

```bash
# npm
npm install -g @ctxopt/mcp-server

# bun
bun install -g @ctxopt/mcp-server

# Then configure your IDEs
ctxopt-mcp setup
```

## CLI Commands

```bash
ctxopt-mcp setup          # Auto-configure detected IDEs
ctxopt-mcp setup --claude # Configure Claude Code only
ctxopt-mcp setup --cursor # Configure Cursor only
ctxopt-mcp doctor         # Verify installation
ctxopt-mcp serve          # Start MCP server (used by IDE)
ctxopt-mcp --help         # Show help
ctxopt-mcp --version      # Show version
```

## IDE Configuration

### Claude Code

After running `ctxopt-mcp setup`, your `~/.claude/settings.json` will include:

```json
{
  "mcpServers": {
    "ctxopt": {
      "command": "ctxopt-mcp",
      "args": ["serve"],
      "env": {}
    }
  }
}
```

### Cursor

Configuration is added to `~/.cursor/mcp.json` (or platform-specific location).

### Windsurf

Configuration is added to `~/.windsurf/settings.json`.

## Development Setup

### 1. Install dependencies

```bash
bun install
```

### 2. Setup environment

```bash
cp apps/web/.env.example apps/web/.env.local
# Edit .env.local with your credentials
```

### 3. Setup database

```bash
bun run db:generate
bun run db:migrate
```

### 4. Start development

```bash
bun run dev
```

## Project Structure

```
ctxopt/
├── apps/
│   └── web/              # Next.js 16 application
├── packages/
│   ├── shared/           # Shared types and utilities
│   ├── mcp-server/       # MCP Server package
│   └── ...
```

## Tech Stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS
- **Backend**: TypeScript, Bun
- **Database**: PostgreSQL (Neon), Drizzle ORM
- **Auth**: Clerk
- **Hosting**: Vercel

## License

MIT
