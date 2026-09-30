"""Make evidence GIFs from qualified captures only. PNGs/JSON remain the source of truth."""
import argparse
import json
from pathlib import Path
from PIL import Image, ImageDraw

parser = argparse.ArgumentParser()
parser.add_argument('--runs', type=Path, default=Path(__file__).parent / 'local' / 'runs')
parser.add_argument('--output', type=Path, default=Path(__file__).parent / 'local' / 'gifs')
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
rows = []
for path in args.runs.glob('*/manifest.json'):
    manifest = json.loads(path.read_text())
    if manifest['mode'] != 'capture':
        continue
    for row in manifest['results']:
        if row['status'] == 'complete' and row.get('qualified') and row.get('capture'):
            rows.append({**row, 'phase': manifest['phase']})

def timeline(row):
    result = []
    for p in sorted(Path(row['capture']).glob('*.png')):
        meta = json.loads(p.with_suffix('.json').read_text())
        result.append((meta['at'], p))
    if not result:
        raise ValueError('No frames for ' + row['case'])
    start = result[0][0]
    return [(t - start, p) for t, p in result]

def pair(before, after):
    a, b = timeline(before), timeline(after)
    # Union of actual frame timestamps: a held frame stays held. Resizing/palette quantization is
    # only for the GIF; review the full PNGs for subpixel seams, flicker and reflection evidence.
    stamps = sorted(set(round(t / 10) * 10 for t, _ in a + b))
    frames, durations = [], []
    ai = bi = 0
    for n, t in enumerate(stamps):
        while ai + 1 < len(a) and a[ai + 1][0] <= t:
            ai += 1
        while bi + 1 < len(b) and b[bi + 1][0] <= t:
            bi += 1
        canvas = Image.new('RGB', (960, 384), '#131b1c')
        for offset, entry, label in [(0, a[ai], 'Before'), (480, b[bi], 'Proposal')]:
            with Image.open(entry[1]) as image:
                image.thumbnail((480, 340))
                canvas.paste(image, (offset + (480 - image.width) // 2, 35))
            ImageDraw.Draw(canvas).text((offset + 12, 10), label + ' — capture, not pacing run', fill='white')
        frames.append(canvas)
        durations.append(max(10, stamps[n + 1] - t if n + 1 < len(stamps) else 500))
    name = '-'.join(str(before[k]) for k in ['browser', 'profile', 'size', 'look', 'case', 'repeat']) + '.gif'
    path = args.output / name
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=durations, loop=0, disposal=2, optimize=False)
    print(path)

made = 0
for b in rows:
    if b['phase'] != 'before':
        continue
    a = next((r for r in rows if r['phase'] == 'after' and all(r[k] == b[k] for k in ['browser', 'profile', 'size', 'look', 'case', 'repeat'])), None)
    if a:
        pair(b, a)
        made += 1
if not made:
    raise SystemExit('No qualified before/after capture pairs; refusing to fabricate evidence GIFs.')
