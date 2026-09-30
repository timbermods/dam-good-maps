# CLAUDE.md

> **Kyler's standing rule, read before any task (PLAN §20, D316): compute is a resource, effort matches the stakes,
> and quality is never compromised.** It applies to every session, agent and investigation, and to prompts from the
> planning chat and Codex.
>
> - **Invest in what compounds:** shared modules (the forces core, the drainage and source logic, the grouped-sources
>   rule), findings later work builds on (the official maps' measurements, the game's rules, why a round failed),
>   kept concise and easy to find, and the project's history. Build shared modules, not one-offs.
> - **Spend little on what doesn't:** one-off reports, captures and tables made for ceremony, re-verifying by hand
>   what's already verified, speculative edge cases, measures no decision uses.
> - **Cheap automated checks stay broad** (CI, random-gesture sweeps, batch checks, probe comparisons). What's cut is
>   agent time, not safety nets.
> - **Deep verification only where failure is expensive and hard to see:** the water matching the game, files the
>   game loads, saved projects opening, determinism behind share links, release gates. Elsewhere prove the idea and
>   the feel, and get it in front of Kyler's eye quickly.
> - **Reports are short:** what changed, what falls short, the numbers a decision needs, the findings worth keeping.
>   A measure that drives no decision is information at most, never a target.
> - Before any report, measurement or manual check, ask: will it be used again, or does it change a decision or what
>   the player gets? If neither, skip it. If a prompt asks for more, do it, and say in one line if it seems out of
>   proportion.
> - **Models (D317, D318):** the cheapest model and effort that does the job, per HANDOFF §7's table; xhigh only for
>   genuinely hard work. Sonnet 5.5 for well-scoped work with a clear spec and a way to check it (bug fixes, feature
>   iterations with clear acceptance, documents, reviews, repeated agent tasks, design polish). Opus 5.5 for complex
>   judgment and long-horizon work (the generator's character, the water and 3D engines, the forces' feel and new
>   forces, redesigns, orchestration). Nothing on Opus moves.
> - **Real checks:** when you change code that can be run, built or type-checked, run a real check that exercises
>   the change before reporting it done. If none can run, say which and why.
> - Downscale screenshots and captures before a model reads them, unless the detail is what's being judged.

> **New milestone session? Read [docs/HANDOFF.md](docs/HANDOFF.md) first.** It says what's in flight, the order of
> work, how things are run here, and the machine the session runs on (resumed 2026-09-26 on a dedicated computer).

> **The yardstick for every review: [docs/PERFECT.md](docs/PERFECT.md)** (what perfect means, D225). Only "plays exactly
> right", "what you see is what you get" and the starting-logs floor are absolute; the rest is judged by Kyler's eye.

Dam Good Maps: a map generator for Timberborn. The README says what the repository holds.

## Standing rules

- **The editor's architecture (PLAN §20, D342):** every change to a map is an operation in `ops.schema.json`, in plain
  terms, validated and rejected with a one-line reason, never silently clamped; all editing logic lives in `src/core/`
  and runs headless in Node (`src/editor/` turns input into operations and shows results); every question the editor
  answers is a plain core function returning plain data; contract tests exercise the core directly. Apply it to
  everything new; fix older code that breaks it when next touched.
- Before any editor work, read `EDITOR_PLAN.md`. It opens with the editor's vision (Kyler's decisions, PLAN §20
  D158, D179–D188); what it lists as superseded must not come back.
- Docs are part of done (PLAN §20, D188):
  - any change that alters how something works updates its living document in the same PR (`EDITOR_PLAN.md` for
    the editor, `PLAN.md` for the product, `ROADMAP.md` for steps, `CLAUDE.md` for the rules, `docs/STATUS.md`
    for the current state); a PR that changes behaviour without its doc isn't finished;
  - at every milestone boundary, skim the living docs against what was just built, fix any drift, and note it
    in the progress log;
  - retired terms (`tools/retired-terms.json`) must not reappear in the living docs, the interface text or the
    editor code; CI flags them. Add a term when a feature is retired;
  - `docs/README.md` says which documents are living and which are history. History (progress logs,
    investigations, the decision log) stays as written; mark superseded parts, never rewrite them.
- Investigations commit reports, code, small samples and a few captures. Large generated results (bulk JSON,
  thousands of files, anything over a few MB) stay out of git: in `investigation/<name>/local/` (gitignored) or
  attached to a GitHub Release, with the report saying how to regenerate them (PLAN §20, D195). Don't rewrite
  history for what's already merged. Every investigation prompt, for Claude or Codex, includes this rule; the
  text to paste is in `investigation/README.md`.
- Claude never launches or drives Timberborn, with one exception: the DGM Probe runner may launch it for an
  automated probe batch, but only after asking Kyler explicitly and getting Kyler's yes in chat, every time (PLAN
  §20, D117).
  - Before each batch, ask in one message: how many maps, which checks, roughly how long it will take, and that it
    will launch Timberborn. Wait for the yes. Never treat an earlier yes as covering a new batch.
  - Once Kyler says yes, the batch runs unattended to the end.
  - Never while Timberborn is already running; never touching Kyler's saves, settings or other mods (probe games
    never autosave into Kyler's folders, and any file they create is removed afterwards); and only when no other
    heavy work is running on this machine.
  - While waiting for the yes, carry on with any work that doesn't need the batch.
  - **Exception, on the dedicated machine only** (PLAN §20, D218): on the computer kept for this work
    (docs/HANDOFF.md, "This machine"), a batch may run whenever the plan calls for one, without asking.
    The other rules above still apply, and every batch and its results go into `docs/STATUS.md`.
- Progress log (D221): add a short, plain comment to the "Progress log" issue
  ([#57](https://github.com/timbermods/dam-good-maps/issues/57)) each time a step finishes, something is
  released, a probe batch runs or something is parked for Kyler: what happened, links, what's next.
- Never touch installed mods or saves otherwise. The maintainer (Kyler) tests in game himself.
- At every milestone or step that changes generated maps, commit one small contact-sheet image to
  `docs/sheets/<step>.png`: seeds 1–30 of every built theme at 128², top-down, each labelled with its seed and
  theme; our own generated maps only; under 1 MB (PLAN §20, D144). Design version 2's prototypes get one too.
- When a test still passes but no longer checks what its name says, because a decision of Kyler's changed the
  thing it tested, update it to check the current decision, rename it if needed, and note it in the progress
  log. No need to ask first. Never weaken a test to make it pass.
- Dependency updates: merge GitHub Actions updates and minor or patch npm updates when CI is green (CI's byte
  checks catch anything that changes a map). Hold major upgrades (TypeScript 7.0, @types/node 26, and any future
  major) for a deliberate upgrade step at a quiet time, such as housekeeping (ROADMAP.md, "Housekeeping"; PLAN
  §20 D283), with the full nightly suite; never mid-milestone. Dependabot groups its updates into one weekly pull
  request per ecosystem.

## Writing README and website text

Kyler, 2026-09-24: "simplicity and elegance is effective and desirable." Every change to the README, the website
text and the player docs follows these rules. Plans, audits and design documents are working documents, not player
text.

- **Write for a Timberborn player** who wants to make and play a map. Developer detail goes in the plans or a
  developer doc; link to it rather than repeating it.
- **Short.** One idea per sentence, most under about 20 words. A paragraph or FAQ answer is one to three sentences,
  a troubleshooting answer a few numbered steps.
- **Lead with the action.** Paths and steps as arrow chains; on-screen labels in bold, exactly as they appear.
- **Say each thing once**, where a player would look for it; link to it elsewhere.
- **Plain words.** No internals (class names, ids, formats) unless the player needs them to act.
- **Cut** filler, repeated caveats, edge cases a player won't meet, and history ("since …", "no longer", older
  builds). Describe the tool as it is now.
- **Check every fact against the code** before writing it; plans and changelogs lag.
- **Keep, briefly:** credits, the unofficial line, the status, and safety facts.
- **Reread as a new player before publishing.** Every step works as written, and nothing is said twice.

## Deploying

- Work happens on `dev`. The site is GitHub Pages, deployed from `main`: https://timbermods.github.io/dam-good-maps/
- A release merges a tag into `main`, never dev's tip, and always as a merge commit. After a milestone is tagged
  `mN-done` and its full check passed, merge that tag into `main` through a PR.
- After every deploy, the live check (`.github/workflows/live-check.yml`) must pass. It runs after each deploy and
  daily; `gh workflow run live-check.yml --ref main` runs it by hand. If it fails, revert the release merge on
  `main`, confirm the old site is back, and report.
- The site stays noindex and unannounced until launch. Launch needs versioned deploys (moved to Later, PLAN §20
  D285) and Kyler's go-ahead; then set the repository variable `DGM_PUBLIC` to `true`.
- Steps outside the milestones are released the same way:
  - the design pass (straight after Kyler's editor UI audit of the combined page, D236) is tagged `design-done` once Kyler has
    approved and merged it on `dev`;
  - Map look (after M8, before M9) is tagged `map-look-done` once Kyler approves the look, or ships inside the M9
    release;
  - Real places (right after Map look) is tagged `real-places-done`;
  - Live editing is tagged `live-editing-done` once Kyler says it feels right; its preview is built from its
    branch into `/preview/` (noindex) by the deploy workflow;
  - Save to Timberborn is tagged `save-to-timberborn-done`, and Pick a place `pick-a-place-done`;
  - the start and edge rules are tagged `start-edge-rules-done`; the Real places second round
    `real-places-2-done`; contaminated ground as a layer `look-contamination-done`, once Kyler approves it;
  - the Map look fixes, once Kyler approves each: badwater blending `look-badwater-done`; mine sites and ruins
    `look-mine-ruins-done`; waterfalls `look-waterfalls-done`;
  - Map look 2 (the High look; right after the forces' release, alongside "The page is the editor"; folds in the
    Frame pass's touch-up, PLAN §20 D283–D284) is tagged `map-look-2-done`;
  - the four terrain-above-terrain steps (PLAN §20 D279–D281, D286; ROADMAP.md, "Terrain above terrain"): 1
    Foundations `3d-foundations-done`, 2 the view `3d-view-done`, 3 creating them `3d-creating-done`, 4
    generation `3d-generation-done`;
  - the Weather view (Drought and Badtide day by day, at the end of finishing the editor, after "The page is the
    editor"; PLAN §20 D285, D349) is tagged `weather-view-done`;
  - the refinement phase is cut (PLAN §20 D283): its remaining items are housekeeping, released with whatever
    step ships them, no tag of its own.
- When dev changes `deploy.yml`, keep its noindex step.
- The deploy workflow can publish a branch at `/preview/` (noindex): run it by hand with `preview_ref=<branch>`
  (Live editing's preview, refreshed after every iteration). Small changes to the deploy workflow itself are
  released as their own tag, like `preview-workflow-done`.
- Tokens and secrets are Kyler's to create and store with `gh secret set`. Never ask Kyler to paste one into chat.
- Kyler has said Claude may merge tagged releases into `main` and manage the Pages setting.
