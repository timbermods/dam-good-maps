"""Optional asset rebuild. Requires numpy and ffmpeg; never needed by the demo.

Place the source downloads described in SOUNDS.md in local/sources. Set FFMPEG
to an executable, or install imageio-ffmpeg into local/build-tools. No network
access occurs here. All intermediate PCM stays in ignored local/.
"""
from pathlib import Path
import hashlib, json, os, subprocess, sys
import numpy as np

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'local/build-tools'))
if os.environ.get('FFMPEG'):
    FFMPEG = os.environ['FFMPEG']
else:
    import imageio_ffmpeg
    FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
SR = 48000
SOURCES = ROOT / 'local/sources'
OUT = ROOT / 'audio'
OUT.mkdir(exist_ok=True)

def find(name):
    matches = list(SOURCES.rglob(name))
    assert len(matches) == 1, (name, matches)
    return matches[0]

def decode(path):
    raw = subprocess.check_output([FFMPEG, '-v', 'error', '-i', str(path),
        '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'])
    return np.frombuffer(raw, np.float32).copy()

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

# id, original filename, provenance group, crop start (seconds), maximum duration
clips = [
    ('wood-a', 'impactWood_light_000.ogg', 'kenney', 0, 1.2),
    ('wood-b', 'impactWood_light_002.ogg', 'kenney', 0, 1.2),
    ('wood-body', 'impactWood_medium_001.ogg', 'kenney', 0, 1.4),
    ('wood-heavy', 'impactWood_heavy_000.ogg', 'kenney', 0, 1.5),
    ('earth-a', 'impactSoft_heavy_000.ogg', 'kenney', 0, 1.2),
    ('earth-b', 'impactSoft_heavy_002.ogg', 'kenney', 0, 1.2),
    ('leaf-a', 'footstep_grass_000.ogg', 'kenney', 0, 1.4),
    ('leaf-b', 'footstep_grass_002.ogg', 'kenney', 0, 1.4),
    ('stone', 'footstep_concrete_001.ogg', 'kenney', 0, 1.2),
    ('grit', 'impactMining_000.ogg', 'kenney', 0, 1.5),
    ('scrape', 'impactMining_004.ogg', 'kenney', 0, 1.5),
    ('metal', 'impactMetal_medium_001.ogg', 'kenney', 0, 1.8),
    ('tin', 'impactTin_medium_002.ogg', 'kenney', 0, 1.5),
    ('resonance', 'impactBell_heavy_000.ogg', 'kenney', 0, 1.8),
    ('crack-a', 'crack01.mp3.flac', 'independent', 0, 1.8),
    ('crack-b', 'crack06.mp3.flac', 'independent', 0, 1.8),
    ('splash-a', 'water_splash-01.flac', 'ezwa', 0, 1.8),
    ('splash-b', 'water_splash-03.flac', 'ezwa', 0, 1.8),
    ('bubbles', 'boiling.ogg', 'tinyworlds', 0, 4),
    ('waterfall', 'waterfall.mp3', 'kaszuba', 12, 6),
    ('boom', 'explosion.mp3', 'samster', 0, 5),
]
manifest = []
decoded = {}

def save(id, data, provenance, source_files, edits):
    # Retain crest factor: one linear gain, not per-sample compression. Cap peaks
    # at -2 dBFS and aim for -19 dBFS over the strongest 100 ms of the recording.
    data = data - np.mean(data)
    window = min(4800, len(data))
    powers = np.convolve(data.astype(np.float64)**2, np.ones(window)/window, 'valid')
    rms = max(1e-6, float(np.sqrt(np.max(powers))))
    gain = min(10**(-19/20)/rms, 10**(-2/20)/max(1e-6, float(np.max(abs(data)))))
    data *= gain
    fade = min(720, len(data)//4)
    data[-fade:] *= np.linspace(1, 0, fade)
    data[:48] *= np.linspace(0, 1, min(48, len(data)))
    path = OUT / f'{id}.mp3'
    subprocess.run([FFMPEG, '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR),
        '-ac', '1', '-i', '-', '-c:a', 'libmp3lame', '-b:a', '192k',
        '-map_metadata', '-1', str(path)], input=data.astype(np.float32).tobytes(), check=True)
    decoded[id] = data
    manifest.append(dict(id=id, file=f'audio/{id}.mp3', provenance=provenance,
        sources=[dict(file=p.name, sha256=sha(p)) for p in source_files],
        edits=edits, duration=round(len(data)/SR, 4), gainDb=round(20*np.log10(gain), 2),
        bytes=path.stat().st_size, sha256=sha(path)))

for id, filename, group, start, duration in clips:
    path = find(filename)
    data = decode(path)[int(start*SR):int((start+duration)*SR)]
    # Remove silence before an impact; keep 2 ms before the first audible sample.
    if id not in ('waterfall', 'bubbles'):
        active = np.flatnonzero(abs(data) > max(abs(data))*0.018)
        if len(active):
            data = data[max(0, active[0]-96):min(len(data), active[-1]+2400)]
    save(id, data, group, [path], f'Crop from {start}s, at most {duration}s; trim impact silence; mono 48 kHz; linear level balance; 1/15 ms edge fades; MP3 192 kbps.')

# Recorded friction beds. Overlap the quieter tails of several physical impacts,
# never their initial thuds. Fixed seed makes the derived assets reproducible.
rng = np.random.default_rng(4218)
for id, pattern in [('earth-bed', 'footstep_concrete_00*.ogg'),
                     ('leaf-bed', 'footstep_grass_00*.ogg'),
                     ('stone-bed', 'impactMining_00*.ogg')]:
    paths = sorted(SOURCES.rglob(pattern))
    grains = [decode(p) for p in paths]
    data = np.zeros(SR*3, np.float32)
    pos = 0
    while pos < len(data)-SR//4:
        g = grains[int(rng.integers(len(grains)))]
        g = g[int(len(g)*0.2):int(len(g)*0.9)].copy()
        g *= np.sin(np.linspace(0, np.pi, len(g)))**2
        length = min(len(g), len(data)-pos)
        data[pos:pos+length] += g[:length] * rng.uniform(.7, 1)
        pos += max(2000, int(len(g)*rng.uniform(.3, .5)))
    save(id, data, 'kenney', paths, 'Three-second friction bed assembled from overlapping recorded tails (seed 4218), cosine grain fades; same level/encoding pass as impacts.')

(ROOT/'bank.json').write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf-8')
print(f'{len(manifest)} recordings / {sum(x["bytes"] for x in manifest):,} bytes')
