# The roadmap canvas

A standalone page for planning: the roadmap's steps as cards, the order of work as written, a map of what follows what,
the releases, how a change travels from a decision to the live site, and where the cards drift from the documents. It is
a reading tool for Kyler, not part of the site, the generator or the editor: nothing here is imported by `src/`, and it
never changes a document.

## Run it

```bash
node tools/roadmap-canvas/extract.mjs
```

reads the documents and writes `data.js`; then open `tools/roadmap-canvas/index.html` in a browser (double-click works).
`node tools/roadmap-canvas/serve.mjs --extract` does both and serves the page at <http://localhost:4811/>.
`--offline` skips GitHub.

## Where the data comes from

| Source | What it gives |
|---|---|
| `ROADMAP.md` | Every open step: its summary, **Delivers**, **Blocking**, **Information**, effort, in-game check, decisions and PRs cited; "The order of work" as phases and items. |
| `docs/archive/roadmap.md` | The finished steps' text, for the released cards. |
| `docs/STATUS.md` | The in-flight tables (branch, PR, worktree, state), the Codex investigations, the sessions, what waits for Kyler, the release gate, what is queued. |
| `PLAN.md` §20 | The decisions in force by topic and their text (hover a D-number), and the next free number. |
| `docs/decisions-pending.md` | The defaults still waiting for Kyler. |
| `docs/PERFECT.md` | The yardstick, in the "How it works" view. |
| `git` tags | Every `*-done` tag with its date: what is released and when. |
| GitHub (`gh`, optional) | Each PR's state (open, draft, merged, closed) and the latest Progress log entries (#57). |
| `manifest.json` | The cards themselves: id, title, lane, tag, branch, PRs, what each follows, and how to find its ROADMAP section and STATUS row. |

A card's status is derived, in this order: its tag exists → **released**; the manifest fixes it (parked, deferred, later,
ongoing, or released without a tag) → that; its STATUS row says parked, merged or in flight → that; one of its own PRs
is open → **in flight**, merged → **built, not released**; otherwise **planned**.

## Keeping it current

- When ROADMAP gains a step, add a card to `manifest.json`: an `id`, `title`, `lane`, the `roadmap` regex that finds its
  heading, its `tags`, `branch`, `prs`, `after` (the cards it follows) and `order` keywords (how "The order of work" names
  it). The **Health** view lists every section, tag and STATUS row no card covers, and every STATUS row GitHub contradicts.
- Rerun the extractor whenever the documents change; `data.js` is a snapshot committed so the page opens without running
  anything.
- The manifest is the only hand-kept file. Keep it high level: one card per step or group, not one per bullet.

## Using it in another project

The canvas reads any repository whose planning documents follow [SPEC.md](SPEC.md) (the planning interface: a plan with
numbered decisions, a roadmap with the order of work and one section per step, a status page, a tag per release).
[CONVERT.md](CONVERT.md) is the prompt to give Claude in that repository: it turns an existing plan into that shape and
writes the manifest from [templates/](templates/). `manifest.json`'s `config` names the project, the owner, the file
paths, the decisions section, the decision prefix and the tag suffix, so nothing in the code is Dam Good Maps-specific.

## Files

`manifest.json` (the cards and the config), `extract.mjs` (the reader), `index.html` (the page, no dependencies),
`serve.mjs` (a static server), `data.js` and `data.json` (generated), `SPEC.md` (the planning interface), `CONVERT.md`
(the conversion prompt), `templates/` (the documents and manifest to fill).
