"""Soil moisture and contamination by the game's own rules, on a heightfield (PLAN §20 D298).

The Python validator's port of src/core/sim/soil3d.ts's "game" mode on one terrain run per tile
(src/core/sim/soil.ts `gameSoil`): the game's per-tick soil tasks (MoistureCalculationTask,
ContaminationCandidatesCountingTask), in float32 with their decay and spreading rates, run from dry
soil until nothing changes, which is what the game stores once the soil has settled. Each tick reads
only the last tick's values, so updating every tile each tick (as here, with numpy) gives the same
values as the TypeScript's update of only the tiles whose inputs changed.

On a heightfield a tile's run is [0, surface) (at level 0 an empty run, as the game lays them out:
it holds soil like any other). Its water is the tile's one water column, whose floor is the surface, or one above it
under a Blockage (then the tile has no water of its own). Thorns (the barrier) keep their tile at 0.
"""

import numpy as np

F32 = np.float32

TICK = F32(0.6)
M_DECAY = F32(F32(1.25) * TICK)
M_SPREAD = F32(F32(6.66) * TICK)
M_SCALER = F32(1.0 / float(F32(0.53)))
M_MIN_WATER = F32(0.01)
M_MIN = F32(0.01)
M_DIAG = F32(1.414)
C_DECAY = F32(F32(0.033) * TICK)
C_SPREAD = F32(F32(0.066) * TICK)
C_MAX = F32(1.0 - float(F32(0.001)))
C_REG = F32(1.0 / 7.0)
C_DIAG = F32(float(F32(np.sqrt(2.0))) / 7.0)
C_VERT = F32(5.0 / 7.0)
C_MIN_WATER = 0.5
C_SCALER = F32(1.0 / (1.0 - 0.5))
C_THRESHOLD = F32(0.001)

# the side-to-side neighbours in the game's order (dx, dy): -y, -x, +y, +x
DIRS4 = ((0, -1), (-1, 0), (0, 1), (1, 0))
# the spread's 8 neighbours (dx, dy, diagonal)
SPREAD8 = ((0, -1, False), (-1, 0, False), (1, 0, False), (0, 1, False), (-1, -1, True), (1, -1, True), (-1, 1, True), (1, 1, True))


def _shift(a: np.ndarray, dx: int, dy: int, fill=0):
    """The value of each tile's neighbour at (x + dx, y + dy); `fill` outside the map."""
    Y, X = a.shape
    out = np.full_like(a, fill)
    ys = slice(max(0, -dy), Y - max(0, dy))
    xs = slice(max(0, -dx), X - max(0, dx))
    ysrc = slice(max(0, dy), Y - max(0, -dy))
    xsrc = slice(max(0, dx), X - max(0, -dx))
    out[ys, xs] = a[ysrc, xsrc]
    return out


def _settle(cell, shape, max_ticks=3000):
    last = np.zeros(shape, F32)
    for _ in range(max_ticks):
        nxt = cell(last)
        if np.array_equal(nxt, last):
            break
        last = nxt
    return last


def moisture_game(surface: np.ndarray, floor: np.ndarray, D: np.ndarray, C: np.ndarray, sat: np.ndarray, barrier=None, max_ticks=3000) -> np.ndarray:
    """Moisture per tile at the game's steady state. `surface` the terrain heights, `floor` the water
    columns' floors (the surface, one higher under a Blockage), `D`, `C` the settled water's depth
    and contamination, `sat` its cluster saturation, `barrier` the Thorns tiles."""
    h = surface.astype(np.int64)
    fl = floor.astype(np.int64)
    node = np.ones(h.shape, bool)
    own = fl == h
    D32 = D.astype(F32)
    C32 = C.astype(F32)
    initial = (2 * sat.astype(np.int64)).astype(F32)
    # GetMoisture: the range of each tile's water, cut by its contamination
    s = (C32 * M_SCALER).astype(F32)
    cut = np.trunc((initial * (F32(1) - s).astype(F32)).astype(F32))
    rng = np.where(C32 < M_MIN_WATER, np.trunc(initial), np.where(s >= 1, 0.0, cut))
    wet_own = own & (D32 > 0)
    climb_base = h + np.where(own, np.ceil(D32.astype(np.float64)).astype(np.int64), 0)
    fixed = np.full(h.shape, np.nan, F32)
    clean = wet_own & (C32 <= M_MIN_WATER)
    fixed[clean] = np.trunc(initial[clean])
    if barrier is not None:
        fixed[barrier] = 0
    keep = np.where(own, (F32(1) - C32).astype(F32), F32(1)).astype(F32)
    # the water term: the best of the 4 neighbours' water (GetMoistureFromWater)
    water = np.zeros(h.shape, np.float64)
    for dx, dy in DIRS4:
        jf = _shift(fl, dx, dy, fill=10 ** 6)
        jd = _shift(D32, dx, dy, fill=F32(0))
        jr = _shift(rng, dx, dy, fill=0.0)
        ok = (jf <= h) & (jd > 0)
        surf = np.ceil((jf.astype(F32) + jd).astype(F32).astype(np.float64)).astype(np.int64)
        m = jr - np.maximum(0, h - surf) * 6
        m = np.where(ok & (surf > 0), m, -np.inf)
        water = np.maximum(water, m)
    water = np.where(np.isfinite(water), water, 0.0)
    water32 = water.astype(F32)
    has_fixed = ~np.isnan(fixed)
    fixed0 = np.where(has_fixed, fixed, F32(0)).astype(F32)
    no_spread = water32 >= 16
    shifted = [(dx, dy, diag, _shift(node, dx, dy, fill=False), _shift(climb_base, dx, dy, fill=0)) for dx, dy, diag in SPREAD8]

    def cell(last):
        spread = np.zeros(h.shape, F32)
        for dx, dy, diag, jn, jcb in shifted:
            m = _shift(last, dx, dy, fill=F32(0))
            cost = M_DIAG if diag else F32(1)
            climb = h - jcb
            v = np.where(climb < 0, (m - cost).astype(F32), ((m - (climb * 6).astype(F32)).astype(F32) - cost).astype(F32))
            v = np.where(jn & (m != 0), v, F32(0))
            spread = np.maximum(spread, v)
        spread = np.where(no_spread, F32(0), spread)
        decayed = np.maximum((last - M_DECAY).astype(F32), F32(0))
        cap = (last + M_SPREAD).astype(F32)
        take = np.where(water32 > cap, cap, water32)
        v = np.where((water32 > decayed) & (water32 >= spread), take, np.where(spread > decayed, spread, decayed))
        out = (v * keep).astype(F32)
        out = np.where(out < M_MIN, F32(0), out)
        out = np.where(has_fixed, fixed0, out)
        return np.where(node, out, F32(0)).astype(F32)

    return _settle(cell, h.shape, max_ticks).astype(np.float64)


def contamination_game(surface: np.ndarray, floor: np.ndarray, D: np.ndarray, C: np.ndarray, barrier=None, max_ticks=3000) -> np.ndarray:
    """Soil contamination per tile at the game's steady state (the candidates' fixed point, 0 below
    the threshold)."""
    h = surface.astype(np.int64)
    fl = floor.astype(np.int64)
    node = np.ones(h.shape, bool)
    D32 = D.astype(F32)
    C32 = C.astype(F32)
    Y, X = h.shape
    barred = barrier if barrier is not None else np.zeros(h.shape, bool)
    # the water term: the first of the 4 neighbours (in the game's order) whose contaminated water
    # reaches the maximum, else the best (GetContaminationFromWater)
    water = np.zeros(h.shape, F32)
    done = np.zeros(h.shape, bool)
    for dx, dy in DIRS4:
        jf = _shift(fl, dx, dy, fill=10 ** 6)
        jd = _shift(D32, dx, dy, fill=F32(0))
        jc = _shift(C32, dx, dy, fill=F32(0))
        ok = (jf <= h) & (jc > 0)
        s = (jc - F32(C_MIN_WATER)).astype(F32)
        surf = np.where(jd > 0, np.ceil((jf.astype(F32) + jd).astype(F32).astype(np.float64)).astype(np.int64), 0)
        scaled = (s * C_SCALER).astype(F32)
        up = h - surf
        m = np.where(up < 0, scaled, (scaled - (up.astype(F32) * C_VERT).astype(F32)).astype(F32))
        valid = ok & (s >= 0) & (surf > 0) & ~done
        better = valid & (m > water)
        water = np.where(better, m, water).astype(F32)
        done = done | (water >= C_MAX)
    water = np.where(barred, F32(0), water).astype(F32)
    no_spread = water >= C_MAX
    shifted = []
    for dx, dy, diag in SPREAD8:
        jh = _shift(h, dx, dy, fill=0)
        climb = (np.maximum(0, h - jh).astype(F32) * C_VERT).astype(F32)
        shifted.append((dx, dy, diag, _shift(node, dx, dy, fill=False), climb))

    def cell(last):
        spread = np.zeros(h.shape, F32)
        for dx, dy, diag, jn, climb in shifted:
            m = _shift(last, dx, dy, fill=F32(0))
            v = ((m - climb).astype(F32) - (C_DIAG if diag else C_REG)).astype(F32)
            spread = np.maximum(spread, np.where(jn, v, F32(0)))
        spread = np.where(no_spread, F32(0), spread)
        decayed = np.maximum((last - C_DECAY).astype(F32), F32(0))
        cap = (last + C_SPREAD).astype(F32)
        take = np.where(water > cap, cap, water)
        v = np.where((water > decayed) & (water >= spread), take, np.where(spread > decayed, spread, decayed)).astype(F32)
        v = np.where(barred, F32(0), v)
        return np.where(node, v, F32(0)).astype(F32)

    cand = _settle(cell, h.shape, max_ticks)
    return np.where(cand < C_THRESHOLD, 0.0, cand.astype(np.float64))
