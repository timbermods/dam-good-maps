# Integration

Tested baseline: `feature/page` at `f2c6c34b86993c822541b5c8365140e45bbd5678`. The requested merge of `origin/dev` (`7adabb48d2017a428a5a08ecf49d19e8f427cfc2`) conflicted in EDITOR_PLAN.md and tools/retired-terms.json and was aborted. The measured product source was never edited.

The report commit has the recorded dev revision as its parent and adds only `investigation/long-session/`. It excludes the page branch's inherited product changes. Reproduction uses the tested page revision, following README's restore instructions; these are not measurements of dev.

| Owner | Product boundary | Adoption |
| --- | --- | --- |
| Milestone | `src/core/`, `src/worker/`, `rust/` | LS1: `adoption/milestone.patch`, one unused simulation removed in `src/worker/session.ts`. |
| Page | `src/ui/`, `src/editor/` | No new confirmed persistent-growth finding; no patch. |
| Renderer | `src/render3d/` | Resource counts returned with map/view state; no patch. |

The patch reads the same current water model through `s.built.waterModel` rather than allocating a canonical run to obtain its model. The actual settle and adoption are unchanged. Do not apply a speculative cancelled-settle or weather patch from this investigation: known merge-review F5/F6 are excluded. Read FINDINGS.md for the exact ownership/lifetime and quantified scope; the hour alone does not establish unbounded growth.

On the milestone owner's branch:

```powershell
git apply --check investigation/long-session/adoption/milestone.patch
git apply investigation/long-session/adoption/milestone.patch
npm run typecheck
npx vitest run --project quick tests/contract/waterStatus.test.ts --maxWorkers=6
```

The source may have moved since the tested revision. If the hunk conflicts, port the three changed lines in backgroundCheck's waterPending block, preserving its current cancellation guard. No page or renderer adoption is required.

Validation completed here without product edits: repository typecheck; candidate full-program typecheck through `typecheck-candidate.mjs`; three existing water-status contracts using `candidate-vitest.config.mts`; headed baseline/candidate reproduction with all twelve settled-state fingerprints equal, 36 versus zero unused runs, and 114 versus 53.8125 MiB peak checks Wasm. The capped smoke also exercised every brush and force. Only the relevant tests were run; there is no speed gate.

Nothing under `src/` imports this folder. Dependencies, lockfiles, repository configuration and generated Wasm are unchanged. Investigation-only Vite transforms implement probes and the candidate in ignored builds. Full profiles, builds, logs, heap snapshots and interrupted development trials remain ignored under `local/` (D195). Two same-page controller recoveries and the marked worker sample gaps are recorded in DETAILS.

`git diff --check` is required before the single permitted push. This is a draft investigation handoff; no merge, approval, auto-merge, tag, release or other branch push is included.
