"""Small labelled contact sheet of our generated first maps; large tile data stays local."""
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw
folder = Path(sys.argv[1])
rows = [json.loads(s) for s in (folder/'measures.jsonl').read_text().splitlines()]
cell, header, cols = 128, 50, 5
sizes = sorted({r['size'] for r in rows})
canvas = Image.new('RGB', (cols*cell, len(sizes)*(4*(cell+22)+header)), '#17232b')
labels = []
for group, size in enumerate(sizes):
    top = group*(4*(cell+22)+header)
    labels.append(((10,top+10), f'Lake Basin {size} x {size} - yellow sources / red start'))
    for r in sorted((r for r in rows if r['size']==size), key=lambda r:r['seed']):
        k=r['seed']-1; x=k%cols*cell; y=top+header+k//cols*(cell+22)
        im=Image.open(folder/f"{size}-{r['seed']}.png").resize((cell-4,cell-4),Image.Resampling.NEAREST)
        canvas.paste(im,(x+2,y))
        flags=''.join(letter if (r['outcomes'] or {}).get(key) else '-' for letter,key in [('P','promise'),('S','standout'),('W','water')])
        labels.append(((x+5,y+cell),f"seed {r['seed']}  {flags}  {'PASS' if r['ok'] else 'FAIL'}"))
draw = ImageDraw.Draw(canvas)
for pos, label in labels:
    draw.text(pos, label, fill='white')
canvas.save(sys.argv[2],optimize=True)
