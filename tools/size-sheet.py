"""Lay out the pictures tools/size-smoke.ts --thumbs wrote as one labelled contact sheet (PLAN §20 D144, D357):
a row per theme, a column per shape, each picture's longer side 128 pixels, the start marked red, each labelled with its time
and its share of water (or "refused" under its theme's least side); a quantized PNG
under 1 MB.

    python tools/size-sheet.py <thumbs dir> docs/sheets/<step>.png "<title>"
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

NAMES = {"any": "Any", "riverValley": "River Valley", "canyon": "Canyon", "highlands": "Highlands", "lakeBasin": "Lake Basin",
         "delta": "Delta", "islands": "Islands"}
CELL = 136
LEFT = 96
TOP = 44


def font(size):
    for name in ("arial.ttf", "segoeui.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def main():
    src, dst, title = sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else ""
    with open(os.path.join(src, "index.json"), encoding="utf-8") as f:
        index = json.load(f)
    shapes, themes = index["shapes"], index["themes"]
    sheet = Image.new("RGB", (LEFT + CELL * len(shapes), TOP + (CELL + 16) * len(themes)), (250, 248, 244))
    draw = ImageDraw.Draw(sheet)
    small, big = font(12), font(15)
    draw.text((8, 6), title, fill=(30, 30, 30), font=big)
    for c, shape in enumerate(shapes):
        draw.text((LEFT + c * CELL + 4, TOP - 18), shape, fill=(30, 30, 30), font=small)
    for r, theme in enumerate(themes):
        y0 = TOP + r * (CELL + 16)
        draw.text((8, y0 + CELL // 2 - 8), NAMES.get(theme, theme), fill=(30, 30, 30), font=small)
        for c, shape in enumerate(shapes):
            row = next((q for q in index["rows"] if q["shape"] == shape and q["theme"] == theme), None)
            x0 = LEFT + c * CELL
            if row and row.get("png"):
                im = Image.open(os.path.join(src, row["png"])).convert("RGB")
                sheet.paste(im, (x0 + (CELL - 8 - im.width) // 2, y0 + (CELL - 8 - im.height) // 2))
            if not row:
                label = "no map"
            elif row["result"] != "ok":
                label = "refused"
            else:
                label = f"{row['ms'] / 1000:.0f} s, water {row.get('water', '?')}%"
            draw.text((x0 + 4, y0 + CELL - 6), label.strip(), fill=(90, 90, 90), font=small)
    sheet.quantize(colors=128, method=Image.Quantize.MEDIANCUT).save(dst, optimize=True)
    print(dst, os.path.getsize(dst), "bytes")


if __name__ == "__main__":
    main()
