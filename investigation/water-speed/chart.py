"""Two small standalone SVG performance charts; Python standard library only."""
import json
from pathlib import Path
from html import escape

HERE = Path(__file__).resolve().parent
data = json.loads((HERE / 'evidence/summary.json').read_text())
OUT = HERE / 'charts'
OUT.mkdir(exist_ok=True)

def document(title, subtitle, height):
    return [f'<svg xmlns="http://www.w3.org/2000/svg" width="900" height="{height}" viewBox="0 0 900 {height}" role="img">',
            f'<title>{escape(title)}</title><desc>{escape(subtitle)}</desc>',
            '<style>text{font-family:Arial,sans-serif;fill:#193343;font-size:14px}.title{font-size:23px;font-weight:bold}.small{font-size:12px}.label{font-size:13px}</style>',
            f'<rect width="900" height="{height}" fill="#f8fafb"/>',
            f'<text x="28" y="37" class="title">{escape(title)}</text>',
            f'<text x="28" y="62" class="small">{escape(subtitle)}</text>']

def rect(parts, x, y, w, h, color):
    parts.append(f'<rect x="{x:.2f}" y="{y:.2f}" width="{max(0,w):.2f}" height="{h}" fill="{color}"/>')

def text(parts, x, y, value, css='label'):
    parts.append(f'<text x="{x}" y="{y}" class="{css}">{escape(str(value))}</text>')

p = document('Where baseline settle spends CPU time', 'Six sampled profiles; seed 1. Sea = Islands theme. Percentages are sampling estimates.', 400)
colors = ['#276b8a', '#e9b44c', '#5ca986', '#ccd6db']
labels = ['Flow substeps', 'Build active set', 'Evaporation', 'Other']
for i, r in enumerate(data['profile']):
    y = 101 + i*39
    text(p, 28, y+18, f"{r['theme']} {r['size']}²")
    x = 215
    values = [r['substep'], r['active'], r['evap']]
    values.append(1-sum(values))
    for v, color in zip(values, colors):
        rect(p, x, y, 600*v, 25, color)
        x += 600*v
    text(p, 827, y+18, f"{r['substep']:.0%}")
for i, (label, color) in enumerate(zip(labels, colors)):
    rect(p, 28+i*214, 354, 14, 14, color)
    text(p, 48+i*214, 366, label, 'small')
p.append('</svg>')
(OUT / 'profile.svg').write_text('\n'.join(p), encoding='utf-8')

rows = sorted(data['selected'], key=lambda r: (int(r['id'].split('-')[-2]), r['id']))
height = 118+len(rows)*44
p = document('Repeated canonical settle: identical results', 'Five alternating pairs after warmup: median CPU seconds and median paired gain. Ryzen 7 9800X3D / Node 24.', height)
values = [r['rows'][0] for r in rows]
maximum = max(v['baselineCpuMs'] for v in values)*1.05
for i, (r, v) in enumerate(zip(rows, values)):
    y = 90+i*44
    theme, size = r['id'].split('-')[1:3]
    text(p, 28, y+21, f'{theme} {size}²')
    rect(p, 215, y, 470*v['baselineCpuMs']/maximum, 12, '#bbc9d0')
    rect(p, 215, y+15, 470*v['fastCpuMs']/maximum, 12, '#276b8a')
    text(p, 705, y+12, f"{v['baselineCpuMs']/1000:.2f} → {v['fastCpuMs']/1000:.2f} s", 'small')
    text(p, 827, y+24, f"{v['cpuRatio']:.2f}×")
rect(p, 215, height-24, 14, 12, '#bbc9d0'); text(p, 237, height-14, 'Baseline', 'small')
rect(p, 370, height-24, 14, 12, '#276b8a'); text(p, 392, height-14, 'Candidate', 'small')
p.append('</svg>')
(OUT / 'speed.svg').write_text('\n'.join(p), encoding='utf-8')
print('Wrote', OUT / 'profile.svg', 'and speed.svg')
