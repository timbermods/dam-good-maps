# A quick eye check: the maps of a look folder in a grid, labelled by seed, each scaled to <px> px.
#   python grid.py <look dir> <out.png> [px] [cols]
import sys, os, re
from PIL import Image, ImageDraw
d, out = sys.argv[1], sys.argv[2]; px = int(sys.argv[3]) if len(sys.argv) > 3 else 128; cols = int(sys.argv[4]) if len(sys.argv) > 4 else 6
seeds = sorted(int(re.match(r"(\d+)\.png", f).group(1)) for f in os.listdir(d) if re.match(r"\d+\.png$", f))
rows = (len(seeds) + cols - 1) // cols
im = Image.new("RGB", (cols * (px + 4), rows * (px + 4)), (255, 255, 255)); dr = ImageDraw.Draw(im)
for k, s in enumerate(seeds):
    x, y = (k % cols) * (px + 4), (k // cols) * (px + 4)
    im.paste(Image.open(os.path.join(d, f"{s}.png")).convert("RGB").resize((px, px)), (x, y)); dr.text((x + 2, y + 1), str(s), fill=(0, 0, 0))
im.save(out)
