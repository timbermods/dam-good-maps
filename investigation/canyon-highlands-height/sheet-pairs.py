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
    """<theme>-<seed>.png or .jpg; a dir of capture-pitch.ts's captures gives its 70° shot."""
    for name in (f"{theme}-{seed}.png", f"{theme}-{seed}.jpg", f"{theme}-{seed}.jpeg", f"{theme}-{seed}-70.jpg"):
        p = os.path.join(d, name)
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
        # the renderer's own framing (no page insets) puts a 128² map in the middle of the capture, a little
        # wider than the capture is tall (1280×733: about 760 px): that middle, on a square of the sky's blue
        side = min(w, round(h * 1.05))
        mid = im.crop(((w - side) // 2, 0, (w - side) // 2 + side, h))
        im = Image.new("RGB", (side, side), (48, 96, 150))
        im.paste(mid, (0, (side - h) // 2))
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
