# Juice investigation

Started from `dev` at `4f1b8c6`. All changes belong to this folder.

## Decisions

- Follow EDITOR_PLAN's quiet interface and PLAN §20 D181, D184, D205 and D212:
  action sounds on at 22%; water ambience off. The user's publishing and folder
  rules override the repository's milestone release and living-doc instructions.
- Use only original procedural synthesis in a Web Audio AudioWorklet. No audio
  assets, recordings, downloads, dependencies or game sounds.
- Use one sustained texture per stroke, with smooth changes in pressure and
  distance. Force sounds have phases so the eventual core can drive their timing.
- Keep this a standalone proposal. The milestone session owns editor integration.
- Use a separate local checkout because the original workspace has unrelated
  untracked investigations that overlap current dev. Those files stay untouched.

## Steps

1. Read project guidance, choose the audio architecture and create this isolated
   package. The demo will run with `npm --prefix investigation/juice run demo`.
