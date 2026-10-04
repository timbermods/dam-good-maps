"""The requested contact sheet; only reads the already generated 30-seed comparison."""
from pathlib import Path
import csv
import difflib
import json
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
LOCAL = HERE / 'local'
BASE = json.loads((HERE / 'BASE.json').read_text())['sha']
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 16)
title = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 24)
tile, gap, margin, header, row_h = 256, 12, 20, 88, 306
pair_w = tile * 2 + gap
sheet = Image.new('RGB', (margin * 2 + 3 * pair_w + 2 * 24, header + 10 * row_h + margin), '#f3f1eb')
draw = ImageDraw.Draw(sheet)
draw.text((margin, 12), 'Delta arms, round 2 — seeds 1–30, 128², default settings', font=title, fill='#252525')
draw.text((margin, 44), f'Left: dev {BASE[:8]}   |   Right: round 2   |   North up; each map 256 × 256 px', font=font, fill='#333333')
rows = []
for seed in range(1, 31):
    x = margin + ((seed - 1) % 3) * (pair_w + 24)
    y = header + ((seed - 1) // 3) * row_h
    row = {'seed': seed}
    for col, mode in enumerate(['before', 'after']):
        data = json.loads((LOCAL / mode / f'{seed}.json').read_text())
        outcome = data['outcomes']
        row.update({f'{mode}_promise': outcome['promise'], f'{mode}_water': outcome['water'],
                    f'{mode}_mouths': outcome['signature']['mouths'],
                    f'{mode}_straight': data['straight']['pass'],
                    f'{mode}_bank_run': data['straight']['run'], f'{mode}_canal': data['straight']['canal']})
        label = f'Seed {seed:02} — {"dev" if col == 0 else "round 2"}'
        draw.text((x + col * (tile + gap), y), label, font=font, fill='#252525')
        image = Image.open(LOCAL / mode / f'{seed}.png').convert('RGB').resize((tile, tile), Image.Resampling.NEAREST)
        sheet.paste(image, (x + col * (tile + gap), y + 24))
        status = f'Promise: {"yes" if outcome["promise"] else "NO"}   Water: {"yes" if outcome["water"] else "NO"}'
        draw.text((x + col * (tile + gap), y + 282), status, font=font, fill='#333333')
    rows.append(row)
out = ROOT / 'docs/sheets/delta-arms.png'
out.parent.mkdir(parents=True, exist_ok=True)
# Lossless PNG: preserve the product's original terrain and water colours.
sheet.save(out, optimize=True)
with (HERE / 'counts.csv').open('w', newline='', encoding='utf-8') as file:
    writer = csv.DictWriter(file, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
before = (LOCAL / 'hydro.before.ts').read_text(encoding='utf-8').splitlines(keepends=True)
after = (LOCAL / 'hydro.after.ts').read_text(encoding='utf-8').splitlines(keepends=True)
patch = 'diff --git a/src/core/land/hydro.ts b/src/core/land/hydro.ts\n' + ''.join(difflib.unified_diff(
    before, after, fromfile='a/src/core/land/hydro.ts', tofile='b/src/core/land/hydro.ts'))
# Git's diff.suppressBlankEmpty format: blank context lines need no trailing space.
patch = ''.join('\n' if line == ' \n' else line for line in patch.splitlines(keepends=True))
(HERE / 'delta-arms.patch').write_text(patch, encoding='utf-8')
summary = {'round': 2, 'base': BASE, 'size': 128, 'seeds': '1–30', 'timings': False}
for mode in ['before', 'after']:
    summary[mode] = {key: sum(row[f'{mode}_{key}'] for row in rows) for key in ['promise', 'water', 'straight']}
    summary[mode]['misses'] = {key: [r['seed'] for r in rows if not r[f'{mode}_{key}']] for key in ['promise', 'water', 'straight']}
    summary[mode]['longestBank'] = max(r[f'{mode}_bank_run'] for r in rows)
    summary[mode]['longestCanal'] = max(r[f'{mode}_canal'] for r in rows)
(HERE / 'counts.json').write_text(json.dumps(summary, indent=2) + '\n', encoding='utf-8')
print(json.dumps(summary, indent=2))
print(f'Sheet: {out.name}, {sheet.width} × {sheet.height}, {out.stat().st_size} bytes')
