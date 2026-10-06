Headed production builds: dev 009a00b and feature/page beee673, Ryzen 5 3600 / RTX 2070 SUPER / Chrome 154, two cold/warm pairs each.
Feature/page generation: cold **4.50 → 2.99 s**, warm **2.33 → 2.22 s**, from first request to the fully drawn map with editing handlers attached.
Feature/page stored reopen: cold **3.00 → 2.75 s**, warm **0.60 → 0.52 s**; generated map hashes match before/after within each target.
Dev milestone-only generation: **6.98 → 6.94 s** cold, **2.75 → 2.74 s** warm; stored reopen regressed **4.53 → 5.00 s** cold, **0.70 → 0.71 s** warm.
Where it went: page warmup held generation ~2 s; dev's cold first renderer frame still costs ~3.8 s; the checks replica downloaded/started before editing.
Changes: overlap worker startup/generation with renderer warmup, defer replica/checks until editable, resave on water settle, cache hashed assets in the existing isolation worker.
Both owner patches apply; typechecks, production builds, 11 relevant contracts, 4 cache cases, real brush/undo/settled save and disabled-replica export gates passed; no timing assertions.
[Measurements, caveats and captures](MEASUREMENTS.md) · [Adoption/CI](INTEGRATION.md) · [Regeneration](REGENERATE.md); product files unchanged, bulk artifacts ignored in local/.
