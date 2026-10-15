"""Lay out tools/erode-sheet.ts's six erosions: a row a case, top-down before and after (the hollows
under the rock tinted, deeper darker; the gesture in white) and a side profile before and after (rock,
hard beds paler, open air, the worn hollow dark); a JPEG.

    python tools/erode-sheet.py <dir> <out.jpg>
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


S = 7  # pixels a tile, top-down
V = 7  # pixels a voxel, in profile
Z = 23
THEMES = {"canyon": "Canyon", "highlands": "Highlands"}


def ramp(h):
    # low green to high tan and grey, as the preview's ground reads
    stops = [(0, (86, 120, 70)), (6, (122, 140, 82)), (10, (160, 146, 102)), (14, (150, 132, 112)), (22, (190, 186, 180))]
    for (a, ca), (b, cb) in zip(stops, stops[1:]):
        if h <= b:
            t = (h - a) / max(1, b - a)
            return tuple(int(ca[k] + (cb[k] - ca[k]) * t) for k in range(3))
    return stops[-1][1]


def popcount(v):
    return bin(v & 0xFFFFFFFF).count("1")


def top_down(c, after):
    n = c["crop"]["n"]
    hs = c["heightsAfter" if after else "heightsBefore"]
    img = Image.new("RGB", (n * S, n * S))
    px = img.load()
    for q in range(n * n):
        x, y = q % n, q // n
        h = hs[q]
        west = hs[q - 1] if x > 0 else h
        north = hs[q - n] if y > 0 else h
        shade = 1.0 + 0.06 * (h - west) + 0.06 * (h - north)
        col = tuple(max(0, min(255, int(v * shade))) for v in ramp(h))
        if c["water"][q] > 0.05 and not after or (after and c["water"][q] > 0.05 and hs[q] == c["heightsBefore"][q]):
            col = (70, 120, 170)
        if after:
            worn = popcount(c["masksBefore"][q] & ~c["masksAfter"][q])
            if worn and hs[q] == c["heightsBefore"][q]:
                k = min(1.0, 0.35 + worn / 10)
                col = tuple(int(col[i] * (1 - k) + (70, 40, 110)[i] * k) for i in range(3))
        for dy in range(S):
            for dx in range(S):
                px[x * S + dx, (n - 1 - y) * S + dy] = col
    d = ImageDraw.Draw(img)
    pts = [((p["x"] + 0.5) * S, (n - 1 - p["y"] + 0.5) * S) for p in c["path"]]
    if len(pts) == 1:
        x, y = pts[0]
        d.ellipse([x - 4, y - 4, x + 4, y + 4], outline=(255, 255, 255), width=2)
    else:
        d.line(pts, fill=(255, 255, 255), width=2)
    # where the profile runs
    a = c["profile"]
    if a["axis"] == "row":
        yy = (n - 1 - a["at"] + 0.5) * S
        d.line([(0, yy), (4, yy)], fill=(255, 220, 90), width=2)
        d.line([(n * S - 5, yy), (n * S, yy)], fill=(255, 220, 90), width=2)
    else:
        xx = (a["at"] + 0.5) * S
        d.line([(xx, 0), (xx, 4)], fill=(255, 220, 90), width=2)
        d.line([(xx, n * S - 5), (xx, n * S)], fill=(255, 220, 90), width=2)
    return img


def profile(c, after):
    n = c["crop"]["n"]
    before = c["sliceBefore"]
    cols = c["sliceAfter"] if after else before
    img = Image.new("RGB", (n * V, Z * V), (200, 222, 236))
    d = ImageDraw.Draw(img)
    for p in range(n):
        for z in range(Z):
            solid = (cols[p] >> z) & 1
            was = (before[p] >> z) & 1
            if solid:
                col = (196, 170, 128) if c["rock"][z] > 0.5 else (128, 112, 96)
            elif was and cols[p] >> z:
                # (worn under rock that stays: a hollow; ground scoured open to the sky is sky)
                col = (52, 44, 66)
            else:
                continue
            y0 = (Z - 1 - z) * V
            d.rectangle([p * V, y0, p * V + V - 1, y0 + V - 1], fill=col)
    return img


def main():
    src, out = sys.argv[1], sys.argv[2]
    cases = json.load(open(os.path.join(src, "index.json"), encoding="utf8"))
    big, small = font(17), font(13)
    n = cases[0]["crop"]["n"]
    pw, ph = n * S, n * S
    qw, qh = n * V, Z * V
    pad = 12
    row = 22 + max(ph, qh) + pad
    width = pad + 2 * (pw + pad) + 2 * (qw + pad)
    height = 52 + len(cases) * row + 26
    sheet = Image.new("RGB", (width, height), (246, 243, 236))
    d = ImageDraw.Draw(sheet)
    d.text((pad, 12), "Erode (D281): six erosions on generated maps, 128², from the core's terrain", font=big, fill=(30, 30, 30))
    d.text((pad, 33), "Top-down before | after (violet: hollow under the rock) · profile before | after (pale: hard beds; dark: worn air)", font=small, fill=(80, 80, 80))
    for k, c in enumerate(cases):
        y = 52 + k * row
        size = "Auto" if c["size"] is None else str(c["size"])
        label = f'{k + 1}. {THEMES.get(c["theme"], c["theme"])}, seed {c["seed"]}: {c["what"]} · Power {c["power"]}, Size {size} · worn {c["worn"]}, kept to hold {c["held"]}, dropped {c["falls"]}'
        d.text((pad, y), label, font=small, fill=(30, 30, 30))
        x = pad
        for img in (top_down(c, False), top_down(c, True)):
            sheet.paste(img, (x, y + 20))
            x += pw + pad
        for img in (profile(c, False), profile(c, True)):
            sheet.paste(img, (x, y + 20 + (ph - qh) // 2 if ph > qh else y + 20))
            x += qw + pad
    d.text((pad, height - 20), "npx tsx tools/erode-sheet.ts; python tools/erode-sheet.py .scratch/erode-sheet docs/sheets/erode-1.jpg", font=small, fill=(110, 110, 110))
    sheet.save(out, "JPEG", quality=86, optimize=True)
    print(out, os.path.getsize(out), "bytes", sheet.size)


main()
