"""Lay out tools/look.ts's pictures as one labelled grid, for a closer look at a few maps.

    python tools/look-grid.py <look dir> [cols] [cell]

Writes <look dir>/grid.png: each map with its theme and seed, whether its water reads, and its
intentions (+ emerged, - dropped).
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
    src = sys.argv[1]
    cols = int(sys.argv[2]) if len(sys.argv) > 2 else 3
    cell = int(sys.argv[3]) if len(sys.argv) > 3 else 384
    with open(os.path.join(src, "index.json"), encoding="utf-8") as f:
        maps = [m for m in json.load(f)["maps"] if "file" in m]
    label = 46
    rows = (len(maps) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (cell + 6) + 6, rows * (cell + label + 6) + 6), (250, 248, 242))
    d = ImageDraw.Draw(sheet)
    f1, f2 = font(14), font(11)
    for k, m in enumerate(maps):
        x = 6 + (k % cols) * (cell + 6)
        y = 6 + (k // cols) * (cell + label + 6)
        im = Image.open(os.path.join(src, m["file"])).convert("RGB").resize((cell, cell), Image.NEAREST)
        sheet.paste(im, (x, y + label))
        s = m.get("story") or {}
        head = f"{NAMES.get(m['theme'], m['theme'])} {m['seed']}"
        if m.get("name"):
            head += f": {m['name']}"
        d.text((x, y), head, fill=(20, 20, 20), font=f1)
        ints = " ".join(f"{i['id']}{'+' if i['ok'] else '-'}" for i in m.get("intentions", []))
        line = f"{'reads' if s.get('readable') else 'tangle'} main {s.get('mainShare')} sys {s.get('systems')} heads {s.get('heads')}  {ints}"
        d.text((x, y + 18), line[:90], fill=(60, 60, 60), font=f2)
        o = m.get("outcomes")
        if o:
            d.text((x, y + 31), str(o.get("summary", ""))[:90], fill=(60, 60, 60), font=f2)
    out = os.path.join(src, "grid.png")
    sheet.save(out, optimize=True)
    print(out)


if __name__ == "__main__":
    main()
