"""Lay out tools/badwater-sheet.ts's maps as one before | after sheet: four pairs a row, each map
labelled with its seed and side, a * where the main water carries badwater; a quantized PNG under 1 MB.

    python tools/badwater-sheet.py <maps.json> <cells dir> <out.png>
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
            continue
    return ImageFont.load_default()


def main():
    src, cells, dst = sys.argv[1], sys.argv[2], sys.argv[3]
    with open(src, encoding="utf-8") as f:
        index = json.load(f)
    maps = index["maps"]
    pairs = any(m["before"] for m in maps)
    per_row = 4 if pairs else 8
    cell, gap, label, top = 192, 8, 16, 26
    unit = (2 * cell + 4 if pairs else cell) + gap
    rows = (len(maps) + per_row - 1) // per_row
    sheet = Image.new("RGB", (per_row * unit + gap, top + rows * (cell + label + gap)), (250, 248, 242))
    d = ImageDraw.Draw(sheet)
    d.text((gap, 5), index["title"], fill=(20, 20, 20), font=font(15))
    small = font(12)
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
    sheet.quantize(colors=128, method=Image.Quantize.MEDIANCUT).save(dst, optimize=True)
    print(f"{dst}: {os.path.getsize(dst) // 1024} KB")


if __name__ == "__main__":
    main()
