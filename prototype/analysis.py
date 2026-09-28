"""Terrain, water and entity measurements shared by calibration (investigation/analyze_maps.py)
and validation (validate.py), so generated maps are judged with the same yardstick that
measured the official and workshop maps.

Coordinates: arrays are indexed [y, x]; entity Coordinates X/Y map to [y, x]; Z is the layer
the entity stands in (the first free layer above solid ground).
"""
from __future__ import annotations

import heapq
import math
from collections import deque

import numpy as np

from tbmap import TimberMap, placement

N4 = ((1, 0), (-1, 0), (0, 1), (0, -1))
N8 = N4 + ((1, 1), (1, -1), (-1, 1), (-1, -1))
TREES = ("Pine", "Birch", "Oak", "Succulent", "Maple", "ChestnutTree", "Mangrove")
BUSHES = ("BlueberryBush", "Dandelion", "CoffeeBush")
WATER_EMITTERS = ("WaterSource", "WaterSeep", "Aquifer")
BAD_EMITTERS = ("BadwaterSource", "BadwaterSeep", "BadtideDrain")


# ---------------------------------------------------------------------------------------------
# Saved simulation state (official maps are saved with water already flowing)

def _level_arrays(m: TimberMap, singleton: str, key: str, levels_key: str):
    s = m.singletons.get(singleton)
    if not s or key not in s:
        return None
    levels = s.get(levels_key) or 1
    toks = s[key]["Array"].split(" ")
    if len(toks) != levels * m.size_x * m.size_y:
        return None
    return levels, toks


def saved_water(m: TimberMap):
    """(depth, contamination, floor) of the top water column per tile, from WaterMapNew.
    Tokens are "0" or depth:contamination:?:floor[:?]; the column with the highest floor wins."""
    X, Y = m.size_x, m.size_y
    depth = np.zeros((Y, X))
    contam = np.zeros((Y, X))
    floor = np.full((Y, X), -1)
    got = _level_arrays(m, "WaterMapNew", "WaterColumns", "Levels")
    if not got:
        return depth, contam, floor
    levels, toks = got
    for lv in range(levels):
        base = lv * X * Y
        for i in range(X * Y):
            t = toks[base + i]
            if t == "0":
                continue
            f = t.split(":")
            fl = int(float(f[3])) if len(f) >= 4 else 0
            y, x = divmod(i, X)
            if fl >= floor[y, x]:
                floor[y, x] = fl
                depth[y, x] = float(f[0])
                contam[y, x] = float(f[1])
    return depth, contam, floor


def saved_moisture(m: TimberMap) -> np.ndarray:
    """Highest soil moisture per tile across levels (SoilMoistureSimulator.MoistureLevels)."""
    X, Y = m.size_x, m.size_y
    got = _level_arrays(m, "SoilMoistureSimulator", "MoistureLevels", "Size")
    if not got:
        return np.zeros((Y, X))
    levels, toks = got
    a = np.array(toks, dtype=float).reshape(levels, Y, X)
    return a.max(axis=0)


# ---------------------------------------------------------------------------------------------
# Grid algorithms (pure numpy/python; the web port mirrors these)

def distance_from(mask: np.ndarray, max_dist: float = 1e9) -> np.ndarray:
    """Chamfer (1, sqrt 2) distance in tiles from the nearest True cell; inf if none."""
    Y, X = mask.shape
    INF = float("inf")
    d = [[0.0 if mask[y, x] else INF for x in range(X)] for y in range(Y)]
    r2 = math.sqrt(2)
    for y in range(Y):
        row, prev = d[y], d[y - 1] if y else None
        for x in range(X):
            v = row[x]
            if v == 0.0:
                continue
            if x and row[x - 1] + 1 < v:
                v = row[x - 1] + 1
            if prev is not None:
                if prev[x] + 1 < v:
                    v = prev[x] + 1
                if x and prev[x - 1] + r2 < v:
                    v = prev[x - 1] + r2
                if x + 1 < X and prev[x + 1] + r2 < v:
                    v = prev[x + 1] + r2
            row[x] = v
    for y in range(Y - 1, -1, -1):
        row, nxt = d[y], d[y + 1] if y + 1 < Y else None
        for x in range(X - 1, -1, -1):
            v = row[x]
            if v == 0.0:
                continue
            if x + 1 < X and row[x + 1] + 1 < v:
                v = row[x + 1] + 1
            if nxt is not None:
                if nxt[x] + 1 < v:
                    v = nxt[x] + 1
                if x + 1 < X and nxt[x + 1] + r2 < v:
                    v = nxt[x + 1] + r2
                if x and nxt[x - 1] + r2 < v:
                    v = nxt[x - 1] + r2
            row[x] = v
    out = np.array(d)
    out[out > max_dist] = np.inf
    return out


def components(mask: np.ndarray, connectivity=N8):
    """Label connected True cells. Returns (labels array with -1 background, list of sizes)."""
    Y, X = mask.shape
    labels = np.full((Y, X), -1, dtype=np.int32)
    sizes = []
    for y0, x0 in zip(*np.nonzero(mask)):
        if labels[y0, x0] >= 0:
            continue
        lab = len(sizes)
        labels[y0, x0] = lab
        q = deque([(y0, x0)])
        n = 0
        while q:
            y, x = q.popleft()
            n += 1
            for dy, dx in connectivity:
                yy, xx = y + dy, x + dx
                if 0 <= yy < Y and 0 <= xx < X and mask[yy, xx] and labels[yy, xx] < 0:
                    labels[yy, xx] = lab
                    q.append((yy, xx))
        sizes.append(n)
    return labels, sizes


def point_clusters(points, gap: float):
    """Single-linkage clusters of integer points: two points join when their Chebyshev distance
    is <= gap (gap=1 means touching, diagonals included). Returns a list of index lists."""
    cell = {}
    for i, (x, y) in enumerate(points):
        cell.setdefault((x // max(1, int(gap)), y // max(1, int(gap))), []).append(i)
    parent = list(range(len(points)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    g = max(1, int(gap))
    for (cx, cy), idxs in cell.items():
        cand = [j for ox in (-1, 0, 1) for oy in (-1, 0, 1) for j in cell.get((cx + ox, cy + oy), [])]
        for i in idxs:
            xi, yi = points[i]
            for j in cand:
                if j <= i:
                    continue
                xj, yj = points[j]
                if max(abs(xi - xj), abs(yi - yj)) <= gap:
                    ri, rj = find(i), find(j)
                    if ri != rj:
                        parent[ri] = rj
    groups = {}
    for i in range(len(points)):
        groups.setdefault(find(i), []).append(i)
    return list(groups.values())


def priority_flood(h: np.ndarray, edge_drains: bool = True):
    """Fill depressions: returns the water surface each tile would hold if rain filled every
    basin to its spill point (Barnes et al. priority flood). With edge_drains the map border
    is the outlet (water leaves the map there)."""
    Y, X = h.shape
    filled = h.astype(float).copy()
    seen = np.zeros((Y, X), bool)
    pq = []
    for y in range(Y):
        for x in (0, X - 1):
            if not seen[y, x]:
                seen[y, x] = True
                heapq.heappush(pq, (filled[y, x], y, x))
    for x in range(X):
        for y in (0, Y - 1):
            if not seen[y, x]:
                seen[y, x] = True
                heapq.heappush(pq, (filled[y, x], y, x))
    while pq:
        lv, y, x = heapq.heappop(pq)
        for dy, dx in N4:
            yy, xx = y + dy, x + dx
            if 0 <= yy < Y and 0 <= xx < X and not seen[yy, xx]:
                seen[yy, xx] = True
                if filled[yy, xx] < lv:
                    filled[yy, xx] = lv
                heapq.heappush(pq, (filled[yy, xx], yy, xx))
    return filled


# ---------------------------------------------------------------------------------------------
# Terrain measures

def step_histogram(h: np.ndarray) -> dict:
    d = np.concatenate([np.abs(np.diff(h, axis=0)).ravel(), np.abs(np.diff(h, axis=1)).ravel()])
    d = d[d > 0]
    out = {}
    for v in d:
        k = str(min(int(v), 6)) if v < 6 else "6+"
        out[k] = out.get(k, 0) + 1
    return out


def flat_mask(h: np.ndarray) -> np.ndarray:
    """Tiles whose 8 neighbours all share their height (good building ground)."""
    Y, X = h.shape
    f = np.ones((Y, X), bool)
    p = np.pad(h, 1, mode="edge")
    for dy, dx in N8:
        f &= p[1 + dy:1 + dy + Y, 1 + dx:1 + dx + X] == h
    return f


def level_regions(h: np.ndarray, min_size=1):
    """Connected same-height regions (4-connected). Returns labels and [(height, size)]."""
    Y, X = h.shape
    labels = np.full((Y, X), -1, dtype=np.int32)
    info = []
    for y0 in range(Y):
        for x0 in range(X):
            if labels[y0, x0] >= 0:
                continue
            lab = len(info)
            hv = h[y0, x0]
            labels[y0, x0] = lab
            q = deque([(y0, x0)])
            n = 0
            while q:
                y, x = q.popleft()
                n += 1
                for dy, dx in N4:
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < Y and 0 <= xx < X and labels[yy, xx] < 0 and h[yy, xx] == hv:
                        labels[yy, xx] = lab
                        q.append((yy, xx))
            info.append((int(hv), n))
    return labels, info


def plateaus(h: np.ndarray, labels, info, min_area=40):
    """Same-height regions of at least min_area whose whole rim drops by >= 1 (raised tables)."""
    Y, X = h.shape
    rim_lower = {}
    rim_total = {}
    for dy, dx in N4:
        ys = slice(max(0, -dy), Y - max(0, dy))
        xs = slice(max(0, -dx), X - max(0, dx))
        ys2 = slice(max(0, dy), Y - max(0, -dy))
        xs2 = slice(max(0, dx), X - max(0, -dx))
        a, b = labels[ys, xs], labels[ys2, xs2]
        ha, hb = h[ys, xs], h[ys2, xs2]
        edge = a != b
        for la, lower in zip(a[edge].ravel(), (hb[edge] < ha[edge]).ravel()):
            rim_total[la] = rim_total.get(la, 0) + 1
            rim_lower[la] = rim_lower.get(la, 0) + int(lower)
    out = []
    for lab, (hv, n) in enumerate(info):
        if n >= min_area and rim_total.get(lab, 0) and rim_lower.get(lab, 0) / rim_total[lab] >= 0.9:
            out.append({"height": hv, "area": n})
    return out


def walk_regions(h: np.ndarray, max_step: int, blocked: np.ndarray | None = None, extra_links=()):
    """Regions reachable on foot: 4-neighbour moves whose height change is <= max_step (0 means
    only flat moves; slopes add links through extra_links [((y,x),(y2,x2)), ...])."""
    Y, X = h.shape
    labels = np.full((Y, X), -1, dtype=np.int32)
    links = {}
    for a, b in extra_links:
        links.setdefault(a, []).append(b)
        links.setdefault(b, []).append(a)
    sizes = []
    for y0 in range(Y):
        for x0 in range(X):
            if labels[y0, x0] >= 0 or (blocked is not None and blocked[y0, x0]):
                continue
            lab = len(sizes)
            labels[y0, x0] = lab
            q = deque([(y0, x0)])
            n = 0
            while q:
                y, x = q.popleft()
                n += 1
                for yy, xx in [(y + dy, x + dx) for dy, dx in N4]:
                    if 0 <= yy < Y and 0 <= xx < X and labels[yy, xx] < 0 \
                            and abs(int(h[yy, xx]) - int(h[y, x])) <= max_step \
                            and not (blocked is not None and blocked[yy, xx]):
                        labels[yy, xx] = lab
                        q.append((yy, xx))
                for yy, xx in links.get((y, x), []):          # a slope bridges one level
                    if labels[yy, xx] < 0 and not (blocked is not None and blocked[yy, xx]):
                        labels[yy, xx] = lab
                        q.append((yy, xx))
            sizes.append(n)
    return labels, sizes


WALK_LIMIT = 64
_WALK_DIRS = ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1))   # (dx, dy)


def walk_distance(h: np.ndarray, blocked, links, sx: int, sy: int, limit: float = WALK_LIMIT) -> np.ndarray:
    """Walking distance from the start's 3x3 (PLAN §5.6, D85; src/core/analysis/walk.ts): moves
    to the 4 neighbours on the same level (1), to a diagonal neighbour when both tiles beside it are
    on that level (sqrt 2), and along slope links [((y, x), (y2, x2)), ...] (1); blocked tiles are
    never entered. inf beyond `limit`. Dijkstra's distances do not depend on the order ties pop, so
    they equal the TypeScript port's bit for bit."""
    Y, X = h.shape
    hl = h.tolist()
    bl = blocked.tolist() if blocked is not None else None
    adj = {}
    for a, b in links:
        ia, ib = a[0] * X + a[1], b[0] * X + b[1]
        adj.setdefault(ia, []).append(ib)
        adj.setdefault(ib, []).append(ia)
    INF = float("inf")
    d = [INF] * (X * Y)
    heap = []
    for y in range(sy - 1, sy + 2):
        for x in range(sx - 1, sx + 2):
            if 0 <= x < X and 0 <= y < Y:
                d[y * X + x] = 0.0
                heapq.heappush(heap, (0.0, y * X + x))
    s2 = math.sqrt(2)

    def free(x, y, lv):
        return not (bl is not None and bl[y][x]) and hl[y][x] == lv

    while heap:
        k, c = heapq.heappop(heap)
        if k > d[c]:
            continue
        y, x = divmod(c, X)
        lv = hl[y][x]
        for dx, dy in _WALK_DIRS:
            xx, yy = x + dx, y + dy
            if not (0 <= xx < X and 0 <= yy < Y) or not free(xx, yy, lv):
                continue
            if dx and dy and not (free(xx, y, lv) and free(x, yy, lv)):
                continue
            nd = k + (s2 if dx and dy else 1.0)
            n = yy * X + xx
            if nd < d[n] and nd <= limit:
                d[n] = nd
                heapq.heappush(heap, (nd, n))
        for n in adj.get(c, ()):
            ny, nx = divmod(n, X)
            if bl is not None and bl[ny][nx]:
                continue
            nd = k + 1.0
            if nd < d[n] and nd <= limit:
                d[n] = nd
                heapq.heappush(heap, (nd, n))
    return np.array(d).reshape(Y, X)


def reach_at(d: np.ndarray, y: int, x: int) -> float:
    """How far a beaver walks to reach (y, x): the tile, or a 4-neighbour and one more step."""
    Y, X = d.shape
    best = d[y, x]
    for dy, dx in N4:
        yy, xx = y + dy, x + dx
        if 0 <= yy < Y and 0 <= xx < X and d[yy, xx] + 1 < best:
            best = d[yy, xx] + 1
    return float(best)


PUMP_DEPTH = 0.3             # water a pump reaches: at least 0.3 deep ...
PUMP_CLEAN = 0.05            # ... and clean
PUMP_REACH = 2               # its surface 0-2 levels below the shore's ground (the WaterPump's pipe)


def pump_shore_distance(walk: np.ndarray, h: np.ndarray, D: np.ndarray, C: np.ndarray) -> float:
    """The water rule (Kyler, 2026-09-25, D153, amending D85; src/core/analysis/walk.ts
    pumpShoreDistance): the walk (over the map's own ground and slopes) to the nearest shore tile
    that touches (4-neighbour) clean water at least 0.3 deep whose surface a pump on that shore
    reaches, 0-2 levels below the shore's own ground. The shore may be on any level."""
    Y, X = h.shape
    best = float("inf")
    for y, x in zip(*np.nonzero((D >= PUMP_DEPTH) & (C < PUMP_CLEAN))):
        surface = float(h[y, x]) + float(D[y, x])
        for dy, dx in N4:
            yy, xx = y + dy, x + dx
            if not (0 <= yy < Y and 0 <= xx < X) or not walk[yy, xx] < best:
                continue
            level = int(h[yy, xx])
            if level - PUMP_REACH <= surface <= level + 0.01:
                best = float(walk[yy, xx])
    return best


WATER_BODY = 0.001           # water deeper than this joins a body of water (4-connected)


def _tile_shore_walk(walk, h, y, x, d, clean) -> float:
    """pump_shore_distance for one tile with its water at depth d."""
    if not (d >= PUMP_DEPTH) or not clean:
        return float("inf")
    Y, X = h.shape
    surface = float(h[y, x]) + float(d)
    best = float("inf")
    for dy, dx in N4:
        yy, xx = y + dy, x + dx
        if not (0 <= yy < Y and 0 <= xx < X) or not walk[yy, xx] < best:
            continue
        level = int(h[yy, xx])
        if level - PUMP_REACH <= surface <= level + 0.01:
            best = float(walk[yy, xx])
    return best


def start_water_shore(walk, h, D, C, sources, after, within):
    """The water rule with Kyler's D302 (src/core/analysis/walk.ts startWaterShore): pump_shore_distance
    over the water a start may count, never a sealed puddle. Water counts when its body of water
    (4-connected, over 0.001 deep, as running_flow finds it) is fed by a running source (strength over 0,
    a tile in the body), or lasts the rule's drought: one of its tiles a pump reaches from a shore within
    `within` tiles' walk now is still one on `after` (drought_storage for the rule's days). Returns
    (distance, puddle, tile): the walk to the nearest water that counts, to the nearest water the rule
    leaves out when that is nearer (else inf), and the (y, x) tile of the water that counts (None)."""
    labels, sizes = components(D > WATER_BODY, connectivity=N4)
    counts = [False] * len(sizes)
    for s in sources:
        if s["strength"] > 0:
            for ty, tx in s["tiles"]:
                if labels[ty, tx] >= 0:
                    counts[labels[ty, tx]] = True
    now = {}
    for y, x in zip(*np.nonzero(labels >= 0)):
        k = int(labels[y, x])
        clean = bool(C[y, x] < PUMP_CLEAN)
        w = _tile_shore_walk(walk, h, y, x, D[y, x], clean)
        if w == float("inf"):
            continue
        now[(y, x)] = w
        if not counts[k] and w <= within and _tile_shore_walk(walk, h, y, x, after[y, x], clean) <= within:
            counts[k] = True
    best = puddle = float("inf")
    tile = None
    for (y, x), w in now.items():
        if counts[int(labels[y, x])]:
            if w < best:
                best, tile = w, (int(y), int(x))
        else:
            puddle = min(puddle, w)
    return best, (puddle if puddle < best else float("inf")), tile


# ---------------------------------------------------------------------------------------------
# Dam sites: a straight dam across a channel, measured by the reservoir it would hold

DAM_DIRS = ((1, 0), (0, 1), (1, 1), (1, -1))


def dam_candidate(h, water_surface, y, x, dy, dx, dam_height, max_half=10, max_flood=6000):
    """Dam line through (y, x) along (dy, dx), crest = h[y,x] + dam_height. The line extends
    until terrain reaches the crest on both sides. The reservoir is the tile set below the crest
    connected to the higher-water side, which must not leak around the dam ends or reach the map
    edge. Returns dict(length, volume, area, ratio) or None. Values are not rounded, so the
    TypeScript port (src/core/analysis/damsites.ts) picks the same sites."""
    Y, X = h.shape
    crest = h[y, x] + dam_height
    line = [(y, x)]
    for sgn in (1, -1):
        k = 1
        while True:
            yy, xx = y + sgn * k * dy, x + sgn * k * dx
            if not (0 <= yy < Y and 0 <= xx < X) or k > max_half:
                return None
            if h[yy, xx] >= crest:
                break
            line.append((yy, xx))
            k += 1
    on_line = set(line)
    # the two sides of the centre tile. A diagonal line of tiles is watertight for 4-connected
    # flow, and its sides are the tiles left and right of the centre.
    py, px = (1, 0) if dy == 0 else (0, 1)
    sides = [(y + py, x + px), (y - py, x - px)]
    sides = [s for s in sides if 0 <= s[0] < Y and 0 <= s[1] < X and s not in on_line]
    if len(sides) < 2:
        return None
    up = max(sides, key=lambda s: water_surface[s])
    down = min(sides, key=lambda s: water_surface[s])
    if h[up] >= crest:
        return None
    seen = {up}
    q = deque([up])
    vol = 0.0
    while q:
        cy, cx = q.popleft()
        vol += crest - h[cy, cx]
        if len(seen) > max_flood:
            return None
        for ddy, ddx in N4:
            yy, xx = cy + ddy, cx + ddx
            if not (0 <= yy < Y and 0 <= xx < X):
                return None           # reservoir spills off the map edge
            if (yy, xx) in seen or (yy, xx) in on_line or h[yy, xx] >= crest:
                continue
            if (yy, xx) == down:
                return None           # water walks around the dam
            seen.add((yy, xx))
            q.append((yy, xx))
    return {"y": int(y), "x": int(x), "dir": (dy, dx), "height": dam_height, "length": len(line),
            "area": len(seen), "volume": float(vol), "ratio": float(vol) / len(line)}


def max_flood_for(W: int, H: int) -> int:
    """The largest reservoir a dam site may flood: 6,000 tiles, or 15% of the map on maps larger
    than 200x200 (the dam-site basin cap, PLAN §9.1)."""
    return max(6000, int(0.15 * W * H))


def dam_sites(h, channel_mask, water_surface=None, heights=(1, 2, 3), stride=3, min_ratio=30.0,
              start_dist=None, max_dist=60, min_depth=0.0):
    """Best dam per channel tile sample (every stride-th channel tile in index order; with
    start_dist, only samples within max_dist of the start). Returns sites sorted by volume per dam
    tile, keeping only sites at least 8 tiles apart. With min_depth, only reservoirs at least that
    deep on average count (Hard: 3, PLAN §11.4)."""
    if water_surface is None:
        water_surface = h.astype(float)
    ys, xs = np.nonzero(channel_mask)
    order = np.lexsort((xs, ys))
    found = []
    max_flood = max_flood_for(h.shape[1], h.shape[0])
    for i in order[::stride]:
        y, x = int(ys[i]), int(xs[i])
        if start_dist is not None and start_dist[y, x] > max_dist:
            continue
        best = None
        for H in heights:
            for dy, dx in DAM_DIRS:
                c = dam_candidate(h, water_surface, y, x, dy, dx, H, max_flood=max_flood)
                if c and (min_depth <= 0 or c["volume"] / c["area"] >= min_depth) and (best is None or c["ratio"] > best["ratio"]):
                    best = c
        if best and best["ratio"] >= min_ratio:
            found.append(best)
    found.sort(key=lambda c: -c["ratio"])
    kept = []
    for c in found:
        if all(max(abs(c["x"] - k["x"]), abs(c["y"] - k["y"])) >= 8 for k in kept):
            kept.append(c)
    return kept


# ---------------------------------------------------------------------------------------------
# Entities

def by_template(m: TimberMap):
    out = {}
    for e in m.entities:
        out.setdefault(e["Template"], []).append(e)
    return out


def is_dead(e) -> bool:
    return bool(e["Components"].get("LivingNaturalResource", {}).get("IsDead", False))


def points(ents):
    return [(placement(e).x, placement(e).y) for e in ents]


def strength(e) -> float:
    return float(e["Components"].get("WaterSource", {}).get("SpecifiedStrength", 0.0))


def pct(values, q):
    return float(np.percentile(values, q)) if len(values) else None


def summary(values):
    v = [float(x) for x in values if x is not None and np.isfinite(x)]
    if not v:
        return None
    return {"n": len(v), "min": round(min(v), 2), "p10": round(pct(v, 10), 2), "median": round(pct(v, 50), 2),
            "mean": round(float(np.mean(v)), 2), "p90": round(pct(v, 90), 2), "max": round(max(v), 2)}
