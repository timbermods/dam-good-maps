# Parallel water investigation

**Status: verification in progress; adoption decision pending.** Base `feature/m9b`:
`6c29b7e5`. Product files are untouched; the six-day stopping cap is preserved.

Isolation works on the headerless, GitHub Pages-style static host in Chromium 145, Firefox 146
and Windows Playwright WebKit 26. First visit reloads once before UI mounting; updates wait for
safe activation. Cached navigations remain isolated with a failing origin. WebKit's offline
emulation also fails with a plain caching worker; installed Safari/offline remains unverified.
Use one combined caching/isolation worker. Current resources are all same-origin/system/generated.

The initial forced fixture sweep passed **72,000 per-tick comparisons** across 1/2/4/8/16 threads.
No-isolation and failed-helper startup passed **2,400 scalar tick checks**. All **1,050 current M9b
inputs** are generated, including 12 generator refusals retained for water comparisons. The final
seed/official/live/Weather matrix and paired timings are running; final results will replace this status.

Early timings show useful gains on larger wet areas and regressions in some WebKit cases.
512² cases are tiled water stress models: today's schema caps generated maps at 256².

Adoption must preserve reduction/source order, gate early worker calls, discard failed tasks before
scalar retry, budget concurrent pools, and keep old cache assets for active tabs. Shared workspace:
**141 bytes/tile**. Native planning/forcing maths still need the determinism study's separate decision;
this patch preserves current bytes and promises kernel identity for identical inputs.

[Integration and regeneration](INTEGRATION.md) · [Adoption patch](adoption.patch)
