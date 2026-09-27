# Juice, round two

Based on dev `9e5e73a`. Only this folder changes. The first round is retained
unchanged for comparison. The branch is `investigation/juice-2`.

## Decisions

- The new brief supersedes round one's quiet/synthetic direction. Use recorded
  CC0 foley, clear attacks, fuller bodies and a clearly audible default mix.
- Treat Balatro as a reference for responsiveness and musical satisfaction, not
  a source of assets or a sound to copy. Pitch runs climb a bounded pentatonic
  ladder and reset after a pause. They never speed up into a machine gun.
- Preserve natural high frequencies at close distance. Use distance filtering
  deliberately, rather than lowpassing the entire sound palette.
- No dependency or package install is needed to run the demo. All shipped audio
  is local, compressed and documented in SOUNDS.md. Downloaded source archives
  and temporary analysis belong in the ignored local/ directory.
- Use an isolated checkout to preserve unrelated files in the shared workspace.
  A delivery copy of this folder will make the requested demo command work there.
- Read EDITOR_PLAN's principles and juice decision, PLAN §20 (including D181,
  D184, D205, D212 and D220), docs/PERFECT, and the first-round code and proposals.
  Live editing stays responsive and forgiving. This is an integration proposal;
  the user's folder/publishing restrictions override milestone release rules.

## Steps

1. Establish the branch and sound direction; verify permissive recording sources.
2. Build 24 CC0 recording assets (818,400 bytes) with source/author/licence and
   SHA-256 manifests. Preserve attacks; balance gain without flattening dynamics.
