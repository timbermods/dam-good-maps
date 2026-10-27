"""Lay out tools/naturalize-sheet.ts's pictures: a row a case, a column a rule, each labelled with the
land's level edges; a quantized PNG.

    python tools/naturalize-sheet.py <dir> <out.png> "<title>" [scale] [x0,y0,x1,y1]

The optional crop is in tiles, north up (rows counted from the top of the picture).
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont


def font(size):
    for name in ("arial.ttf", "segoeui.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


def main():
    src, out, title = sys.argv[1], sys.argv[2], sys.argv[3]
    scale = int(sys.argv[4]) if len(sys.argv) > 4 else 3
    crop = tuple(int(v) for v in sys.argv[5].split(",")) if len(sys.argv) > 5 else None
    index = json.load(open(os.path.join(src, "index.json"), encoding="utf8"))
    names = {"riverValley": "River Valley", "lakeBasin": "Lake Basin"}
    big, small = font(18), font(14)
    pad, gap = 12, 10
    rows = []
    for case in index["cases"]:
        imgs = []
        for c in case["cells"]:
            im = Image.open(os.path.join(src, c["file"])).convert("RGB")
            if crop:
                im = im.crop(crop)
            imgs.append(im.resize((im.width * scale, im.height * scale), Image.NEAREST))
        rows.append((case, imgs))
    cw, ch = rows[0][1][0].size
    ncol = max(len(r[1]) for r in rows)
    width = pad * 2 + ncol * cw + (ncol - 1) * gap
    height = pad + 28 + len(rows) * (22 + 20 + ch + gap) + pad
    sheet = Image.new("RGB", (width, height), (243, 241, 236))
    d = ImageDraw.Draw(sheet)
    d.text((pad, pad), title, fill=(30, 30, 30), font=big)
    y = pad + 30
    for case, imgs in rows:
        d.text((pad, y), f"{names.get(case['theme'], case['theme'])} {case['seed']} (Terracing 100, generator {case['generator']})", fill=(30, 30, 30), font=small)
        y += 22
        for k, (c, im) in enumerate(zip(case["cells"], imgs)):
            x = pad + k * (cw + gap)
            label = f"{c['label']}: {c['edges']:,} level edges"
            d.text((x, y), label, fill=(70, 70, 70), font=small)
            sheet.paste(im, (x, y + 20))
        y += 20 + ch + gap
    sheet = sheet.quantize(colors=128, method=Image.Quantize.MEDIANCUT)
    sheet.save(out, optimize=True)
    print(out, os.path.getsize(out), "bytes")


main()
