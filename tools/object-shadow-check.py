"""The shadows plants cast on the ground, in the game's frames and ours (D497: draw as the game draws; docs/progress/
3d-view.md, "Objects' shadows").

For each probe shot of a map's start (the `start` pose: the start's tile, yaw 30 deg west of north, 55 deg down, fov 40),
ours is drawn from the same pose by `tools/object-shadows.ts --game` (the snapshot's land, water and plants, the start's
other objects; each look with its objects and without). Ours is aligned to the game's frame by a scale and a shift (the
probe's distance does not carry over exactly), fitted on the blurred luma (cached beside the captures). The ground is
every flat, dry tile in view, sampled on a grid; each point is given to the first grown, living plant up-sun of it
whose shadow's box (`BOX`: its height along the sun's way, its width across) holds it. Each point's darkening is its
luma's fall from the same point drawn without objects, as a share of the full shadow's fall (`FULL`: a full shadow's
luma over lit ground, the game's light as both looks draw it, D497); the game's lit ground is ours without objects
scaled to the game's where neither look shades. Points any object covers on screen (its bounding box, projected) and
points a terrain shadow darkens are skipped. Ground or water lower than a plant up-sun of it, within its shadow's box
lengthened by the drop, is scored apart, ground and water surface each (a terrace's foot, a bank's river): its full shadow's fall is taken
as the ground's. By species: the mean darkening over the points, the share darkened at
least half and the 90th centile, the game's against each look's.

    npx tsx tools/object-shadows.ts --label <label> --game <shot>,<shot>
    python tools/object-shadow-check.py <label> <shot>,<shot>

Reads the game's frames from C:/dgm-probe; writes nothing.
"""
import json
import math
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, uniform_filter

BATCH = "20261002-1610-batch"
OURS = ".scratch/object-shadows"
LUMA = np.array([0.299, 0.587, 0.114])
#: A full shadow's luma over the lit ground's (the meadow's pillar in both looks: 0.53 and 0.54).
FULL = 0.53
#: Each plant's bounding box (half width, height) at the game's largest randomizer draw (plantSize.ts).
BOX = {"Pine": (0.72, 3.1), "Oak": (1.0, 2.6), "Birch": (0.6, 2.0), "BlueberryBush": (0.7, 0.5), "Succulent": (0.4, 0.6)}
PLANTS = ("Pine", "Oak", "Birch", "BlueberryBush")
#: The ground below a step from a plant (a bank's water, a terrace's foot), all species together.
BELOW = ("below, ground", "below, water")
STEP = 0.1


def luma(path):
    return np.asarray(Image.open(path).convert("RGB"), float) @ LUMA


def projector(c, w, h):
    """renderer.ts's orbit camera (cameraClamp.ts orbitEye, lookAt with y up), as the pixel judge places it."""
    cp = math.cos(c["pitch"])
    t = np.array(c["target"], float)
    eye = t + c["distance"] * np.array([math.sin(c["yaw"]) * cp, math.sin(c["pitch"]), math.cos(c["yaw"]) * cp])
    zc = (eye - t) / np.linalg.norm(eye - t)
    xc = np.cross([0, 1, 0], zc)
    xc /= np.linalg.norm(xc)
    yc = np.cross(zc, xc)
    f = 1 / math.tan(math.radians(c["fov"]) / 2)

    def proj(p):
        d = np.asarray(p, float) - eye
        z = -(d @ zc)
        return np.stack([((d @ xc) * f / (w / h) / z + 1) / 2 * w, (1 - (d @ yc) * f / z) / 2 * h], -1)

    return proj


def edges(L):
    gx = np.zeros_like(L)
    gy = np.zeros_like(L)
    gx[:, 1:-1] = L[:, 2:] - L[:, :-2]
    gy[1:-1] = L[2:] - L[:-2]
    m = np.hypot(gx, gy)
    return uniform_filter(np.minimum(m, 60), 3)


def warp(img, s, dx, dy):
    """Sample img at ours' pixels mapped into it: x' = cx + s (x - cx) + dx."""
    h, w = img.shape
    ys, xs = np.mgrid[0:h, 0:w].astype(float)
    return sample(img, np.stack([w / 2 + s * (xs - w / 2) + dx, h / 2 + s * (ys - h / 2) + dy], -1))


def sample(img, px):
    x = np.clip(px[..., 0] - 0.5, 0, img.shape[1] - 1.001)
    y = np.clip(px[..., 1] - 0.5, 0, img.shape[0] - 1.001)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = x - x0, y - y0
    return (img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x0 + 1] * fx * (1 - fy) + img[y0 + 1, x0] * (1 - fx) * fy
            + img[y0 + 1, x0 + 1] * fx * fy)


def align(game, ours):
    """The scale about the frame's middle and the shift that take ours onto the game's (its land's edges): searched at a
    quarter of the frame's size, then refined at half."""
    def best_of(eg, eo, scales, shifts):
        h, w = eo.shape
        m = (slice(h // 12, h - h // 12), slice(w // 12, w - w // 12))
        b = eo[m].ravel()
        best = (-2, 1, 0, 0)
        for s in scales:
            for dx in shifts[0]:
                for dy in shifts[1]:
                    r = np.corrcoef(warp(eg, s, dx, dy)[m].ravel(), b)[0, 1]
                    if r > best[0]:
                        best = (r, s, dx, dy)
        return best

    def shrink(a, k):
        h, w = a.shape[0] // k * k, a.shape[1] // k * k
        return a[:h, :w].reshape(h // k, k, w // k, k).mean((1, 3))

    eg, eo = gaussian_filter(game, 3), gaussian_filter(ours, 3)
    r, s, dx, dy = best_of(shrink(eg, 4), shrink(eo, 4), np.arange(0.9, 1.105, 0.0125), (range(-8, 9), range(-8, 9)))
    r, s, dx, dy = best_of(shrink(eg, 2), shrink(eo, 2), np.arange(s - 0.01, s + 0.011, 0.0025),
                           (np.arange(dx * 2 - 2, dx * 2 + 2.1, 0.5), np.arange(dy * 2 - 2, dy * 2 + 2.1, 0.5)))
    return r, s, dx * 2, dy * 2


def main():
    label, shots = sys.argv[1], sys.argv[2].split(",")
    looks = ("standard", "high")
    by = {k: {sp: [] for sp in PLANTS + BELOW} for k in ("game",) + looks}
    for shot in shots:
        rec = json.load(open(f"{OURS}/{label}-game-{shot}.json"))
        cam, objs = rec["cam"], rec["objects"]
        snap = json.load(__import__("gzip").open(f"C:/dgm-probe/results/{BATCH}/m9b-{shot}-start.snapshot.json.gz"))
        W, H = snap["width"], snap["height"]
        hts = np.array(snap["terrain"]).reshape(H, W)
        depth = np.array(snap["depth"]).reshape(H, W)
        wet = depth > 0.001
        game = luma(f"C:/dgm-probe/shots/{BATCH}/m9b-{shot}-start-start.jpg")
        img = {k: luma(f"{OURS}/{label}-game-{shot}-{k}.png") for k in looks}
        bare = {k: luma(f"{OURS}/{label}-game-{shot}-{k}-bare.png") for k in looks}
        h, w = game.shape
        key = f"{OURS}/{label}-game-{shot}-align.json"
        try:
            r, s, dx, dy = json.load(open(key))
        except OSError:
            r, s, dx, dy = align(game, bare["standard"])
            json.dump([r, s, dx, dy], open(key, "w"))
        print(flush=True)
        print(f"{shot}: aligned r {r:.3f}, scale {s:.4f}, shift {dx:+.0f} {dy:+.0f}")
        proj = projector(cam, w, h)
        to_game = lambda p: np.stack([w / 2 + s * (p[..., 0] - w / 2) + dx, h / 2 + s * (p[..., 1] - h / 2) + dy], -1)
        # every object's box on screen (ours' pixels)
        cover = Image.new("L", (w, h), 0)
        d = ImageDraw.Draw(cover)
        occupied = np.zeros((H, W), bool)
        for o in objs:
            hw, ht = BOX.get(o["template"], (1.6 if o["template"] == "StartingLocation" else 0.75, 4.5))
            cx, cy = o["x"] + 0.5, o["y"] + 0.5
            if o["template"] == "StartingLocation":
                cx, cy, hw = o["x"] + 1.5, o["y"] + 1.5, 1.6
            occupied[max(0, int(cy - hw)):int(cy + hw) + 1, max(0, int(cx - hw)):int(cx + hw) + 1] = True
            z = o["z"]
            corners = np.array([[cx + a * hw, z + b * ht, -(cy + c * hw)] for a in (-1, 1) for b in (0, 1) for c in (-1, 1)])
            pts = proj(corners)
            # (one off the frame, or behind the camera, covers none of it)
            if not np.all(np.isfinite(pts)) or pts[:, 0].max() < 0 or pts[:, 1].max() < 0 or pts[:, 0].min() > w or pts[:, 1].min() > h or np.abs(pts).max() > 4 * w:
                continue
            hull = pts[np.argsort(np.arctan2(pts[:, 1] - pts[:, 1].mean(), pts[:, 0] - pts[:, 0].mean()))]
            d.polygon([tuple(p) for p in hull], fill=255)
        covered = uniform_filter(np.asarray(cover, float), 5) > 0
        # the sun's way on the ground, away from the sun (tile axes): toward it is the camera's way turned 40 deg
        toward = -cam["yaw"] + math.pi + math.radians(40)
        away = np.array([-math.sin(toward), -math.cos(toward)])
        across = np.array([-away[1], away[0]])
        sunny_u, sunny_v = np.meshgrid(np.arange(-1.6, -0.7, STEP), np.arange(-1.0, 1.01, STEP), indexing="ij")
        # the ground: every dry tile in view whose four neighbours stand as high, sampled on a grid at its top
        plant_at = {}
        for o in objs:
            if o["template"] in PLANTS and not o["flags"]:
                plant_at[(o["x"], o["y"])] = o
        g = np.arange(0.05, 1.0, STEP)
        fx, fy = np.meshgrid(g, g, indexing="ij")
        fx, fy = fx.ravel(), fy.ravel()
        P, owner, onwater = [], [], []
        for ty in range(1, H - 1):
            for tx in range(1, W - 1):
                z = hts[ty, tx]
                # (dry and flat, or water: its surface)
                if wet[ty, tx]:
                    z = z + depth[ty, tx]
                elif hts[ty - 1, tx] != z or hts[ty + 1, tx] != z or hts[ty, tx - 1] != z or hts[ty, tx + 1] != z:
                    continue
                c = proj(np.array([[tx + 0.5, z, -(ty + 0.5)]]))[0]
                if not (30 < c[0] < w - 30 and 30 < c[1] < h - 30):
                    continue
                gx, gy = tx + fx, ty + fy
                # (the plant whose shadow a point lies in, if any: walking toward the sun, the first plant whose shadow's
                # box (its height along, its width across) holds the point)
                own = []
                for x, y in zip(gx, gy):
                    hit = None
                    for step in np.arange(0.25, 3.4, 0.25):
                        q = (int(math.floor(x - away[0] * step)), int(math.floor(y - away[1] * step)))
                        o = plant_at.get(q)
                        if o is None:
                            continue
                        hw, ht = BOX[o["template"]]
                        du, dv = (x - q[0] - 0.5) * away[0] + (y - q[1] - 0.5) * away[1], (x - q[0] - 0.5) * across[0] + (y - q[1] - 0.5) * across[1]
                        if -0.3 <= du <= ht + 0.4 and abs(dv) <= hw + 0.3 and o["z"] <= z + 0.01:
                            hit = o["template"]
                            break
                    if hit is None:
                        # (below a step: a plant up-sun standing higher, its shadow the longer by the drop)
                        for step in np.arange(0.25, 9, 0.25):
                            q = (int(math.floor(x - away[0] * step)), int(math.floor(y - away[1] * step)))
                            o = plant_at.get(q)
                            if o is None or o["z"] <= z + 0.5:
                                continue
                            hw, ht = BOX[o["template"]]
                            du, dv = (x - q[0] - 0.5) * away[0] + (y - q[1] - 0.5) * away[1], (x - q[0] - 0.5) * across[0] + (y - q[1] - 0.5) * across[1]
                            if 0.5 <= du <= ht + (o["z"] - z) + 0.4 and abs(dv) <= hw + 0.3:
                                hit = BELOW[1 if wet[ty, tx] else 0]
                                break
                    own.append(hit)
                P.append(np.stack([gx, np.full_like(gx, z), -gy], -1))
                owner += own
                onwater += [bool(wet[ty, tx])] * len(own)
        if not P:
            continue
        pts = proj(np.concatenate(P))
        owner = np.array([o or "" for o in owner])
        keep = ~sample(covered.astype(float), pts).astype(bool)
        print(f"  {len(pts)} ground points, {keep.sum()} uncovered")
        b = sample(bare["standard"], pts)
        onwater = np.array(onwater)
        # (out of the terrain's own shadows, as ours draws them: those cancel; the ground's and the water's apart)
        for part in (onwater, ~onwater):
            if part.any():
                keep[part] &= b[part] > 0.8 * np.median(b[part])
        t = {lk: (sample(bare[lk], pts) - sample(img[lk], pts)) / (sample(bare[lk], pts) * (1 - FULL)) for lk in looks}
        # the game's lit ground (and water): ours without objects, scaled to the game's where neither look shades
        gl = sample(game, to_game(pts))
        quiet = keep & (t["standard"] < 0.1) & (t["high"] < 0.1) & (owner == "")
        k = np.full(len(pts), np.median(gl[quiet & ~onwater] / b[quiet & ~onwater]))
        if (quiet & onwater).sum() > 50:
            k[onwater] = np.median(gl[quiet & onwater] / b[quiet & onwater])
        quiet &= ~onwater
        t["game"] = (k * b - gl) / (k * b * (1 - FULL))
        print(f"  {keep.sum()} points; the game's ground {k[~onwater][0]:.3f} of ours; unattributed mean darkening game {t['game'][quiet].mean():+.3f}")
        for sp in PLANTS + BELOW:
            m = keep & (owner == sp)
            n = int((plant_at and sum(1 for o in plant_at.values() if o['template'] == sp)))
            if m.sum() < 50:
                continue
            for key in ("game",) + looks:
                by[key][sp].append({"mass": float(t[key][m].sum() * STEP * STEP), "points": int(m.sum()), "dark": float((t[key][m] > 0.5).mean()), "core": float(np.percentile(t[key][m], 90))})
    print("\nthe ground in plants' shadow boxes, out of their own boxes on screen: mean darkening (1: full shadow), the share "
          "darkened at least half, and the 90th centile")
    for sp in PLANTS + BELOW:
        if not by["game"][sp]:
            continue
        n = sum(x["points"] for x in by["game"][sp])
        line = f"{sp:14s} {n:6d} pts"
        for key in ("game",) + looks:
            xs = by[key][sp]
            mean = sum(x["mass"] for x in xs) / (n * STEP * STEP)
            dark = sum(x["dark"] * x["points"] for x in xs) / n
            core = sum(x["core"] * x["points"] for x in xs) / n
            line += f" | {key} {mean:.3f} {dark:.2f} {core:.2f}"
        print(line)

main()
