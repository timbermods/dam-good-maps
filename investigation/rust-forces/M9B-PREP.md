# M9b port (preparation retired)

M9b is merged and released. The oracle is group 4 (`a516e43d`), including M9b and cleanup groups 1–3.

| Result-reachable change | Implementation |
|---|---|
| Game water, evaporation, edge spill, active/wet bookkeeping and partial obstacles | Reused typed rust-water kernel; game + edge flags enabled. |
| Canonical settle | Six-day first cap, four-day drain cap; exact unfed removal and current sealed-lake restoration/releveling. |
| Glaciate flood probe | Game + edge flags enabled; existing 300-tick probe. |
| Soil, water columns, resource placement and exported singletons | Current core build/finalization and product writers in the TypeScript host. |
| Source groups | Group 4's shared member-ID rule and standing/used-ID collision checks. |
| Force request/result assembly | Core planForce, fullForceMapOf, natureOf, forceRecordOf and keptForceParams. |
| Edge hook | Removed (D462). edgeLip does not reach forces. |

The defaults patch has been applied. No pilot, matrix, timing projection or window remains (D453/D454). See INTEGRATION.md for adoption and local checks. Source diff evidence is ignored local/adoption/group4.diff; regenerate with git diff 4799800f a516e43d -- src/core src/worker rust.
