# Collaborative architecture investigation

Headless, investigation-only prototypes. Product code is imported and never changed. No server starts.
See [REPORT](REPORT.md), [PROTOCOL](PROTOCOL.md), then [INTEGRATION](INTEGRATION.md).

From this directory, Node ≥22:

```powershell
npm run setup
npm run check
node run.mjs --safety
node local/runtime/node_modules/typescript/bin/tsc -p tsconfig.json
```

`local/results.json`, the generated Node bundle/sourcemap, fixture bytes and installed dependencies are
gitignored. Re-running reproduces deterministic checks and refreshes machine-dependent timings (~minutes).
An existing esbuild/fflate installation can be reused with `COLLAB_RUNTIME=<absolute node_modules path>`.
The setup changes only `local/runtime/`. Nothing launches Timberborn or a browser.

`state.ts`: exact patches/masks; `architecture.ts`: undo/claims/notices; `forces.ts`: cached planning;
`snapshot.ts`: compact current-state codec/presence; `channel.ts`: host/replica ordering; `check.ts`: proof harness.
`spike.ts` adapts the previous spike's model helpers without duplicating its transport experiment.
