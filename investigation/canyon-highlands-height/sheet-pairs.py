"""Before beside after, one theme, seeds 1-30: each map's two pictures side by side (dev's tip, then the
patch), 256 px cells, five pairs a row, labelled with the seed; a PNG under 1 MB where it fits, else a
JPEG.

    python investigation/canyon-highlands-height/sheet-pairs.py <theme> <before dir> <after dir> <out> "<title>"

A dir holds <theme>-<seed>.png or .jpg (tools/look.ts, investigation/theme-critique/capture-3d.ts).
"""
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


def pic(d, theme, seed):
    for ext in ("png", "jpg", "jpeg"):
        p = os.path.join(d, f"{theme}-{seed}.{ext}")
        if os.path.exists(p):
            return Image.open(p).convert("RGB")
    return None


def fit(im, cell):
    """The picture scaled to the cell, its middle kept (a 3D capture is wider than tall: the map's
    frame is cropped to a square round its centre first)."""
    if im is None:
        return Image.new("RGB", (cell, cell), (60, 60, 60))
    w, h = im.size
    if w != h:
        # the opening camera frames a 128² map in about the middle 700 px of a 1105×733 capture
        bx, by, bw = round(w * 0.17), round(h * 0.04), round(w * 0.66)
        im = im.crop((bx, by, bx + bw, by + bw))
    return im.resize((cell, cell), Image.LANCZOS if im.size[0] > cell else Image.NEAREST)


def main():
    theme, before, after, out, title = sys.argv[1:6]
    cell, gap, label, cols = 288, 6, 18, 5
    seeds = list(range(1, 31))
    rows = (len(seeds) + cols - 1) // cols
    pair_w = 2 * cell + 2
    width = cols * (pair_w + gap) + gap
    top = 34
    height = top + rows * (cell + label + gap)
    sheet = Image.new("RGB", (width, height), (250, 248, 242))
    d = ImageDraw.Draw(sheet)
    d.text((8, 8), title, fill=(30, 30, 30), font=font(18))
    small = font(13)
    for k, seed in enumerate(seeds):
        r, c = divmod(k, cols)
        x = gap + c * (pair_w + gap)
        y = top + r * (cell + label + gap)
        d.text((x + 2, y), f"{seed}  before | after", fill=(60, 60, 60), font=small)
        sheet.paste(fit(pic(before, theme, seed), cell), (x, y + label))
        sheet.paste(fit(pic(after, theme, seed), cell), (x + cell + 2, y + label))
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    if out.lower().endswith(".png"):
        for colors in (256, 128, 96, 64):
            q = sheet.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG if colors >= 128 else Image.Dither.NONE)
            q.save(out, optimize=True)
            if os.path.getsize(out) < 1_000_000:
                break
    else:
        for quality in (82, 74, 66, 58):
            sheet.save(out, quality=quality, optimize=True)
            if os.path.getsize(out) < 1_000_000:
                break
    print(f"{out}: {os.path.getsize(out)} bytes, {sheet.size[0]}x{sheet.size[1]}")


if __name__ == "__main__":
    main()
