# Security Policy

## Supported versions

Security fixes land on the latest release. Always run the most recent version
from [npm](https://www.npmjs.com/package/distill-mcp) (`npx distill-mcp@latest`)
or your MCP client's package configuration.

## Reporting a vulnerability

**Please do not open a public issue for security reports.**

Email **arthur.jean@strivex.fr** with:

- a description of the issue and its impact,
- steps to reproduce (or a proof of concept),
- the Distill version (`npx distill-mcp --version`), Node.js version, OS, and
  the MCP client (Claude Code, Cursor, Windsurf, …) where relevant.

You can expect an initial acknowledgement within 72 hours. Once a fix is ready,
a patched release is published to npm and the report is credited unless you
prefer to stay anonymous.

## Scope

Distill executes untrusted, model-generated code and reads arbitrary files, so
the areas most relevant to its threat model are:

- the **QuickJS WASM sandbox** (`code_execute`) and its isolation boundary
  (no `fetch`, no `fs`, no `process`, no dynamic `import()`),
- the **static code analysis** layer that blocks `eval`, `require`, `Reflect`,
  `Proxy`, prototype access, and similar escapes before execution,
- **path validation and symlink resolution** — any way to read or write outside
  the working directory, or to reach blocked files (`.env`, credentials, keys),
- the **git command allowlist** in the sandbox SDK (no `push` / `fetch` /
  `clone`; `execFileSync` to bypass the shell),
- **error-message sanitization** — leaking host paths or environment details
  through error strings,
- **resource exhaustion** — bypassing the memory limit, execution timeout, or
  output token cap to cause a denial of service.

The sandbox is the primary security boundary; the pinned versions of
`@sebastianwessel/quickjs` and `web-tree-sitter` are part of that boundary and
are reviewed manually before the pin moves.
