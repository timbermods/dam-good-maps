# Connection spike — 2026-09-30

**The local bet holds; universal internet connectivity does not.** Real WebRTC and the product's headless MapSession kept identical maps through host-ordered edits and rejoin. Product code untouched; base `dev` `9ac250b6`, seed 349, River Valley, 48², canonical water.

## Measured

Final encoding: reversible SDP dictionary → DEFLATE level 9 → base64url. All candidates, credentials and fingerprints remain. Exact character counts include the five-character prefix; raw means uncompressed JSON/base64url.

| Exchange | Raw | DEFLATE only | Final |
| --- | ---: | ---: | ---: |
| Chromium Invite / Reply | 1016 / 1015 | 645 / 643 | **324 / 324** |
| Chromium rejoin Invite / Reply | 1019 / 1016 | 648 / 645 | **329 / 327** |
| Firefox Reply | 1347 | 727 | **529** |

Lengths vary with credentials and candidate count.

- **Connect:** two Chromium 145 tabs, `file://`, STUN off, selected direct host/UDP candidates. Final-build host channel opened in **672 ms**, map ready in **922 ms** from Invite after generation; whole automated exchange **1.99 s**, including generation. Human copying excluded.
- **Sameness:** **523 accepted edits** from both players: 339 brush, 156 placement, 28 real Carve results. Concurrent sends and opposing same-tile strokes included. **Zero mismatches** across 513 live guest checks and 261 replay checks. Invalid brush rejected without advancing the log.
- **Final compression check:** **83 edits + 41 replay checks** passed. Chromium/Firefox 146 then matched an **83-entry replay + 60 new concurrent edits**; connection plus catch-up **9.08 s**.
- **Latency under the 523-edit load:** host→guest median/p95 **272/1662 ms**; guest→host **197/1401 ms**. Submit to peer canvas update, same-machine clocks, including canonical settling/queueing. Hash confirmation median/p95 **316/1794 ms**. Not network-only or 256² timings.
- **Drop:** guest edits stopped; host accepted 10 offline edits. Fresh codes replayed all **261** entries to the exact host hash: **55.6 s** catch-up versus **147 ms** transport. Silent loss has a 12-second heartbeat deadline when the tab runs. Unconfirmed guest edits are not automatically resent.
- **Unverified:** second physical device and different networks. Public Google STUN gathering timed out at **20 s** here; cause undiagnosed.

## Milestone findings

Move rebuilding off the main thread, define consistent water completion, and checkpoint/catch up efficiently. Persist the host base/log; refresh currently loses them. Pin the actual code/schema build. Check larger maps and more browsers.

Ordering guarantees the shared result, not both players' intentions: **10 Carve requests** reached a newer host state; literal levels can overwrite intervening work. Decide whether stale forces are accepted, rejected or recomputed. Undo with two players and seeing each other are out of scope.

**Internet expectation (inference):** ordinary home routers may permit direct hole punching; reachable IPv6 can help. Incompatible endpoint-dependent (“symmetric”) NAT pairs, blocked direct UDP/TCP, isolated Wi-Fi and restrictive enterprise/mobile networks can fail. CGNAT/mobile data alone does not guarantee failure. STUN finds addresses; it cannot relay through blocked paths. Some friends cannot connect under the no-relay rule. [WebRTC guidance](https://webrtc.org/getting-started/turn-server), [MDN protocols](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Protocols).

Try home Wi-Fi versus a phone hotspot with phone Wi-Fi off, STUN enabled on both. [README.md](README.md) has steps and regeneration commands. Default `check.mjs` runs 500 mixed requests; `SPIKE_BATCH=15 CHECK_FIREFOX=1` repeats the focused final-build check. Generated HTML, logs and raw results stay gitignored in `local/`.
