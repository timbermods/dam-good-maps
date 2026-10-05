# The roadmap canvas

A planning page for Kyler: what needs him, what is in flight, the roadmap's steps as cards, the order of work, a map of
the steps over time and the releases. It is a reading tool, not part of the site, the generator or the editor: nothing in
`src/` imports it, and it never changes a document or anything on GitHub.

## Open it

Open `tools/roadmap-canvas/index.html` in a browser, straight from disk. Nothing to run or install. It reads everything
live when it opens and again every 5 minutes while it is visible. It is also published from `dev` at
<https://timbermods.github.io/dam-good-maps/roadmap/>, and works on a phone in portrait: one column, the views in two
rows.

## Views

- **Needs you:** every open pull request and issue labelled `needs-kyler`: its title, which session, its latest comment
  or else its text, a link. One line when nothing needs him.
- **In flight:** open pull requests grouped as approved and waiting to merge (`approved`), held (`hold`), investigations
  (`investigation/` branches) and the rest; what merged in the last 24 hours; the latest messages on the open
  issue titled "Coordination".
- **Board:** a card per `##` section of ROADMAP.md and per `*-done` tag no section claims, in columns Released · Built,
  not released · In flight · Planned, in order · Ongoing · Parked or deferred · Later. Click a card for its details.
- **Order of work:** ROADMAP's "The order of work" as written, each item tied to the cards it names.
- **Map:** released steps by date, then what is in flight, then the planned steps in the order of work.
- **Releases:** every `*-done` tag by date, and the next release: STATUS's release gate, what is in flight, the queue and
  PERFECT's sections.

## Where the data comes from

| Source | Read from |
|---|---|
| `ROADMAP.md`, `docs/STATUS.md`, `docs/PERFECT.md` | `dev`, on raw.githubusercontent.com |
| The decisions | `docs/decisions/README.md` and the topic files it links, when it exists on `dev`; else `PLAN.md` §20 |
| Pull requests, issues, labels, comments, tags | GitHub's public API, without a token unless one is saved |

A document that can't be read, or whose shape has changed, shows one line at the top saying which; the rest of the page
carries on, using what that document said last time.

**A card's status:** a heading that says parked or deferred, "Later" or "Housekeeping" decides it; then its tags (all
exist → released); then its STATUS rows (parked, merged into dev, else in flight); then an open pull request it cites
(investigations don't count); else planned, in its place in the order of work. A card finds its STATUS rows and order
items by the words of its heading before any colon, comma or parenthesis, so a new ROADMAP section appears with no edits
here.

**GitHub's limit:** 60 requests an hour per address without a token, shared by every page open on it (both machines,
when they share a connection). The page reads everything every hour and only what changed in between (one request per
refresh), keeps that in the browser between visits, reads each tag's date once, reads nothing while hidden, and slows
down when the allowance runs low. What needs Kyler comes from GitHub's search on every refresh, which has an allowance of
its own, so Needs you matches GitHub within one refresh. A request with no answer in 20 seconds is dropped, so a
refresh always finishes.

**A GitHub token (optional)** lifts that limit and refreshes every 2 minutes: **GitHub token** in the header, paste,
**Save**; it stays in this browser and goes only to api.github.com. Make it at GitHub → **Settings** → **Developer
settings** → **Fine-grained tokens** → **Generate new token**: **Public repositories (read-only)**, no permissions.

## Settings

The `CONFIG` block at the top of `index.html`'s script: the project's name, the repository and branch, the documents'
paths, the decision prefix, the tag suffix, the three labels, the Coordination issue's title and the refresh interval.

## Using it in another project

The page reads any public repository whose planning documents follow [SPEC.md](SPEC.md). [CONVERT.md](CONVERT.md) is the
prompt that turns an existing plan into that shape, from [templates/](templates/). Change `CONFIG` and open the page.
