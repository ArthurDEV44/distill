#!/bin/bash

# CtxOpt MCP Server Installation Script
# https://ctxopt.dev
#
# Usage:
#   curl -fsSL https://ctxopt.dev/install.sh | bash
#
# This script will:
#   1. Detect your OS and package manager
#   2. Install @ctxopt/mcp-server globally
#   3. Auto-configure detected IDEs (Claude Code, Cursor, Windsurf)
#   4. Verify the installation

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${BLUE}ℹ${NC} $1"
}

success() {
    echo -e "${GREEN}✓${NC} $1"
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1"
}

# Detect OS
detect_os() {
    case "$(uname -s)" in
        Linux*)     OS="linux";;
        Darwin*)    OS="macos";;
        CYGWIN*|MINGW*|MSYS*) OS="windows";;
        *)          OS="unknown";;
    esac
    echo "$OS"
}

# Detect package manager
detect_package_manager() {
    if command -v bun &> /dev/null; then
        echo "bun"
    elif command -v npm &> /dev/null; then
        echo "npm"
    elif command -v yarn &> /dev/null; then
        echo "yarn"
    elif command -v pnpm &> /dev/null; then
        echo "pnpm"
    else
        echo "none"
    fi
}

# Check Node.js version
check_node() {
    if ! command -v node &> /dev/null; then
        error "Node.js is not installed."
        echo ""
        echo "Please install Node.js 18 or higher:"
        echo "  https://nodejs.org/"
        echo ""
        exit 1
    fi

    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        error "Node.js version must be 18 or higher (found v$NODE_VERSION)."
        echo ""
        echo "Please upgrade Node.js:"
        echo "  https://nodejs.org/"
        echo ""
        exit 1
    fi
}

# Install package
install_package() {
    local pm=$1

    log "Installing @ctxopt/mcp-server using $pm..."

    case "$pm" in
        bun)
            bun install -g @ctxopt/mcp-server
            ;;
        npm)
            npm install -g @ctxopt/mcp-server
            ;;
        yarn)
            yarn global add @ctxopt/mcp-server
            ;;
        pnpm)
            pnpm add -g @ctxopt/mcp-server
            ;;
        *)
            error "No supported package manager found."
            echo ""
            echo "Please install one of the following:"
            echo "  • npm (comes with Node.js)"
            echo "  • bun: https://bun.sh"
            echo "  • yarn: npm install -g yarn"
            echo "  • pnpm: npm install -g pnpm"
            echo ""
            exit 1
            ;;
    esac
}

# Main installation flow
main() {
    echo ""
    echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${CYAN}║     CtxOpt MCP Server Installation       ║${NC}"
    echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════╝${NC}"
    echo ""

    # Detect environment
    OS=$(detect_os)
    PM=$(detect_package_manager)

    log "Detected OS: $OS"
    log "Detected package manager: $PM"
    echo ""

    # Check Node.js
    check_node
    success "Node.js $(node -v) detected"

    # Install package
    echo ""
    install_package "$PM"
    success "Package installed successfully"

    # Verify installation
    echo ""
    if command -v ctxopt-mcp &> /dev/null; then
        VERSION=$(ctxopt-mcp --version 2>/dev/null || echo "unknown")
        success "ctxopt-mcp v$VERSION is now available"
    else
        warn "ctxopt-mcp not found in PATH. You may need to restart your terminal."
    fi

    # Run setup
    echo ""
    log "Configuring IDEs..."
    echo ""

    if command -v ctxopt-mcp &> /dev/null; then
        ctxopt-mcp setup
    else
        # Fallback to npx if global install didn't add to PATH yet
        npx @ctxopt/mcp-server setup
    fi

    # Final message
    echo ""
    echo -e "${BOLD}${GREEN}Installation complete!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Restart your IDE to load the MCP server"
    echo "  2. Run 'ctxopt-mcp doctor' to verify everything is working"
    echo ""
    echo -e "Documentation: ${CYAN}https://ctxopt.dev/docs${NC}"
    echo ""
}

# Run main function
main "$@"
