# Contributing to Distill

Thank you for your interest in contributing to Distill! This document provides guidelines for contributing to the project.

## Getting Started

### Prerequisites

- Node.js 18+
- Bun 1.3+

### Development Setup

```bash
# Clone the repository
git clone https://github.com/ArthurDEV44/distill.git
cd distill

# Install dependencies
bun install

# Start development servers
bun run dev
```

### Project Structure

```
distill/
├── apps/web/              # Next.js landing page & docs
├── packages/mcp-server/   # MCP server (npm: distill-mcp)
├── packages/shared/       # Shared types & utilities
└── packages/ui/           # React component library
```

## Development Workflow

### Running Tests

```bash
# Run all tests
bun run test

# Run tests in watch mode (mcp-server)
cd packages/mcp-server && bun run test:watch

# Run with coverage
cd packages/mcp-server && bun run test:coverage
```

### Code Quality

```bash
# Type checking
bun run check-types

# Linting
bun run lint

# Formatting
bun run format
```

### Building

```bash
# Build all packages
bun run build
```

## Making Changes

1. **Fork the repository** and create your branch from `main`
2. **Make your changes** with clear, focused commits
3. **Add tests** for new functionality
4. **Ensure all tests pass** (`bun run test`)
5. **Run type checks** (`bun run check-types`)
6. **Submit a pull request**

## Pull Request Guidelines

- Keep PRs focused on a single feature or fix
- Update documentation if needed
- Add tests for new features
- Follow existing code style

## Priority Areas

We especially welcome contributions in:

- **New language parsers** (Java, C#, Kotlin, Ruby)
- **SDK extensions** (new ctx.* functions)
- **Documentation improvements**
- **Bug fixes**

## Reporting Issues

- Use GitHub Issues for bug reports and feature requests
- Include reproduction steps for bugs
- Check existing issues before creating new ones

## Code of Conduct

Be respectful and constructive in all interactions.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
