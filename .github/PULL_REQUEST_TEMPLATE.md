## Summary

<!-- What changed and why? -->

## User-visible behavior

<!-- Tool output, CLI behavior, or API surface users will notice. Write "None" for internal-only changes. -->

## Validation

<!-- Check every command you ran. Tests run from packages/mcp-server/. -->

- [ ] `bun run lint`
- [ ] `bun run check-types`
- [ ] `bun run test` (from `packages/mcp-server/`)
- [ ] `bun run build`
- [ ] Coverage stays at or above the thresholds in `vitest.config.ts`

## Compatibility

- [ ] No breaking change to the 3 tools' input/output contracts, **or** the
      change is documented and the version is bumped accordingly
- [ ] `node >= 20` preserved; no new runtime dependency added without rationale
- [ ] Pinned deps (`@sebastianwessel/quickjs`, `web-tree-sitter`) untouched, or
      the pin move is justified in the description

## Notes for reviewers

<!-- Anything non-obvious: a workaround, an invariant, a gotcha, or a follow-up. -->
