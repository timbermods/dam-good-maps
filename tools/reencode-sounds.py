"""Re-encode the shipped editor sounds at a higher bitrate (PLAN §20 D313). Requires numpy and
ffmpeg; never needed by the demo.

investigation/juice-2 is history (docs/README.md) and stays exactly as PR #64 merged it: its own
192 kbps bank.json, audio and SOUNDS.md are untouched. `public/sounds/juice-2/` is the living,
shipped copy the editor actually plays; this script re-renders it from the same CC0 originals at
256 kbps (measured against those originals: see the "Sounds" listening note in
docs/progress/forces.md) and rewrites its own bank.json and SOUNDS.md. Every crop, trim, gain and
bed exactly matches investigation/juice-2/build-bank.py; only the final MP3 encode's bitrate
changes.

Place the source downloads described in investigation/juice-2/SOUNDS.md in
investigation/juice-2/local/sources (the same cache build-bank.py uses). Set FFMPEG to an
executable, or install imageio-ffmpeg. No network access occurs here.

    python tools/reencode-sounds.py
"""
from pathlib import Path
import hashlib, json, os, subprocess, sys
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / "investigation/juice-2/local/sources"
OUT = ROOT / "public/sounds/juice-2/audio"
MANIFEST = ROOT / "public/sounds/juice-2/bank.json"
BITRATE = "256k"

if os.environ.get("FFMPEG"):
    FFMPEG = os.environ["FFMPEG"]
else:
    import imageio_ffmpeg

    FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
SR = 48000


def find(name):
    matches = list(SOURCES.rglob(name))
    assert len(matches) == 1, (name, matches)
    return matches[0]


def decode(path):
    raw = subprocess.check_output(
        [FFMPEG, "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"]
    )
    return np.frombuffer(raw, np.float32).copy()


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


# id, original filename, provenance group, crop start (seconds), maximum duration (identical to
# investigation/juice-2/build-bank.py's own list)
clips = [
    ("wood-a", "impactWood_light_000.ogg", "kenney", 0, 1.2),
    ("wood-b", "impactWood_light_002.ogg", "kenney", 0, 1.2),
    ("wood-body", "impactWood_medium_001.ogg", "kenney", 0, 1.4),
    ("wood-heavy", "impactWood_heavy_000.ogg", "kenney", 0, 1.5),
    ("earth-a", "impactSoft_heavy_000.ogg", "kenney", 0, 1.2),
    ("earth-b", "impactSoft_heavy_002.ogg", "kenney", 0, 1.2),
    ("leaf-a", "footstep_grass_000.ogg", "kenney", 0, 1.4),
    ("leaf-b", "footstep_grass_002.ogg", "kenney", 0, 1.4),
    ("stone", "footstep_concrete_001.ogg", "kenney", 0, 1.2),
    ("grit", "impactMining_000.ogg", "kenney", 0, 1.5),
    ("scrape", "impactMining_004.ogg", "kenney", 0, 1.5),
    ("metal", "impactMetal_medium_001.ogg", "kenney", 0, 1.8),
    ("tin", "impactTin_medium_002.ogg", "kenney", 0, 1.5),
    ("resonance", "impactBell_heavy_000.ogg", "kenney", 0, 1.8),
    ("crack-a", "crack01.mp3.flac", "independent", 0, 1.8),
    ("crack-b", "crack06.mp3.flac", "independent", 0, 1.8),
    ("splash-a", "water_splash-01.flac", "ezwa", 0, 1.8),
    ("splash-b", "water_splash-03.flac", "ezwa", 0, 1.8),
    ("bubbles", "boiling.ogg", "tinyworlds", 0, 4),
    ("waterfall", "waterfall.mp3", "kaszuba", 12, 6),
    ("boom", "explosion.mp3", "samster", 0, 5),
    # D459: Naturalize's new sound (qubodup's "20 Rustles of dry leaves", CC0, opengameart.org): one
    # dry-leaf rustle for the stroke's touch, and a stretch of a longer rustle as its held bed
    ("leaves", "rustle17.flac", "qubodup", 0, 1.2),
    ("leaves-bed", "rustle04.flac", "qubodup", 0.3, 2.5),
]
# `python tools/reencode-sounds.py leaves leaves-bed` renders only the named clips and merges them into
# the existing bank.json (for adding to the bank without the other sources at hand)
ONLY = set(sys.argv[1:])
manifest = []


def save(id, data, provenance, source_files, edits):
    # Retain crest factor: one linear gain, not per-sample compression. Cap peaks
    # at -2 dBFS and aim for -19 dBFS over the strongest 100 ms of the recording.
    data = data - np.mean(data)
    window = min(4800, len(data))
    powers = np.convolve(data.astype(np.float64) ** 2, np.ones(window) / window, "valid")
    rms = max(1e-6, float(np.sqrt(np.max(powers))))
    gain = min(10 ** (-19 / 20) / rms, 10 ** (-2 / 20) / max(1e-6, float(np.max(abs(data)))))
    data = data * gain
    fade = min(720, len(data) // 4)
    data[-fade:] *= np.linspace(1, 0, fade)
    data[:48] *= np.linspace(0, 1, min(48, len(data)))
    path = OUT / f"{id}.mp3"
    subprocess.run(
        [FFMPEG, "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-",
         "-c:a", "libmp3lame", "-b:a", BITRATE, "-map_metadata", "-1", str(path)],
        input=data.astype(np.float32).tobytes(), check=True,
    )
    manifest.append(dict(
        id=id, file=f"audio/{id}.mp3", provenance=provenance,
        sources=[dict(file=p.name, sha256=sha(p)) for p in source_files],
        edits=edits, duration=round(len(data) / SR, 4), gainDb=round(20 * np.log10(gain), 2),
        bytes=path.stat().st_size, sha256=sha(path),
    ))


for id, filename, group, start, duration in clips:
    if ONLY and id not in ONLY:
        continue
    path = find(filename)
    data = decode(path)[int(start * SR):int((start + duration) * SR)]
    if id not in ("waterfall", "bubbles", "leaves-bed"):
        active = np.flatnonzero(abs(data) > max(abs(data)) * 0.018)
        if len(active):
            data = data[max(0, active[0] - 96):min(len(data), active[-1] + 2400)]
    if group == "qubodup":
        edits = (f"Crop from {start}s, at most {duration}s (24-bit 96 kHz stereo FLAC original, "
                 f"downmixed to mono, resampled to 48 kHz); "
                 + ("no silence trim (a held bed); " if id == "leaves-bed" else "trim leading and trailing silence; ")
                 + "one linear gain to -19 dBFS in the strongest 100 ms, peak capped at -2 dBFS; "
                 "1/15 ms edge fades; MP3 256 kbps (D459).")
    else:
        edits = (f"Crop from {start}s, at most {duration}s; trim impact silence; mono 48 kHz; linear "
                 f"level balance; 1/15 ms edge fades; MP3 256 kbps (re-encoded from 192 kbps, D313: "
                 f"192 kbps measurably added more error than its CC0 original supports for a modest size "
                 f"increase; see docs/progress/forces.md).")
    save(id, data, group, [path], edits)

rng = np.random.default_rng(4218)
for id, pattern in [] if ONLY else [("earth-bed", "footstep_concrete_00*.ogg"),
                     ("leaf-bed", "footstep_grass_00*.ogg"),
                     ("stone-bed", "impactMining_00*.ogg")]:
    paths = sorted(SOURCES.rglob(pattern))
    grains = []
    for path in paths:
        g = decode(path)
        active = np.flatnonzero(abs(g) > max(abs(g)) * 0.025)
        if len(active):
            g = g[max(0, active[0] - 48):min(len(g), active[-1] + 480)]
        grains.append(g)
    data = np.zeros(SR * 3, np.float32)
    pos = 0
    while pos < len(data) - SR // 4:
        g = grains[int(rng.integers(len(grains)))]
        g = g[int(len(g) * 0.18):int(len(g) * 0.95)].copy()
        g = g * (np.sin(np.linspace(0, np.pi, len(g))) ** 2)
        length = min(len(g), len(data) - pos)
        data[pos:pos + length] += g[:length] * rng.uniform(0.7, 1)
        pos += max(240, int(len(g) * rng.uniform(0.3, 0.5)))
    save(id, data, "kenney", paths,
         "Three-second friction bed assembled from overlapping recorded tails (seed 4218), "
         "cosine grain fades; MP3 256 kbps (re-encoded from 192 kbps, D313).")

if ONLY:
    existing = json.loads(MANIFEST.read_text(encoding="utf-8"))
    by_id = {m["id"]: m for m in manifest}
    existing = [by_id.pop(m["id"], m) for m in existing]
    manifest = existing + list(by_id.values())
MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
print(f"{len(manifest)} recordings / {sum(x['bytes'] for x in manifest):,} bytes")
