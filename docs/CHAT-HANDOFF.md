# Chat handoff: how Kyler and his planning chat work

Written 2026-10-02 for a new planning chat in claude.ai. Read this first, then `docs/PERFECT.md` (the yardstick),
`docs/STATUS.md` (what's in flight and what waits for Kyler), `EDITOR_PLAN.md`, `docs/decisions/README.md` (the decisions in force: the index) and
`docs/HANDOFF.md`, all from github.com/timbermods/dam-good-maps (public). The previous versions are in
`docs/archive/chats/` (the last, 2026-10-02, is the one before the document prune). Past planning chats are searchable: use
them for detail on any decision.

## Roles

- **Kyler** (he/him) decides everything; his eye is the final judge. A one-person passion project with no launch date:
  realising his vision matters more than speed.
- **The planning chat** (claude.ai) is his advisor and reviewer. It reads the repo, branches, PRs and captures itself, gives
  brutally honest and specific feedback, and writes the exact prompts he sends elsewhere.
- **Three Claude Code sessions** work at once: the milestone session, the page session and the renderer session. The renderer
  session shares `src/worker/session.ts`, `src/editor/waterPlayer.ts` and `src/editor/waterJourney.ts` with the milestone
  session (HANDOFF §2's rule applies: small changes there, Kyler told before large ones). `Editor.tsx` and its split files
  are the page session's alone.
- **The milestone session** (Claude Code, Opus 5.5, high; the main clone `C:\Users\krams\code\DamGoodMaps`) is the only
  session that changes `dev`, merges and releases. It
  does everything except the page: the core, the water, the generator, the editor-core items, the Codex adoptions and the
  documents. It orchestrates sub-agents, records Kyler's decisions in `docs/decisions/`, and logs one line per event on the Progress
  log issue (#57). It runs on the dedicated machine (`docs/HANDOFF.md`, "The machine").
- **The page session** (Claude Code, Fable 5.1, high; D388) does only "The page is the editor" and its design (D384), in its
  own worktree `C:\Users\krams\code\DamGoodMaps-page` and branch `feature/page`, started fresh from `dev` (D395), with Kyler's sittings at each checkpoint. The
  `/preview/` slot is its while it works (D396). It builds the first-visit map picker and parallel loading; the milestone
  session builds the startup service worker (D397). Neither session touches the other's
  files; the page session records its decisions in its own `DESIGN.md` and `docs/progress/page.md`.
- **The renderer session** (Claude Code, Opus 5.5, high, on Kyler's PC; D398) works on its own branches off `dev`. Moving
  water, the Flow view and renderer R1 are merged (#165, D446). Its current work: the quick-click PR (post-release items 1
  and 2), then D371 and D374, playback only. The milestone session
  merges each PR when CI is green (D453).
- **Codex** builds prototypes and audits on its own `investigation/<name>` branches. The milestone session merges them into
  `dev` as investigations, and adopts them on Kyler's yes.
  On Kyler's PC, Codex works only in its own clone, never in the renderer session's checkout.

## Models (D389)

The milestone session runs on Opus 5.5 at high. The document prune and mechanical work touching layout or other work's tests
go to Sonnet 5.5 sub-agents at high; self-contained mechanical work to Sonnet 5.5 at medium. Never Fable unless Kyler asks
(he has, for the page session and the coherence review, D386); never raise a model's effort on one's own; never start
sub-agents at max. The table is in `docs/HANDOFF.md`, "Models and agent definitions".

## Kyler's standing rules and preferences

- **Brutal honesty.** Say when something is fluff, overengineered or wrong; praise only what earns it. Look at captures before
  judging them. Report what fell short as plainly as what worked.
- **Prompts stand alone.** Code blocks are the exact text Kyler sends; prose is for him. Each prompt says where it goes and
  needs nothing from the chat to make sense. A prompt is never assumed sent until Kyler says so.
- **No excess checks (D454), above every other rule on checks.** No excessive tests, timings or validation, only when genuinely
  necessary or when Kyler asks; CI, the nightly suite, bug-catching checks and a real check before "done" stay.
- **Compute is a resource (D316–D318).** Effort matches the stakes; quality is never compromised. Invest in what compounds;
  spend little on ceremony. The cheapest model and effort that does the job; a real check before anything is reported done;
  short reports.
- **The test for every document, section and rule (D390):** does it change what gets built, or how? If not, it goes.
- **Pings (D332).** The session pings Kyler the moment his decision, eye or yes is needed, never for progress.
- **Green before merge (D341).** Nothing merges into `dev` red, ever. No test stays known-flaky: the cause is found.
- **The release gate (D385).** The water and the editor's core must be perfect before the next release; anything Kyler finds
  in them blocks it. Then a coherence review (D386).
- **A headless core (D342).** Every change to a map is an operation; all editing logic lives in `src/core/` and runs without
  the page; every refusal gives a one-line reason; contract tests exercise the core.
- **Tooltips (D351, D361, D368).** A short purpose phrase with the shortcut as a small key cap at the end; no second
  sentence, no key in brackets.
- **A force always has a visible effect (D356)** wherever it's used, even at Power 0 (the gentlest visible effect).
- **Only the player places objects (D368 (10)).** No force, brush or edit adds an object; problems go to the checks.
- **The first land shown is the map (D348, D370).** Every shaping step finishes before the land is shown; only water and
  D350's small outlet wear may follow.
- **Edits never replay onto new land (D336).** One key habit for every tool: F (or `{ }`) is Size, `[ ]` or F+scroll is
  strength (D368 (1), (11)).
- **Before a release, fix only what's wrong;** polish comes after, in its own step.
- **Speed (D453).** Kyler judges speed by using the tool; something that feels slow is a bug. No quiet windows or timing gates.
- **The Rust order (D381).** The exact core moves to Rust, each port byte-identical and tagged before its TypeScript is
  deleted: water, the five forces, their planning and the checks, new forces directly, the generator, perhaps the editor's
  operations. The interface and rendering stay in TypeScript.
- **No outside users for now (D382).** Only Kyler uses it: no compatibility constraint on old share links, seeds or project
  files; re-pin freely. His own saved maps and projects keep opening or convert automatically.
- **The licence is the AGPL v3 or later (D379);** versions before 2026-10-01 stay MIT.
- **Probe batches** (the only way Timberborn is launched) need Kyler's yes in chat every time on any machine but the dedicated
  one (D117, D218).
- Kyler batches hands-on reviews into single sittings: collect what's ready on the preview and give him one checklist of
  only what changed.

## How sessions coordinate (D470)

- Kyler reviews no PR or code, only design, taste and human-facing behaviour; the milestone session reviews every diff.
- PR labels: `hold`, `needs-kyler`, `approved`. A PR that changes what a player sees, hears or feels needs approved; the
  rest merges on review and green CI. Theme rounds are real PRs into dev, re-pin included; Codex stays on investigation branches.
- Sessions talk on the Coordination issue ([#236](https://github.com/timbermods/dam-good-maps/issues/236)), not through Kyler.
  Kyler only decides what a player sees, hears or feels, new direction, rules, adopting Codex work, releases, probe batches,
  spending usage, and anything unsure. Pings reach his phone too.
- Everything waiting on Kyler carries `needs-kyler`: the PR, or a small issue for a question without one. One GitHub list shows it all.
- Reports to him are at most about eight lines plus the sheet or link. A decision gets a number only if it's a rule.

## Codex: models and prompts

- **GPT-6.1 Sol at high** is the default: force demos, physics, audits, performance and architecture work. **GPT-6 Astra at
  high** is for look work, where its judgment has the track record. Choose by the kind of work.
- Codex prompts start with HARD RULES: the authorization to push one named branch and open one PR; no merges, approvals,
  auto-merge, other branches, tags or releases; work only in its own folder; large generated results out of git (D195, the
  text in `investigation/README.md`); original or clearly licensed assets only; a `git diff` check before the PR; "don't
  wait for my replies". Each branch gets an INTEGRATION.md for adoption.
- Shared-code findings are reported separately from a prototype's own shaping, so Claude's agent fixes each once.

## Where things live after the prune (D390)

- **What's in flight, the Codex PRs and what waits for Kyler:** `docs/STATUS.md`. **How things are run:**
  `docs/HANDOFF.md`. **The order of work, the post-release list and the Codex adoptions with Kyler's verdicts:** `ROADMAP.md`.
- **The decisions in force:** `docs/decisions/README.md` (the index; one file per topic); the full table as it stood at D390 is in `docs/archive/decisions.md`.
- **History** (progress logs, old handoffs and chats, feedback files, the story of the project): `docs/archive/`, its README
  is the index; `investigation/README.md` indexes the investigations. `docs/README.md` maps every document.
- **Open pending defaults:** `docs/decisions-pending.md`. **Findings:** `docs/FINDINGS.md`. **Terms:** `docs/GLOSSARY.md`.
- **The next free decision number is D473.**

## How the planning chat checks in

`git fetch` the repo (all branches), read `docs/STATUS.md`, the Progress log issue (#57), recent commits and open PRs, and
view captures with `git show`. Prefer git over the GitHub REST API, which rate-limits quickly from shared addresses.

## Ideas parked for later

- **Hosting on Cloudflare Workers with Static Assets:** two reasons now. Multi-core water needs the isolation headers
  GitHub Pages can't set (today's plan is a service worker), and collaborative editing needs a small function for the room
  code and the relay's credentials (D431).
- **Co-op starts:** an idea only, nothing decided.
