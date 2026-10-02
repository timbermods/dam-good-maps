"""Golden vectors for the TypeScript water port (PLAN §4, §15): small terrains with sources,
simulated by the Python reference (prototype/watersim.py). For each fixture it records the state
after 50, 200 and 975 ticks from empty, the steady-state moisture and soil contamination of the
975-tick state, the pre-fill and the canonical settle, and the analytic drought storage.
tests/unit/water.test.ts replays them and must match within 1e-6 depth and exactly on the
moist/dry mask.

    python tools/export-fixtures.py            # writes tests/golden/water.json.gz

The terrains are built from formulas (no random numbers), so the file only changes when the
simulation does.
"""
from __future__ import annotations

import gzip
import json
import os
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "prototype"))
from watersim import (WaterSim, canonical_settle, contamination, drought_storage,  # noqa: E402
                      moisture, prefill)

OUT = os.path.join(ROOT, "tests", "golden", "water.json.gz")


def src(tiles, strength, cont=0.0, depth_limit=None):
    s = {"tiles": [tuple(t) for t in tiles], "strength": strength, "contamination": cont}
    if depth_limit:
        s["depth_limit"] = depth_limit
    return s


def channel(W=32, H=12, bed=3, bank=4, rows=(4, 5, 6, 7)):
    h = np.full((H, W), bank)
    for y in rows:
        h[y, :] = bed
    return h


def fixtures():
    out = []

    # 1. a river entering on the west edge, its mouth sealed by a row of sources, leaving east
    h = channel()
    out.append(("channel_sealed", h, None, [src([(y, 0)], 0.5) for y in (4, 5, 6, 7)]))

    # 2. the same mouth with a gap: water drains back off the west edge beside the gap
    out.append(("channel_gap", h, None, [src([(y, 0)], 0.5) for y in (4, 5, 7)]))

    # 3. a waterfall: the bed drops three levels halfway along
    h = channel(W=36, bed=6, bank=7)
    h[4:8, 18:] = 3
    h[:4, 18:] = 4
    h[8:, 18:] = 4
    out.append(("waterfall", h, None, [src([(y, 0)], 0.6) for y in (4, 5, 6, 7)]))

    # 4. a lake: an inland spring fills a closed basin to its sill, then spills to the east edge
    W, H = 30, 24
    h = np.full((H, W), 6)
    h[6:18, 5:17] = 3
    h[11:13, 17:W] = 5                   # the outlet channel, sill at 5
    h[11:13, 24:W] = 4
    out.append(("lake_sill", h, None, [src([(12, 10)], 1.0)]))

    # 5. a spring on a flat plain: a thin sheet spreads past the spill threshold
    h = np.full((20, 20), 5)
    h[:, 0] = 4
    out.append(("flat_plain", h, None, [src([(10, 10)], 0.3)]))

    # 6. badwater: a 3x3 badwater source beside a clean river mixes in downstream
    h = channel(W=34, H=16, bed=3, bank=4, rows=(6, 7, 8))
    h[1:4, 14:17] = 3
    h[4:6, 15] = 3
    bad = src([(y, x) for x in range(14, 17) for y in range(1, 4)], 0.9, 1.0)
    out.append(("badwater_mix", h, None, [src([(y, 0)], 0.5) for y in (6, 7, 8)] + [bad]))

    # 7. a natural weir (0.65 partial obstacle) across the channel
    h = channel(W=30)
    dam = np.full(h.shape, -1.0)
    dam[4:8, 15] = 0.65
    out.append(("weir", h, dam, [src([(y, 0)], 0.5) for y in (4, 5, 6, 7)]))

    # 8. a seep in a pit: it stops above 0.8 deep and restarts below 0.72
    h = np.full((16, 16), 6)
    h[5:11, 5:11] = 4
    seep = src([(7, 7), (7, 8), (8, 7), (8, 8)], 1.0, 0.0, ((7, 7), 0.8, 0.72))
    out.append(("seep_pit", h, None, [seep]))

    # 9. terraces above a river: moisture climbs one level (-6), not three
    h = channel(W=28, H=24, bed=3, bank=4, rows=(10, 11, 12))
    h[14:17, :] = 5
    h[17:, :] = 8
    h[:7, :] = 6
    out.append(("terraces", h, None, [src([(y, 0)], 0.7) for y in (10, 11, 12)]))

    # 10. two rivers merging into one
    W, H = 30, 30
    h = np.full((H, W), 5)
    h[4:7, :] = 3
    h[4:W, 14:17] = 3
    out.append(("confluence", h, None, [src([(y, 0)], 0.4) for y in (4, 5, 6)] +
                [src([(H - 1, x)], 0.4) for x in (14, 15, 16)]))

    # 11. a weak spring in a small pit: evaporation balances the inflow, films evaporate fast
    h = np.full((14, 14), 5)
    h[5:9, 5:9] = 4
    out.append(("evaporation", h, None, [src([(6, 6)], 0.002)]))

    # 12. a stepped valley with a side basin the river passes through (pre-fill: basin + river)
    W, H = 40, 22
    h = np.full((H, W), 8)
    h[9:13, :] = 5
    h[9:13, 20:] = 4
    h[5:17, 10:18] = 3                    # a depression the river crosses
    out.append(("valley_basin", h, None, [src([(y, 0)], 0.5) for y in (9, 10, 11, 12)]))

    # 13. a pit on a dry plateau (D385): a spring's channel drops onto the plateau's lip and on into
    # a gorge; the pre-fill's walk spreads over the whole plateau and fills the pit, but no water
    # goes there, so the canonical settle takes that water away and the pit is dry
    W, H = 30, 20
    h = np.full((H, W), 4)
    h[:, :6] = 8
    h[9:12, :6] = 6
    h[9:12, 7:] = 2
    h[3:6, 18:21] = 2                     # the pit
    out.append(("plateau_pit", h, None, [src([(10, 1)], 1.5)]))
    return out


def arr(a):
    """Row-major list with whole numbers as ints (short) and floats as repr (exact)."""
    flat = np.asarray(a, dtype=float).ravel()
    return [int(v) if v == int(v) else float(v) for v in flat.tolist()]


def main():
    data = {"version": 1, "ticks": [50, 200, 975], "fixtures": []}
    for name, h, dam, sources in fixtures():
        H, W = h.shape
        rec = {
            "name": name, "W": W, "H": H, "floor": arr(h),
            "dam": arr(dam) if dam is not None else None,
            "emitters": [{"cells": [y * W + x for y, x in s["tiles"]], "strength": s["strength"],
                          "contamination": s["contamination"],
                          **({"depthLimit": {"anchor": s["depth_limit"][0][0] * W + s["depth_limit"][0][1],
                                             "off": s["depth_limit"][1], "on": s["depth_limit"][2]}}
                             if s.get("depth_limit") else {})} for s in sources],
            "snapshots": [],
        }
        sim = WaterSim(h, sources, dam=dam)
        done = 0
        for t in data["ticks"]:
            sim.run(t - done)
            done = t
            rec["snapshots"].append({"ticks": t, "depth": arr(sim.D), "contamination": arr(sim.C)})
        sat = sim.sat()
        rec["moisture"] = arr(moisture(h, sim.D, sim.C, sat))
        rec["soilContamination"] = arr(contamination(h, sim.D, sim.C))
        d0, c0 = prefill(h, sources, dam)
        rec["prefill"] = {"depth": arr(d0), "contamination": arr(c0)}
        csim, settled = canonical_settle(h, sources, dam)
        rec["canonical"] = {"settled": bool(settled), "ticks": csim.ticks, "depth": arr(csim.D),
                            "contamination": arr(csim.C)}
        rec["drought9"] = arr(drought_storage(h, csim.D, 9, sources, dam))
        data["fixtures"].append(rec)
        print(f"{name:15s} {W}x{H}  wet {int((sim.D > 0).sum())} at 975, canonical settle "
              f"{'settled' if settled else 'NOT settled'} after {csim.ticks} ticks")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    raw = json.dumps(data, separators=(",", ":")).encode("utf-8")
    with open(OUT, "wb") as f:
        f.write(gzip.compress(raw, compresslevel=9, mtime=0))
    print(f"wrote {OUT}: {len(raw)} bytes of JSON")


if __name__ == "__main__":
    main()
