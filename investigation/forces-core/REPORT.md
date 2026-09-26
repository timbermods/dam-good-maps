# Shared forces investigation

Work starts from dev at 4f1b8c6. Source commits are pinned in SOURCES.json.

## Decisions

- All changes stay in this directory. The four prototype branches are read-only references.
- Preserve the terrain algorithms and their seed arithmetic; extract common services around them.
- Keep the brush-first grammar and mode-first options rows. No editor changes or releases.
- New work explicitly includes Quake, overriding the older held-slot handoff for this investigation only.
- Large test output and baseline downloads stay in ignored local/.

## Steps

1. Read the project contracts, pin prototype sources, and isolate the investigation.
