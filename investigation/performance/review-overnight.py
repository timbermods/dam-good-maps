"""Offline full-pixel/PCM diagnostics; no discarded recording is certified by this script."""
import json
import subprocess
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent
local = root / 'local'
proof = json.loads((root / 'overnight-proof.json').read_text())
out = local / 'overnight-review'
out.mkdir(exist_ok=True)
results = []
for row in proof['rows']:
    folder = local / 'runs' / row['folder']
    stem = '-'.join(row['config'].split('/') + [row['case'], str(row['repeat'])])
    paths = sorted((folder / (stem + '-frames')).glob('*.png'))
    changes = []
    previous = None
    for path in paths:
        with Image.open(path) as image:
            image.load()
            pixels = np.asarray(image.convert('RGB'), dtype=np.int16)
        meta = json.loads(path.with_suffix('.json').read_text())
        changes.append(dict(frame=path.stem, at=meta['at'], size=list(pixels.shape),
                            meanPixelDelta=float(np.abs(pixels - previous).mean()) if previous is not None else None))
        previous = pixels
    if paths:
        largest = max(range(1, len(paths)), key=lambda i: changes[i]['meanPixelDelta'], default=0)
        selected = sorted(set([max(0, largest-1), largest, min(len(paths)-1, largest+1)]))
        sheet = Image.new('RGB', (1200, 285), '#181818')
        ImageDraw.Draw(sheet).text((5, 5), row['folder'] + ' ' + row['config'] + ' ' + ('QUALIFIED' if row['qualified'] else 'UNQUALIFIED') + '', fill='white')
        for col, i in enumerate(selected):
            with Image.open(paths[i]) as image:
                image.thumbnail((390, 235))
                sheet.paste(image, (400*col, 45))
            ImageDraw.Draw(sheet).text((400*col+5, 25), paths[i].stem, fill='white')
        sheet.save(out / (row['folder'] + '.png'))
    audio = []
    for context in row.get('audio') or []:
        destination = out / (row['folder'] + '-' + context['contextId'] + '.wav')
        command = [sys.executable, str(root / 'audio.py'), str(folder / (stem + '-audio.jsonl')),
                   '--context-id=' + context['contextId'], '--output', str(destination)]
        result = subprocess.run(command, capture_output=True, text=True)
        audio.append(dict(converted=result.returncode == 0,
                          message=(result.stdout + result.stderr).strip(), **context))
    results.append(dict(folder=row['folder'], config=row['config'], phase=row['phase'],
                        qualified=row['qualified'], changes=changes, audio=audio))
    if paths or audio:
        print(row['folder'], len(paths), 'frames;', len(audio), 'PCM contexts', flush=True)
(out / 'pixel-pcm-index.json').write_text(json.dumps(results, indent=2))
print('Full-resolution pixels decoded:', sum(len(r['changes']) for r in results))
print('PCM conversions:', sum(a['converted'] for r in results for a in r['audio']))
print('No perceptual visual/audio oracle is automatically passed.')
