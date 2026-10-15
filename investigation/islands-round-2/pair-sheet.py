# The contact sheet as pairs (D144): seeds 1-30 at 128², each seed's map before (the base) beside after
# (the patch), from the page `npm run sheet -- --compare <base> ...` wrote; under 1 MB.
#   python investigation/islands-round-2/pair-sheet.py <sheet.html> <base tag> <out.png> "<title>"
import base64, io, re, sys
from PIL import Image, ImageDraw, ImageFont
html, base_tag, out, title = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
text = open(html, encoding="utf-8").read()
maps = {}
for m in re.finditer(r'title="Islands (\d+), ([^:"]+):[^"]*"><img src="data:image/png;base64,([^"]+)"', text):
    seed, tag, b64 = int(m.group(1)), m.group(2), m.group(3)
    maps[(seed, tag == base_tag)] = Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")
S, GAP, COLS, LABEL = 96, 6, 5, 14
font = ImageFont.load_default()
W = COLS * (2 * S + 3 * GAP) + GAP
rows = (30 + COLS - 1) // COLS
H = 22 + rows * (S + LABEL + GAP) + GAP
im = Image.new("RGB", (W, H), (250, 248, 242))
d = ImageDraw.Draw(im)
d.text((GAP, 5), title, fill=(20, 20, 20), font=font)
for k, seed in enumerate(range(1, 31)):
    cx = GAP + (k % COLS) * (2 * S + 3 * GAP)
    cy = 22 + (k // COLS) * (S + LABEL + GAP)
    d.text((cx, cy), f"Islands, seed {seed}: before | after", fill=(40, 40, 40), font=font)
    for j, before in enumerate((True, False)):
        pic = maps.get((seed, before))
        if pic: im.paste(pic.resize((S, S), Image.LANCZOS), (cx + j * (S + GAP), cy + LABEL))
im.quantize(128).save(out, optimize=True)
import os; print(out, os.path.getsize(out), "bytes", im.size, "maps found", len(maps))
