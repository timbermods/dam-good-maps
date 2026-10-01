"""Compact audit tables and contact sheets; full captures stay in local/."""
import argparse
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

p = argparse.ArgumentParser()
p.add_argument('--label', default='before')
p.add_argument('--sizes', default='96,128,256')
a = p.parse_args()
here = Path(__file__).resolve().parent
folder = here / 'local' / a.label
rows = []
for size in map(int, a.sizes.split(',')):
    measures = [json.loads(l) for l in (folder / f'measures-{size}.jsonl').read_text().splitlines() if l.startswith('{')]
    assert len(measures) == 20 and {m['seed'] for m in measures} == set(range(1, 21)), 'Incomplete batch'
    assert not any('error' in m for m in measures), 'Runner error'
    measures.sort(key=lambda m: m['seed'])
    details = [json.loads((folder / f"{size}-{m['seed']}.json").read_text()) for m in measures]
    outcomes = [d['outcomes'] for d in details]
    def percentile(values, fraction):
        return sorted(values)[min(len(values)-1, math.floor(fraction*len(values)))]
    row = dict(size=size, n=20, all=sum(o['met'] and m['ok'] for o, m in zip(outcomes, measures)), promise=sum(o['promise'] for o in outcomes), standout=sum(bool(o['standout']) for o in outcomes), water=sum(o['story']['readable'] for o in outcomes), absolute_fails=sum(not m['ok'] for m in measures), land_median=percentile([m['ms']['land'] for m in measures], .5), land_p90=percentile([m['ms']['land'] for m in measures], .9), water_median=percentile([m['ms']['water'] for m in measures], .5), water_p90=percentile([m['ms']['water'] for m in measures], .9), land_changes=sum(m['changed'] for m in measures), maps_changed=sum(m['changed'] > 0 for m in measures), once=sum(m['shown'] == 1 for m in measures), cpu_land_median=percentile([m['cpu']['land'] for m in measures], .5), cpu_land_p90=percentile([m['cpu']['land'] for m in measures], .9))
    rows.append(row)
    for m, d in zip(measures, details):
        o = d['outcomes']
        if not (m['ok'] and o['met']):
            print(json.dumps(dict(size=size, seed=m['seed'], ok=m['ok'], planned=m['planned'], summary=o['summary'], canyon=o['signature']['canyon'], canyonShare=o['signature']['canyonShare'], story=o['story'], failed=m['failedChecks'], fixes=m['fixes'], changed=m['changed'], drawn=d['info']['genome']['intentions'], intentions=d['intentions'])))
    # All 20 maps, no cherry picking. North up; red is the start, purple is badwater.
    cell, image_side, header = 210, 192, 44
    sheet = Image.new('RGB', (5*cell, header+4*(cell+30)), '#171e22')
    draw = ImageDraw.Draw(sheet)
    font_path = Path('C:/Windows/Fonts/arial.ttf')
    font = ImageFont.truetype(str(font_path), 14) if font_path.exists() else ImageFont.load_default()
    small = ImageFont.truetype(str(font_path), 12) if font_path.exists() else ImageFont.load_default()
    draw.text((10, 12), f'Canyon {size}x{size} | {a.label} | seeds 1-20 | P promise, S standout, W water | red start; purple badwater', font=font, fill='white')
    for k, (m, d) in enumerate(zip(measures, details)):
        x, y = (k % 5)*cell+9, header+(k//5)*(cell+30)
        im = Image.open(folder / f"{size}-{m['seed']}.png").resize((image_side, image_side), Image.Resampling.NEAREST)
        sheet.paste(im, (x, y))
        o = d['outcomes']
        flags = ' '.join(f'{key}{"+" if yes else "-"}' for key, yes in [('P', o['promise']), ('S', bool(o['standout'])), ('W', o['story']['readable'])])
        draw.text((x, y+image_side+3), f"seed {m['seed']:02}   {flags}" + ('  FAIL' if not m['ok'] else ''), font=font, fill='#bce8bf' if m['ok'] and o['met'] else '#ffc592')
        draw.text((x, y+image_side+21), o['standout'] or 'no standout', font=small, fill='#b8c3cc')
    sheet.save(here / f'{a.label}-{size}.png', optimize=True)
(folder / 'summary.json').write_text(json.dumps(rows, indent=2)+'\n')
print(json.dumps(rows, indent=2))
