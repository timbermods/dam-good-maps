# Collaborative architecture: the proof and the limits

**The patch/claim/checkpoint architecture holds. Fast exact force warnings and cross-browser equality
are not settled for shipping.** Product code untouched; base `feature/forces` `32aee5cf`. Kyler's brief
was read from dev `8f3e7e27`; the spike's model is extended headless. No server/browser/game was started.

- **Undo:** exact inverse patches, last 50 actions per player, indexed tile/identity dependencies;
  skip and name blockers, retain blocked entries, restore eligibility after peer undo. No replay onto
  changed ground. 900 interleaved brush actions, 298 allowed undos, 19 skips; every later peer touch/read
  tile compared including objects and rock. Median/p95 **0.17/1.96 ms**, including those assertions.
  Four extra tests protect evicted identity dependencies and derived resource changes. Whole-map force
  reads are safe but conservative: a distant force can block earlier brush undo.
- **Footprint:** all five real force planners, plus Fissure and Slide, two gesture versions at 48² and
  256². Cached release uses the same completed plan; rock, objects, springs/lakes, owned banks and start
  carry are included. No direct changed tile escapes it; seven same-Node peer computations match.
  Exact changed-gesture 256² times: Carve **264 ms**, Craterize **242**, Erupt **188**, Fissure **262**,
  Lift **245**, Slide **259**, Glaciate **689** (two samples per case; not p95). These are too slow for
  continuous warning updates. Release must wait for the latest exact plan; a ring cannot replace it.
- **Claims:** normalized arbitrary-shape tile ownership; atomic host validation, partial release,
  offer/decline/accept, race invalidation, ownership checks on undo. No-op attempted strokes are refused
  inside the other's claim too. Only direct effects are blocked; water can cross. Claims/offers survive
  the checkpoint and are absent from exported map data. Claim changes use explicit Release/Offer.
- **Water:** real source addition/removal floods/drains 12 claimed tiles; exact location/bounds and
  quiet no-change behavior proved. Full 256² notice scan median/p95 **0.16/1.14 ms**. For strict “no tile”
  undo, settle a scratch inverse and guard derived water/soil/resource changes against later peer touches.
  This blocks a source undo under a later lake edit and clears after that edit is undone. Settling is
  expensive: the long-session final 256² canonical water/soil solve took **8.96 s**. Attribution across
  coalesced edits needs a causal settle revision per edit or an honestly named batch, not the last author.
- **Rejoin:** current numeric map plus 100 inverse records/dependency fences, claims and a pending offer;
  after **10,016 edits** (10,000 real core brush raster actions, four broad forces, 12 core placements),
  **756,635 bytes / 739 KiB** gzip. Encode/decode medians **194/94 ms**, three trials. Twenty operations
  since it: **2,061 bytes**, **95 ms** applied on both replicas together. Hashes, claim/offer state and
  subsequent selective undo match. This measures the working-state codec, not network transfer or
  MapSession/UI hydration; exact saved-file metadata still belongs in the milestone adapter.
- **Presence:** cursor, tool, bounded quarter-tile stroke delta and camera; **243 JSON bytes** per packet,
  **3,645 B/s** at 15 Hz, ~4,485 B/s with illustrative 56-byte packet overhead (not measured WebRTC).
  Epoch, reorder/duplicate and bounds checks proved. Stroke keyframes and Go to are specified, not UI-tested.

**Harder than the brief looks:** serial host order does not make a stale force preview valid; reject it.
Undo's derived-water guarantee can require a slow global solve. A compact current map still needs bounded
undo metadata. All automatic placement/start/resource effects must belong to the original transaction.

Determinism was still running: its local baseline progress showed **36 mismatches at 165/316 cases**,
with some invalid-input cases. One inspected Chromium/Firefox Craterize sample had equal terrain, water,
objects and recorded op, but **23 fallen-pose differences**. This is partial evidence, not its final report.
Pinning a build alone cannot establish cross-browser sameness. The milestone must finish that gate,
optimize warning latency, add the baked MapSession/transaction adapter and causal water handling, and
wire persistence/presence UI. Feature-op guards are specified; their feature-state patch adapter remains open.

**Checks:** 521 main checks + four focused assertions; strict TypeScript passed. Timings: Node 24.13.0,
Ryzen 7 9800X3D, same machine, headless. `npm run setup && npm run check`, `node run.mjs --safety`, and
the TypeScript command in [README](README.md) regenerate everything. Bulk output stays in ignored `local/`.
[PROTOCOL](PROTOCOL.md) lists browser messages; [INTEGRATION](INTEGRATION.md) gives operation rules/proofs/gates.
