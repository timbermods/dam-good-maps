"""Lay out captures as labelled grids for reading by eye.

    python investigation/theme-critique/grid.py top <look dir> <out dir>   # one grid per theme, 6x5, 256 px cells
    python investigation/theme-critique/grid.py 3d <3d dir> <out dir>      # per theme, 6 maps per image (3x2), 560 px wide
    python investigation/theme-critique/grid.py pick <out file> <cell px> <label>=<image> ...   # a small capture for the report
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

THEMES = ["any", "riverValley", "canyon", "highlands", "lakeBasin", "delta", "islands"]
NAMES = {"any": "Any", "riverValley": "River Valley", "canyon": "Canyon", "highlands": "Highlands", "lakeBasin": "Lake Basin", "delta": "Delta", "islands": "Islands"}

def font(size):
    for name in ("arial.ttf", "segoeui.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()

def grid(cells, cols, cw, ch, label_h, out, title=None):
    rows = (len(cells) + cols - 1) // cols
    th = 28 if title else 0
    im = Image.new("RGB", (cols * cw, th + rows * (ch + label_h)), (24, 24, 24))
    d = ImageDraw.Draw(im)
    f = font(14)
    if title:
        d.text((6, 6), title, fill=(255, 255, 255), font=f)
    for i, (label, img) in enumerate(cells):
        r, c = divmod(i, cols)
        x, y = c * cw, th + r * (ch + label_h)
        if img is not None:
            img = img.copy()
            img.thumbnail((cw - 4, ch - 4))
            im.paste(img, (x + 2, y + 2))
        d.text((x + 4, y + ch + 2), label, fill=(255, 255, 255), font=f)
    im.save(out)
    return out

mode = sys.argv[1]
if mode == "top":
    src, out = sys.argv[2], sys.argv[3]
    os.makedirs(out, exist_ok=True)
    idx = json.load(open(os.path.join(src, "index.json")))["maps"]
    by = {(m["theme"], m["seed"]): m for m in idx}
    for t in THEMES:
        cells = []
        for s in range(1, 31):
            m = by.get((t, s))
            p = os.path.join(src, f"{t}-{s}.png")
            img = Image.open(p) if os.path.exists(p) else None
            o = (m or {}).get("outcomes") or {}
            tag = "" if not m else (" P" if o.get("promise") else " p-") + (" W" if (m.get("story") or {}).get("readable") else " w-")
            cells.append((f"{s}{tag} {(m or {}).get('name') or ''}"[:34], img))
        grid(cells, 6, 256, 256, 18, os.path.join(out, f"top-{t}.png"), f"{NAMES[t]} seeds 1-30, 128², top-down  (P promise kept, W water reads)")
        print("wrote", f"top-{t}.png")
elif mode == "3d":
    src, out = sys.argv[2], sys.argv[3]
    os.makedirs(out, exist_ok=True)
    for t in THEMES:
        seeds = list(range(1, 31))
        for k in range(0, 30, 6):
            cells = []
            for s in seeds[k:k + 6]:
                p = os.path.join(src, f"{t}-{s}.jpg")
                img = Image.open(p) if os.path.exists(p) else None
                if img is not None:
                    w, h = img.size
                    img = img.crop((int(w * 0.17), int(h * 0.04), int(w * 0.82), int(h * 0.96)))
                cells.append((f"{NAMES[t]} {s}", img))
            grid(cells, 3, 560, 530, 18, os.path.join(out, f"3d-{t}-{k // 6 + 1}.jpg"))
        print("wrote", t)
elif mode == "pick":
    out, cell = sys.argv[2], int(sys.argv[3])
    cells = []
    for a in sys.argv[4:]:
        label, p = a.split("=", 1)
        img = Image.open(p)
        if p.endswith(".jpg"):
            w, h = img.size
            img = img.crop((int(w * 0.17), int(h * 0.04), int(w * 0.82), int(h * 0.96)))
        cells.append((label, img))
    grid(cells, len(cells), cell, cell, 18, out)
    print("wrote", out, os.path.getsize(out))
