# The editor's sounds: provenance

These recordings are the editor's sounds in Live editing (PLAN §20 D226), from Codex's second
sound round (`investigation/juice-2`, PR #64, merged at ecfbafe): `audio/<id>.mp3` and `bank.json`
(every file's source, author, licence, edits, byte count and SHA-256). The editor plays them
through `src/editor/juice/` (the round-two engine, ported). They load on the player's first click
or key, never with the page. `tests/unit/juiceSounds.test.ts` checks each file against its hash
here.

**D313 (2026-09-28):** every file was checked against its original recording and re-encoded from
192 to 256 kbps MP3, still mono at 48 kHz: at 192 kbps a reconstruction-error measurement against
each clip's pre-encode signal (the same one `build-bank.py` computes, before quantization) showed
roughly 27–30 dB of encoding noise across every recording (impacts, splashes and the three friction
beds alike); 256 kbps cut that error by 10–40 dB for a modest size increase (818,400 to 1,090,848
bytes, 0.78 to 1.04 MiB total — still four files at a time on the player's first gesture). The crop
points, trims, gains and bed assembly are byte-for-byte the same as the round's own
`build-bank.py`; only the final encode's bitrate changed. `tools/reencode-sounds.py` (repository
root) reproduces this pass from the same CC0 sources; `investigation/juice-2/` (its own 192 kbps
`bank.json`, audio and this note as first written) is left exactly as PR #64 merged it, since
`investigation/` is history (docs/README.md). This file now describes the shipped copy as it is;
what follows below the sources table is the round's own text, amended only where noted.

## Sound provenance

Every recording shipped here is **CC0 1.0**. No attribution-only, non-commercial,
game-extracted or ambiguously licensed recording is included. Credits are kept
for traceability, not because attribution is a condition. Licence checked on
26 September 2026: [CC0 legal text](https://creativecommons.org/publicdomain/zero/1.0/legalcode).

## Sources and authors

| ID | Author | Primary source / licence evidence | Download used |
| --- | --- | --- | --- |
| K | Kenney | [Impact Sounds, CC0](https://kenney.nl/assets/impact-sounds); archive's License.txt also explicitly grants CC0 | [Impact Sounds 1.0 ZIP](https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip) |
| I | Independent.nu | [35 wooden cracks/hits/destructions, CC0](https://opengameart.org/content/35-wooden-crackshitsdestructions), uploaded by qubodup, author credited as Independent.nu | [7z archive](https://opengameart.org/sites/default/files/independent_nu_ljudbank-wood_crack_hit_destruction.7z) |
| E | ezwa (pdsounds.org) | [6 Short water splashes, CC0](https://opengameart.org/content/6-short-water-splashes), uploaded by qubodup, author credited as ezwa | [7z archive](https://opengameart.org/sites/default/files/ezwa-water_splash.7z) |
| T | TinyWorlds | [Boiling water loops, CC0](https://opengameart.org/content/boiling-water-loops); author recorded a cooking pot | [OGG](https://opengameart.org/sites/default/files/cooking_with_cover_01.ogg) |
| W | Tom_Kaszuba | [Waterfall sound, CC0](https://freesound.org/people/Tom_Kaszuba/sounds/660255/); Sony PCM-D100 field recording | [Public HQ MP3 preview](https://cdn.freesound.org/previews/660/660255_11673893-hq.mp3) |
| B | SamsterBirdies | [Large explosion, CC0](https://freesound.org/people/SamsterBirdies/sounds/592000/); recorded garage firecracker, layered and pitched by its author | [Public HQ MP3 preview](https://cdn.freesound.org/previews/592/592000_5487341-hq.mp3) |

The two Freesound inputs are public compressed previews, **not** the original
lossless recordings. The independent.nu filenames also identify an earlier MP3
generation. No claim of lossless mastering is made. No sign-in was needed.

## Every shipped sample

All outputs below are `audio/<id>.mp3`, mono, 48 kHz, **256 kbps** (D313; 192 kbps as PR #64 first
shipped it). Every row inherits the named author's **CC0** grant from the source table above. Exact
input/output SHA-256 hashes, byte counts, lengths, crops and gain adjustments are in
[bank.json](bank.json). Total: **1,090,848 bytes (1.04 MiB)**.

| Output ID | Source / author ID | Original recording(s) |
| --- | --- | --- |
| wood-a | K | impactWood_light_000.ogg |
| wood-b | K | impactWood_light_002.ogg |
| wood-body | K | impactWood_medium_001.ogg |
| wood-heavy | K | impactWood_heavy_000.ogg |
| earth-a | K | impactSoft_heavy_000.ogg |
| earth-b | K | impactSoft_heavy_002.ogg |
| leaf-a | K | footstep_grass_000.ogg |
| leaf-b | K | footstep_grass_002.ogg |
| stone | K | footstep_concrete_001.ogg |
| grit | K | impactMining_000.ogg |
| scrape | K | impactMining_004.ogg |
| metal | K | impactMetal_medium_001.ogg |
| tin | K | impactTin_medium_002.ogg |
| resonance | K | impactBell_heavy_000.ogg |
| crack-a | I | crack01.mp3.flac |
| crack-b | I | crack06.mp3.flac |
| splash-a | E | water_splash-01.flac |
| splash-b | E | water_splash-03.flac |
| bubbles | T | cooking_with_cover_01.ogg (local input name boiling.ogg) |
| waterfall | W | 660255_11673893-hq.mp3 (local input name waterfall.mp3) |
| boom | B | 592000_5487341-hq.mp3 (local input name explosion.mp3) |
| earth-bed | K | footstep_concrete_000–004.ogg |
| leaf-bed | K | footstep_grass_000–004.ogg |
| stone-bed | K | impactMining_000–004.ogg |

Impacts retain their attacks and original crest factors. One linear gain aims at
−19 dBFS in the strongest 100 ms, constrained by a −2 dBFS sample peak. Short edge
fades avoid clicks. The three beds overlap only the recorded friction tails,
using a fixed seed; they contain no generated noise. `investigation/juice-2/build-bank.py`
reproduces the original 192 kbps processing with NumPy and FFmpeg;
`tools/reencode-sounds.py` reproduces this file's own 256 kbps pass, identical otherwise. Neither
tool nor any package installation is needed to play the sounds. Source archives/build tools remain
ignored in `local/`.

Pitching, filtering, reversing (undo), envelopes and layering happen in Web Audio.
The little musical resonance is a recorded bell strike, never an oscillator beep.
The first-round comparison remains entirely procedural and uses its unchanged
files from `../juice/`; it contributes no recordings to this bank.
