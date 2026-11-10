"""The sun's shadow edge on the ground, in the game's frames and ours (D497; docs/progress/3d-view.md, "Grass in the
game's light").

For each shot the pixel judge fitted (its JSON: the camera, the sun's height), this finds where a cliff's shadow ends on
flat open ground: lines along the sun's way across the ground, the hard shadow of the terrain marched toward the sun
at 0.02 of a tile, an edge where it turns from shadow to sun with flat, dry, plant-free ground a tile and a half each
side, seen from the camera, cast by a straight top (its neighbours' edges in line). Each line's luma is sampled across
its edge, by the ground distance at right angles to the edge, in the game's frame and in each of ours (the judge's
`--ours` renders), and the lines are averaged by shot and cliff height. A step blurred by a Gaussian is fitted to each
mean; its 10-90 % width is the edge's, in tiles of ground.

The game's own edge, from its settings (Timberborn 1.1.2.8, numbers only): one URP asset (`globalgamemanagers.assets`
"UniversalRenderPipelineAsset"): one cascade, soft shadows at High quality (URP's 7 x 7 tent: a 10-90 % width of
about 3.95 shadow-map texels), the main light's map `ShadowQuality`'s 1024/1024/2048/4096/8192 (preset Low/-/Medium/
High/Ultra; the default preset High, 4096), over the shadow distance `ShadowDistanceUpdater` sets from the camera
every frame (the farthest of the screen's corners on the plane y = 0, at most 150); the probe's shots set it to 2.5 x
the pose's distance instead (ShotTaker.cs). One cascade fits the view's frustum to that distance in a sphere, so a
texel is 2 r / resolution, and on the ground the light's square texel stretches 1 / sin(elevation) along the sun's way.

    npx tsx tools/water-pixel-judge.ts --ours <dir> [--dev <tree>]
    python tools/shadow-edge-check.py <judge json> <ours dir> [--cases dev,ours] [--res 2048]

Reads the game's frames from C:/dgm-probe; writes nothing.
"""
import argparse
import gzip
import json
import math
import os

import numpy as np
from PIL import Image

BATCH = "20261002-1610-batch"
W_PX, H_PX = 1280, 800
SUN_FOLLOW = 40.0
LUMA = np.array([0.299, 0.587, 0.114])
#: URP's High soft shadows (7 x 7 tent), 10-90 % of a step, in shadow-map texels.
TENT_WIDTH = {"low": 1.7, "medium": 2.85, "high": 3.95}


def projector(c):
    cp = math.cos(c["pitch"])
    t = np.array(c["target"], float)
    eye = t + c["distance"] * np.array([math.sin(c["yaw"]) * cp, math.sin(c["pitch"]), math.cos(c["yaw"]) * cp])
    zc = (eye - t) / np.linalg.norm(eye - t)
    xc = np.cross([0, 1, 0], zc)
    xc /= np.linalg.norm(xc)
    yc = np.cross(zc, xc)
    f = 1 / math.tan(math.radians(c["fov"]) / 2)
    aspect = W_PX / H_PX

    def proj(p):
        d = np.asarray(p, float) - eye
        z = -(d @ zc)
        x = (d @ xc) * f / aspect / z
        y = (d @ yc) * f / z
        return np.stack([(x + 1) / 2 * W_PX, (1 - y) / 2 * H_PX], -1)

    return proj, eye


def bilinear(img, px):
    x = np.clip(px[..., 0] - 0.5, 0, img.shape[1] - 1.001)
    y = np.clip(px[..., 1] - 0.5, 0, img.shape[0] - 1.001)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = x - x0, y - y0
    return (img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x0 + 1] * fx * (1 - fy) + img[y0 + 1, x0] * (1 - fx) * fy
            + img[y0 + 1, x0 + 1] * fx * fy)


def luma(path):
    return np.asarray(Image.open(path).convert("RGB"), float) @ LUMA


def frustum_radius(fov, aspect, d):
    """The sphere round the view's frustum from the eye to d (Unity's cascade fit, one cascade)."""
    ty = math.tan(math.radians(fov) / 2)
    rho2 = (d * ty) ** 2 * (1 + aspect ** 2)
    c = (d * d + rho2) / (2 * d)
    return math.sqrt(rho2) if c > d else c


def fit_step(t, y):
    """A step blurred by a Gaussian: y = a + b Phi((t - c) / s); returns (c, 10-90 % width, a, b, rms)."""
    from math import erf
    best = None
    for c in np.arange(-0.6, 0.61, 0.02):
        for s in np.arange(0.02, 0.8, 0.01):
            phi = 0.5 * (1 + np.vectorize(erf)((t - c) / (s * math.sqrt(2))))
            A = np.vstack([np.ones_like(t), phi]).T
            coef, res, *_ = np.linalg.lstsq(A, y, rcond=None)
            r = float(np.sqrt(np.mean((A @ coef - y) ** 2)))
            if best is None or r < best[4]:
                best = (float(c), 2.5631 * float(s), float(coef[0]), float(coef[1]), r)
    return best


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("judge")
    ap.add_argument("ours")
    ap.add_argument("--cases", default="dev,ours")
    ap.add_argument("--looks", default="standard,high")
    ap.add_argument("--res", type=int, default=2048, help="the probe's shadow map (its game ran the Medium preset)")
    ap.add_argument("--quality", default="high")
    args = ap.parse_args()
    cases = args.cases.split(",")
    R = json.load(open(args.judge))
    shots = sorted({k.split("-standard-")[0] for k in R if "-standard-" in k and isinstance(R[k], dict)})
    span, step = 1.5, 0.05
    ts = np.arange(-span, span + 1e-9, step)
    groups = {}
    for shot in shots:
        v = R[f"{shot}-standard-clean"]
        cam, elev = v["camera"], math.radians(v["light"]["angle"])
        snap = json.loads(gzip.open(f"C:/dgm-probe/results/{BATCH}/m9b-{shot}.snapshot.json.gz").read())
        W, H = snap["width"], snap["height"]
        hgt = np.array(snap["terrain"], float).reshape(H, W)
        wet = np.array(snap["depth"], float).reshape(H, W) > 0.02
        bad = np.zeros((H, W), bool)
        for p in snap["plants"]:
            bad[max(0, p["y"] - 2):p["y"] + 3, max(0, p["x"] - 2):p["x"] + 3] = True
        toward = -cam["yaw"] + math.pi + math.radians(SUN_FOLLOW)
        s = np.array([math.sin(toward), math.cos(toward)])  # toward the sun, tile (x, y)
        lat = np.array([-s[1], s[0]])
        tan_e = math.tan(elev)
        proj, eye = projector(cam)

        def col(u, v_):
            i, j = np.floor(v_).astype(int), np.floor(u).astype(int)
            ok = (i >= 0) & (i < H) & (j >= 0) & (j < W)
            out = np.full(np.shape(u), -1.0)
            out[ok] = hgt[i[ok], j[ok]]
            return out, ok

        def visible(pts, z):
            p3 = np.stack([pts[:, 0], z + 0.01, pts[:, 1]], -1)
            e3 = np.array([eye[0], eye[1], -eye[2]])
            vis = np.ones(len(pts), bool)
            for f in np.linspace(0.005, 1, 400):
                q = p3 + f * (e3 - p3)
                c, ok = col(q[:, 0], q[:, 2])
                vis &= ~(ok & (c > q[:, 1]))
            return vis

        imgs = {"game": luma(f"C:/dgm-probe/shots/{BATCH}/m9b-{shot}-water.jpg")}
        for look in args.looks.split(","):
            for c in cases:
                p = os.path.join(args.ours, f"{shot}-{look}-{c}.png")
                if os.path.exists(p):
                    imgs[f"{look}-{c}"] = luma(p)
        # lines along the sun's way, 0.1 of a tile apart across it; along each, the hard shadow of the terrain: the
        # sun's ray from a point on a line runs along that line, so its top is carried from the sun's end
        corners = np.array([[0, 0], [W, 0], [0, H], [W, H]], float)
        ells = np.arange((corners @ lat).min(), (corners @ lat).max(), 0.1)
        dt = 0.02
        taus = np.arange((corners @ s).min(), (corners @ s).max(), dt)
        U = ells[:, None] * lat[0] + taus[None, :] * s[0]
        V = ells[:, None] * lat[1] + taus[None, :] * s[1]
        Z, OK = col(U, V)
        top = np.full(len(ells), -1.0)
        src = np.full(len(ells), -1.0)
        SH = np.zeros(Z.shape, bool)
        SRC = np.zeros(Z.shape)
        for j in range(len(taus) - 1, -1, -1):
            if j < len(taus) - 1:
                fall = top - dt * tan_e
                up = Z[:, j + 1] >= fall
                top = np.where(up, Z[:, j + 1], fall)
                src = np.where(up, Z[:, j + 1], src)
            SH[:, j] = OK[:, j] & (top > Z[:, j] + 1e-6)
            SRC[:, j] = src
        nspan = int(round((span + 0.3) / dt))
        found = 0
        for li in range(2, len(ells) - 2):
            sh, z, ok = SH[li], Z[li], OK[li]
            for k in np.where(sh[1:] & ~sh[:-1])[0] + 1:
                if k - nspan < 0 or k + nspan >= len(taus) or not ok[k - nspan:k + nspan].all():
                    continue
                if np.ptp(z[k - nspan:k + nspan]) > 0 or sh[k - nspan:k].any() or not sh[k:k + nspan].all():
                    continue
                te = taus[k] - dt / 2
                # straight: the edge on the lines 0.1 and 0.2 either side, in line
                tes = [te]
                for dl in (-2, -1, 1, 2):
                    s2 = SH[li + dl]
                    j = np.where(s2[k - 50:k + 50][1:] & ~s2[k - 50:k + 50][:-1])[0]
                    if len(j) != 1:
                        break
                    tes.append(taus[k - 50 + j[0] + 1] - dt / 2)
                if len(tes) != 5:
                    continue
                dls = np.array([0.0, -0.2, -0.1, 0.1, 0.2])
                slope, icpt = np.polyfit(dls, np.array(tes), 1)
                if np.abs(icpt + slope * dls - np.array(tes)).max() > 0.05:
                    continue
                beta = math.atan(slope)
                if abs(beta) > math.radians(55):
                    continue
                p0 = ells[li] * lat + te * s
                ti, tj = int(math.floor(p0[1])), int(math.floor(p0[0]))
                rr = slice(max(0, ti - 3), ti + 4), slice(max(0, tj - 3), tj + 4)
                if wet[rr].any() or bad[rr].any():
                    continue
                height = float(SRC[li, k] - z[k])
                # samples by the ground distance at right angles to the edge, toward the sun negative (in shadow)
                along = -ts / math.cos(beta)
                pts = p0[None, :] + along[:, None] * s[None, :]
                zz = np.full(len(ts), z[k])
                if not visible(pts, zz).all():
                    continue
                px = proj(np.stack([pts[:, 0], zz, -pts[:, 1]], -1))
                if (px[:, 0] < 2).any() or (px[:, 1] < 2).any() or (px[:, 0] > W_PX - 3).any() or (px[:, 1] > H_PX - 3).any():
                    continue
                tile_px = float(np.linalg.norm(px[-1] - px[0])) / (2 * span / math.cos(beta))
                hb = "1" if height <= 1.5 else "2" if height <= 2.5 else "3" if height <= 3.5 else "4-5" if height <= 5.5 else "6+"
                g = groups.setdefault((shot, hb), {"n": 0, "beta": [], "px": [], "prof": {}})
                g["n"] += 1
                g["beta"].append(beta)
                g["px"].append(tile_px)
                for name, img in imgs.items():
                    g["prof"].setdefault(name, []).append(bilinear(img, px))
                found += 1
        d = 2.5 * cam["distance"]
        r = frustum_radius(cam["fov"], W_PX / H_PX, d)
        texel = 2 * r / args.res
        print(f"{shot}: {found} lines; camera {cam['distance']:.0f} away, fov {cam['fov']:.1f}; the probe's shadow "
              f"distance {d:.0f}, sphere {r:.0f}, texel {texel:.3f} tiles at {args.res}")
        groups[(shot, "_texel")] = texel
    names = ["game"] + [f"{l}-{c}" for l in args.looks.split(",") for c in cases]
    print(f"\n10-90 % width of the shadow's edge on the ground, tiles, at right angles to it (fitted to the lines' mean)")
    print(f"{'shot':26s} {'cliff':5s} {'lines':>5s} {'px/tile':>7s} {'model':>6s} " + " ".join(f"{n:>14s}" for n in names))
    for (shot, hb), g in sorted((k, v) for k, v in groups.items() if k[1] != "_texel"):
        if g["n"] < 6:
            continue
        texel = groups[(shot, "_texel")]
        b = np.array(g["beta"])
        e = math.radians(R[f"{shot}-standard-clean"]["light"]["angle"])
        sigma = TENT_WIDTH[args.quality] * texel
        model = float(np.mean(sigma * np.sqrt(np.cos(b) ** 2 / math.sin(e) ** 2 + np.sin(b) ** 2)))
        cells = []
        for n in names:
            if n not in g["prof"]:
                cells.append(f"{'-':>14s}")
                continue
            y = np.mean(g["prof"][n], axis=0)
            c, w, a, bb, rms = fit_step(ts, y)
            cells.append(f"{w:6.2f} ({bb:4.0f})")
        print(f"{shot:26s} {hb:5s} {g['n']:5d} {np.mean(g['px']):7.1f} {model:6.2f} " + " ".join(cells))


if __name__ == "__main__":
    main()
