"""Lay out before | after badwater pictures made by tools/badwater-numbers.ts --png (one folder per side).

  python tools/badwater-pairs.py --before <dir> --after <dir> --maps riverValley:1,any:4 --out sheet.png
      [--title "..."] [--scale 2] [--labels "dev 0.10.39,branch 0.10.40"]

Each row is one map, the before side left and the after side right, whole maps north up, each captioned with its
theme, size and seed, the start's check numbers (reach, level land, food, wood, badwater distance, walk to clean
water) and its pits (where each ditch ends, how many deliver, their lengths). A .jpg out is saved at quality 82.
"""
from __future__ import annotations

import argparse
import json
import os

from PIL import Image, ImageDraw, ImageFont

NAMES = {"any": "Any", "riverValley": "River Valley", "canyon": "Canyon", "highlands": "Highlands", "lakeBasin": "Lake Basin", "delta": "Delta", "islands": "Islands"}


def font(size: int) -> ImageFont.ImageFont:
    for name in ("DejaVuSans.ttf", "arial.ttf", "segoeui.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


def caption(row: dict, side: str) -> list[str]:
    c = row["checks"]

    def n(k: str) -> str:
        v = c.get(k)
        return str(round(v, 1)) if isinstance(v, (int, float)) else str(v)

    ends = {"river": 0, "lake": 0, "ditch": 0, "edge": 0}
    for p in row["pits"]:
        ends[p["to"]] = ends.get(p["to"], 0) + 1
    delivered = sum(1 for p in row["pits"] if p["delivers"])
    lengths = " ".join(str(p["length"]) for p in row["pits"])
    return [
        f"{NAMES.get(row['theme'], row['theme'])} {row['size']}², seed {row['seed']}, {side} ({row['version']})",
        f"start {row['start']}, {row['attempts']} attempts; reach {n('start.reach')}, level land {n('start.level_land')}",
        f"food {n('start.food')}, wood {n('start.wood')}, badwater at {n('start.badwater')}, walk to clean water {n('start.water')}",
        f"pits {len(row['pits'])}: river {ends['river']}, lake {ends['lake']}, gully {ends['ditch']}, edge {ends['edge']}; delivered {delivered}",
        f"lengths {lengths or '-'}",
    ]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--before", required=True)
    ap.add_argument("--after", required=True)
    ap.add_argument("--maps", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--title", default="")
    ap.add_argument("--scale", type=int, default=2)
    ap.add_argument("--labels", default="base,branch")
    a = ap.parse_args()
    labels = a.labels.split(",")
    maps = [m.split(":") for m in a.maps.split(",")]
    f_cap, f_title = font(13), font(15)
    line_h, pad = 16, 10
    cells = []
    for theme, seed in maps:
        row = []
        for d in (a.before, a.after):
            img = Image.open(os.path.join(d, f"{theme}-{seed}.png")).convert("RGB")
            img = img.resize((img.width * a.scale, img.height * a.scale), Image.NEAREST)
            with open(os.path.join(d, f"{theme}-{seed}.json"), encoding="utf-8") as fh:
                row.append((img, json.load(fh)))
        cells.append(row)
    w = max(img.width for r in cells for img, _ in r)
    h = max(img.height for r in cells for img, _ in r)
    cap_h = 5 * line_h + 6
    title_h = line_h + 2 * pad if a.title else pad
    sheet = Image.new("RGB", (2 * w + 3 * pad, title_h + len(cells) * (cap_h + h + pad)), (243, 241, 236))
    dr = ImageDraw.Draw(sheet)
    if a.title:
        dr.text((pad, pad), a.title, fill=(20, 20, 20), font=f_title)
    y = title_h
    for row in cells:
        for k, (img, data) in enumerate(row):
            x = pad + k * (w + pad)
            for j, t in enumerate(caption(data, labels[k])):
                dr.text((x, y + j * line_h), t, fill=(20, 20, 20) if j == 0 else (60, 60, 60), font=f_cap)
            sheet.paste(img, (x, y + cap_h))
        y += cap_h + h + pad
    if a.out.lower().endswith((".jpg", ".jpeg")):
        sheet.save(a.out, quality=82, optimize=True)
    else:
        sheet.save(a.out, optimize=True)
    print(f"{a.out}: {sheet.width}×{sheet.height}, {os.path.getsize(a.out) // 1024} KB")


if __name__ == "__main__":
    main()
