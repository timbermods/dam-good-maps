# Adoption

This investigation contains no product changes. Patches target `feature/page` **32e07fe955ab0f759b5d9d61d9b0b37b83cb4344**, not the investigation PR's `dev` base. Do not apply the page patch directly to today's `dev` App if it still has the older page. Adopt in the owning sessions and adapt context if their files have moved.

1. **Milestone session** adopts `milestone.patch`: only `src/core/library/saver.ts`, `src/core/library/yourMaps.ts`, and `src/platform/yourMaps.ts`. `git apply --check investigation/saving-review/milestone.patch`, then `git apply investigation/saving-review/milestone.patch`. This adds a token to entries/results, optional compare-and-swap to put, conflict wording, an actual flush barrier, deletion cancellation, and transaction rejection cleanup. No worker file is changed.
2. **Page session** adopts `page.patch`: only `src/ui/App.tsx`; no `src/editor/` file is changed. Check/apply the same way. The page passes/receives commit tokens, handles departure, retains migration recovery through commit, rechecks newly failed saves, and cancels local deletion's queued saves. This patch requires the milestone APIs; adopt milestone first, then page, and publish them together.
3. Preserve `investigation/saving-review/` for regression tests, or port the tests/harness to the owning test layout. The current harness always reads the pinned original/fixed local copies; it is not an assertion that later unrelated App changes are tested automatically.

The commit token is independent of editor revision: both tabs can legitimately produce the same revision number, and rename/delete are storage operations. Legacy entries get a deterministic token from their metadata on read. New commits and metadata changes get fresh UUID tokens. Missing entries reject saves of previously opened maps; an explicitly restored map gets a fresh token. Atomicity stays in one transaction across entries/projects. Explicit two-argument `put` remains unconditional for compatibility with other callers/tests; the page's saver always supplies an expected token.

Close/reload older cached page tabs when adopting: their old JavaScript still writes without the new compare-and-swap and cannot be retroactively protected by a client-only patch. Updated tabs detect conflicts, retain the draft in memory, offer project download, block newly failed replacement, and warn on cancellable departure. There is no edit merging or crash-proof promise for an unsaved draft. The existing explicit “Close it” action still permits intentional discard. Same-tab delete cancellation is defensive cleanup, not a claimed same-tab resurrection finding.

Reproduce in an investigation clone (PowerShell, from its root; no product checkout changes):

```powershell
npm ci --no-audit --no-fund --cache investigation/saving-review/local/npm-cache
node investigation/saving-review/prepare.mjs
Remove-Item Env:SAVING_FIXED -ErrorAction SilentlyContinue
npx --no-install vitest run --config investigation/saving-review/vitest.config.ts --maxWorkers 4
# Expected: nine regression failures, 22 controls/existing assertions pass.
$env:SAVING_FIXED = '1'
npx --no-install vitest run --config investigation/saving-review/vitest.config.ts --maxWorkers 4
# Expected: all 31 pass.
npx --no-install tsc --noEmit -p investigation/saving-review/local/tsconfig.json
Remove-Item Env:SAVING_FIXED
```

`prepare.mjs` uses only Git archive, tar and Node; it materializes `src`/`tests` from the pinned source into ignored local/base, copies src into local/product, checks and applies the two patches **there only**, and writes a source typecheck config. It overwrites those generated copies on rerun. `local/` also holds optional diagnostics; nothing large belongs in Git (D195). Run the owning sessions' normal typecheck and affected tests before adoption is pushed, and `git diff --check`.
