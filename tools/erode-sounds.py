"""Render Erode's recordings into the editor's sound bank (D281), the way tools/reencode-sounds.py renders the
others: mono 48 kHz, one linear gain to -19 dBFS in the strongest 100 ms (peak capped at -2 dBFS), 1/15 ms edge
fades, MP3 256 kbps. The sources are investigation/erode/audio (Freesound's CC0 previews, ATTRIBUTION.md there).
Requires numpy and ffmpeg (set FFMPEG, or install imageio-ffmpeg). Merges its entries into bank.json.

    python tools/erode-sounds.py
"""
from pathlib import Path
import hashlib, json, os, subprocess
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / "investigation/erode/audio"
OUT = ROOT / "public/sounds/juice-2/audio"
MANIFEST = ROOT / "public/sounds/juice-2/bank.json"
SR = 48000
if os.environ.get("FFMPEG"):
    FFMPEG = os.environ["FFMPEG"]
else:
    import imageio_ffmpeg

    FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

# id, source file, provenance, start (s), duration (s), what it is for. The grind is a steady stretch of the
# recording (its other stretches are strokes with silence between them), looped by the bank.
clips = [
    ("grind-bed", "scrape-vrymaa.mp3", "vrymaa", 0.5, 2.0, "the grinding wear (a held loop)"),
    ("rocks", "rocks-adamgryu.mp3", "adamgryu", 0.0, 4.0, "falling stone (landings)"),
    ("rockfall", "rockfall-iwanplays.mp3", "iwanplays", 0.0, 3.0, "falling stone (landings and the closing fall)"),
]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def decode(path):
    raw = subprocess.check_output([FFMPEG, "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"])
    return np.frombuffer(raw, np.float32).copy()


manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
for id, name, provenance, start, duration, what in clips:
    src = SOURCES / name
    data = decode(src)[int(start * SR):int((start + duration) * SR)]
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
         "-c:a", "libmp3lame", "-b:a", "256k", "-map_metadata", "-1", str(path)],
        input=data.astype(np.float32).tobytes(), check=True,
    )
    entry = dict(
        id=id, file=f"audio/{id}.mp3", provenance=provenance,
        sources=[dict(file=name, sha256=sha(src))],
        edits=(f"Freesound's public HQ MP3 preview (investigation/erode), from {start}s, {duration}s; mono 48 kHz; "
               "one linear gain to -19 dBFS in the strongest 100 ms, peak capped at -2 dBFS; 1/15 ms edge fades; "
               f"MP3 256 kbps; used as {what} (D281)."),
        duration=round(len(data) / SR, 4), gainDb=round(20 * np.log10(gain), 2),
        bytes=path.stat().st_size, sha256=sha(path),
    )
    manifest = [entry if m["id"] == id else m for m in manifest]
    if not any(m["id"] == id for m in manifest):
        manifest.append(entry)
MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
print(sum(m["bytes"] for m in manifest))
