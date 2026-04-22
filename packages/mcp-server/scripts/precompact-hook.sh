#!/bin/sh
# precompact-hook.sh — Distill PreCompact hook for Claude Code.
#
# Wired from ~/.claude/settings.json as a PreCompact hook. Claude Code
# dispatches this script via `executePreCompactHooks` in
# claude-code/utils/hooks.ts:3961-4025 and merges the trimmed stdout into
# `newCustomInstructions` (claude-code/services/compact/compact.ts:420-423)
# before the compact-summary LLM runs.
#
# Contract (verified against claude-code/utils/hooks.ts:3991-4024 and the
# parseHookOutput fallback at :399-449):
#   - stdin: PreCompact hook-input JSON (ignored by this script — we emit
#     the same instruction for every invocation).
#   - stdout: plain text (MUST NOT start with `{` — Claude Code would try to
#     parse JSON output, and PreCompact has no JSON schema branch).
#   - exit: always 0. Non-zero exit would surface as a failed hook without
#     improving autocompact, so we prefer silent success.
#
# Portability: POSIX `/bin/sh` only. No bashisms, no GNU-only tools. Tested
# against busybox sh, dash, and bash in sh-compat mode.
#
# Lint: `shellcheck -x packages/mcp-server/scripts/precompact-hook.sh` should
# report zero issues. Included as a quality gate in US-011.
#
# See CLAUDE.md → "Compression Marker Contract" for the envelope format
# that this hook instructs the summarizer to preserve.

set -u

print_help() {
    cat <<'EOF'
precompact-hook.sh — Distill PreCompact hook for Claude Code

PURPOSE
  Emits a short instruction that Claude Code merges into its
  compact-summary prompt, telling the summarizer LLM to preserve any
  [DISTILL:COMPRESSED ratio=X.XX method=<name>] ... [/DISTILL:COMPRESSED]
  region verbatim during autocompact.

USAGE
  precompact-hook.sh            # PreCompact hook mode — reads hook-input
                                # JSON on stdin (contents ignored), emits
                                # the instruction on stdout, exits 0.
  precompact-hook.sh --help     # Print this help.

MARKER CONTRACT
  When DISTILL_COMPRESSED_MARKERS=1 is set on the MCP server, Distill's
  three tools wrap compressed output in:

      [DISTILL:COMPRESSED ratio=X.XX method=<name>]
      <compressed payload>
      [/DISTILL:COMPRESSED]

  The marker is the stable token this hook anchors its preserve-verbatim
  instruction to. See the "Compression Marker Contract" section of the
  Distill CLAUDE.md for the full format, per-tool thresholds, and
  collision-escape behavior.

INSTALL
  Add to ~/.claude/settings.json under hooks.PreCompact, or use
  `distill-mcp setup --install-precompact-hook` (shipped in US-010).

EXIT CODES
  0  Always — even on malformed stdin or unexpected events. The hook is
     best-effort and must never block Claude Code's compact flow.
EOF
}

# --- argument handling ------------------------------------------------------

if [ "$#" -gt 0 ]; then
    case "$1" in
        -h|--help)
            print_help
            exit 0
            ;;
        *)
            # Unknown args: don't fail, just ignore. PreCompact dispatchers
            # may pass flags we don't know about in future Claude Code
            # releases; silent tolerance beats a hard failure that blocks
            # compaction.
            :
            ;;
    esac
fi

# --- stdin handling ---------------------------------------------------------
# Drain stdin to /dev/null so the caller's pipe doesn't accumulate buffer
# or receive SIGPIPE. We intentionally do not parse the JSON: the output is
# unconditional, and depending on stdin shape would make the hook fragile
# across Claude Code upgrades.
cat >/dev/null 2>&1 || true

# --- instruction emission ---------------------------------------------------
# Plain-text output. MUST NOT start with `{` — see parseHookOutput at
# claude-code/utils/hooks.ts:399-449. The text is trimmed and joined into
# newCustomInstructions at :3991-4024. Required phrases verified by the
# US-011 integration test: `[DISTILL:COMPRESSED`, `preserve verbatim`,
# `do not re-summarize`.
printf '%s\n' \
'Preserve verbatim any text region delimited by [DISTILL:COMPRESSED ratio=X.XX method=<name>] ... [/DISTILL:COMPRESSED] (or the collision-escaped [DISTILL-USER-TEXT:COMPRESSED ...] variant). These regions were already compressed by the Distill MCP server before entering context. Do not re-summarize, rewrite, or drop them — copy the full block including both the opening tag line and the closing [/DISTILL:COMPRESSED] tag into the summary exactly as written. All other content may be summarized normally.'

exit 0
