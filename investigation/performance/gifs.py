"""Make evidence GIFs from qualified captures only. PNGs/JSON remain the source of truth."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw

parser = argparse.ArgumentParser()
parser.add_argument('--runs', type=Path, default=Path(__file__).parent / 'local' / 'runs')
parser.add_argument('--proof', type=Path, help='Offline audit: include only its qualified captures')
parser.add_argument('--output', type=Path, default=Path(__file__).parent / 'local' / 'gifs')
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
rows = []
if args.proof:
    proof = json.loads(args.proof.read_text())
    for row in proof['rows']:
        if row['mode'] != 'capture' or not row['qualified']:
            continue
        browser, profile, size, look = row['config'].split('/')
        stem = '-'.join([browser, profile, size, look, row['case'], str(row['repeat'])])
        folder = args.runs / row['folder']
        frames = folder / (stem + '-frames')
        digest = hashlib.sha256()
        for source in list(sorted(frames.iterdir())) + [folder / (stem + '-audio.jsonl'), folder / (stem + '-raw.json')]:
            if not source.exists():
                continue
            digest.update(source.name.encode())
            with source.open('rb') as stream:
                for block in iter(lambda: stream.read(1048576), b''):
                    digest.update(block)
        if not row.get('captureHash') or digest.hexdigest() != row['captureHash']:
            raise SystemExit('Capture digest changed; refusing GIF: ' + row['folder'])
        rows.append(dict(browser=browser, profile=profile, size=int(size), look=look,
                         case=row['case'], repeat=row['repeat'], phase=row['phase'],
                         capture=str(args.runs / row['folder'] / (stem + '-frames'))))
else:
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
    path.with_suffix('.timestamps.json').write_text(json.dumps({
        'clock': 'Original page monotonic timestamps; GIF relative union rounds to 10ms.',
        'sources': {phase: [dict(png=str(source), actualTimeMs=json.loads(source.with_suffix('.json').read_text())['at'])
                           for _, source in timeline] for phase, timeline in [('before', a), ('after', b)]},
        'relativeUnionMs': stamps, 'durationsMs': durations}, indent=2))
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
