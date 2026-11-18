"""Lay out before-and-after frames that tools/ruled-water.ts --frames wrote as one sheet: each map whole, north up, its
start's numbers first (D515's floors from the map's own checks), then the ruled-water measures, attempts and leaks.

    python tools/ruled-water-sheet.py <before frames> <after frames> <out.png> riverValley-9 delta-3 … [--cell 512]

Two maps a row, each as before | after. Straight lake shore is marked orange, channels side by side within 6 tiles
water to water yellow.
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

NAMES = {"any": "Any", "riverValley": "River Valley", "canyon": "Canyon", "highlands": "Highlands", "lakeBasin": "Lake Basin",
         "delta": "Delta", "islands": "Islands"}
START = [("start.level_land", "bench"), ("start.reach", "walk"), ("start.wood", "wood"), ("start.wood_fast", "fast"),
         ("start.water", "water"), ("start.food", "food"), ("start.forester", "forester"), ("start.farmland", "farm")]


def font(size):
    for name in ("arial.ttf", "segoeui.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def num(v):
    if v is None:
        return "–"
    if isinstance(v, float) and not v.is_integer():
        return f"{v:.2f}" if abs(v) < 10 else f"{v:.0f}"
    return f"{int(v)}"


def labels(rec, side):
    name = rec.get("theme", "?")
    s = rec.get("start") or {}
    start = "  ".join(f"{short} {num(s[k]['value'])}" + ("" if s[k].get("ok") else "!") for k, short in START if k in s)
    start = start.replace("  food", "\n       food", 1)
    head = f"{NAMES.get(name, name)} {rec.get('seed', '?')} · {side}"
    water = (f"straight shore {100 * rec['straightShare']:.1f} % (longest {rec['longestShore']})  ·  side by side "
             f"{rec['beside6']} (12: {rec['beside']}) tiles  ·  attempts {rec.get('attempts', '?')}, leaks {rec.get('leaks', '?')}")
    return head, "start: " + start, water


def main():
    before, after, out = sys.argv[1], sys.argv[2], sys.argv[3]
    rest = sys.argv[4:]
    cell = 512
    if "--cell" in rest:
        k = rest.index("--cell")
        cell = int(rest[k + 1])
        rest = rest[:k] + rest[k + 2:]
    maps = rest
    f_head, f_line = font(18), font(13)
    lab = 88
    cols = 4
    rows = (2 * len(maps) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (cell + 8) + 8, rows * (cell + lab + 8) + 8), (24, 24, 24))
    d = ImageDraw.Draw(sheet)
    k = 0
    for m in maps:
        for side, folder in (("before", before), ("after", after)):
            x0 = 8 + (k % cols) * (cell + 8)
            y0 = 8 + (k // cols) * (cell + lab + 8)
            with open(os.path.join(folder, m + ".json"), encoding="utf-8") as f:
                rec = json.load(f)
            head, start, water = labels(rec, side)
            d.text((x0, y0), head, fill=(255, 255, 255), font=f_head)
            d.multiline_text((x0, y0 + 24), start, fill=(255, 230, 150), font=f_line, spacing=2)
            d.text((x0, y0 + 62), water, fill=(200, 220, 255), font=f_line)
            img = Image.open(os.path.join(folder, m + ".png")).convert("RGB")
            img = img.resize((cell, cell), Image.NEAREST)
            sheet.paste(img, (x0, y0 + lab))
            k += 1
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    sheet.save(out, optimize=True)
    print(f"wrote {out} ({sheet.width}×{sheet.height})")


if __name__ == "__main__":
    main()
