"""Offline diagnostic review aid. Discarded captures never become qualified evidence."""
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent
local = root / 'local'
proof = json.loads((root / 'morning-proof.json').read_text())
results = []
sheet = Image.new('RGB', (1200, 270 * proof['audioFiles']), '#181818')
row_index = 0
for row in proof['rows']:
    folder = local / 'runs' / row['folder']
    frame_dirs = list(folder.glob('*-frames'))
    if not frame_dirs:
        continue
    paths = sorted(frame_dirs[0].glob('*.png'))
    previous = None
    changes = []
    for path in paths:
        with Image.open(path) as image:
            image.load()  # Decode every actual full-resolution PNG, then compare pixels.
            pixels = np.asarray(image.convert('RGB'), dtype=np.int16)
        delta = float(np.abs(pixels - previous).mean()) if previous is not None else None
        changes.append(dict(frame=path.stem, meanPixelDelta=delta))
        previous = pixels
    largest = max(range(1, len(paths)), key=lambda i: changes[i]['meanPixelDelta'], default=0)
    selected = sorted(set([max(0, largest - 1), largest, min(len(paths) - 1, largest + 1)]))
    for col, i in enumerate(selected):
        with Image.open(paths[i]) as image:
            image.thumbnail((390, 220))
            sheet.paste(image, (400 * col, 270 * row_index + 45))
        ImageDraw.Draw(sheet).text((400 * col + 5, 270 * row_index + 25), paths[i].stem, fill='white')
    ImageDraw.Draw(sheet).text((5, 270 * row_index + 5), row['folder'] + ' — UNQUALIFIED; pixel changes are not glitch verdicts', fill='white')
    row_index += 1
    results.append(dict(folder=row['folder'], frames=len(paths), changes=changes))
    print(row['folder'], len(paths), flush=True)
sheet.save(local / 'morning-contact-sheet.png')
(local / 'morning-pixel-review.json').write_text(json.dumps(results, indent=2))

# A single discarded recording illustrates the observed jump; no after build or qualification.
folder = local / 'runs' / '2026-09-30T16-19-36.786Z-before-capture'
frames = sorted(next(folder.glob('*-frames')).glob('*.png'))
images, durations = [], []
for i, path in enumerate(frames):
    with Image.open(path) as image:
        canvas = image.convert('RGB')
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, 0, canvas.width, 27), fill='black')
    draw.text((8, 8), 'UNQUALIFIED before-only capture — CPU-discarded; no smoothness certification', fill='white')
    images.append(canvas)
    at = json.loads(path.with_suffix('.json').read_text())['at']
    next_at = json.loads(frames[i+1].with_suffix('.json').read_text())['at'] if i+1 < len(frames) else at+1000
    durations.append(max(10, round((next_at-at)/10)*10))
images[0].save(local / 'diagnostic-crater-standard.gif', save_all=True, append_images=images[1:], duration=durations, loop=0)
