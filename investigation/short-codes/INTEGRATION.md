# Collaboration milestone adoption

Use `codes.ts` and `long-codes.ts` as the connection-code boundary, with `fflate` 0.8.3.
`encode(description, alphabet = 'base64url', policy = 'all')` returns `.code`, lengths and fallback diagnostics.
`decode(code)` returns `RTCSessionDescriptionInit` or a readable version/corruption error.
`adoption.patch` shows the concrete change to the spike; do not apply it during this investigation.

Create a fresh `RTCPeerConnection` for each exchange/rejoin, with one application/data-channel media section.
Keep the spike's ordered channel, complete ICE gather before encoding, five-minute code lifetime and DTLS.
Set the decoded remote description, create/set the answer, gather, return the Reply. Never edit local SDP.
The compact profile is for fresh peers, not media negotiation or in-place ICE restarts: its origin is synthesized.
The brief's public STUN option remains address lookup only. Configure no TURN, relay or signaling endpoint.

Wire version `S1`: alphabet tags `u` (base64url), `h` (Bitcoin base58), `c` (Crockford base32), `z` (integer radix85,
Z85 alphabet, not fixed-block Z85). Prefixes count toward every reported length. Payload: mode byte, unsigned
LEB128 payload length, payload, CRC-24/OpenPGP (three big-endian bytes; initial `B704CE`, polynomial `864CFB`).
Modes 0/2 are raw/DEFLATE compact fields; mode 1 preserves the spike's complete compressed description.
CRC covers mode, length and payload before parsing/decompression. Version/alphabet errors are explicit.
Whitespace wrapping is accepted; base32 payload case is ignored. No look-alike aliases are silently corrected.
CRC detects mistakes, not a malicious sender; random corruption can collide (roughly 1 in 16.7 million).
Legacy `DGC1`/`DGC2` reads are supported but have no new checksum; old demos cannot read `S1`.

Compact fields retain ICE ufrag/password (six bits per character, no entropy reduction), SHA-256 fingerprint,
DTLS setup role, mid, SCTP port/message limit, ICE options and all candidate endpoints/priorities/types/extensions.
Addresses use IPv4 bytes, IPv6 bytes, UUID mDNS bytes or a literal string, with references for repeats.
Candidate foundations are renamed while preserving their equality groups. Boilerplate is synthesized;
common settings/extensions are derived from tagged defaults. The shorter of raw and DEFLATE binary wins.
Unknown SDP semantics, candidate extensions or unsupported profiles use lossless fallback and expose `.reason`.
Keep that fallback; browser descriptions change. Unsupported profiles may be slightly longer than old codes.

Adopt `all` candidates. `udp-only` and `first` are investigation comparisons; they can lose TCP, IPv6,
other interfaces or STUN-discovered paths. There is no evidence supporting those losses in the product.
The decoder limits text to 16,384 characters and compact inflate output to 8 KiB; the legacy path keeps
the spike's 256 KiB inflate bound. Surface decoding errors before calling `setRemoteDescription`.

Before milestone adoption: complete the two-device and WebRTC-enabled WebKit rows in README, plus different-network
trials if internet joins are promised. Compare full map hashes, edits and fresh rejoin against the long baseline.
The format shortens addresses/credentials; it cannot make blocked direct paths connect. QR is left for the milestone UI.
