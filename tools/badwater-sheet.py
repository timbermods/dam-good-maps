"""Lay out tools/badwater-sheet.ts's maps as one before | after sheet: four pairs a row, each map
labelled with its seed and side, a * where badwater reaches the main water, and a key to the water's
shading (its own colour to rust by the square root of its badwater share); a quantized PNG under 1 MB.

    python tools/badwater-sheet.py <maps.json> <cells dir> <out.png>
"""
import json
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFont

# (deep water's own colour, src/core/render/shade.ts WATER, the key's clean end)
WATER = (64, 128, 200)


def font(size):
    for name in ("arial.ttf", "segoeui.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def key(d, x, y, rust, small):
    """The water's shading: a bar from clean to all badwater, ticks at the shares that matter."""
    d.text((x, y), "Water by its badwater share:", fill=(40, 40, 40), font=small)
    x0 = x + 178
    w, h = 300, 12
    for k in range(w):
        t = k / (w - 1)
        c = tuple(round(WATER[j] * (1 - t) + rust[j] * t) for j in range(3))
        d.line([(x0 + k, y + 2), (x0 + k, y + 2 + h)], fill=c)
    for share, text in ((0, "0"), (0.01, "1%"), (0.05, "5%"), (0.25, "25%"), (1, "100%")):
        px = x0 + round(math.sqrt(share) * (w - 1))
        d.line([(px, y + 2 + h), (px, y + 6 + h)], fill=(40, 40, 40))
        d.text((px - 6, y + 7 + h), text, fill=(40, 40, 40), font=small)
    d.text((x0 + w + 16, y), "a square-root scale; water 5% or more bad is not pumpable", fill=(40, 40, 40), font=small)


def main():
    src, cells, dst = sys.argv[1], sys.argv[2], sys.argv[3]
    with open(src, encoding="utf-8") as f:
        index = json.load(f)
    maps = index["maps"]
    pairs = any(m["before"] for m in maps)
    per_row = 4 if pairs else 8
    cell, gap, label, top = 192, 8, 16, 62
    unit = (2 * cell + 4 if pairs else cell) + gap
    rows = (len(maps) + per_row - 1) // per_row
    sheet = Image.new("RGB", (per_row * unit + gap, top + rows * (cell + label + gap)), (250, 248, 242))
    d = ImageDraw.Draw(sheet)
    d.text((gap, 5), index["title"], fill=(20, 20, 20), font=font(15))
    small = font(12)
    key(d, gap, 26, tuple(index.get("rust", (150, 48, 32))), small)
    for k, m in enumerate(maps):
        x0 = gap + (k % per_row) * unit
        y0 = top + (k // per_row) * (cell + label + gap)
        sides = [("before", m["before"], m["beforeBad"]), ("after", m["after"], m["afterBad"])] if pairs else [("", m["after"], m["afterBad"])]
        for j, (tag, file, bad) in enumerate(sides):
            x = x0 + j * (cell + 4)
            text = f"seed {m['seed']} {tag}".strip() + (" *" if bad else "")
            d.text((x, y0), text, fill=(150, 30, 20) if bad else (60, 60, 60), font=small)
            if file:
                im = Image.open(os.path.join(cells, file)).convert("RGB").resize((cell, cell), Image.NEAREST)
                sheet.paste(im, (x, y0 + label))
    os.makedirs(os.path.dirname(os.path.abspath(dst)), exist_ok=True)
    sheet.quantize(colors=160, method=Image.Quantize.MEDIANCUT).save(dst, optimize=True)
    print(f"{dst}: {os.path.getsize(dst) // 1024} KB")


if __name__ == "__main__":
    main()
