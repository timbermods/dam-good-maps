# Cross-browser determinism

**It breaks today.** At `feature/forces` commit `32aee5cf`, 358 cases produced
1,758 full-state checkpoints per engine: **533 pairwise mismatches across 28 cases**.
Tested Chromium 145, Firefox 146 and Playwright WebKit 26 on Windows x64/Ryzen 9800X3D.
Every theme at 128²/256², three seeds, all brushes/forces at multiple Powers/Sizes,
long mixed sequences, placement, undo/redo, reopening and water were covered.
Generation, standalone brushes and placement matched; all generated maps passed validation.

| Actual failure | Cause and evidence |
| --- | --- |
| Glaciate makes tile (74,74) height **4 vs 7**, then different water | Native `hypot` changes a route decision. Four terrain/water checkpoint comparisons differ. |
| Craterize and subsequent mixed edits retain different fallen directions | Native `hypot` differs by low bits; 504 checkpoint comparisons differ. Raw state differs even when rounded operation directions match. |
| Badtide contamination differs | Native `exp` changes forcing; 25 checkpoint comparisons differ. |
| Force records depend on planning speed, even within one browser | Worker stores planning calls as `steps`: 12 vs 27/43. Final maps match; deterministic stage count is 11. |

Replacing **only hypot** cleared the force/mixed isolation cases; replacing **only exp**
cleared both weather cases. Separately, 45,117 identical numerical inputs exposed 3,629 native
math disagreements and zero portable-math disagreements.

The [adoption patch](adoption.patch) uses fixed-order math, correctly rounded Wasm sqrt,
a consistent weir comparator and deterministic force-record counts. Its complete sweep had
**zero mismatches and zero runtime errors**. Both core variants type-check; the patch applies cleanly.
Product source remains untouched.

Math replacement can change today's results: adopt with D148 re-pins and replay/share-link
versioning. This sample changed Chromium contamination and new record metadata, with no terrain
changes; that does not promise unchanged terrain for other inputs. Comparator equality preserves
valid distinct-ID ordering. Clock metadata needs record-pin updates. Collaboration must distribute
one normalized gesture, seed, identity and agreed water snapshot.

[INTEGRATION.md](INTEGRATION.md) gives adoption choices and regeneration commands;
[AUDIT.md](AUDIT.md) classifies all risks. [RESULTS.json](RESULTS.json) and
[MISMATCHES.tsv](MISMATCHES.tsv) enumerate the evidence. Large dumps stay in ignored `local/`.
[ci.yml](ci.yml) checks actual adopted code in all three engines, compares Linux x64/ARM64,
Windows and macOS ARM64 manifests, and rejects new native approximate math. That CPU matrix is
proposed, not yet run; finite sampling cannot prove every input or future engine.
