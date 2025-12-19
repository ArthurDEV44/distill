#!/bin/bash
# Workaround for:
# 1. Bun installed via snap has confined environment - $HOME points to snap dir
# 2. napi-cli spawns /bin/sh internally which doesn't inherit PATH
# 3. rustup needs RUSTUP_HOME and CARGO_HOME to find its configuration
#
# Solution: Use real home directory and set all required environment variables

set -e

# Get the REAL home directory (snap sets HOME to /home/user/snap/bun-js/XX)
REAL_HOME=$(getent passwd "$(whoami)" | cut -d: -f6)

# Set Rust environment variables with real home paths
export RUSTUP_HOME="$REAL_HOME/.rustup"
export CARGO_HOME="$REAL_HOME/.cargo"
export PATH="$CARGO_HOME/bin:$REAL_HOME/.local/bin:$PATH"

# Source cargo environment if available (this sets additional variables)
if [ -f "$CARGO_HOME/env" ]; then
    # Override HOME temporarily for the source command
    HOME="$REAL_HOME" source "$CARGO_HOME/env"
fi

# Find cargo and export it for napi-cli child processes
CARGO_BIN=$(command -v cargo 2>/dev/null)
if [ -z "$CARGO_BIN" ] || [ ! -x "$CARGO_BIN" ]; then
    if [ -x "$CARGO_HOME/bin/cargo" ]; then
        CARGO_BIN="$CARGO_HOME/bin/cargo"
    elif [ -x "$REAL_HOME/.local/bin/cargo" ]; then
        CARGO_BIN="$REAL_HOME/.local/bin/cargo"
    fi
fi

if [ -z "$CARGO_BIN" ] || [ ! -x "$CARGO_BIN" ]; then
    echo "Error: cargo not found. Searched:"
    echo "  - PATH"
    echo "  - $CARGO_HOME/bin/cargo"
    echo "  - $REAL_HOME/.local/bin/cargo"
    exit 1
fi

export CARGO="$CARGO_BIN"

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Run napi with all arguments passed to this script
exec "$SCRIPT_DIR/node_modules/.bin/napi" "$@"
