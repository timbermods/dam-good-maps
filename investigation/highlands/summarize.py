"""Small committed sheets and per-seed evidence from the ignored exact-map captures."""
import csv
import json
import math
import statistics
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
def percentile(values, p):
    values = sorted(values)
    return statistics.median(values) if p == .5 else values[math.ceil(p * len(values))-1]

def summarize(phase):
    folder = HERE / 'local' / phase
    rows = []; summaries = {}
    for size in (96, 128, 256):
        maps = []
        for seed in range(1, 21):
            file = folder / f'{size}-{seed}.measure.json'
            if not file.exists():
                continue
            m = json.loads(file.read_text())
            detail = json.loads((folder / f'{size}-{seed}.json').read_text())
            out = m['outcomes'] or detail.get('evaluated')
            sig = out['signature'] if out else None
            why = []
            if not out:
                why.append('no accepted map: ' + ', '.join(m['failedChecks']))
            else:
                if not out['promise']:
                    if sig['high'] < .6: why.append(f"high {sig['high']:.3f}<0.600")
                    if sig['plateaus'] < 3: why.append(f"plateaus {sig['plateaus']}<3")
                    if sig['cliffs'] < .1 * math.sqrt(128 / size): why.append(f"cliffs {sig['cliffs']:.3f}<{.1 * math.sqrt(128 / size):.3f}")
                if not out['water']: why += out['story']['why']
                if not out['standout']: why.append('no emerged intention')
            checks = detail['checks']
            absfail = [c['id'] for c in checks if not c['ok'] and not c.get('advisory') and c.get('applicable', True) and not c.get('approximate')]
            mechanism = []
            if out and not out['promise']:
                if sig['high'] < .6: mechanism.append('upland distribution too low relative to the median wet surface')
                if sig['plateaus'] < 3: mechanism.append('too few broad elevated level regions survive shaping')
                if sig['cliffs'] < .1 * math.sqrt(128 / size): mechanism.append('too little terrace rim drops two levels')
                if (m.get('planned') or {}).get('promise') is False: mechanism.append('already misses on the plan; capped shared screen exhausted')
                elif (m.get('planned') or {}).get('promise') is True: mechanism.append('settled surface/terrain changes lose the planned promise')
            if out and not out['water']:
                story = out['story']
                if story['reach'] < .35: mechanism.append('source/courses concentrated in too little of the map')
                if story['mainShare'] < .72 or story['separate']>1:
                    has_plug = any(f['kind']=='mapObject' and f['params']['kind']=='plug' for f in detail['features'])
                    separate = sum(f['kind']=='river' and not f['params']['badwater'] and 'edge' in f['params']['exit'] for f in detail['features'])>1
                    mechanism.append('plug divides otherwise joined water (shared intention/story interaction)' if has_plug else 'separate outlets divide the clean drainage' if separate else 'planned tributaries split by shallow settled gaps (shared hydrology/settle interaction)')
                if story['mainWet'] < .85 or story['leastWet'] < .6: mechanism.append('planned channel is dry for a visible stretch after settling')
            rows.append(dict(size=size, seed=seed, all_three=bool(out and out['met']), promise=bool(out and out['promise']), standout=bool(out and out['standout']), water=bool(out and out['water']), accepted=m['ok'], failed_checks='; '.join(m['failedChecks']), absolute_failures='; '.join(absfail), cause='; '.join(why), mechanism='; '.join(mechanism), mechanism_status='inferred from measurements and plan/settled comparison', provenance=m.get('provenance', 'measured first map'), d348_failed=m['changed'] > 0, high=sig['high'] if sig else '', cliffs=sig['cliffs'] if sig else '', plateaus=sig['plateaus'] if sig else '', planned_falls=detail['info'].get('hydro', {}).get('falls', 0), clean_fall_tiles=(detail.get('brief') or {}).get('cleanFallTiles', ''), tallest_clean_fall=(detail.get('brief') or {}).get('tallestCleanFall', ''), start_level_area=(detail.get('brief') or {}).get('startLevelArea', ''), first_land_ms=m['ms']['firstLook'], first_water_ms=m['ms']['water'], final_ms=m['ms']['final'], cpu_land_ms=m['cpu']['land'], cpu_water_ms=m['cpu']['water'], attempts=m['attempts'], screened=m['redrawn'], shown=m['shown'], changed=m['changed'], planned_promise=(m.get('planned') or {}).get('promise'), planned_water=(m.get('planned') or {}).get('water'), logs=(m.get('walk') or {}).get('logs', 0), level=(m.get('walk') or {}).get('level', 0), mine_sites=m['mines']['walked']))
            maps.append((seed, m))
        if not maps: continue
        # Compact contact sheets; native-resolution maps remain in ignored local/.
        cell, margin, label, head = 192, 8, 34, 46
        sheet = Image.new('RGB', (5*(cell+margin)+margin, head+4*(cell+label+margin)+margin), '#20271f')
        draw = ImageDraw.Draw(sheet)
        font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 16) if Path('C:/Windows/Fonts/arial.ttf').exists() else ImageFont.load_default()
        display_phase = phase + (' (unchanged baseline)' if phase == 'after' and all(m.get('provenance') for _,m in maps) else '')
        draw.text((8, 7), f'Highlands {size} x {size} | {display_phase} | seeds 1-20', fill='white', font=font)
        draw.text((8, 25), 'P promise / S standout / W water; red = start; purple = badwater', fill='#bec7b8', font=font)
        for seed, m in maps:
            x = margin + ((seed-1)%5)*(cell+margin)
            y = head + ((seed-1)//5)*(cell+label+margin)
            im = Image.open(folder / f'{size}-{seed}.png').resize((cell, cell), Image.Resampling.NEAREST)
            sheet.paste(im, (x,y))
            detail = json.loads((folder / f'{size}-{seed}.json').read_text())
            out = m['outcomes'] or detail.get('evaluated') or {}
            flags = ' '.join(k + ('+' if out.get(v) else '-') for k,v in [('P','promise'),('S','standout'),('W','water')])
            draw.text((x,y+cell+2), f'{seed:02}  {flags}', fill='#b9eea3' if out.get('met') and m['ok'] else '#ffc899', font=font)
        sheet.save(HERE / f'{phase}-{size}.png', optimize=True)
        a = [r for r in rows if r['size']==size]
        stats = dict(count=len(a), **{k: sum(r[k] for r in a) for k in ['all_three','promise','standout','water','accepted']},
            land=[percentile([r['first_land_ms'] for r in a], p) for p in (.5,.9)],
            settled_water=[percentile([r['first_water_ms'] for r in a], p) for p in (.5,.9)],
            final=[percentile([r['final_ms'] for r in a], p) for p in (.5,.9)],
            changed=[min(r['changed'] for r in a), max(r['changed'] for r in a)],
            cpu_land=[percentile([r['cpu_land_ms'] for r in a], p) for p in (.5,.9)],
            logs_min=min(r['logs'] for r in a), level_min=min(r['level'] for r in a),
            clean_fall_tiles_min=min((r['clean_fall_tiles'] for r in a if r['clean_fall_tiles']!=''), default=None))
        summaries[size]=stats
        print(size, stats)
    if rows:
        with (HERE / f'{phase}.csv').open('w', newline='', encoding='utf-8') as f:
            w = csv.DictWriter(f, rows[0].keys()); w.writeheader(); w.writerows(rows)
        (HERE/'local'/f'{phase}-summary.json').write_text(json.dumps(summaries, indent=2))

if __name__ == '__main__':
    import sys
    summarize(sys.argv[1] if len(sys.argv)>1 else 'before')
