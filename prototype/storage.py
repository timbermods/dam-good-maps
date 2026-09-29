"""Water storage near the start and dam walls (M9a): the Python twins of
src/core/analysis/storage.ts (`water.storage_possible`, D111, replacing `water.reservoir`;
information the generator prefers, D209 #67) and src/core/analysis/ridge.ts (`terrain.dam_wall`,
D111: no built dam walls). Same rules, same order, so tools/oracle.ts compares the verdicts.

JavaScript's Math.round rounds halves up; Python's round() rounds them to even, so `_js_round` is
used wherever the TypeScript rounds."""
from __future__ import annotations

import math

SECONDS_PER_DAY = 460


def _js_round(v: float) -> int:
    return math.floor(v + 0.5)


def pump_shore_tile(walk, h, D, C, depth_min=0.3, clean_max=0.05, reach=2):
    """src/core/analysis/walk.ts pumpShoreDistance: the walk to the nearest pump shore and the water
    tile it draws from, (inf, None) when none."""
    import numpy as np
    Y, X = h.shape
    best = float("inf")
    tile = None
    for y, x in zip(*np.nonzero((D >= depth_min) & (C < clean_max))):
        surface = float(h[y, x]) + float(D[y, x])
        for dy, dx in ((0, -1), (0, 1), (-1, 0), (1, 0)):
            yy, xx = y + dy, x + dx
            if not (0 <= yy < Y and 0 <= xx < X) or not walk[yy, xx] < best:
                continue
            level = int(h[yy, xx])
            if level - reach <= surface <= level + 0.01:
                best = float(walk[yy, xx])
                tile = (int(y), int(x))
    return best, tile


def running_flow(D, sources, tile) -> float:
    """Clean strength feeding the water body `tile` (y, x) belongs to (4-connected, any depth)."""
    Y, X = D.shape
    body = set([tile])
    q = [tile]
    k = 0
    while k < len(q):
        y, x = q[k]
        k += 1
        for yy, xx in ((y, x - 1), (y, x + 1), (y - 1, x), (y + 1, x)):
            if 0 <= yy < Y and 0 <= xx < X and (yy, xx) not in body and D[yy, xx] > 0.001:
                body.add((yy, xx))
                q.append((yy, xx))
    running = 0.0
    for s in sources:
        if s["contamination"] > 0 or not s["strength"] > 0:
            continue
        if any((ty, tx) in body for ty, tx in s["tiles"]):
            running += s["strength"]
    return running


def levee_storage(h, D, C, sx, sy, sz, enough) -> float:
    """analysis/storage.ts leveeStorage: the most a dam and levees can hold near the start."""
    Y, X = h.shape
    W, H = X, Y
    hl = h.tolist()
    Dl = D.tolist()
    Cl = C.tolist()
    best = 0.0
    R = [[-1] * W for _ in range(H)]
    stamp = 0
    seeds = []
    for y in range(max(1, sy - 40), min(H - 2, sy + 40) + 1, 3):
        for x in range(max(1, sx - 40), min(W - 2, sx + 40) + 1, 3):
            if Dl[y][x] > 0.05 and Cl[y][x] < 0.05:
                seeds.append((y, x))
    tried = set()
    for (y0, x0) in seeds:
        for crest in (1, 2, 3):
            lam = hl[y0][x0] + crest
            if lam > sz:
                break
            stamp += 1
            if R[y0][x0] >= 0 and (R[y0][x0], lam) in tried:
                continue
            q = [(y0, x0)]
            R[y0][x0] = stamp
            cut = 0
            perim = 0
            vol = 0.0
            k = 0
            while k < len(q):
                y, x = q[k]
                k += 1
                sfc = hl[y][x] + Dl[y][x]
                if lam > sfc:
                    vol += lam - sfc
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    xx, yy = x + dx, y + dy
                    if xx < 0 or yy < 0 or xx >= W or yy >= H:
                        continue
                    if R[yy][xx] == stamp:
                        continue
                    if hl[yy][xx] >= lam:
                        perim += 1
                        continue
                    if not (max(abs(xx - sx), abs(yy - sy)) <= 60 and 0 < xx < W - 1 and 0 < yy < H - 1):
                        cut += 1
                        perim += 1
                        continue
                    R[yy][xx] = stamp
                    q.append((yy, xx))
            tried.add((stamp, lam))
            if cut <= 0.25 * perim and vol > best:
                best = vol
            if best >= enough:
                return best
    return best


# ---- dam walls (analysis/ridge.ts)

C22 = 0.9238795325112867
S22 = 0.3826834323650898
R2 = 0.7071067811865476
LINES = ((1, 0), (C22, S22), (R2, R2), (S22, C22), (0, 1), (-S22, C22), (-R2, R2), (-C22, S22))


def dam_walls(h, D) -> list:
    """A straight band of rock 2–6 levels high across a valley, with vertical faces, a flat crest,
    even thickness and dry floor on both sides, and a gap for the river (analysis/ridge.ts)."""
    Y, X = h.shape
    W, H = X, Y
    hl = h.tolist()
    Dl = D.tolist()

    def at(x, y):
        xi = _js_round(x)
        yi = _js_round(y)
        return None if xi < 0 or yi < 0 or xi >= W or yi >= H else (yi, xi)

    def probe(px, py, nx, ny):
        c = at(px, py)
        if c is None or Dl[c[0]][c[1]] > 0.05:
            return None
        crest = hl[c[0]][c[1]]
        floors = []
        dry = False
        for sgn in (1, -1):
            f = math.inf
            wet_face = False
            for m in range(4, 8):
                j = at(px + sgn * m * nx, py + sgn * m * ny)
                if j is None:
                    return None
                if hl[j[0]][j[1]] < f:
                    f = hl[j[0]][j[1]]
                if Dl[j[0]][j[1]] > 0.05:
                    wet_face = True
            if not wet_face:
                dry = True
            if crest < f + 2 or crest > f + 6:
                return None
            face = False
            for m in range(0, 6):
                if face:
                    break
                a = at(px + sgn * m * nx, py + sgn * m * ny)
                b = at(px + sgn * (m + 1) * nx, py + sgn * (m + 1) * ny)
                if a is None or b is None:
                    return None
                if hl[a[0]][a[1]] >= crest - 1 and hl[a[0]][a[1]] - hl[b[0]][b[1]] >= 2:
                    face = True
            if not face:
                return None
            floors.append(f)
        thick = 1
        for sgn in (1, -1):
            for m in range(1, 9):
                j = at(px + sgn * m * nx, py + sgn * m * ny)
                if j is None or hl[j[0]][j[1]] < crest - 1:
                    break
                thick += 1
        if thick < 2 or thick > 8:
            return None
        return (crest, floors[0], floors[1], thick, dry)

    found = []
    for cy in range(H):
        row = Dl[cy]
        for cx in range(W):
            if not row[cx] > 0.05:
                continue
            if any(abs(wx - cx) + abs(wy - cy) <= 12 for wx, wy in found):
                continue
            for tx, ty in LINES:
                nx, ny = -ty, tx
                sides = []
                for sgn in (1, -1):
                    pts = []
                    started = False
                    miss = 0
                    for k in range(1, 41):
                        p = probe(cx + sgn * k * tx, cy + sgn * k * ty, nx, ny)
                        if p is not None:
                            started = True
                            miss = 0
                            pts.append(p)
                        elif not started:
                            if k > 8:
                                break
                        else:
                            miss += 1
                            if miss > 1:
                                break
                    sides.append(pts)
                if len(sides[0]) < 6 or len(sides[1]) < 6:
                    continue
                allp = sides[0] + sides[1]
                crests = [p[0] for p in allp]
                if max(crests) - min(crests) > 1:
                    continue

                def med(v):
                    return sorted(v)[len(v) >> 1]
                fa = med([p[1] for p in allp])
                fb = med([p[2] for p in allp])
                if abs(fa - fb) > 1:
                    continue
                th = [p[3] for p in allp]
                if max(th) - min(th) > 3:
                    continue
                if sum(1 for p in allp if p[4]) < 0.75 * len(allp):
                    continue
                found.append((cx, cy))
                break
    return found
