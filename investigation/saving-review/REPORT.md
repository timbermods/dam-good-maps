F1 — Closing/reloading during the 1.5s edit delay or 4s + 1.5s new-map delay discards the unsaved edit/map without a leave warning.
F2 — Switching maps after an edit's snapshot queues behind a writing save loses the outgoing edit: flush ignores that writing queue and its snapshot reads the next map.
F3 — Startup clears the old autosave before Your maps commits it; leaving then, or a failed migration save, loses the recovery copy.
F4 — Two tabs on the same map silently overwrite edits/renames; a stale save after the other tab deletes it recreates the deleted map.
F5 — A first full/unavailable save discovered during replacement/Generate still lets the page replace the only edited copy; the guard checked before failure.
Ruled out in tests: same-tab delete with pending save; different-map tabs; same-tab pending/in-flight renames; partial quota writes; edited-map reopening across the tested generator bump (D455/D382).
Evidence: feature/page 32e07fe9; 9 original regression failures, 31/31 with patches; original and patched typechecks pass. See DETAILS.md and INTEGRATION.md.
Limit: controller/RPC interleavings and real adapter over fake-indexeddb, not full browser UI; leave-warning fix protects cancellable departure, not forced termination or a dismissed warning.
