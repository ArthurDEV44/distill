# Distill MCP Server Installation Script for Windows
# https://distill-mcp.com
#
# Usage:
#   irm https://distill-mcp.com/install.ps1 | iex
#
# This script will:
#   1. Detect your package manager
#   2. Install distill-mcp globally
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

    Write-Info "Installing distill-mcp using $PackageManager..."

    switch ($PackageManager) {
        "bun" { bun install -g distill-mcp }
        "npm" { npm install -g distill-mcp }
        "yarn" { yarn global add distill-mcp }
        "pnpm" { pnpm add -g distill-mcp }
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
    Write-Host "     Distill MCP Server Installation" -ForegroundColor Cyan
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
    if (Get-Command distill-mcp -ErrorAction SilentlyContinue) {
        $version = distill-mcp --version 2>$null
        if (-not $version) { $version = "unknown" }
        Write-Success "distill-mcp v$version is now available"
    } else {
        Write-Warning "distill-mcp not found in PATH. You may need to restart your terminal."
    }

    # Run setup
    Write-Host ""
    Write-Info "Configuring IDEs..."
    Write-Host ""

    if (Get-Command distill-mcp -ErrorAction SilentlyContinue) {
        distill-mcp setup
    } else {
        # Fallback to npx if global install didn't add to PATH yet
        npx distill-mcp setup
    }

    # Final message
    Write-Host ""
    Write-Host "Installation complete!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:"
    Write-Host "  1. Restart your IDE to load the MCP server"
    Write-Host "  2. Run 'distill-mcp doctor' to verify everything is working"
    Write-Host ""
    Write-Host "Documentation: " -NoNewline
    Write-Host "https://distill-mcp.com/docs" -ForegroundColor Cyan
    Write-Host ""
}

# Run main function
Main
