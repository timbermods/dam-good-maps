1. Largest offered size: 256×256, seven small terrain edits; Chrome 154, High look, RTX 4080 SUPER confirmed; one valid reading per build.
2. Click → editor ready: 3.171 s before → 1.270 s after (59.9% sooner); exact water observed at 3.184 s → 5.085 s: no fully-settled speedup claimed.
3. Foreground shares before → after: save/drain 4.9% → 49.1%, storage read 0.1% → 0.5%, worker/RPC 90.3% → 35.1%, page/3D 4.7% → 15.3%.
4. Cacheless worker open: 2,795 → 247 ms; defer its duplicate canonical settle to the existing checks replica; stored projects and D455 keep their path.
5. Page saves again when canonical water finishes, retaining the supported stored map without another edit; final map and project bytes match the synchronous reference.
6. Drain queued edits, capture snapshot identity, and await in-flight saves; Generate and Surprise me passed browser checks; no new visible elements or text.
7. Kept saving on the critical path for durability; renderer already retained its GPU context (setMap 133 → 160 ms); generator, imports, old/baked maps and Rust left alone.
8. Typecheck + 75 focused tests + browser checks passed; setup merge clean; reproduce with INTEGRATION.md (minutes); builds/profiles/screenshots stay in local/ (D195).
