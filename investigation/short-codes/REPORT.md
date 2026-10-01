# Short codes — 2026-10-01

**About half the Chromium length, with all candidates retained.** Default: base64url; base85 saves another
10 characters but uses punctuation. Same two-code exchange; no server, signaling, shortener or relay.
Base: latest fetched dev `0f4a978b`. Product and original spike unchanged. `adoption.patch` is unapplied.

Exact paired measurements from the final matrix; every prefix, framing byte and checksum is included:

| Description | Spike long | Base64url | Base58 | Base32 | Base85 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Chromium Invite | 331 | **163** | 166 | 195 | **153** |
| Chromium Reply | 325 | **163** | 166 | 195 | **153** |
| Firefox Invite | 523 | **223** | 227 | 267 | **208** |
| Firefox Reply | 525 | **220** | 225 | 264 | **206** |

Against the spike's historical 324-character Chromium codes: 163 is 50% shorter, 153 is 53% shorter.
Across this run, long Chromium codes varied 321–335 and Firefox 519–528; Firefox base64url varied 220–223.
Numbers depend on the network, browser and random credentials. These machines gathered two Chromium
UDP/mDNS candidates and four Firefox UDP/TCP candidates. Both sides' lengths are measured from their own SDP.

- **Base64url:** best default for chat paste; letters, digits, `-` and `_`, with case sensitivity/look-alikes.
- **Base58:** no `0/O/I/l`, nearly as short, but still case-sensitive.
- **Base32:** excludes `I/L/O/U`; case-insensitive payload, best for retyping, longest.
- **Base85:** integer radix85 using the Z85 alphabet; shortest tested, punctuation can be altered by chat formatting.

Compact binary retains ICE credentials, SHA-256 fingerprint, DTLS/SCTP settings, candidate priorities,
endpoints, types and extensions. Derive boilerplate/common defaults, preserve foundation equality groups,
pack addresses/credentials and reuse repeated addresses. Use DEFLATE only when it wins. Chromium frames
were 119 bytes (raw); Firefox 162–164 versus 169 raw. Credentials/fingerprint alone occupy 53 Chromium
bytes before metadata: a tiny room number would need external rendezvous or reduced security.
Version tag, explicit payload length and three-byte CRC produce a plain corruption error before connection.
Unknown SDP semantics use lossless fallback; that can be a few characters longer than the spike.

| Connection check, one Windows machine | Long control | Short codes |
| --- | --- | --- |
| Chromium 145 ↔ Chromium 145 | Pass | Pass |
| Chromium host → Firefox 146 guest | Pass | Pass |
| Firefox host → Chromium guest | Pass | Pass |
| Firefox 146 ↔ Firefox 146 | Pass | Pass |
| Windows WebKit 26 | Unavailable: no RTCPeerConnection | Same limitation |
| Two physical devices on the same LAN | **Unverified** | **Unverified** |
| Public STUN gathering, two Chromium tabs | Timed out at 20 s | Timed out at 20 s |

Final matrix: **13/13 same-machine exchanges passed**, including actual base58/base32/base85 exchanges
and two pruning experiments. Each verified both directions with 12,000-character payloads. No HTTP or
WebSocket requests occurred. STUN failure happened before encoding; its cause remains undiagnosed.
The adapted spike also passed **83 mixed map edits + 41 replay checks** in Chromium; a Firefox guest
replayed all **83 edits**, then both peers accepted **60 new edits**, with zero hash mismatches. Guest
edits stopped on drop; the host kept 10 offline edits; a fresh exchange restored the same map.
Codec/type checks passed: **108 round trips, 40,328 corruptions rejected, 26 exact lossless fallbacks**;
synthetic IPv6, server-reflexive related addresses and TCP values preserved (codec tests, not network proof).

**Trade-off choice:** retain all candidates. Firefox UDP-only was 175/175 characters; first-only 138/138.
Both connected locally, but can discard TCP, IPv6, other interfaces or public STUN addresses. Local success
does not establish equal reachability on other networks. Fresh peer connections only; no media or in-place
renegotiation claim. CRC is error detection, not authentication, and can collide. Direct-network limits stay:
[ICE](https://www.rfc-editor.org/rfc/rfc8445.html) discovers/checks paths; it cannot relay blocked traffic.

The sole accessible device was this Windows machine. WebRTC-enabled Safari/WebKit and two-device trials
remain milestone gates, with explicit steps in README. QR was optional and is deferred. Regenerate the
demo, matrix, corruption tests, map/rejoin checks and adoption patch with README's commands; raw evidence,
private SDP/codes, logs and captures stay in gitignored `local/`. See `INTEGRATION.md` for adoption.
