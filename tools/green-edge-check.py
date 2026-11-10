# The green edge round water (showcase gap 9; D135, D496): where the grass gives way to dry ground, the game's frame
# against ours, on the same map from the same camera. The game's side is a probe water shot; ours is the judge's render
# of the same snapshot (tools/water-pixel-judge.ts --ours <dir>, which also writes the fitted camera to its JSON). Both
# sides draw the game's own moisture from the snapshot, so what differs is the blend alone: the desert intensity's
# curve, the blending noise and the softness.
#
#   npx tsx tools/water-pixel-judge.ts --dev none --ours .scratch/edge/ours --look both
#   cp .scratch/water-judge/judge-clean-shot.json .scratch/edge/judge.json
#   python -I tools/green-edge-check.py --judge .scratch/edge/judge.json --ours .scratch/edge/ours \
#     --shots riverValley-128-1-start,riverValley-128-2-start [--batch 20261002-1610-batch] [--prefix m9b-|none] [--looks standard,high]
#
# Per shot and look: the residual offset between the two frames (the shift that best lines up their greenness; the
# game's frame is sampled through it), then on visible level tops (dry, uncontaminated, no plant within two tiles, no
# higher tile that could shade them) at a 0.1-tile grid:
# - each frame's grass share at a point, from its greenness G - (R + B) / 2 scaled between the frame's own dry ground
#   (moisture 0) and grass (moisture 6 or more);
# - the share by the tile's moisture (where the edge falls);
# - the edge's raggedness: the share's spread on edge tiles (moisture 0.01-3) over blocks of 0.1 to 1 tile once each
#   moisture band's mean is taken out, beside the same spread on pure grass and dry ground (the textures' own floor);
# - against the moisture contour (m 1.24, where the game's formula gives half grass on average): where the green/dry
#   boundary falls (its signed distance's mean and spread, in tiles, after smoothing the share over 0.1 to 1.1 tiles),
#   and the share's profile across it with its 10-90 % width.
# Numbers only; nothing of the game's frames is written.
import argparse, gzip, json, math
import numpy as np
from PIL import Image
from scipy import ndimage

ap = argparse.ArgumentParser()
ap.add_argument("--judge", required=True)
ap.add_argument("--ours", required=True)
ap.add_argument("--shots", required=True)
ap.add_argument("--batch", default="20261002-1610-batch")
ap.add_argument("--prefix", default="m9b-")
ap.add_argument("--looks", default="standard,high")
args = ap.parse_args()
PREFIX = "" if args.prefix == "none" else args.prefix
W_PX, H_PX = 1280, 800
STEP = 0.1
BANDS = [(0, 0.01), (0.01, 1), (1, 1.5), (1.5, 2), (2, 2.5), (2.5, 3), (3, 4), (4, 5), (5, 6)]
judge = json.load(open(args.judge))


def projector(c):
    """World point to pixel, as the judge's (renderer.ts's orbit camera)."""
    cp = math.cos(c["pitch"])
    t = c["target"]
    eye = np.array([t[0] + math.sin(c["yaw"]) * cp * c["distance"], t[1] + math.sin(c["pitch"]) * c["distance"], t[2] + math.cos(c["yaw"]) * cp * c["distance"]])
    zc = eye - np.array(t)
    zc /= np.linalg.norm(zc)
    xc = np.cross([0, 1, 0], zc)
    xc /= np.linalg.norm(xc)
    yc = np.cross(zc, xc)
    f = 1 / math.tan(c["fov"] * math.pi / 360)

    def pr(p):
        d = p - eye
        z = -(d @ zc)
        return np.stack([((d @ xc) * f / (W_PX / H_PX) / z + 1) / 2 * W_PX, (1 - (d @ yc) * f / z) / 2 * H_PX], 1), z

    return pr, eye


def bilinear(img, xy):
    x = np.clip(xy[:, 0] - 0.5, 0, W_PX - 2)
    y = np.clip(xy[:, 1] - 0.5, 0, H_PX - 2)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = (x - x0)[:, None], (y - y0)[:, None]
    a = img[y0, x0] * (1 - fx) + img[y0, x0 + 1] * fx
    b = img[y0 + 1, x0] * (1 - fx) + img[y0 + 1, x0 + 1] * fx
    return a * (1 - fy) + b * fy


def green(rgb):
    return rgb[..., 1] - (rgb[..., 0] + rgb[..., 2]) / 2


def best_shift(game, ours, M=10):
    """The whole-pixel shift of the game's frame that best lines its greenness up with ours (the camera fit's residue)."""
    G, O = green(game), green(ours)
    b = O[M : H_PX - M, M : W_PX - M].ravel()
    best = (-2.0, 0, 0)
    for dy in range(-M, M + 1):
        for dx in range(-M, M + 1):
            c = np.corrcoef(G[M + dy : H_PX - M + dy, M + dx : W_PX - M + dx].ravel(), b)[0, 1]
            if c > best[0]:
                best = (c, dx, dy)
    return best


def block_spread(s, T, sx, sy, k, blk):
    key = T[k] * 10000 + (sx[k] // blk) * 100 + (sy[k] // blk)
    _, inv = np.unique(key, return_inverse=True)
    sums, cnt = np.bincount(inv, s[k]), np.bincount(inv)
    full = cnt >= blk * blk * 0.8
    return round(float(np.std((sums / cnt)[full])), 3)


def contour(px, py, m, shares):
    """The boundary against the moisture contour at m 1.24, on the 0.1-tile grid (tile-constant moisture, as the game's map)."""
    gx, gy = np.floor(px * 10).astype(int), np.floor(py * 10).astype(int)
    x0, y0 = gx.min() - 20, gy.min() - 20
    Wg, Hg = gx.max() - x0 + 21, gy.max() - y0 + 21
    Mg = np.zeros((Hg, Wg))
    for a, b, v in zip(gx // 10, gy // 10, m):
        Mg[b * 10 - y0 : b * 10 - y0 + 10, a * 10 - x0 : a * 10 - x0 + 10] = v
    inside = Mg >= 1.24
    dist = np.where(inside, ndimage.distance_transform_edt(inside), -ndimage.distance_transform_edt(~inside)) / 10.0
    sd = dist[gy - y0, gx - x0]
    out = {}
    for name, s in shares.items():
        prof = {}
        for c in np.arange(-2, 2.01, 0.25):
            k = np.abs(sd - c) < 0.125
            if k.sum() > 30:
                prof[f"{c:+.2f}"] = round(float(s[k].mean()), 2)
        inner = [float(c) for c, v in prof.items() if float(c) > 0 and v >= 0.9]
        outer = [float(c) for c, v in prof.items() if float(c) < 0 and v <= 0.1]
        r = {"profile": prof, "width_10_90": round(min(inner) - max(outer), 2) if inner and outer else None}
        S = np.full((Hg, Wg), np.nan)
        S[gy - y0, gx - x0] = s
        valid = ~np.isnan(S)
        for sm in (1, 3, 7, 11):
            num = ndimage.uniform_filter(np.nan_to_num(S), sm)
            den = ndimage.uniform_filter(valid.astype(float), sm)
            Sm = np.where((den > 0.6) & valid, num / np.maximum(den, 1e-6), np.nan)
            G, V = Sm >= 0.5, ~np.isnan(Sm)
            bd = np.zeros_like(V)
            for dy, dx in ((0, 1), (1, 0)):
                a, b = (slice(0, Hg - dy), slice(0, Wg - dx)), (slice(dy, Hg), slice(dx, Wg))
                bd[a] |= V[a] & V[b] & (G[a] != G[b])
            off = dist[bd & (np.abs(dist) <= 3)]
            r[f"boundary_{sm / 10:.1f}"] = {"n": int(off.size), "mean": round(float(off.mean()), 2), "sd": round(float(off.std()), 2)}
        out[name] = r
    return out


results = {}
for sid in args.shots.split(","):
    snap = json.load(gzip.open(f"C:/dgm-probe/results/{args.batch}/{PREFIX}{sid}.snapshot.json.gz"))
    Wt, Ht = snap["width"], snap["height"]
    hs = np.array(snap["terrain"], float).reshape(Ht, Wt)
    depth = np.array(snap["depth"], float).reshape(Ht, Wt)
    moist = np.array(snap["moisture"], float).reshape(Ht, Wt)
    soilc = np.array(snap["soilContamination"], float).reshape(Ht, Wt)
    covered = np.zeros((Ht, Wt), bool)
    for p in snap["plants"]:
        covered[max(0, p["y"] - 2) : p["y"] + 3, max(0, p["x"] - 2) : p["x"] + 3] = True
    pad = np.pad(hs, 4, mode="edge")
    level = np.ones((Ht, Wt), bool)
    shaded = np.zeros((Ht, Wt), bool)
    for dy in range(-4, 5):
        for dx in range(-4, 5):
            if dx or dy:
                nb = pad[4 + dy : 4 + dy + Ht, 4 + dx : 4 + dx + Wt]
                if abs(dx) <= 1 and abs(dy) <= 1:
                    level &= nb == hs
                shaded |= nb - hs > 0.6 * math.hypot(dx, dy)
    nearwet = ndimage.binary_dilation(depth > 0, np.ones((3, 3), bool))
    usable = level & ~shaded & ~covered & ~nearwet & (soilc <= 0)
    farm = ndimage.binary_dilation(moist > 0, np.ones((5, 5), bool))
    game = np.asarray(Image.open(f"C:/dgm-probe/shots/{args.batch}/{PREFIX}{sid}-water.jpg").convert("RGB"), float)
    for look in args.looks.split(","):
        key = f"{sid}-{look}-clean"
        if key not in judge:
            continue
        pr, eye = projector(judge[key]["camera"])
        ours = np.asarray(Image.open(f"{args.ours}/{sid}-{look}-ours.png").convert("RGB"), float)
        corr, sx_px, sy_px = best_shift(game, ours)
        ty, tx = np.nonzero(usable)
        offs = (np.arange(10) + 0.5) * STEP
        ox, oy = (v.ravel() for v in np.meshgrid(offs, offs))
        px = (tx[:, None] + ox[None, :]).ravel()
        py = (ty[:, None] + oy[None, :]).ravel()
        tile = np.repeat(np.arange(len(tx)), len(ox))
        pts = np.stack([px, np.repeat(hs[ty, tx], len(ox)), -py], 1)
        xy, z = pr(pts)
        vis = (z > 0.5) & (xy[:, 0] >= 2) & (xy[:, 1] >= 2) & (xy[:, 0] < W_PX - 2) & (xy[:, 1] < H_PX - 2)
        d = eye[None, :] - pts
        L = np.linalg.norm(d, axis=1)
        d /= L[:, None]
        for t in np.arange(0.6, 60, 0.4):
            q = pts + d * t
            qx, qy = np.floor(q[:, 0]).astype(int), np.floor(-q[:, 2]).astype(int)
            ok = (qx >= 0) & (qy >= 0) & (qx < Wt) & (qy < Ht) & (t < L)
            hq = np.full(len(q), -1.0)
            hq[ok] = hs[qy[ok], qx[ok]] + np.maximum(depth[qy[ok], qx[ok]], 0)
            vis &= ~(hq > q[:, 1] + 0.02)
        T = tile[vis]
        m = moist[ty, tx][T]
        dry, grass = ~farm[ty, tx][T], m >= 6
        res = {"shift_px": [sx_px, sy_px], "frame_corr": round(float(corr), 3), "points": int(vis.sum())}
        shares = {}
        for name, img, sh in (("game", game, (sx_px, sy_px)), ("ours", ours, (0, 0))):
            g = green(bilinear(img, xy[vis] + np.array(sh, float)))
            gd, gg = np.median(g[dry]), np.median(g[grass])
            shares[name] = (g - gd) / (gg - gd)
        res["share_by_moisture"] = {}
        for a, b in BANDS:
            k = ((m >= a) & (m < b)) if a > 0 else ((m <= 0) & ~dry)
            if k.sum() >= 50:
                res["share_by_moisture"][f"{a}-{b}"] = {"tiles": int(len(np.unique(T[k]))), "game": round(float(shares["game"][k].mean()), 3), "ours": round(float(shares["ours"][k].mean()), 3)}
        sx = np.round((px[vis] - tx[T]) / STEP - 0.5).astype(int)
        sy = np.round((py[vis] - ty[T]) / STEP - 0.5).astype(int)
        edge = (m > 0.01) & (m < 3)
        res["edge_tiles"] = int(len(np.unique(T[edge])))
        res["edge_corr"] = round(float(np.corrcoef(shares["game"][edge], shares["ours"][edge])[0, 1]), 3)
        for name, s in shares.items():
            r = s.copy()
            for a, b in BANDS:
                k = (m >= a) & (m < b)
                if k.any():
                    r[k] -= r[k].mean()
            res[f"{name}_spread"] = {
                lab: {f"{blk * STEP:.1f}": block_spread(r if lab == "edge" else s - s[k].mean(), T, sx, sy, k, blk) for blk in (1, 2, 5, 10)}
                for lab, k in (("edge", edge), ("grass", grass), ("dry", dry))
            }
        res["contour"] = contour(px[vis], py[vis], m, shares)
        results[key] = res
print(json.dumps(results, indent=1))
