# Renders a land-stage dump (heights, planned water, the spill levels) as a picture: height in grey,
# planned water in blue, the edge tiles that drain the lowest basin in red.
import json, sys
from PIL import Image
d = json.load(open(sys.argv[1])); W, H = d["W"], d["H"]; h, est, spill = d["h"], d["est"], d["spill"]
im = Image.new("RGB", (W, H))
px = im.load()
lo = min(h); hi = max(h)
for y in range(H):
    for x in range(W):
        i = y * W + x; v = int(60 + 180 * (h[i] - lo) / max(1, hi - lo))
        px[x, y] = (v, v, v)
        if est[i] > 0.05: px[x, y] = (40, 90, 220)
        if spill[i] > h[i] and est[i] <= 0.05: px[x, y] = (120, 160, 200)  # a basin that holds water the plan didn't fill
        if (x == 0 or y == 0 or x == W - 1 or y == H - 1) and h[i] <= lo + 1: px[x, y] = (255, 0, 0)
im = im.resize((W * 4, H * 4), Image.NEAREST); im.save(sys.argv[2])
print("h range", lo, hi, "edge tiles at floor+1:", sum(1 for y in range(H) for x in range(W) if (x == 0 or y == 0 or x == W - 1 or y == H - 1) and h[y * W + x] <= lo + 1))
