# Kyler's decision on collaborative editing's connection (2026-10-02, 19:25)

Recorded as PLAN §20 D431 (amends D362 and docs/COLLAB-BRIEF.md). Verbatim:

Collaborative editing always goes through a relay, and players join with a short room code.

- The connection: every session goes through a managed TURN relay (Cloudflare's Realtime TURN is the candidate), with no direct peer-to-peer path, so every session connects the same way on every network and neither player sees the other's address. Its free monthly allowance far exceeds what operations and rejoins send. The relay sees only encrypted traffic.
- Joining: the host's Invite gives a short room code; the guest types or pastes it and they're connected. A small serverless function (a Cloudflare Worker is the candidate, with whatever storage a room needs for its few minutes) hands out the relay's short-lived credentials and passes the connection setup between the two browsers. It never carries map data, never holds the key in the page, and keeps nothing once a session is connected. Codes are short-lived and single-use.
- If the relay or the function is down, collaboration is unavailable and the page says so plainly; editing alone is unaffected.
- Everything else in the brief stands: one player hosts and keeps the order of operations, each browser rebuilds the map from it, forces travel as gestures with their seeds, rejoining sends the host's map plus the edits since.

This replaces the brief's "pure serverless, peer to peer", "no server of ours or anyone's in the conversation", "no relay" and the two copy-paste codes. Record it with the next free number in PLAN §20, and update docs/COLLAB-BRIEF.md and ROADMAP's "Collaborative editing" section in the same change (D188), noting that the two-code join from the spike (#109) and the short-codes findings (#150) are superseded. Note in CHAT-HANDOFF's parked ideas that hosting on Cloudflare Workers now has a second reason (the room and credential function). Nothing is built before the milestone (D349). Docs only.
