"""Persist decision-sized measurements and contact sheets; complete fields stay in local/."""
import csv
import itertools
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent

def font(size):
    for name in ('arial.ttf', 'segoeui.ttf', 'DejaVuSans.ttf'):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()

def percentile(values, p):
    values = sorted(values)
    return values[max(0, math.ceil(p * len(values))-1)]

rows, summaries = [], []
for mode in ('before', 'after'):
    sheet = Image.new('RGB', (1448, 1098), '#f7f5ed')
    draw = ImageDraw.Draw(sheet)
    draw.text((12, 8), f'River Valley / {mode} / first maps, seeds 1-20', font=font(23), fill='#243225')
    draw.text((12, 39), 'A = all three outcomes; W = readable water; red ! = blocking check failed. Yellow source / white exit / red start.', font=font(13), fill='#384337')
    for block, size in enumerate((96, 128, 256)):
        maps = [json.loads(l) for l in (ROOT/'local'/f'{mode}-{size}.jsonl').read_text(encoding='utf-8-sig').splitlines() if l.strip()]
        assert len(maps) == 20 and {m['seed'] for m in maps} == set(range(1, 21))
        assert not any('error' in m for m in maps)
        maps.sort(key=lambda m:m['seed'])
        y0 = 65 + block * 341
        captures=[json.loads((ROOT/'local'/mode/str(size)/f'{seed}.json').read_text(encoding='utf8')) for seed in range(1,21)]
        summary = dict(mode=mode, size=size, maps=20, all=sum(bool(m['ok'] and m['outcomes'] and m['outcomes']['met']) for m in maps),
                       water=sum(bool(m['outcomes'] and m['outcomes']['water']) for m in maps), failed=sum(not m['ok'] for m in maps),
                       land_ms=[percentile([m['ms']['firstLook'] for m in maps], p) for p in (.5,.9)],
                       cpu_land_ms=[percentile([m['cpu']['land'] for m in maps],p) for p in (.5,.9)],
                       settled_ms=[percentile([m['ms']['water'] for m in maps],p) for p in (.5,.9)],
                       max_lands=max(m.get('lands',0) for m in maps), max_shown=max(m.get('shown',0) for m in maps),
                       min_logs=min(m['walk']['logs'] for m in maps if m['walk']),
                       min_bed=min(m['heights']['bedMin'] for m in maps),
                       min_mines_walked=min(m['mines']['walked'] for m in maps),
                       max_changed=max(m['changed'] for m in maps),
                       head_losing=sum(m['head']['losing']>0 for m in maps),
                       no_main=sum(not any(r['role']=='river/main' for r in c['rivers']) for c in captures))
        summaries.append(summary)
        draw.text((12,y0), f'{size} x {size}    all {summary["all"]}/20    water {summary["water"]}/20    blocking failures {summary["failed"]}', font=font(19), fill='#243225')
        for k,m in enumerate(maps):
            out=m.get('outcomes') or {}
            x=9+(k%10)*144; y=y0+30+(k//10)*151
            label=f'RV {m["seed"]}  '+('A ' if out.get('met') else '')+('W' if out.get('water') else '')+(' !' if not m['ok'] else '')
            draw.text((x,y),label,font=font(13),fill='#a22621' if not m['ok'] else '#243225')
            im=Image.open(ROOT/'local'/mode/str(size)/f'{m["seed"]}.png').convert('RGB').resize((136,136),Image.Resampling.NEAREST if size==128 else Image.Resampling.LANCZOS)
            sheet.paste(im,(x,y+16))
            story=out.get('story') or {}
            rows.append(dict(mode=mode,size=size,seed=m['seed'],absolute_pass=m['ok'],all=out.get('met',False),water=out.get('water',False),promise=out.get('promise',False),standout=out.get('standout',False),
                             land_ms=m['ms']['firstLook'],cpu_land_ms=m['cpu']['land'],settled_ms=m['ms']['water'],lands=m.get('lands'),shown=m.get('shown'),changed=m['changed'],
                             main_share=story.get('mainShare'),systems=story.get('systems'),ponds=story.get('ponds'),main_wet=story.get('mainWet'),least_wet=story.get('leastWet'),reach=story.get('reach'),
                             why='; '.join(story.get('why',[])),summary=out.get('summary',''),failed_checks='; '.join(m.get('failedChecks') or []),fixes='; '.join(m.get('fixes') or []),logs=(m['walk'] or {}).get('logs'),mines=m['mines']['walked']))
    sheet.quantize(colors=128,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE).save(ROOT/f'contact-{mode}.png',optimize=True)
    assert (ROOT/f'contact-{mode}.png').stat().st_size < 1_000_000

with (ROOT/'maps.csv').open('w',newline='',encoding='utf-8') as f:
    writer=csv.DictWriter(f,fieldnames=list(rows[0]))
    writer.writeheader();writer.writerows(rows)
(ROOT/'summary.json').write_text(json.dumps(summaries,indent=2)+'\n')
controls=[]
control_rows=[]
for size in (96,128,256):
    maps=[json.loads(l) for l in (ROOT/'local'/f'shared-{size}.jsonl').read_text(encoding='utf-8-sig').splitlines() if l.strip()]
    assert len(maps)==20 and not any('error' in m for m in maps)
    controls.append(dict(size=size,all=sum(bool(m['ok'] and m['outcomes'] and m['outcomes']['met']) for m in maps),water=sum(bool(m['outcomes'] and m['outcomes']['water']) for m in maps),failed=sum(not m['ok'] for m in maps)))
    for m in sorted(maps,key=lambda m:m['seed']):
        out=m.get('outcomes') or {}
        story=out.get('story') or {}
        control_rows.append(dict(size=size,seed=m['seed'],absolute_pass=m['ok'],all=out.get('met',False),water=out.get('water',False),promise=out.get('promise',False),standout=out.get('standout',False),why='; '.join(story.get('why',[])),failed_checks='; '.join(m.get('failedChecks') or [])))
(ROOT/'shared-control.json').write_text(json.dumps(controls,indent=2)+'\n')
with (ROOT/'shared-maps.csv').open('w',newline='',encoding='utf-8') as f:
    writer=csv.DictWriter(f,fieldnames=list(control_rows[0]))
    writer.writeheader();writer.writerows(control_rows)

# Cheap land-variety check, same rule as M9b sameLand: all 190 seed pairs per size.
variety=[]
for size in (96,128,256):
    fields=[json.loads((ROOT/'local'/'after'/str(size)/f'{seed}.field.json').read_text(encoding='utf8')) for seed in range(1,21)]
    pairs=[]
    for a,b in itertools.combinations(range(20),2):
        share=sum(abs(x-y)<=1 for x,y in zip(fields[a]['heights'],fields[b]['heights']))/(size*size)
        pairs.append((share,a+1,b+1))
    largest=max(pairs)
    captures=[json.loads((ROOT/'local'/'after'/str(size)/f'{seed}.json').read_text(encoding='utf8')) for seed in range(1,21)]
    standouts=sorted(set(m['outcomes']['standout'] for m in captures if m.get('outcomes') and m['outcomes']['standout']))
    entry_edges=sorted(set(r['entry']['edge'] for m in captures for r in m['rivers'] if r['role']=='river/main' and 'edge' in r['entry']))
    variety.append(dict(size=size,pairs=len(pairs),near_duplicates=sum(p[0]>=.85 for p in pairs),highest_share=round(largest[0],4),closest_seeds=list(largest[1:]),standouts=standouts,entry_edges=entry_edges))
(ROOT/'variety.json').write_text(json.dumps(variety,indent=2)+'\n')
print(json.dumps(dict(summary=summaries,variety=variety),indent=2))
