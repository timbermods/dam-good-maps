"""Lay out before-and-after frames as one sheet for the water tree (D(water-tree)): each map whole, north up, its start's
numbers first (D515's floors from the map's own checks), then the tree's measures (tools/water-tree.ts), attempts and
leaks. The frames are tools/ruled-water.ts --frames'; the measures tools/water-tree.ts --json's, one file a side.

    python tools/water-tree-sheet.py <before frames> <before.json> <after frames> <after.json> <out.png> highlands-4 … [--cell 512]

Two maps a row, each as before | after.
"""
import json
import os
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from importlib import import_module

rw = import_module("ruled-water-sheet")


def tree_line(t, rec):
    return (f"courses {t['courses']} (alone {t['alone']})  ·  joins {t['joins']}, wider below {t['wider']}  ·  wet "
            f"{100 * t['wetShare']:.1f} %  ·  irrigable dry {100 * t['irrigable']:.1f} %  ·  attempts {rec.get('attempts', '?')}, "
            f"leaks {rec.get('leaks', '?')}")


def main():
    args = sys.argv[1:]
    cell = 512
    if "--cell" in args:
        k = args.index("--cell")
        cell = int(args[k + 1])
        args = args[:k] + args[k + 2:]
    before, bjson, after, ajson, out = args[:5]
    maps = args[5:]
    trees = {}
    for side, path in (("before", bjson), ("after", ajson)):
        with open(path, encoding="utf-8") as f:
            trees[side] = {r["name"]: r["m"] for r in json.load(f)}
    f_head, f_line = rw.font(18), rw.font(13)
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
            head, start, _ = rw.labels(rec, side)
            d.text((x0, y0), head, fill=(255, 255, 255), font=f_head)
            d.multiline_text((x0, y0 + 24), start, fill=(255, 230, 150), font=f_line, spacing=2)
            t = trees[side].get(m)
            d.text((x0, y0 + 62), tree_line(t, rec) if t else "", fill=(200, 220, 255), font=f_line)
            img = Image.open(os.path.join(folder, m + ".png")).convert("RGB")
            img = img.resize((cell, cell), Image.NEAREST)
            sheet.paste(img, (x0, y0 + lab))
            k += 1
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    sheet.save(out, optimize=True)
    print(f"wrote {out} ({sheet.width}×{sheet.height})")


if __name__ == "__main__":
    main()
