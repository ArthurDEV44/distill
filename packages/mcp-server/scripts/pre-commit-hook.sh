#!/bin/bash
#
# CtxOpt Pre-commit Hook
#
# Warns about files with high token counts that may cause issues
# with AI coding assistants.
#
# Installation:
#   ctxopt-mcp setup --hooks
#   OR
#   cp scripts/pre-commit-hook.sh .git/hooks/pre-commit
#   chmod +x .git/hooks/pre-commit

set -e

# Configuration
THRESHOLD=${CTXOPT_TOKEN_THRESHOLD:-2000}
WARN_ONLY=${CTXOPT_WARN_ONLY:-true}

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Check if ctxopt-mcp is installed
if ! command -v ctxopt-mcp &> /dev/null; then
    # Try npx as fallback
    if command -v npx &> /dev/null; then
        CTXOPT_CMD="npx @anthropic-ai/ctxopt-mcp"
    else
        echo -e "${YELLOW}Warning: ctxopt-mcp not found. Skipping token analysis.${NC}"
        exit 0
    fi
else
    CTXOPT_CMD="ctxopt-mcp"
fi

# Get staged files (only source code files)
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx|js|jsx|py|go|rs|java|swift|php|rb|c|cpp|h|hpp)$' || true)

if [ -z "$STAGED_FILES" ]; then
    exit 0
fi

echo -e "${CYAN}Analyzing token usage for staged files...${NC}"

# Analyze each file
WARNINGS=0
for file in $STAGED_FILES; do
    if [ ! -f "$file" ]; then
        continue
    fi

    # Get token count using a simple wc-based estimate
    # More accurate counting requires the full ctxopt-mcp analyze
    LINES=$(wc -l < "$file" 2>/dev/null || echo "0")
    WORDS=$(wc -w < "$file" 2>/dev/null || echo "0")

    # Rough token estimate: ~1.3 tokens per word for code
    ESTIMATED_TOKENS=$((WORDS * 13 / 10))

    if [ "$ESTIMATED_TOKENS" -gt "$THRESHOLD" ]; then
        WARNINGS=$((WARNINGS + 1))
        echo -e "${YELLOW}Warning:${NC} $file"
        echo -e "  Estimated tokens: ~$ESTIMATED_TOKENS (threshold: $THRESHOLD)"
        echo -e "  Suggestion: Use ${CYAN}smart_file_read${NC} to extract specific functions"
    fi
done

if [ "$WARNINGS" -gt 0 ]; then
    echo ""
    echo -e "${YELLOW}$WARNINGS file(s) may have high token counts.${NC}"
    echo -e "Consider using CtxOpt tools when working with these files:"
    echo -e "  - ${CYAN}smart_file_read${NC}: Extract specific functions/classes"
    echo -e "  - ${CYAN}code_skeleton${NC}: Get signatures only"
    echo ""

    if [ "$WARN_ONLY" != "true" ]; then
        echo -e "${RED}Commit blocked. Set CTXOPT_WARN_ONLY=true to allow.${NC}"
        exit 1
    fi
fi

exit 0
