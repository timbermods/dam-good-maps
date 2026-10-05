# Generation speed investigation

- Base: dev `38d4ee6b`; all work stays here, product files and pins unchanged.
- One Node profile per theme at 256²/seed 1, plus the extreme case: [stage table](PROFILE.md).
- Shared reuse covers guarded incremental builds, drought pools, pump shores, intention contexts and resource scratch space.
- A bounded settled-start snapshot cache cuts the extreme case's CPU 38.80 → 35.97 s (7.3%), wall 62.70 → 57.24 s, one reading each.
- The first reuse group's eight after readings were slower; their settings/load differ, so no overall generation speedup is established.
- Exactness and targeted tests: see [verification](INTEGRATION.md#verification); hashes, complete build arrays, checks, retry state and shown land are compared.
- This dev predates D471: the extreme case fails after 27 attempts; its behavior is preserved. Highest terrain assumed 22; the prompt ended at “The pinned”.
- Publication branch: `investigation/gen-speed-2` into `dev`; the old branch is preserved and its report was not read. [Adoption patch](adoption.patch).
