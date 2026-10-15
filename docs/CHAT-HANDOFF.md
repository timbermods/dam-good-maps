# Planning handoff: the planning session

Rewritten 2026-10-14, when a Claude Code session on the dedicated machine replaced the claude.ai planning chat. Read this
first, then `docs/STATUS.md` and `docs/HANDOFF.md` (tops), `AGENTS.md`, CLAUDE.md's "Coordination", `docs/PERFECT.md`,
`docs/decisions/README.md` and `docs/COLLAB-BRIEF.md`, then #236 from the last few days. The previous versions are in
`docs/archive/chats/` (the last, 2026-10-14, is the claude.ai chat's).

## Roles

- **Kyler** (he/him) owns the project. Since 2026-10-14 he is done testing and giving feedback (D484): Claude completes the
  whole order without him, deciding against his recorded decisions. He talks to the planning session, rarely. A
  one-person passion project with no launch date: realising his vision matters more than speed.
- **The planning session** (Claude Code, Opus 5.5, high; the dedicated machine, worktree
  `C:\Users\krams\code\DamGoodMaps-planning`, detached at `origin/dev`) coordinates. It never edits the main clone or
  another session's worktree; merges go through `gh`. Its job:
  1. **Merge every "ready to merge"** posted on #236, promptly. Before each: the owner's verdict comment and captures on
     the PR; for a look or interaction change, a fresh Opus reviewer's verdict on the PR; for the milestone's own PRs, its
     fresh sub-agent's review; the PR's quick checks green (typecheck, quick suite, build). The browser specs and the
     suites run on dev after the merge (Kyler, 2026-10-15); a failure there goes back to whoever's merge broke it, at
     once. No full run by hand except for a release. It never merges its own work.
  2. **Filter design questions.** A session posts one on #236. If Kyler's recorded decisions (`docs/decisions`,
     `docs/design`, PERFECT, UI-BRIEF, COLLAB-BRIEF) settle it, answer on #236 citing the decision. If not: one
     `needs-kyler` issue (2–4 options, a capture or mockup, the recommended default), at most one batch a day, one plain
     line to Kyler in chat. Work never waits: the sessions build on the default.
  3. **Settle cross-session questions** on #236 (conflicts, who owns a file, page-file edits while the page session is
     stopped, order inside a step), after reading the code and the decisions, never relaying a session's guess.
  4. **Keep the order moving.** Watch for stalls. A stopped session gets its resume steps on #236 and one line to Kyler:
     "type 'Resume from #236' in <session>".
  5. **Release** at the end of each step once the full run, the nightly and a D483 probe batch are green (CLAUDE.md,
     "Deploying"), and say so on #236.
- **The milestone session** (Claude Code, Opus 5.5, high; the main clone `C:\Users\krams\code\DamGoodMaps`, its branches
  in worktrees) builds everything except the page and the renderer, orchestrates sub-agents, runs probe batches, and owns
  the decision numbers, STATUS and HANDOFF.
- **Forces play** (Claude Code; works only in `C:\Users\krams\code\DamGoodMaps-forces-play`, by path) owns `src/render3d/`
  and the forces' playback, and takes the renderer-side parts of the order.
- **The page session** is stopped (`DamGoodMaps-page`). **Codex** works in its own clone on `investigation/<name>`
  branches when Kyler starts it.

## What reaches Kyler

Never code. Engineering, tests, performance, fixes, merges, wording and "is this good enough" are the sessions'. He is
pinged (a `needs-kyler` issue; the label's ntfy workflow reaches his phone) only for:
- design direction his recorded decisions don't settle (D484);
- anything irreversible or destructive (history, branches with unmerged work, force-pushing `main` or `dev`, the licence,
  anything that harms the site's users), secrets, security or money;
- something only his accounts can do that blocks all work (#377, the merge-queue ruleset, blocks nothing);
- usage about to stop everything with work unfinished.

A permission prompt that refuses a session's action is his to clear: one line to him naming the session and the words to
type.

## Kyler's standing rules and preferences

- **Brutal honesty.** Say when something is fluff, overengineered or wrong; praise only what earns it. Look at captures
  before judging them.
- **No excess checks (D454),** above every other rule on checks. **Compute is a resource (D316–D318):** effort matches the
  stakes; quality is never compromised. Haiku for mechanical work, Sonnet for specified building, Opus for judgment (D484).
- **Quick checks before merge, the rest after (D341, amended 2026-10-15).** Nothing merges into `dev` with its quick
  checks red; the browser specs and suites run on dev's tip after the merge and are fixed forward at once. No test stays
  known-flaky: the cause is found.
- **A headless core (D342), tooltips (D351), a force always has a visible effect (D356), only the player places objects
  (D368), the first land shown is the map (D348), edits never replay onto new land (D336), speed (D453), the Rust order
  (D381), no old-project compatibility until launch (D475), AGPL v3 or later (D379).**
- Generated maps stay byte-identical unless a step means to change them.

## Lessons

From the planning chat (to 2026-10-14):
1. Judge every option against Kyler's recorded decisions; the tempting fix can reverse one he made on purpose (D476 → the
   right answer was D480).
2. Read the code before passing on another session's claim.
3. Read what a probe batch plays before it runs (D483 came from a batch that replayed old maps).
4. A test that passes by moving its spot can hide a player-facing bug (Erupt showing no lava broke D356). Ask what the test
   was catching.
5. No measuring for its own sake (D454).
6. A prompt that starts a session or names a folder uses the repo's real folder names and says what to do if a step it
   depends on hasn't happened. A restarted session has no memory: it needs a complete prompt.
7. A layout change that adds room is shown as a mockup with its cost named before it's built; judge the whole look, not
   only the rule asked about.

## Codex prompts

GPT-6.1 Sol at high by default; GPT-6 Astra at high for look work. Prompts start with HARD RULES: push one named branch and
open one PR; no merges, approvals, auto-merge, other branches, tags or releases; its own folder only; large results out of
git (D195, `investigation/README.md`); original or clearly licensed assets; a `git diff` check before the PR; "don't wait
for my replies". Each branch gets an INTEGRATION.md, shared-code findings reported separately.

## Where things live

What's in flight: `docs/STATUS.md`. How things are run: `docs/HANDOFF.md`. The order of work: the top of `ROADMAP.md`.
Decisions: `docs/decisions/README.md` (the next free number is in STATUS; only the milestone hands them out). History:
`docs/archive/`. Coordination: #236. Progress log: #57.

## Ideas parked for later

- **Hosting on Cloudflare Workers with Static Assets:** multi-core water needs isolation headers GitHub Pages can't set,
  and collaborative editing needs a small function for the room code and the relay's credentials (D431).
- **Co-op starts:** an idea only, nothing decided.
