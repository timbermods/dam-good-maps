# Kyler's standing rule on checks (2026-10-03)

Recorded as PLAN §20 D454. Verbatim:

Kyler, 2026-10-03, a standing rule above every other on checks: no excessive tests, timings or validation, only when genuinely necessary or when Kyler asks. The timing gates paralysed progress for a week; chasing the last bit of measured certainty made velocity and quality stagnate. Speed is judged by Kyler using the product. What stays: CI and the nightly suite (GitHub's machines), checks that catch real bugs, and a real check that the change works before reporting it done. Before adding any check, measurement or validation step, ask: is something actually likely to break here, and would Kyler not see it anyway? If not, don't add it.

Record it as a decision and put it at the top of CLAUDE.md (above D316's rule, which it tightens), in CHAT-HANDOFF's standing rules, and in HANDOFF's opening rule. Cut every remaining line in the living docs that requires a timing, quiet window, budget measurement or validation run beyond this. Keep it short.
