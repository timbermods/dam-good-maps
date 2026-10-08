"""The opening camera as it is (70° down) beside the same map pitched 55° down, one theme, seeds 1-30:
each map's two captures side by side, the map cropped to its own bounds, 288 px cells, five pairs a row.

    python investigation/canyon-highlands-height/sheet-pitch.py <theme> <pitch dir> <out.jpg> "<title>"

The dir holds <theme>-<seed>-70.jpg and <theme>-<seed>-55.jpg (capture-pitch.ts).
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


def map_bounds(im):
    """The map's bounding box in a capture: the pixels that are not the sky (blue with little red)."""
    small = im.resize((im.width // 4, im.height // 4))
    px = small.load()
    xs, ys = [], []
    for y in range(small.height):
        for x in range(small.width):
            r, g, b = px[x, y]
            if not (b > r + 30 and b > g):
                xs.append(x)
                ys.append(y)
    if not xs:
        return (0, 0, im.width, im.height)
    pad = 6
    return (max(0, min(xs) - pad) * 4, max(0, min(ys) - pad) * 4, min(small.width, max(xs) + pad) * 4, min(small.height, max(ys) + pad) * 4)


def fit(im, cell):
    if im is None:
        return Image.new("RGB", (cell, cell), (60, 60, 60))
    im = im.crop(map_bounds(im))
    w, h = im.size
    s = max(w, h)
    square = Image.new("RGB", (s, s), (62, 108, 170))
    square.paste(im, ((s - w) // 2, (s - h) // 2))
    return square.resize((cell, cell), Image.LANCZOS)


def main():
    theme, src, out, title = sys.argv[1:5]
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
        d.text((x + 2, y), f"{seed}  70° (as now) | 55°", fill=(60, 60, 60), font=small)
        for j, pitch in enumerate((70, 55)):
            p = os.path.join(src, f"{theme}-{seed}-{pitch}.jpg")
            im = Image.open(p).convert("RGB") if os.path.exists(p) else None
            sheet.paste(fit(im, cell), (x + j * (cell + 2), y + label))
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    for quality in (82, 74, 66, 58):
        sheet.save(out, quality=quality, optimize=True)
        if os.path.getsize(out) < 1_000_000:
            break
    print(f"{out}: {os.path.getsize(out)} bytes, {sheet.size[0]}x{sheet.size[1]}")


if __name__ == "__main__":
    main()
