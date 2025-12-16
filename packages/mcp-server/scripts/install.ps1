# CtxOpt MCP Server Installation Script for Windows
# https://ctxopt.dev
#
# Usage:
#   irm https://ctxopt.dev/install.ps1 | iex
#
# This script will:
#   1. Detect your package manager
#   2. Install @ctxopt/mcp-server globally
#   3. Auto-configure detected IDEs (Claude Code, Cursor, Windsurf)
#   4. Verify the installation

$ErrorActionPreference = "Stop"

# Colors and formatting
function Write-Info { Write-Host "i " -ForegroundColor Blue -NoNewline; Write-Host $args }
function Write-Success { Write-Host "√ " -ForegroundColor Green -NoNewline; Write-Host $args }
function Write-Warning { Write-Host "! " -ForegroundColor Yellow -NoNewline; Write-Host $args }
function Write-Error { Write-Host "x " -ForegroundColor Red -NoNewline; Write-Host $args }

function Get-PackageManager {
    if (Get-Command bun -ErrorAction SilentlyContinue) { return "bun" }
    if (Get-Command npm -ErrorAction SilentlyContinue) { return "npm" }
    if (Get-Command yarn -ErrorAction SilentlyContinue) { return "yarn" }
    if (Get-Command pnpm -ErrorAction SilentlyContinue) { return "pnpm" }
    return "none"
}

function Test-NodeVersion {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Error "Node.js is not installed."
        Write-Host ""
        Write-Host "Please install Node.js 18 or higher:"
        Write-Host "  https://nodejs.org/"
        Write-Host ""
        exit 1
    }

    $nodeVersion = (node -v).TrimStart('v').Split('.')[0]
    if ([int]$nodeVersion -lt 18) {
        Write-Error "Node.js version must be 18 or higher (found v$nodeVersion)."
        Write-Host ""
        Write-Host "Please upgrade Node.js:"
        Write-Host "  https://nodejs.org/"
        Write-Host ""
        exit 1
    }
}

function Install-Package {
    param([string]$PackageManager)

    Write-Info "Installing @ctxopt/mcp-server using $PackageManager..."

    switch ($PackageManager) {
        "bun" { bun install -g @ctxopt/mcp-server }
        "npm" { npm install -g @ctxopt/mcp-server }
        "yarn" { yarn global add @ctxopt/mcp-server }
        "pnpm" { pnpm add -g @ctxopt/mcp-server }
        default {
            Write-Error "No supported package manager found."
            Write-Host ""
            Write-Host "Please install one of the following:"
            Write-Host "  - npm (comes with Node.js)"
            Write-Host "  - bun: https://bun.sh"
            Write-Host "  - yarn: npm install -g yarn"
            Write-Host "  - pnpm: npm install -g pnpm"
            Write-Host ""
            exit 1
        }
    }
}

function Main {
    Write-Host ""
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host "     CtxOpt MCP Server Installation" -ForegroundColor Cyan
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host ""

    # Detect environment
    $pm = Get-PackageManager
    Write-Info "Detected OS: Windows"
    Write-Info "Detected package manager: $pm"
    Write-Host ""

    # Check Node.js
    Test-NodeVersion
    $nodeVer = node -v
    Write-Success "Node.js $nodeVer detected"

    # Install package
    Write-Host ""
    Install-Package -PackageManager $pm
    Write-Success "Package installed successfully"

    # Verify installation
    Write-Host ""
    if (Get-Command ctxopt-mcp -ErrorAction SilentlyContinue) {
        $version = ctxopt-mcp --version 2>$null
        if (-not $version) { $version = "unknown" }
        Write-Success "ctxopt-mcp v$version is now available"
    } else {
        Write-Warning "ctxopt-mcp not found in PATH. You may need to restart your terminal."
    }

    # Run setup
    Write-Host ""
    Write-Info "Configuring IDEs..."
    Write-Host ""

    if (Get-Command ctxopt-mcp -ErrorAction SilentlyContinue) {
        ctxopt-mcp setup
    } else {
        # Fallback to npx if global install didn't add to PATH yet
        npx @ctxopt/mcp-server setup
    }

    # Final message
    Write-Host ""
    Write-Host "Installation complete!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:"
    Write-Host "  1. Restart your IDE to load the MCP server"
    Write-Host "  2. Run 'ctxopt-mcp doctor' to verify everything is working"
    Write-Host ""
    Write-Host "Documentation: " -NoNewline
    Write-Host "https://ctxopt.dev/docs" -ForegroundColor Cyan
    Write-Host ""
}

# Run main function
Main
