"""Lay out the pictures tools/contact-sheet.ts wrote as one labelled contact sheet (PLAN §20 D144):
a block per theme, ten maps a row, each labelled with its theme and seed; a quantized PNG under 1 MB.

    python tools/contact-sheet.py .scratch/sheet docs/sheets/<step>.png "<title>"
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

NAMES = {"any": "Any", "riverValley": "River Valley", "canyon": "Canyon", "highlands": "Highlands", "lakeBasin": "Lake Basin",
         "delta": "Delta", "islands": "Islands"}


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
    maps = index["maps"]
    themes = []
    for m in maps:
        if m["theme"] not in themes:
            themes.append(m["theme"])
    cols, cell, label, head = 10, 96, 14, 22
    per_theme = max(len([m for m in maps if m["theme"] == t]) for t in themes)
    rows = (per_theme + cols - 1) // cols
    block = head + rows * (cell + label + 4)
    top = 30 if title else 0
    sheet = Image.new("RGB", (cols * (cell + 4) + 4, top + len(themes) * block), (250, 248, 242))
    d = ImageDraw.Draw(sheet)
    small, big = font(11), font(15)
    if title:
        d.text((6, 6), title, fill=(30, 30, 30), font=font(17))
    for t, theme in enumerate(themes):
        y0 = top + t * block
        d.text((6, y0 + 3), NAMES.get(theme, theme), fill=(30, 30, 30), font=big)
        for k, m in enumerate([m for m in maps if m["theme"] == theme]):
            im = Image.open(os.path.join(src, m["file"])).convert("RGB").resize((cell, cell), Image.BILINEAR)
            x = 4 + (k % cols) * (cell + 4)
            y = y0 + head + (k // cols) * (cell + label + 4)
            sheet.paste(im, (x, y + label))
            d.text((x + 1, y), f"{NAMES.get(theme, theme)} {m['seed']}", fill=(60, 60, 60), font=small)
    os.makedirs(os.path.dirname(dst) or ".", exist_ok=True)
    # under 1 MB (D144): fewer colours until it fits (no dithering: its noise costs more than the
    # banding it hides at this size)
    for colors in (128, 96, 64, 48, 32):
        dither = Image.Dither.FLOYDSTEINBERG if colors == 128 else Image.Dither.NONE
        sheet.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=dither).save(dst, optimize=True)
        if os.path.getsize(dst) < 1_000_000:
            break
    print(f"{dst}: {os.path.getsize(dst)} bytes, {sheet.size[0]}x{sheet.size[1]}, {colors} colours")


if __name__ == "__main__":
    main()
