"""Timberborn 1.1 water, moisture and soil contamination for heightfield maps (one water column
per tile). A port of the game's rules (investigation/notes/water_and_soil.md, "Simplified water
simulation spec"): it reproduced the game's own save of a generated map to 0.001 depth after
975 ticks from empty, and matches Diorama and Waterfalls exactly. It does not model water under
roofs (caves, overhangs, tunnels), which the generator never makes.

This is the reference the TypeScript port (src/core/sim/*.ts) is checked against, bit for bit on
the golden fixtures (tools/export-fixtures.py): keep the order of operations in step with it.

Units: depth in blocks, strength S = S blocks of water per second; 1 tick = 0.6 s = 2 substeps;
1 game day = 768 ticks.

Emitters are dicts {tiles: [(y, x)], strength: S, contamination: 0..1} with an optional
depth_limit: ((y, x), off, on) for seeps (off above `off` deep at the anchor, back on below `on`).
"""
from __future__ import annotations

import heapq
import math

import numpy as np

DT = 0.3                  # seconds per substep
K = 2.25 * DT             # flow factor
SPILL = 0.1               # spill threshold onto dry ground of the same floor
KEEP = 0.999              # flow momentum kept per substep
BAL = 0.8                 # outflow balancing against the reverse flow
TICKS_PER_DAY = 768
EVAPORATION_PER_DAY = 0.0535
# direction k: 0 = -y, 1 = -x, 2 = +y, 3 = +x ; OPP[k] is the reverse direction
DIRS = ((-1, 0), (0, -1), (1, 0), (0, 1))
OPP = (2, 3, 0, 1)


def _shift(a, k, fill):
    """Value of the neighbour in direction k for every tile (fill outside the map)."""
    dy, dx = DIRS[k]
    Y, X = a.shape
    p = np.pad(a, 1, constant_values=fill)
    return p[1 + dy:1 + dy + Y, 1 + dx:1 + dx + X]      # out[y, x] = a[y + dy, x + dx]


def seq_sum(a) -> float:
    """Sum in index order (the TypeScript port adds the same way; numpy's .sum() is pairwise)."""
    flat = np.asarray(a, dtype=float).ravel()
    return float(np.cumsum(flat)[-1]) if flat.size else 0.0


class WaterSim:
    def __init__(self, floor: np.ndarray, sources=(), dam=None, depth=None, contamination=None):
        """floor: floor of the water column per tile (terrain surface, raised by full obstacles).
        sources: emitters (see the module doc). dam: height of a partial obstacle (NaturalDam 0.65)
        above the floor per tile, -1 where there is none. depth/contamination: a starting state."""
        self.F = floor.astype(float)
        Y, X = floor.shape
        self.D = np.zeros((Y, X)) if depth is None else np.array(depth, dtype=float)
        self.Dold = np.zeros((Y, X))
        self.C = np.zeros((Y, X)) if contamination is None else np.array(contamination, dtype=float)
        self.out = np.zeros((4, Y, X))
        self.sources = list(sources)
        self.dam = None if dam is None else np.asarray(dam, dtype=float)
        self.inside = [np.ones((Y, X), bool) for _ in range(4)]    # neighbour k inside the map
        self.inside[0][0, :] = False
        self.inside[1][:, 0] = False
        self.inside[2][-1, :] = False
        self.inside[3][:, -1] = False
        # the map edge drains water, except the padding next to a source cell, which is solid
        # (every water source, also one that is switched off)
        self.wall = [np.zeros((Y, X), bool) for _ in range(4)]
        for s in self.sources:
            for (y, x) in s["tiles"]:
                for k in range(4):
                    if not self.inside[k][y, x]:
                        self.wall[k][y, x] = True
        self.seep_on = [True] * len(self.sources)
        self.ticks = 0
        self.steady_ticks = None      # see settle()

    def _evap_mod(self):
        wet = self.D > 0
        p = np.pad(wet, 1)
        Y, X = wet.shape
        cnt = sum(p[1 + dy:1 + dy + Y, 1 + dx:1 + dx + X].astype(int)
                  for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx)
        wn = np.where(wet, 1 + cnt, 0)
        best = wn.copy()
        for k in range(4):
            best = np.maximum(best, _shift(wn, k, 0) - 1)
        sat = np.where(wet, np.minimum(8, best), 0)
        mod = np.where(sat == 0, 1.0, 0.0595 * (10 - sat) ** 2 + 0.101 * (10 - sat) + 0.72)
        return mod, sat

    def _update_seeps(self):
        for i, s in enumerate(self.sources):
            lim = s.get("depth_limit")
            if not lim:
                continue
            (ay, ax), off, on = lim
            d = self.D[ay, ax]
            if d > off:
                self.seep_on[i] = False
            elif d < on:
                self.seep_on[i] = True

    def substep(self, evap_mod, strength_scale=1.0):
        F, D, C = self.F, self.D, self.C
        H = F + D
        f = np.zeros((4,) + D.shape)
        for k in range(4):
            Hn = _shift(H, k, 0.0)            # outside the map: floor 0, no water
            Fn = _shift(F, k, 0.0)
            Dn = _shift(D, k, 0.0)
            e = H - Hn
            prev = KEEP * self.out[k]
            e_sp = np.where((Dn == 0) & (Fn == F) & self.inside[k], e - SPILL, e)
            fk = prev + K * e_sp
            if self.dam is not None:
                # a partial obstacle (NaturalDam) in the target tile
                lim = np.where(self.inside[k], _shift(self.dam, k, -1.0), -1.0)
                at_dam = (lim >= 0) & (Fn < np.ceil(H))
                hd = H - Fn
                a = np.clip(np.clip((lim - hd) / 0.1, 0, 1) * np.clip(1 - 2.25 * (H - (F + self.Dold)), 0.5, 2), 0, 1)
                f_below = 0.995 * prev - 0.02 * a
                e_d = np.where((hd - lim < 0.1) & (e > 0), e * ((hd - lim) / 0.1), e)
                f_above = 0.995 * prev + K * e_d
                fk = np.where(at_dam, np.where(hd < lim, f_below, f_above), fk)
            blocked = self.wall[k] | (Fn >= H) | (D <= 0)
            f[k] = np.where(blocked, 0.0, np.maximum(fk, 0.0))
        s = f.sum(axis=0)
        scale = np.where(s * DT > D, D / np.maximum(s * DT, 1e-12), 1.0)
        f *= scale
        inflow = np.zeros((4,) + D.shape)
        for k in range(4):
            inflow[k] = np.where(self.inside[k], _shift(f[OPP[k]], k, 0.0), 0.0)
        outsum = f.sum(axis=0)
        insum = inflow.sum(axis=0)
        # contamination moves with the flow as a volume-weighted mix
        cin = sum(inflow[k] * _shift(C, k, 0.0) for k in range(4))
        remaining = np.maximum(D - outsum * DT, 0.0)
        for k in range(4):
            self.out[k] = np.maximum(0.0, f[k] - BAL * inflow[k])
        self.Dold = D.copy()
        evap = np.where(D < 0.02, 1e-3, 1e-4) * evap_mod
        newD = np.maximum(0.0, D + (insum - outsum - evap * (D > 0)) * DT)
        mass = C * remaining + cin * DT
        self.C = np.where(newD > 1e-9, np.clip(mass / np.maximum(newD, 1e-9), 0, 1), 0.0)
        self.D = newD
        # sources add dt*S/N to each of their cells
        for i, src in enumerate(self.sources):
            if not self.seep_on[i]:
                continue
            add = DT * src["strength"] * strength_scale / len(src["tiles"])
            if not add > 0:
                continue
            for (y, x) in src["tiles"]:
                d0 = self.D[y, x]
                self.C[y, x] = (self.C[y, x] * d0 + src.get("contamination", 0.0) * add) / (d0 + add)
                self.D[y, x] = d0 + add

    def run(self, ticks, strength_scale=1.0):
        for _ in range(ticks):
            self._update_seeps()
            mod, _ = self._evap_mod()
            self.substep(mod, strength_scale)
            self.substep(mod, strength_scale)
            self.ticks += 1
        return self

    def settle(self, max_days=4.0, tol=0.005, check_every=128, sealed=None):
        """Run with sources on until the water stops changing (PLAN §11.3): between two checks
        128 ticks apart, the total volume changes by under 0.2% and at least 99.5% of tiles move
        by at most `tol`. (A strict max-change test never passes: thin sheets at spill
        thresholds keep flickering by a few hundredths.)

        `sealed`: the kept tiles of the map's sealed basins (flat indices, a carve's oxbow lakes,
        Fills). What they lose to evaporation is not the water changing (D222, D413): the settle
        stops at the first check where only that still changed, and `self.steady_ticks` is that
        check's tick (None otherwise). `self.last_prev` is the water at the check before the last
        (`sealed_basins` at the last check)."""
        self.steady_ticks = None
        prev = self.D.copy()
        prev_vol = seq_sum(prev)
        n = self.D.size
        self.last_prev = prev
        for _ in range(int(max_days * TICKS_PER_DAY / check_every)):
            self.run(check_every)
            vol = seq_sum(self.D)
            dv = abs(vol - prev_vol) / max(vol, 1e-9)
            moved = int(np.count_nonzero(np.abs(self.D - prev) > tol))
            self.last_prev = prev
            if dv < 0.002 and moved <= 0.005 * n:
                return True
            if sealed and steady_apart_from_sealed(self, prev, sealed, tol, 0.005):
                self.steady_ticks = self.ticks
                return False
            prev = self.D.copy()
            prev_vol = vol
        return False

    def sat(self):
        return self._evap_mod()[1]


def sealed_basins(sim, prev, sealed):
    """The sealed basins at a check (D222): the water round each of a basin's kept tiles
    (4-connected tiles wet at either check) while it holds no running source's tile and reaches no
    map edge: nothing flows in or out, so all it can lose is what evaporates. Returns (closed,
    drying), flat masks: every tile of such a basin, and those of its tiles that did not rise. Same
    as src/core/sim/water.ts `sealedBasins`."""
    Y, X = sim.D.shape
    D = sim.D.ravel()
    P = prev.ravel()
    N = D.size
    feeds = np.zeros(N, bool)
    for s in sim.sources:
        if s["strength"] > 0:
            for (y, x) in s["tiles"]:
                feeds[y * X + x] = True
    wet = (D > 0) | (P > 0)
    closed = np.zeros(N, bool)
    drying = np.zeros(N, bool)
    seen = np.zeros(N, bool)
    for s0 in sealed:
        if seen[s0] or not wet[s0]:
            continue
        seen[s0] = True
        queue = [s0]
        is_open = False
        head = 0
        while head < len(queue):
            c = queue[head]
            head += 1
            y, x = divmod(c, X)
            if feeds[c] or x == 0 or y == 0 or x == X - 1 or y == Y - 1:
                is_open = True
            for nb in (c - X if y > 0 else -1, c - 1 if x > 0 else -1, c + X if y < Y - 1 else -1, c + 1 if x < X - 1 else -1):
                if nb < 0 or seen[nb] or not wet[nb]:
                    continue
                seen[nb] = True
                queue.append(nb)
        if is_open:
            continue
        for i in queue:
            closed[i] = True
            if not D[i] > P[i]:
                drying[i] = True
    return closed, drying


def steady_apart_from_sealed(sim, prev, sealed, tol, moved_share):
    """Whether the water changed between two checks only by sealed basins evaporating (D222,
    D413): the settle's test on everything but the tiles of a sealed basin that lost water (its
    tiles that rose count as before): the rest's volume changes by under 0.2% of the rest and at
    most `moved_share` of the map's tiles move by over `tol`. Same as src/core/sim/water.ts
    `steadyApartFromSealed`."""
    D = sim.D.ravel()
    P = prev.ravel()
    N = D.size
    _, drying = sealed_basins(sim, prev, sealed)
    # the settle's test on everything else, summed in index order as the TypeScript does
    rest = seq_sum(np.where(drying, 0.0, D))
    rest_prev = seq_sum(np.where(drying, 0.0, P))
    moved = int(np.count_nonzero((np.abs(D - P) > tol) & ~drying))
    dv = abs(rest - rest_prev) / max(rest, 1e-9)
    return dv < 0.002 and moved <= moved_share * N


# ---------------------------------------------------------------------------------------------
# The canonical settle (PLAN §10, §19.7): a starting state computed from the terrain and the
# sources alone, then the simulation until it settles. Same algorithm as src/core/sim/prefill.ts.

def _level(floor, dam):
    lv = floor.astype(float)
    if dam is not None:
        lv = np.where(dam >= 0, lv + dam, lv)
    return lv


def spill_levels(floor: np.ndarray, sources=(), dam=None) -> np.ndarray:
    """Spill level of every tile: the lowest level water standing there drains at, through the
    map edge (priority flood). Edge tiles that emit water are walled off and are not outlets."""
    Y, X = floor.shape
    filled = _level(floor, dam).ravel().copy()
    emitting = np.zeros(Y * X, bool)
    for s in sources:
        for (y, x) in s["tiles"]:
            emitting[y * X + x] = True
    seen = np.zeros(Y * X, bool)
    heap = []
    for i in range(Y * X):
        y, x = divmod(i, X)
        if (x == 0 or y == 0 or x == X - 1 or y == Y - 1) and not emitting[i]:
            seen[i] = True
            heap.append((filled[i], i))
    heapq.heapify(heap)
    while heap:
        lv, c = heapq.heappop(heap)
        y, x = divmod(c, X)
        for n in (c - X if y > 0 else -1, c - 1 if x > 0 else -1, c + X if y < Y - 1 else -1, c + 1 if x < X - 1 else -1):
            if n < 0 or seen[n]:
                continue
            seen[n] = True
            if filled[n] < lv:
                filled[n] = lv
            heapq.heappush(heap, (filled[n], n))
    return filled.reshape(Y, X)


def prefill(floor: np.ndarray, sources=(), dam=None, retained=()):
    """Starting depth and contamination: every depression on the sources' downhill path starts
    full at its spill level; the other tiles of the path start at 0.3*Q/w (Q the flow through the
    tile, w the shorter of the row and column runs of open-channel tiles through it), at most 1.
    `retained`: the water sealed basins kept (a carve's oxbow lakes, as src/core/sim/water.ts
    `RetainedWater`: dicts of flat `tiles` and their `floor`, `depth` and `contamination`); their
    tiles start with it, up to the surface it had."""
    Y, X = floor.shape
    N = Y * X
    F = floor.astype(float).ravel()
    spill = spill_levels(floor, sources, dam).ravel()
    q = np.zeros(N)
    q_bad = np.zeros(N)
    path = np.zeros(N, bool)
    for s in sources:
        if not s["strength"] > 0:
            continue
        seen = np.zeros(N, bool)
        queue = []
        for (y, x) in s["tiles"]:
            i = y * X + x
            if not seen[i]:
                seen[i] = True
                queue.append(i)
        head = 0
        while head < len(queue):
            c = queue[head]
            head += 1
            q[c] += s["strength"]
            if s.get("contamination", 0.0) > 0:
                q_bad[c] += s["strength"] * s["contamination"]
            path[c] = True
            y, x = divmod(c, X)
            for n in (c - X if y > 0 else -1, c - 1 if x > 0 else -1, c + X if y < Y - 1 else -1, c + 1 if x < X - 1 else -1):
                if n < 0 or seen[n] or spill[n] > spill[c]:
                    continue
                seen[n] = True
                queue.append(n)
    basin = spill > F
    open_ = (path & ~basin).reshape(Y, X)
    run_x = np.zeros((Y, X), int)
    run_y = np.zeros((Y, X), int)
    for y in range(Y):
        x = 0
        while x < X:
            if not open_[y, x]:
                x += 1
                continue
            x1 = x
            while x1 < X and open_[y, x1]:
                x1 += 1
            run_x[y, x:x1] = x1 - x
            x = x1
    for x in range(X):
        y = 0
        while y < Y:
            if not open_[y, x]:
                y += 1
                continue
            y1 = y
            while y1 < Y and open_[y1, x]:
                y1 += 1
            run_y[y:y1, x] = y1 - y
            y = y1
    run_x, run_y = run_x.ravel(), run_y.ravel()
    depth = np.zeros(N)
    cont = np.zeros(N)
    for i in np.nonzero(path)[0]:
        if basin[i]:
            d = spill[i] - F[i]
        else:
            w = min(run_x[i], run_y[i])
            d = 0.3 * q[i] / w
            if d > 1:
                d = 1.0
        depth[i] = d
        cont[i] = q_bad[i] / q[i] if d > 0 and q[i] > 0 else 0.0
    # a sealed basin starts with the water it kept, up to the surface it had
    for lake in retained or ():
        for k, i in enumerate(lake["tiles"]):
            if F[i] == lake["floor"][k]:
                depth[i] = lake["depth"][k]
                cont[i] = lake["contamination"][k]
            else:
                d = lake["floor"][k] + lake["depth"][k] - F[i]
                depth[i] = d if d > 0 else 0.0
                cont[i] = lake["contamination"][k] if d > 0 else 0.0
    return depth.reshape(Y, X), cont.reshape(Y, X)


def canonical_settle(floor: np.ndarray, sources=(), dam=None, retained=()):
    """The canonical settle: the pre-fill, then the simulation until it settles (at most 4 game
    days). Returns (sim, settled); `sim.steady_ticks` is set when it stopped because only sealed
    basins were still changing, by evaporating (D222, D413), and such water has settled too
    (`water.settles`). Every sealed basin at the last check is stored as the pre-fill started it
    (D413; src/core/sim/prefill.ts `keepSealed`)."""
    d0, c0 = prefill(floor, sources, dam, retained)
    sim = WaterSim(floor, sources, dam=dam, depth=d0, contamination=c0)
    sealed = sorted({i for lake in retained or () for i in lake["tiles"]})
    settled = sim.settle(max_days=4, sealed=sealed or None)
    if sealed:
        closed, _ = sealed_basins(sim, sim.last_prev, sealed)
        closed = closed.reshape(sim.D.shape)
        sim.D = np.where(closed, d0, sim.D)
        sim.C = np.where(closed, c0, sim.C)
        sim.out = np.where(closed[None, :, :], 0.0, sim.out)
    return sim, settled


# ---------------------------------------------------------------------------------------------
# Soil moisture and contamination (exact steady state of the game's rules on heightfields)

def moisture(floor: np.ndarray, D: np.ndarray, C: np.ndarray, sat: np.ndarray, barrier=None) -> np.ndarray:
    """Steady-state soil moisture per tile. Tiles with clean water get 2*sat; tiles beside water
    get range - 6 * levels above the ceiled water surface; spreading costs 1 per orthogonal tile,
    1.414 per diagonal, and 6 per level climbed. Badwater (C >= 0.53) gives none. Barrier tiles
    (Thorns) stay at 0 and pass nothing on."""
    Y, X = floor.shape
    z = floor.astype(int)
    wet = D > 0
    rng = np.where(C >= 0.01, np.floor(2 * sat * np.clip(1 - C / 0.53, 0, 1)), 2 * sat)
    surf_ceil = np.ceil(z + D - 1e-9).astype(int)
    M = np.zeros((Y, X))
    fixed = np.zeros((Y, X), bool)
    clean_wet = wet & (C <= 0.01)
    M[clean_wet] = 2 * sat[clean_wet]
    fixed |= clean_wet
    if barrier is not None:
        M[barrier] = 0
        fixed |= barrier
    heap = []
    for y in range(Y):
        for x in range(X):
            if fixed[y, x]:
                if M[y, x] > 0:
                    heapq.heappush(heap, (-M[y, x], y * X + x))
                continue
            best = 0.0
            for dy, dx in DIRS:
                yy, xx = y + dy, x + dx
                if 0 <= yy < Y and 0 <= xx < X and wet[yy, xx]:
                    v = rng[yy, xx] - 6 * max(0, z[y, x] - surf_ceil[yy, xx])
                    best = max(best, v)
            if best > 0:
                M[y, x] = best
                heapq.heappush(heap, (-best, y * X + x))
    r2 = math.sqrt(2)
    while heap:
        negm, i = heapq.heappop(heap)
        y, x = divmod(i, X)
        m = -negm
        if m < M[y, x] - 1e-9:
            continue
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if not (dy or dx):
                    continue
                yy, xx = y + dy, x + dx
                if not (0 <= yy < Y and 0 <= xx < X) or fixed[yy, xx]:
                    continue
                cost = r2 if dy and dx else 1.0
                climb = max(0, z[yy, xx] - z[y, x] - int(math.ceil(D[y, x] - 1e-9)))
                v = m - cost - 6 * climb
                if v > M[yy, xx] + 1e-9:
                    M[yy, xx] = v
                    heapq.heappush(heap, (-v, yy * X + xx))
    M = M * np.where(wet, 1 - C, 1.0)
    M[M < 0.01] = 0
    return M


def contamination(floor: np.ndarray, D: np.ndarray, C: np.ndarray, barrier=None) -> np.ndarray:
    """Steady-state soil contamination candidates: only water with C >= 0.5 contaminates; value
    2*(C-0.5) beside it, -1/7 per tile (sqrt2/7 diagonal), -5/7 per level up. Reach ~7 tiles."""
    Y, X = floor.shape
    z = floor.astype(int)
    bad = (D > 0) & (C >= 0.5)
    surf_ceil = np.ceil(z + D - 1e-9).astype(int)
    V = np.zeros((Y, X))
    heap = []
    for y, x in zip(*np.nonzero(bad)):
        V[y, x] = max(V[y, x], 2 * (C[y, x] - 0.5))
        heapq.heappush(heap, (-V[y, x], y * X + x))
        for dy, dx in DIRS:
            yy, xx = y + dy, x + dx
            if 0 <= yy < Y and 0 <= xx < X and not bad[yy, xx]:
                v = 2 * (C[y, x] - 0.5) - (5 / 7) * max(0, z[yy, xx] - surf_ceil[y, x])
                if v > V[yy, xx]:
                    V[yy, xx] = v
                    heapq.heappush(heap, (-v, yy * X + xx))
    r2 = math.sqrt(2)
    while heap:
        negv, i = heapq.heappop(heap)
        y, x = divmod(i, X)
        v0 = -negv
        if v0 < V[y, x] - 1e-9:
            continue
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if not (dy or dx):
                    continue
                yy, xx = y + dy, x + dx
                if not (0 <= yy < Y and 0 <= xx < X) or (barrier is not None and barrier[yy, xx]):
                    continue
                v = v0 - (r2 if dy and dx else 1) / 7 - (5 / 7) * max(0, z[yy, xx] - z[y, x])
                if v > V[yy, xx] + 1e-9:
                    V[yy, xx] = v
                    heapq.heappush(heap, (-v, yy * X + xx))
    V[V < 0.001] = 0
    return V


def cluster_saturation(wet: np.ndarray) -> np.ndarray:
    """Cluster saturation of every wet tile: WN = 1 + wet 8-neighbours,
    sat = min(8, max(WN, max over 4-neighbours of WN - 1)); 0 on dry tiles."""
    p = np.pad(wet, 1)
    Y, X = wet.shape
    cnt = sum(p[1 + dy:1 + dy + Y, 1 + dx:1 + dx + X].astype(int)
              for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx)
    wn = np.where(wet, 1 + cnt, 0)
    best = wn.copy()
    for k in range(4):
        best = np.maximum(best, _shift(wn, k, 0) - 1)
    return np.where(wet, np.minimum(8, best), 0)


SECONDS_PER_DAY = TICKS_PER_DAY * 2 * DT


def drought_storage(floor: np.ndarray, D: np.ndarray, days: float, sources=(), dam=None):
    """Water left after `days` of drought with every source off (PLAN §10): water below each
    basin's spill level stays, water above it drains through the edges, and each pool loses what
    its surface evaporates (1e-4/s times each tile's saturation modifier, shared over the flat
    pool). Same algorithm as src/core/sim/drought.ts."""
    Y, X = floor.shape
    N = Y * X
    F = floor.astype(float).ravel()
    Dr = np.asarray(D, dtype=float).ravel()
    spill = spill_levels(floor, sources, dam).ravel()
    own = spill.copy()
    if dam is not None:
        dm = np.asarray(dam, dtype=float).ravel()
        for i in range(N):
            if dm[i] < 0:
                continue
            y, x = divmod(i, X)
            lo = F[i] if (x == 0 or y == 0 or x == X - 1 or y == Y - 1) else math.inf
            for n in (i - X if y > 0 else -1, i - 1 if x > 0 else -1, i + X if y < Y - 1 else -1, i + 1 if x < X - 1 else -1):
                if n >= 0 and spill[n] < lo:
                    lo = spill[n]
            own[i] = lo if lo > F[i] else F[i]
    kept = np.zeros(N)
    for i in range(N):
        surface = F[i] + Dr[i]
        k = (surface if surface < own[i] else own[i]) - F[i]
        kept[i] = k if k > 0 else 0.0
    wet = kept > 0
    sat = cluster_saturation(wet.reshape(Y, X)).ravel()
    label = np.full(N, -1)
    area = []
    for s0 in range(N):
        if not wet[s0] or label[s0] >= 0:
            continue
        lab = len(area)
        label[s0] = lab
        queue = [s0]
        head = 0
        while head < len(queue):
            c = queue[head]
            head += 1
            y, x = divmod(c, X)
            for n in (c - X if y > 0 else -1, c - 1 if x > 0 else -1, c + X if y < Y - 1 else -1, c + 1 if x < X - 1 else -1):
                if n < 0 or not wet[n] or label[n] >= 0 or own[n] != own[c]:
                    continue
                label[n] = lab
                queue.append(n)
        area.append(len(queue))
    evap = [0.0] * len(area)
    for i in range(N):
        if label[i] < 0:
            continue
        t = 10 - int(sat[i])
        evap[label[i]] += 1e-4 * (0.0595 * (t * t) + 0.101 * t + 0.72) * SECONDS_PER_DAY
    for i in range(N):
        if label[i] < 0:
            continue
        drop = (evap[label[i]] / area[label[i]]) * days
        k = kept[i] - drop
        kept[i] = k if k > 0 else 0.0
    return kept.reshape(Y, X)
