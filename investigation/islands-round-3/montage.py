# Sheets for Kyler's eye (D144): pairs before | after, each map scaled to 256 px, ten seeds a sheet.
#   python montage.py <before dir> <after dir> <out prefix> "<title>" [seeds per sheet] ["<pair label>"]
import sys, os
from PIL import Image, ImageDraw, ImageFont
before, after, prefix, title = sys.argv[1:5]; per = int(sys.argv[5]) if len(sys.argv) > 5 else 10
pair = sys.argv[6] if len(sys.argv) > 6 else "before | after"
S, GAP, LABEL, COLS = 256, 8, 16, 2
font = ImageFont.load_default(size=13) if hasattr(ImageFont, "load_default") else ImageFont.load_default()
for n, s0 in enumerate(range(1, 31, per), 1):
    seeds = list(range(s0, min(31, s0 + per))); rows = (len(seeds) + COLS - 1) // COLS
    W = COLS * (2 * S + 3 * GAP) + GAP; H = 24 + rows * (S + LABEL + GAP) + GAP
    im = Image.new("RGB", (W, H), (250, 248, 242)); d = ImageDraw.Draw(im)
    d.text((GAP, 5), f"{title} (sheet {n}: seeds {seeds[0]}-{seeds[-1]})", fill=(20, 20, 20), font=font)
    for k, seed in enumerate(seeds):
        cx = GAP + (k % COLS) * (2 * S + 3 * GAP); cy = 24 + (k // COLS) * (S + LABEL + GAP)
        d.text((cx, cy), f"Islands, seed {seed}: {pair}", fill=(40, 40, 40), font=font)
        for j, src in enumerate((before, after)):
            f = os.path.join(src, f"{seed}.png")
            if os.path.exists(f): im.paste(Image.open(f).convert("RGB").resize((S, S), Image.NEAREST), (cx + j * (S + GAP), cy + LABEL))
    out = f"{prefix}-{n}.png"; im.quantize(128).save(out, optimize=True); print(out, os.path.getsize(out), im.size)
