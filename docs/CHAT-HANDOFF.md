# Chat handoff: how Kyler and his planning chat work

Written 2026-10-01 for a new planning chat in claude.ai. Read this first, then `docs/PERFECT.md` (the yardstick),
`docs/STATUS.md` (its summary for Kyler), `EDITOR_PLAN.md`, `PLAN.md` §20 (every decision, D1–D378) and
`docs/HANDOFF.md`, all from github.com/timbermods/dam-good-maps (public). The previous version is
`docs/chats/2026-09-27.md`. Past planning chats are searchable: use them for detail on any decision.

## Roles

- **Kyler** (he/him) decides everything; his eye is the final judge. A one-person passion project with no launch
  date: realising his vision matters more than speed.
- **The planning chat** (claude.ai) is his advisor and reviewer. It reads the repo, branches, PRs and captures
  itself, gives brutally honest and specific feedback, and writes the exact prompts he sends elsewhere.
- **The milestone session** (Claude Code, Opus 5.5 at high) is the only session that changes `dev`, merges and
  releases. It orchestrates subagents, records Kyler's decisions in PLAN §20, and logs one line per event on the
  Progress log issue (#57). From 2026-10-01 it runs on another machine (`docs/HANDOFF.md`, "Resume here").
- **Codex** builds prototypes and audits on its own `investigation/<name>` branches. The milestone session merges
  them into `dev` as investigations (only Codex's own commits when a branch started from an unreleased branch), and
  Claude's agents adopt them on Kyler's yes.

## Kyler's standing rules and preferences

- **Brutal honesty.** Say when something is fluff, overengineered or wrong; praise only what earns it. Look at
  captures before judging them. Report what fell short as plainly as what worked.
- **Prompts stand alone.** Code blocks are the exact text Kyler sends; prose is for him. Each prompt says where it
  goes and needs nothing from the chat to make sense. A prompt is never assumed sent until Kyler says so.
- **Compute is a resource (D316–D318).** Effort matches the stakes; quality is never compromised. Invest in what
  compounds (shared modules, findings, history); spend little on ceremony. The cheapest model and effort that does
  the job; a real check before anything is reported done; short reports.
- **Pings (D332).** The session pings Kyler the moment his decision, eye or yes is needed, never for progress.
- **Green before merge (D341).** Nothing merges into `dev` red, ever. No test stays known-flaky: the cause is found.
- **A headless core (D342).** Every change to a map is an operation; all editing logic lives in `src/core/` and
  runs without the page; every refusal gives a one-line reason; contract tests exercise the core.
- **Tooltips (D351, D361, D368).** A short purpose phrase with the shortcut as a small key cap at the end; no second
  sentence, no key in brackets.
- **A force always has a visible effect (D356)** wherever it's used, even at Power 0 (the gentlest visible effect).
- **Only the player places objects (D368 (10)).** No force, brush or edit adds an object; problems go to the checks.
- **The first land shown is the map (D348, D370).** Every shaping step finishes before the land is shown; only water
  and D350's small outlet wear may follow.
- **Edits never replay onto new land (D336).** One key habit for every tool: F (or `{ }`) is Size, `[ ]` or F+scroll
  is strength (D368 (1), (11)).
- **Before a release, fix only what's wrong;** polish comes after, in its own step.
- **Probe batches** (the only way Timberborn is launched) need Kyler's yes in chat every time on any machine but the
  dedicated one (D117, D218).
- Kyler batches hands-on reviews into single sittings: collect what's ready on the preview and give him one
  checklist of only what changed.

## Codex: models and prompts

- **GPT-6.1 Sol at high** is the default: force demos, physics, audits, performance and architecture work.
  **GPT-6 Astra at high** is for look work, where its judgment has the track record. Choose by the kind of work.
- Codex prompts start with HARD RULES: the authorization to push one named branch and open one PR; no merges,
  approvals, auto-merge, other branches, tags or releases; work only in its own folder; large generated results out
  of git (D195, the text in `investigation/README.md`); original or clearly licensed assets only; a `git diff` check
  before the PR; "don't wait for my replies". Each branch gets an INTEGRATION.md for adoption.
- Shared-code findings are reported separately from a prototype's own shaping, so Claude's agent fixes each once.
- **Quiet windows:** Codex's performance measurements need the machine quiet; the session pauses every heavy job
  for the window Kyler names.

## The milestone order (D349, as amended) and where each step stands

1. **Finish the editor as players will know it.**
   - **The forces: released** on 2026-10-01 (`forces-done`, #149; Kyler's yes, D375).
   - **Right after it** (not blocking): Carve's river born as it cuts (D371), Glaciate's 3.5 s timing (D374),
     startup part 1 (D367), the smoothness fixes (#107), Carve's Maturity (D355).
   - **M9b's release** (`feature/m9b`, #70): in progress, see below.
   - **The High look's release** (#75): approved (D346); released after the forces.
   - **The parity batch** (#95), then **"The page is the editor"** (#92, `docs/UI-BRIEF.md`), with startup part 2.
   - **The Weather view** (#73) with day stepping (D361), then **custom map sizes** (D357), closing step 1.
2. **3D, terrain above terrain:** foundations (#71), the view (Codex's proposal approved, D365), then Erode and the
   Block tool.
3. **Polish until mature:** Kyler's editor UI audit, the design pass, M13, and the 20-second live tour of the
   editor's best controls (D377).
4. **Collaborative editing** (`docs/COLLAB-BRIEF.md`, D362; the spike and architecture investigations are merged).
5. **M12** (Claude in the editor).

## Open items, with owner and next step

### The forces: released (2026-10-01)

Released as `forces-done` (#149) on Kyler's yes after all eleven D368 fixes passed on the preview (D375): the five
forces, one key habit, tooltips with key caps, cross-browser determinism (D366), only the player placing objects.
The public site shows them. **Next: the High look's release** (the milestone session's first task).

### After the forces release (owner: the milestone session, `build` agents)

- **Carve's water flows in as it cuts** (D371) and **Glaciate's Fast timing, 3.5 s with easing** (D374); both use
  the smoothness investigation's findings and its harness at 256².
- **Startup part 1** (D367): stored maps open without rebuilding, shader warm-up, checks after the first frame.
  Kyler tests on a real modest laptop once adopted.
- **Trees on dry soil say so** (D376): a hover hint ("Oak, grown · dry soil, will die") and a subtle mark with
  Markers on; never a change to the trees.
- **The smoothness fixes** (#107), once Kyler approves the investigation.
- **The faster water settle's speed** (D359, merged into M9b, byte-identical): still to be timed on a quiet machine.

### M9b (owner: the `m9b-build` agent; hand-over in `docs/progress/m9b.md`)

- **Adopted:** Codex's Islands, Delta and River Valley shaping, on the strict D348 base, with the shared fixes (the
  channel carved through planned lakes, channels sized for joined flow, the mine pair, river joins, one shared
  reading of the colony's reach).
- **Measured** (840 maps, seeds 1–40 of every theme; `feature/m9b` e292cefe): failing absolutes 2 / 0 / 0 at 96² /
  128² / 256²; first maps meeting all three outcomes 213 / 228 / 229 of 280. Lake Basin (12–13 of 20 at every size),
  and Canyon and Highlands at 96², are under two-thirds.
- **Failing maps and their plans:** the 96² start class (Any 31, Islands 4: no start with room for two mine sites;
  Highlands 14 passes only by luck, its starts' water moves). The dam walls are fixed. Still to try: keeping planned
  lakes at their planned level (the cleared floor lets water round the outlet), which may lift Lake Basin.
- **Held:** Canyon, Highlands and Lake Basin's prototypes (re-audit after the shared fixes; Lake Basin most worth
  a second Codex round) and the settings prototype (**Codex's round 2 starts from `feature/m9b` at a69c9f11 or
  later**; adopted last).
- **Open:** speed at 256² for Any, Canyon, Highlands and Lake Basin (profile first); the canyon measure's separate
  effect; the D148 re-pins; then the review set for Kyler's eye and one pooled probe batch (his yes).

### The High look (owner: the milestone session)

Approved on real maps (D346), one dry-earth tune done on its branch (#75). Released right after the forces.

## Codex investigations

| Investigation | PR | State | Still to decide |
|---|---|---|---|
| Determinism | #122 → #123 | merged; adopted on `feature/forces` (D366) | nothing |
| Startup | #127 | merged; approved (D367) | adoption in two parts; the laptop test |
| Collaboration spike and architecture | #109, #119 → #120 | merged (D362) | built at step 4 |
| 3D view | #116 → #117 | merged; approved (D365) | adopted at 3D step 2 |
| Deposit | #104 → #114 | merged; approved (D364) | adopted after the forces release |
| Landslide | #101 → #103 | merged, not adopted (D354) | nothing |
| Meander | #106 | merged, folds into Carve (D355) | Carve's Maturity, after the release |
| Rift, Erode, Block tool, flow arrows, High look, faster settle | merged | approved | adoption per ROADMAP |
| M9b theme audits (seven) | #143 | merged (D370): three adopted, four held | re-audits; settings round 2 |
| Smoothness (performance) | #107 (draft) | in flight; its 2–5 AM trial of 2026-10-01 awaits its result | Kyler's approval, then adoption |
| Multi-core water (parallel-water) | #130 (draft) | in flight, awaiting results | whether to adopt; hosting follows |
| Scaling to 512 | #132 (draft) | in flight; round 3 is on reopening | Kyler's look |

## Ideas parked for later

- **A Rust port of the water settle:** raise it when multi-core water reports, after M9b's release.
- **Hosting on Cloudflare Workers with Static Assets:** when multi-core water is adopted (GitHub Pages can't set
  the isolation headers; today's plan is a service worker).
- **Custom map sizes** (D357): end of step 1; curves checked at 512².
- **Collaborative editing** (`docs/COLLAB-BRIEF.md`): step 4.
- **Co-op starts:** an idea only, nothing decided.

## How the planning chat checks in

`git fetch` the repo (all branches), read the summary at the top of `docs/STATUS.md`, the Progress log issue (#57),
recent commits and open PRs, and view captures with `git show`. Prefer git over the GitHub REST API, which
rate-limits quickly from shared addresses.

**The next free decision number is D379.**
