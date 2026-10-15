"""Lay out tools/erode-sheet.ts's six erosions, a row a case:
  1. top-down before, 2. after (violet: hollow under the rock, deeper darker; the gesture in white);
  3. a plan slice at the level most worn (rock, open air, worn air joined to the outside, worn air
     sealed off: red, never expected);
  4-5. a side profile before and after through the most-worn row or column (pale: hard beds; dark: worn air);
  6. the profile at right angles, after;
  7. a low oblique cutaway after, looking into the rock behind the profile's cut, undersides shaded.
A JPEG.

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


S = 6  # pixels a tile, top-down
V = 6  # pixels a voxel, in profile
Z = 23
THEMES = {"canyon": "Canyon", "highlands": "Highlands"}
SKY = (200, 222, 236)
HOLLOW = (52, 44, 66)


def ramp(h):
    stops = [(0, (86, 120, 70)), (6, (122, 140, 82)), (10, (160, 146, 102)), (14, (150, 132, 112)), (22, (190, 186, 180))]
    for (a, ca), (b, cb) in zip(stops, stops[1:]):
        if h <= b:
            t = (h - a) / max(1, b - a)
            return tuple(int(ca[k] + (cb[k] - ca[k]) * t) for k in range(3))
    return stops[-1][1]


def popcount(v):
    return bin(v & 0xFFFFFFFF).count("1")


def rock(c, z):
    return (196, 170, 128) if c["rock"][z] > 0.5 else (128, 112, 96)


def solid(m, z):
    return (m >> z) & 1


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
        if c["water"][q] > 0.05 and hs[q] == c["heightsBefore"][q]:
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
    a = c["profile"]
    if a["axis"] == "row":
        yy = (n - 1 - a["at"] + 0.5) * S
        d.line([(0, yy), (5, yy)], fill=(255, 220, 90), width=2)
        d.line([(n * S - 6, yy), (n * S, yy)], fill=(255, 220, 90), width=2)
    else:
        xx = (a["at"] + 0.5) * S
        d.line([(xx, 0), (xx, 5)], fill=(255, 220, 90), width=2)
        d.line([(xx, n * S - 6), (xx, n * S)], fill=(255, 220, 90), width=2)
    return img


def most_worn_level(c):
    counts = [0] * Z
    for b, a in zip(c["masksBefore"], c["masksAfter"]):
        gone = b & ~a
        for z in range(Z):
            if (gone >> z) & 1:
                counts[z] += 1
    return max(range(Z), key=lambda z: counts[z])


def plan_slice(c):
    """Rock, open air, worn air joined to the outside through air, and worn air sealed off (red)."""
    n = c["crop"]["n"]
    b, a = c["masksBefore"], c["masksAfter"]
    z0 = most_worn_level(c)
    open_ = set()
    stack = []
    for q in range(n * n):
        for z in range(Z):
            if not solid(b[q], z):
                open_.add((q, z))
                stack.append((q, z))
    while stack:
        q, z = stack.pop()
        x, y = q % n, q // n
        for nq, nz in ((q - 1 if x > 0 else -1, z), (q + 1 if x < n - 1 else -1, z), (q - n if y > 0 else -1, z), (q + n if y < n - 1 else -1, z), (q, z - 1), (q, z + 1)):
            if nq < 0 or nz < 0 or nz >= Z or (nq, nz) in open_ or solid(a[nq], nz):
                continue
            open_.add((nq, nz))
            stack.append((nq, nz))
    img = Image.new("RGB", (n * S, n * S))
    px = img.load()
    for q in range(n * n):
        x, y = q % n, q // n
        if solid(a[q], z0):
            col = rock(c, z0)
        elif not solid(b[q], z0):
            col = SKY
        elif (q, z0) in open_:
            col = HOLLOW
        else:
            col = (210, 40, 40)
        for dy in range(S):
            for dx in range(S):
                px[x * S + dx, (n - 1 - y) * S + dy] = col
    return img, z0


def column(c, axis, at, key):
    n = c["crop"]["n"]
    m = c[key]
    return [m[at * n + p] if axis == "row" else m[p * n + at] for p in range(n)]


def profile(c, axis, at, after):
    n = c["crop"]["n"]
    before = column(c, axis, at, "masksBefore")
    cols = column(c, axis, at, "masksAfter") if after else before
    img = Image.new("RGB", (n * V, Z * V), SKY)
    d = ImageDraw.Draw(img)
    for p in range(n):
        for z in range(Z):
            if solid(cols[p], z):
                col = rock(c, z)
            elif solid(before[p], z) and cols[p] >> z:
                col = HOLLOW
            else:
                continue
            y0 = (Z - 1 - z) * V
            d.rectangle([p * V, y0, p * V + V - 1, y0 + V - 1], fill=col)
    return img


def oblique(c):
    """The rock behind the profile's cut, after, in a low oblique view: the cut face square on, each
    row behind it up and to the right, faces toward the viewer, tops and undersides shaded."""
    n = c["crop"]["n"]
    a = c["profile"]
    m = c["masksAfter"]
    b = c["masksBefore"]
    rows = 14
    U = 5
    dx, dy = U * 0.5, U * 0.4
    img = Image.new("RGB", (int(n * U + rows * dx) + 2, int(Z * U + rows * dy) + 2), SKY)
    d = ImageDraw.Draw(img)
    def at(p, k):
        if p < 0 or p >= n:
            return None
        if a["axis"] == "row":
            y = a["at"] + k
            return y * n + p if 0 <= y < n else None
        x = a["at"] + k
        return p * n + x if 0 <= x < n else None
    def sol(p, k, z):
        q = at(p, k)
        return q is not None and 0 <= z < Z and solid(m[q], z)
    def worn(p, k, z):
        q = at(p, k)
        return q is not None and 0 <= z < Z and solid(b[q], z) and not solid(m[q], z)
    for k in range(rows - 1, -1, -1):
        for z in range(Z):
            for p in range(n):
                if not sol(p, k, z):
                    continue
                base = rock(c, z)
                near = worn(p, k - 1, z) or worn(p, k, z - 1) or worn(p, k, z + 1) or worn(p - 1, k, z) or worn(p + 1, k, z)
                fade = 1.0 - 0.035 * k
                x0 = p * U + k * dx
                y0 = (Z - 1 - z) * U + (rows - 1 - k) * dy
                if k == 0 or not sol(p, k - 1, z):
                    d.rectangle([x0, y0, x0 + U - 1, y0 + U - 1], fill=tuple(int(v * fade * (0.75 if near else 1.0)) for v in base))
                if not sol(p, k, z + 1):
                    d.polygon([(x0, y0), (x0 + dx, y0 - dy), (x0 + U + dx, y0 - dy), (x0 + U, y0)], fill=tuple(min(255, int(v * fade * 1.15)) for v in base))
                if not sol(p + 1, k, z):
                    d.polygon([(x0 + U, y0), (x0 + U + dx, y0 - dy), (x0 + U + dx, y0 + U - dy), (x0 + U, y0 + U)], fill=tuple(int(v * fade * 0.72) for v in base))
                if z > 0 and not sol(p, k, z - 1):
                    d.polygon([(x0, y0 + U), (x0 + dx, y0 + U - dy), (x0 + U + dx, y0 + U - dy), (x0 + U, y0 + U)], fill=tuple(int(v * fade * 0.45) for v in base))
    return img


def main():
    src, out = sys.argv[1], sys.argv[2]
    cases = json.load(open(os.path.join(src, "index.json"), encoding="utf8"))
    big, small = font(17), font(12)
    n = cases[0]["crop"]["n"]
    panels = []
    for c in cases:
        a = c["profile"]
        other = "col" if a["axis"] == "row" else "row"
        line = column(c, a["axis"], a["at"], "masksBefore")
        after = column(c, a["axis"], a["at"], "masksAfter")
        best = max(range(n), key=lambda p: popcount(line[p] & ~after[p]))
        sl, z0 = plan_slice(c)
        row = [top_down(c, False), top_down(c, True), sl, profile(c, a["axis"], a["at"], False), profile(c, a["axis"], a["at"], True), profile(c, other, best, True), oblique(c)]
        panels.append((c, row, z0))
    pad = 10
    widths = [max(p[1][k].size[0] for p in panels) for k in range(7)]
    rowh = max(max(im.size[1] for im in p[1]) for p in panels) + 22 + pad
    width = pad + sum(w + pad for w in widths)
    height = 70 + len(panels) * rowh + 20
    sheet = Image.new("RGB", (width, height), (246, 243, 236))
    d = ImageDraw.Draw(sheet)
    d.text((pad, 10), "Erode (D281): six erosions on generated maps and an arch on a hand-made fin, 128², from the core's terrain", font=big, fill=(30, 30, 30))
    d.text((pad, 32), "Top-down before | after (violet: hollow under rock) · plan slice at the most-worn level (dark: worn air open to the outside; red: sealed) ·", font=small, fill=(80, 80, 80))
    d.text((pad, 48), "profile before | after (pale: hard beds) · profile at right angles · oblique cutaway behind the profile, undersides dark", font=small, fill=(80, 80, 80))
    for k, (c, row, z0) in enumerate(panels):
        y = 70 + k * rowh
        size = "Auto" if c["size"] is None else str(c["size"])
        where = "hand-made" if c["seed"] == 0 else f'{THEMES.get(c["theme"], c["theme"])}, seed {c["seed"]}'
        label = f'{k + 1}. {where}: {c["what"]} · Power {c["power"]}, Size {size} · worn {c["worn"]}, kept to hold {c["held"]}, dropped {c["falls"]} · slice at level {z0}'
        d.text((pad, y), label, font=small, fill=(30, 30, 30))
        x = pad
        for w, im in zip(widths, row):
            sheet.paste(im, (x, y + 18))
            x += w + pad
    d.text((pad, height - 16), "npx tsx tools/erode-sheet.ts; python tools/erode-sheet.py .scratch/erode-sheet docs/sheets/erode-1.jpg", font=small, fill=(110, 110, 110))
    sheet.save(out, "JPEG", quality=86, optimize=True)
    print(out, os.path.getsize(out), "bytes", sheet.size)


main()
