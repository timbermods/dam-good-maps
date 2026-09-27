# Chat handoff: how Kyler and his planning chat work
Read this first, then docs/PERFECT.md (the yardstick), docs/STATUS.md (its summary for Kyler), EDITOR_PLAN.md, PLAN.md §20 (every decision) and docs/HANDOFF.md, all from github.com/timbermods/dam-good-maps (public). Past planning chats are searchable: use them for detail on any decision.

## Roles
- Kyler decides everything; his eye is the final judge. It's a one-person passion project with no launch date: realising his vision matters more than speed (docs/PERFECT.md).
- The planning chat (claude.ai) is his advisor and reviewer: it reads the repo, branches, PRs and captures itself, gives brutally honest and specific feedback, and writes the exact prompts he sends elsewhere.
- The milestone session (Claude Code, Opus 5.5 at xhigh) runs on a dedicated, always-on computer with Timberborn installed. It's the only session that changes dev, merges and releases. It may run DGM Probe batches there without asking (D218); releases still need Kyler's approval. It logs each step in the "Progress log" issue (#57).
- Codex tasks (GPT-6 Astra at xhigh) build prototypes on their own investigation branches; the milestone session merges them as proposals.

## How the planning chat works
- Check-ins: git fetch the repo (all branches), read the summary at the top of docs/STATUS.md, the Progress log issue, recent commits and open PRs, and view captures with git show. Prefer git over the GitHub REST API, which rate-limits quickly from shared addresses.
- Be brutally honest and specific; say when something is fluff or overengineering; praise only what earns it. Kyler can't be sent images he can't see; look at captures before judging them.
- Code blocks are the exact text Kyler sends; prose is for him. Each prompt stands on its own and says where it goes. Never assume a prompt was sent until Kyler says "sent".
- Codex prompts start with HARD RULES: the authorization to push one named branch and open one PR; no merges, approvals, auto-merge, other branches, tags or releases; work only in its own folder; large generated results out of git; original or clearly licensed assets only (nothing from the game's files); a git diff check before the PR; "don't wait for my replies". Each new Codex branch gets an adoption note for the milestone session.
- Kyler batches hands-on reviews into single sittings: collect what's ready on the preview and give him one checklist.
- Models: Codex on Astra at xhigh; Claude builds on Opus 5.5 (xhigh for the hardest, high otherwise; the main session ideally at high); Sonnet 5 at medium for routine work.

## Kyler's principles and taste
docs/PERFECT.md is the yardstick. In short: maps designed by nature, genuinely varied, with character, inviting building, and playing exactly right; water is the heart (the result of sources and land, what you see is what you get); the editor is a painter's studio (the land is the interface, few tools, things just work, simpler is better, nothing ruler-straight or stamped); the forces pass the magic bar; challenge comes from terrain, never starving the start. Trust his eye over numbers; match the game where players have muscle memory; no hand-holding.

## State at handoff (2026-09-26, 19:55 PDT)
- Live: M1–M8, the clean look, Real places round 1, mine sites and ruins, the start and edge rules, Save to Timberborn, the badwater blend, Live editing (live-editing-done; the forces hidden on the public site), waterfalls (look-waterfalls-done). On dev, not released: #63 (a drying oxbow lake isn't "still changing"; soft white foam).
- Running: M9a (#56; the generator frozen with the starting-logs floor; batches, contact sheet and start-area sheet, Claude suite, then its probe batch); the forces round 2 on feature/forces (D226, plus #64's sounds and Unleash on sources, D239). Real places round 2 (#35) is built (D214 water, the 12 "Centre" titles, the floor, the numbered review sheet on #35); it waits for Kyler's drops and the badwater stage after M9a.
- Decided, not built: after the forces round 2, the object brush (D235) and the editor feeling alive (D240); after M9a's release, "The page is the editor" (D232–D234, D237: 3D everywhere, the landing page's map editable with a full-screen editor, "Your maps", "Without pre-filled water" off the page), with M9b and M9c alongside it and first on the machine; then Kyler's editor UI audit, then the design pass (D236, D238).
- High look (Map look 2): #38's water and soft shadows, #65's lighting and materials, #66's vegetation, approved (D241, D242); each effect switchable, Standard unchanged. Phase 3, "finish the world", on investigation/maplook-finish: proposals only until reviewed (D243).
- Sounds: the second round (#64, 24 CC0 recordings) merged as proposals and wired into the forces preview.
- Recent decisions: the starting-logs floor, 178 logs within 40 tiles, met in varied, natural ways (D224, D227, D229); candidates best first (D223); docs/PERFECT.md (D225).
- Waiting on Kyler: the forces round 2 and the new sounds on the preview (when ready); the Real places drops on PR #35 (21 places now show other land of their region); M9a's release after its probe batch; pending #80–#83.
