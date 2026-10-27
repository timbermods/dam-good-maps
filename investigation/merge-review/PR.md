Six reproducible correctness/lifecycle defects in the Oct 4 dev water adoption: public-state edit parity, exceptional helper dispatch, final-commit retry carry, partial helper startup, weather cancellation disposal and map-switch draft disposal. All six have proposed fixes in the adoption patch; product sources remain unchanged.

The report opens with eight lines. Details distinguish controlled fault injection and public API contracts from observed player lifecycle failures, and record the incomplete native Firefox private-window check. No additional defect found in service-worker/isolation checks, wet-list/layout sync or pre-adoption force playback comparisons.

- [Report](investigation/merge-review/REPORT.md), [reproductions and evidence](investigation/merge-review/DETAILS.md), [integration](investigation/merge-review/INTEGRATION.md), [patch](investigation/merge-review/adoption.patch).
- Validation: 128 water cases (threads 1–16), eight edit/continuation cases, 249 force comparisons, three browser engines plus blocked-SW configurations; 100 candidate existing tests, three candidate finding tests, 13 native water/stacked tests; typechecks, patch apply check and diff whitespace checks.
- Bulk outputs stay in ignored local/. No speed measurements, benchmarks, timing gates or Timberborn probes.
