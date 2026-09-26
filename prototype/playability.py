"""Playability checks (PLAN.md §11.3-11.5): settle the map's own water with the game's rules (the
canonical settle of watersim.py), then check that a colony can survive and grow from the start.
Thresholds come from the map's spec when a project file is given, otherwise from calibrated.py
for the difficulty (PLAN §19.5: imported maps use the defaults).

This is the oracle the TypeScript validator (src/core/validate/playability.ts) is compared with,
check by check (tools/oracle.ts): the same ids, rules, thresholds and "not applicable" cases.
Emitters and walking blockers are taken through their footprints (PLAN §11.5): a BadwaterSource
emits on its rotated 3x3, seeps stop at 0.8 deep, aquifers and badtide drains are off, and
multi-tile objects block walking on every tile."""
from __future__ import annotations

import math

import numpy as np

import calibrated as cal
from analysis import (components, dam_sites, distance_from, is_dead, placement, point_clusters, pump_shore_distance,
                      reach_at, walk_distance, walk_regions)
from watersim import (TICKS_PER_DAY, canonical_settle, cluster_saturation, contamination, drought_storage,
                      moisture, seq_sum, spill_levels)

WET = 0.05                   # water deeper than this is a water tile
BAD = 0.05                   # water this contaminated is badwater to a beaver
NEAR = 20                    # gatherers, lumberjacks and scavengers work within 20 steps
RESERVOIR_RADIUS = 40
BLUEBERRY_DAYS_TO_DIE_DRY = 9
TREES = ("Pine", "Birch", "Oak")
WALK_BLOCKERS = ("Thorns", "Blockage", "NaturalDam", "UnstableCore", "GeothermalField", "UndergroundRuins",
                 "SmallRelic", "MediumRelic", "LargeRelic")
RESERVE = {"scarce": 1.0, "normal": 1.5, "plenty": 3.0}      # PLAN §5.3 drought reserve
START_AREA = {"small": 0.6, "normal": 1.0, "large": 1.8}      # PLAN §5.6 start area
DROUGHT_DAYS = {"easy": 4, "normal": 9, "hard": 30}
COLONY = {"easy": 40, "normal": 50, "hard": 50}
START_CHECKS = ("start.dry", "start.water", "start.badwater", "start.reach", "start.food",
                "start.wood", "start.ruins_clear", "plants.survive", "plants.drought", "water.reservoir",
                "resources.scrap", "resources.trees", "resources.bushes", "ruins.fields", "ruins.access",
                "extras.placement")
# advisory from M8 (D85): generation targets with a warning, never a reason to reject a map; the
# resource amounts are information (Kyler, 2026-09-25: resources like the official maps)
ADVISORY_START = ("start.badwater", "start.reach", "start.ruins_clear", "water.reservoir", "plants.drought",
                  "resources.scrap", "resources.trees", "resources.bushes")

TREE_LOGS = {"Pine": 2, "Birch": 1, "Oak": 8}      # logs a grown tree gives (the game's specs)


def _number(v):
    """A number as a file stores it: plain, or in the older {"Value": ...} wrapper; None otherwise
    (src/core/analysis/wood.ts numberOf)."""
    if isinstance(v, dict) and len(v) == 1 and "Value" in v:
        v = v["Value"]
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
        return None
    return v


def growth_of(comps):
    """How far a tree has grown (Growable.GrowthProgress), or None for a grown tree: the game
    writes a Growable only while a tree grows (src/core/analysis/wood.ts growthOf)."""
    g = comps.get("Growable")
    return _number(g.get("GrowthProgress")) if isinstance(g, dict) else None


def is_sapling(comps):
    g = growth_of(comps)
    return g is not None and g < 1


def tree_logs(template, comps):
    """The logs a lumberjack cuts from a Pine, Birch or Oak once it has grown (D164;
    src/core/analysis/wood.ts treeLogs): what its Yielder:Cuttable holds when that is logs, else its
    species' yield; anything else gives none."""
    spec = TREE_LOGS.get(template)
    if spec is None:
        return 0
    y = comps.get("Yielder:Cuttable")
    if isinstance(y, dict) and isinstance(y.get("Yield"), dict) and y["Yield"].get("Good") == "Log":
        n = _number(y["Yield"].get("Amount"))
        if n is not None:
            return n if n > 0 else 0
    return spec


# emitters: local tiles, contamination, running at map start, seep (sim/model.ts)
SQ2 = [(x, y) for x in range(2) for y in range(2)]
SQ3 = [(x, y) for x in range(3) for y in range(3)]
EMITTERS = {
    "WaterSource": ([(0, 0)], 0.0, True, False),
    "BadwaterSource": (SQ3, 1.0, True, False),
    "WaterSeep": (SQ2, 0.0, True, True),
    "BadwaterSeep": (SQ2, 1.0, True, True),
    "Aquifer": ([(1, 1)], 0.0, False, False),
    "BadtideDrain": ([(0, 1)], 1.0, False, False),
}
ROT = {"Cw0": lambda x, y: (x, y), "Cw90": lambda x, y: (y, -x),
       "Cw180": lambda x, y: (-x, -y), "Cw270": lambda x, y: (-y, x)}
SLOPE_HIGH = {"Cw0": (0, -1), "Cw90": (-1, 0), "Cw180": (0, 1), "Cw270": (1, 0)}      # (dx, dy)


def object_tile(fps, p, lx, ly):
    fp = fps.get(p.template)
    if p.flipped and fp and fp["flippable"]:
        lx = fp["size"][0] - 1 - lx
    dx, dy = ROT[p.orientation](lx, ly)
    return p.x + dx, p.y + dy


def footprint_tiles(fps, p):
    """2-D tiles an object covers (every block with occupation flags, projected)."""
    fp = fps[p.template]
    out = []
    for x, y, z, below, flags, oab, stack in fp["blocks"]:
        if flags == 0:
            continue
        t = object_tile(fps, p, x, y)
        if t not in out:
            out.append(t)
    return out


def water_model(m, fps, surface):
    """(floor, sources, dam) for the simulation, from the map's objects in file order."""
    Y, X = surface.shape
    floor = surface.astype(float).copy()
    dam = None
    sources = []
    for e in m.entities:
        if "BlockObject" not in e.get("Components", {}):
            continue
        p = placement(e)
        rule = EMITTERS.get(p.template)
        if rule:
            tiles, cont, runs, seep = rule
            cells = [(ty, tx) for tx, ty in (object_tile(fps, p, lx, ly) for lx, ly in tiles) if 0 <= tx < X and 0 <= ty < Y]
            if cells:
                comps = e["Components"]
                delayed = comps.get("TimeActivatedComponent", {}).get("IsEnabled") is True
                s = float(comps.get("WaterSource", {}).get("SpecifiedStrength", 0.0)) if runs and not delayed else 0.0
                s = min(s, 8 * len(tiles))
                if not s > 0:
                    s = 0.0
                src = {"tiles": cells, "strength": s, "contamination": cont, "template": p.template}
                if seep:
                    src["depth_limit"] = (cells[0], 0.8, 0.72)
                sources.append(src)
        if p.template in ("Blockage", "BadtideDrain"):
            x, y = object_tile(fps, p, 0, 0)
            if 0 <= x < X and 0 <= y < Y and floor[y, x] < p.z + 1:
                floor[y, x] = p.z + 1
        elif p.template == "NaturalDam":
            x, y = object_tile(fps, p, 0, 0)
            if 0 <= x < X and 0 <= y < Y:
                if dam is None:
                    dam = np.full((Y, X), -1.0)
                dam[y, x] = 0.65
    return floor, sources, dam


def polygon_mask(poly, W, H):
    """Tiles whose centre lies inside a polygon (even-odd rule); src/core/features/geometry.ts."""
    mask = np.zeros((H, W), bool)
    ys = [p[1] for p in poly]
    y0, y1 = max(0, int(np.ceil(min(ys)))), min(H - 1, int(np.floor(max(ys))))
    for y in range(y0, y1 + 1):
        xs = []
        j = len(poly) - 1
        for i in range(len(poly)):
            xi, yi = poly[i]
            xj, yj = poly[j]
            if (yi > y) != (yj > y):
                xs.append(xi + ((y - yi) / (yj - yi)) * (xj - xi))
            j = i
        xs.sort()
        for k in range(0, len(xs) - 1, 2):
            xa, xb = max(0, int(np.ceil(xs[k]))), min(W - 1, int(np.floor(xs[k + 1])))
            if xb >= xa:
                mask[y, xa:xb + 1] = True
    return mask


def rules_for(spec, difficulty):
    """Thresholds (validate/playability.ts rulesFor): the spec's settings, or the defaults."""
    d = spec["designedFor"] if spec else difficulty
    base = cal.DIFFICULTY[d]
    s = spec["settings"] if spec else None
    r = s["start"]["rules"] if s else None
    return {
        "difficulty": d,
        "water_within": r["waterWithin"] if r else base["water_dist"],
        "wood_within": r["woodWithin20"] if r else base["wood_r20"],
        "bushes_within": r["bushesWithin20"] if r else base["bushes_r20"],
        # the Badwater distance setting and the start rule say the same thing: the stricter counts
        "badwater_within": max(s["hazards"]["badwaterDistance"], r["badwaterWithin"]) if s else base["badwater_min"],
        "ruins_within": r["ruinsWithin"] if r else base["ruin_min"],
        "reach_min": cal.START["reach_by_buildable_land"][s["terrain"]["buildableLand"] if s else "normal"]
        * START_AREA[s["start"]["area"] if s else "normal"],
        "drought_days": DROUGHT_DAYS[d],
        "reservoir_need": cal.reservoir_needed(d) * RESERVE[s["water"]["droughtReserve"] if s else "normal"],
        "reservoir_depth": 3 if d == "hard" else 0,
        "max_share": 0.55 if spec and spec["theme"] in ("lakeBasin", "islands") else cal.WATER["max_water_share"],
        "mult": ({"scrap": s["resources"]["ruins"] / 100, "trees": s["resources"]["forestDensity"] / 100,
                  "bushes": s["resources"]["berryBushes"] / 100} if s else {"scrap": 1, "trees": 1, "bushes": 1}),
    }


def check_playability(m, rep, fps, difficulty="normal", spec=None, features=None, water=None, profile=None):
    """The playability class, then the approximate-water rule (src/core/analysis/mechanics.ts)."""
    got = {} if water is None else water
    first = len(rep.checks)
    _check_playability(m, rep, fps, difficulty, spec, features, got, profile)
    why = approximate_reason(m, fps, got["D"])
    if why:
        for c in rep.checks[first:]:
            if approximate_id(c.id) and not c.na:
                c.ok = True
                c.approx = why


# ---- maps whose water a steady state cannot show (PLAN §11, D87, D98; decisions-pending #36)
CAVE_SHARE = 0.05
DELAYED_SHARE = 0.25
SEEP_SHARE = 0.5
DISAGREE_SHARE = 0.1


def approximate_id(cid):
    return cid.startswith("water.") or cid in ("start.dry", "start.water", "start.badwater", "start.reach", "start.food",
                                                "start.wood", "start.ruins_clear")


def _pct(v):
    return f"{int(round(v * 100))}%"


def mechanics(m, fps, h):
    """Causes: water a steady state leaves out (src/core/analysis/mechanics.ts mechanicsOf)."""
    running = delayed = aquifers = seeps = 0.0
    starts = []
    for e in m.entities:
        if "BlockObject" not in e.get("Components", {}):
            continue
        t = e["Template"]
        if t == "StartingLocation":
            starts.append(e)
        if t not in ("WaterSource", "WaterSeep", "Aquifer"):
            continue
        comps = e["Components"]
        s = float(comps.get("WaterSource", {}).get("SpecifiedStrength", 0.0))
        if t == "WaterSource":
            if comps.get("TimeActivatedComponent", {}).get("IsEnabled") is True:
                delayed += s
            else:
                running += s
        elif t == "WaterSeep":
            seeps += s
        else:
            aquifers += s
    floors = m.floors()
    cave = float(np.count_nonzero(floors > 1)) / floors.size
    under = False
    if len(starts) == 1:
        p = placement(starts[0])
        cells = [object_tile(fps, p, lx, ly) for lx in range(3) for ly in range(3)]
        x = int(round(sum(c[0] for c in cells) / 9))
        y = int(round(sum(c[1] for c in cells) / 9))
        if 0 <= x < m.size_x and 0 <= y < m.size_y and h[y, x] != p.z:
            under = True
    clean = running + delayed + aquifers + seeps
    reasons = []
    if cave >= CAVE_SHARE:
        reasons.append(f"caves or overhangs cover {_pct(cave)} of the map, and water under them is not simulated")
    if clean > 0 and delayed >= DELAYED_SHARE * clean:
        reasons.append(f"sources that turn on later carry {_pct(delayed / clean)} of the clean water")
    if clean > 0 and aquifers >= DELAYED_SHARE * clean:
        reasons.append(f"aquifers, which need a powered drill, carry {_pct(aquifers / clean)} of the clean water")
    if clean > 0 and seeps >= SEEP_SHARE * (running + seeps):
        reasons.append(f"seeps, which stop at 0.8 deep, carry {_pct(seeps / (running + seeps))} of the running water")
    if under:
        reasons.append("the start stands under a roof")
    return reasons, under, starts


def stored_wet(m):
    """Tiles where the map's own water (WaterMapNew, any level) is deeper than 0.05."""
    X, Y = m.size_x, m.size_y
    out = np.zeros((Y, X), bool)
    wm = m.singletons.get("WaterMapNew")
    if not wm or "WaterColumns" not in wm:
        return out
    toks = wm["WaterColumns"]["Array"].split(" ")
    levels = wm.get("Levels", 1)
    if len(toks) != levels * X * Y:
        return out
    for k, t in enumerate(toks):
        if t == "0":
            continue
        d = float(t.split(":")[0])
        if d > 0.05:
            y, x = divmod(k % (X * Y), X)
            out[y, x] = True
    return out


def approximate_reason(m, fps, D):
    """Why the settle cannot stand for the map's own water, or None (mechanics.ts approximateReason)."""
    h = m.surface()
    reasons, under, starts = mechanics(m, fps, h)
    if under:
        return "; ".join(reasons)
    if not reasons:
        return None
    stored = stored_wet(m)
    settled = D > 0.05
    differ = int(np.count_nonzero(settled != stored))
    ring_settled = ring_stored = 0
    if len(starts) == 1:
        p = placement(starts[0])
        cells = [object_tile(fps, p, lx, ly) for lx in range(3) for ly in range(3)]
        cx = int(round(sum(c[0] for c in cells) / 9))
        cy = int(round(sum(c[1] for c in cells) / 9))
        for y in range(cy - 2, cy + 3):
            for x in range(cx - 2, cx + 3):
                if 0 <= x < m.size_x and 0 <= y < m.size_y:
                    ring_settled += bool(settled[y, x])
                    ring_stored += bool(stored[y, x])
    evidence = []
    if ring_settled > ring_stored:
        evidence.append("the settled water floods the start, which the map's own water keeps dry")
    if differ >= DISAGREE_SHARE * stored.size:
        evidence.append(f"the settled water differs from the map's own water on {_pct(differ / stored.size)} of the map")
    return "; ".join(reasons + evidence) if evidence else None


def _check_playability(m, rep, fps, difficulty="normal", spec=None, features=None, water=None, profile=None):
    h = m.surface()
    X, Y = m.size_x, m.size_y
    N = X * Y
    rules = rules_for(spec, difficulty)

    # ---- blockers by footprint: walking, and moisture/contamination (Thorns)
    blocked = np.zeros((Y, X), bool)
    thorns = np.zeros((Y, X), bool)
    for e in m.entities:
        if "BlockObject" not in e.get("Components", {}) or e["Template"] not in WALK_BLOCKERS or e["Template"] not in fps:
            continue
        p = placement(e)
        for x, y in footprint_tiles(fps, p):
            if 0 <= x < X and 0 <= y < Y:
                blocked[y, x] = True
        if p.template == "Thorns":
            x, y = object_tile(fps, p, 0, 0)
            if 0 <= x < X and 0 <= y < Y:
                thorns[y, x] = True
    barrier = thorns if thorns.any() else None

    # ---- water: the canonical settle of the map's own sources
    floor, sources, dam = water_model(m, fps, h)
    sim, settled = canonical_settle(floor, sources, dam)
    D, C = sim.D, sim.C
    wet = D > WET
    clean = wet & (C < BAD)
    rep.add("water.settles", settled, f"steady after {sim.ticks} ticks ({sim.ticks / TICKS_PER_DAY:.1f} days)",
            sim.ticks, 4 * TICKS_PER_DAY)
    share = float(np.count_nonzero(wet)) / N
    rep.add("water.no_flood", share <= rules["max_share"], f"{share:.0%} of the map under water (official p90 40%)",
            round(share, 3), rules["max_share"])
    n_clean = int(np.count_nonzero(clean))
    # targets, not rules: maps need not hold their water (D152)
    rep.add("water.clean_exists", n_clean >= 0.02 * N, f"{n_clean} tiles of clean water", n_clean, int(0.02 * N),
            advisory=True)
    _outflow(rep, D, sources, features, X, Y)
    _sources_in_flow(rep, floor, sources, dam, D, profile)
    _, sizes = components(clean, connectivity=((1, 0), (-1, 0), (0, 1), (0, -1)))
    largest = max(sizes, default=0)
    rep.add("water.clean_reach", largest >= 40, f"largest clean water body {largest} tiles", largest, 40, advisory=True)
    _contained(rep, h, features, X, Y)
    M = moisture(h, D, C, sim.sat(), barrier)
    SC = contamination(h, D, C, barrier)
    water.update({"D": D, "C": C, "M": M, "SC": SC, "ticks": sim.ticks, "settled": settled})

    # ---- a mine site on every map (Kyler, 2026-09-25)
    mines = sum(1 for e in m.entities if e["Template"] == "UndergroundRuins" and "BlockObject" in e.get("Components", {}))
    rep.add("resources.mine_site", mines >= 1, f"{mines} mine sites (at least one)", mines, 1)

    # ---- the start (vanilla: exactly one; start.count reports anything else)
    starts = [e for e in m.entities if e["Template"] == "StartingLocation" and "BlockObject" in e.get("Components", {})]
    if len(starts) != 1:
        for cid in START_CHECKS:
            rep.add(cid, True, f"needs exactly one start (the map has {len(starts)})", na=True,
                    advisory=cid in ADVISORY_START)
        return
    p = placement(starts[0])
    cells = [object_tile(fps, p, lx, ly) for lx in range(3) for ly in range(3)]
    sx = int(round(sum(c[0] for c in cells) / 9))
    sy = int(round(sum(c[1] for c in cells) / 9))
    yy, xx = np.mgrid[0:Y, 0:X]
    cheb = np.maximum(np.abs(yy - sy), np.abs(xx - sx))
    sd = distance_from(cheb <= 1)
    rep.add("start.dry", not wet[cheb <= 2].any(), "district center and its ring stay dry after water settles")
    # walking: the map's own ground, and its slopes join levels (no player stairs)
    links = []
    for e in m.entities:
        if e["Template"] != "Slope":
            continue
        q = placement(e)
        dx, dy = SLOPE_HIGH[q.orientation]
        if 0 <= q.x < X and 0 <= q.y < Y and 0 <= q.x + dx < X and 0 <= q.y + dy < Y:
            links.append(((q.y, q.x), (q.y + dy, q.x + dx)))
    walk = walk_distance(h, blocked, links, sx, sy)
    # requirement 1, the water rule (D153, amending D85): clean pumpable water at a
    # shore the start reaches on foot, over the map's own ground and slopes, within the rule's walk
    dw = pump_shore_distance(walk, h, D, C)
    rep.add("start.water", dw <= rules["water_within"], f"clean water a pump reaches {dw:.1f} tiles' walk away",
            round(dw, 1), rules["water_within"])
    bad_soil = (SC > 0) | (wet & (C >= BAD))
    db = float(sd[bad_soil].min()) if bad_soil.any() else float("inf")
    rep.add("start.badwater", db >= rules["badwater_within"], f"nearest badwater or contaminated soil {db:.0f} tiles",
            round(db, 1), rules["badwater_within"], advisory=True)

    # ---- reach: same-level land joined by slopes (beavers cannot climb a 1-voxel step)
    labels, _ = walk_regions(h, 0, blocked, links)
    root = labels[sy, sx]
    reach = (labels == root) if root >= 0 else np.zeros((Y, X), bool)
    dry_reach = int(np.count_nonzero(reach & ~wet))
    rep.add("start.reach", dry_reach >= rules["reach_min"], f"{dry_reach} dry tiles walkable from the start",
            dry_reach, rules["reach_min"], advisory=True)

    # requirement 3 (D85): living berry bushes within 20 tiles' walk (slopes allowed); living: alive
    # and on soil where it survives at steady state. Requirement 2, starting wood (D164): the logs
    # of every grown tree within that walk, alive or dead, by its species' yield (tree_logs); a
    # sapling's logs are still growing and do not count
    bushes = wood = 0
    for e in m.entities:
        if "BlockObject" not in e.get("Components", {}):
            continue
        q = placement(e)
        tree = q.template in TREES
        if not tree and q.template != "BlueberryBush":
            continue
        if not (0 <= q.x < X and 0 <= q.y < Y) or reach_at(walk, q.y, q.x) > NEAR:
            continue
        if tree:
            if not is_sapling(e["Components"]):
                wood += tree_logs(q.template, e["Components"])
            continue
        if is_dead(e) or not (M[q.y, q.x] > 0 and not D[q.y, q.x] > 0 and not SC[q.y, q.x] > 0):
            continue
        bushes += 1
    rep.add("start.food", bushes >= rules["bushes_within"], f"{bushes} living berry bushes within 20 tiles' walk",
            bushes, rules["bushes_within"])
    rep.add("start.wood", wood >= rules["wood_within"], f"{wood} logs within 20 tiles' walk", wood,
            rules["wood_within"])
    ruins = [e for e in m.entities if e["Template"].startswith("RuinColumnH") and "BlockObject" in e.get("Components", {})]
    near_ruins = sum(1 for e in ruins if 0 <= placement(e).x < X and 0 <= placement(e).y < Y
                     and sd[placement(e).y, placement(e).x] < rules["ruins_within"])
    rep.add("start.ruins_clear", near_ruins == 0, f"{near_ruins} ruin columns within {rules['ruins_within']} tiles",
            near_ruins, 0, advisory=True)

    # ---- plants survive: living ones on moist, dry-footed, clean soil; succulents on dry soil
    wrong = 0
    for e in m.entities:
        if "BlockObject" not in e.get("Components", {}) or is_dead(e):
            continue
        q = placement(e)
        if not (0 <= q.x < X and 0 <= q.y < Y):
            continue
        if q.template in TREES or q.template == "BlueberryBush":
            wrong += bool(M[q.y, q.x] <= 0 or D[q.y, q.x] > 0 or SC[q.y, q.x] > 0)
        elif q.template == "Succulent":
            wrong += bool(M[q.y, q.x] > 0)
    rep.add("plants.survive", wrong == 0, f"{wrong} living plants on soil that kills them", wrong, 0)

    # ---- advisory: berry bushes near the start that lose their moisture in a long drought
    if rules["drought_days"] <= 0.9 * BLUEBERRY_DAYS_TO_DIE_DRY:
        rep.add("plants.drought", True, "droughts are shorter than a berry bush survives dry", 0, 0, advisory=True)
    else:
        kept = drought_storage(floor, D, rules["drought_days"], sources, dam)
        Cd = np.where(kept > 0, C, 0.0)
        Md = moisture(h, kept, Cd, cluster_saturation(kept > 0), barrier)
        thirsty = 0
        for e in m.entities:
            if e["Template"] != "BlueberryBush" or "BlockObject" not in e.get("Components", {}) or is_dead(e):
                continue
            q = placement(e)
            if 0 <= q.x < X and 0 <= q.y < Y and sd[q.y, q.x] <= NEAR and not Md[q.y, q.x] > 0:
                thirsty += 1
        rep.add("plants.drought", thirsty == 0, f"{thirsty} berry bushes near the start dry out in the drought",
                thirsty, 0, advisory=True)

    # ---- drought: a reservoir site near the start that holds a colony through the worst drought
    kept = drought_storage(floor, D, rules["drought_days"], sources, dam)
    natural = seq_sum(kept[sd <= RESERVOIR_RADIUS])
    deep = rules["reservoir_depth"]
    sites = dam_sites(h, clean, h + D, heights=(1, 2, 3, 4) if deep > 0 else (1, 2, 3), stride=2, start_dist=sd,
                      min_depth=deep)
    near_sites = [s for s in sites if sd[s["y"], s["x"]] <= RESERVOIR_RADIUS]
    best = max([s["volume"] for s in near_sites], default=0.0)
    need = rules["reservoir_need"]
    rep.add("water.reservoir", max(natural, best) >= need,
            f"best dam site within 40 tiles holds {best:.0f}, natural pools {natural:.0f}; need {need:.0f} "
            f"for {COLONY[rules['difficulty']]} beavers", round(max(natural, best)), round(need), advisory=True)
    water.update({"reach": reach, "sites": sites})

    # ---- resource totals: at least half the official median for this map size (about the official p10)
    area = N
    scrap = sum(15 * int(e["Template"][11:]) for e in ruins)
    n_trees = sum(1 for e in m.entities if e["Template"] in TREES + ("Succulent",) and "BlockObject" in e.get("Components", {}))
    n_bushes = sum(1 for e in m.entities if e["Template"] == "BlueberryBush" and "BlockObject" in e.get("Components", {}))
    for key, have, dkey, per in (("scrap", scrap, "scrap_per_1k_tiles", 1e3), ("trees", n_trees, "trees_per_10k", 1e4),
                                 ("bushes", n_bushes, "bushes_per_10k", 1e4)):
        need_k = 0.5 * cal.density(dkey, area) * area / per * rules["mult"][key]
        rep.add(f"resources.{key}", have >= need_k, f"{have} {key} (at least {need_k:.0f})", have, round(need_k),
                advisory=True)

    # ---- ruins: fields of touching columns, each scavengeable from its own level
    if ruins:
        pts = [(placement(e).x, placement(e).y) for e in ruins]
        in_fields = sum(len(c) for c in point_clusters(pts, 1) if len(c) >= 10) / len(ruins)
        rep.add("ruins.fields", in_fields >= 0.8, f"{in_fields:.0%} of columns in fields of 10+", round(in_fields, 2), 0.8)
        no_access = 0
        for e, (x, y) in zip(ruins, pts):
            z = placement(e).z
            if not any(0 <= x + dx < X and 0 <= y + dy < Y and h[y + dy, x + dx] == z and not blocked[y + dy, x + dx]
                       for dx in (-1, 0, 1) for dy in (-1, 0, 1) if dx or dy):
                no_access += 1
        rep.add("ruins.access", no_access == 0, f"{no_access} columns with no neighbour at their level", no_access, 0)
    else:
        rep.add("ruins.fields", True, "no ruins on this map", na=True)
        rep.add("ruins.access", True, "no ruins on this map", na=True)
    _extras(rep, h, D, sd, features, fps, X, Y)


# ---- extras.placement (PLAN §11.4; src/core/validate/playability.ts checkExtras)
OBJECT_TEMPLATE = {"mineSite": "UndergroundRuins", "relicSmall": "SmallRelic", "relicMedium": "MediumRelic",
                   "relicLarge": "LargeRelic", "geothermal": "GeothermalField", "thornBelt": "Thorns",
                   "weir": "NaturalDam", "plug": "Blockage", "bridge": "NaturalOverhang3x1",
                   "unstableCore": "UnstableCore"}
INF = float("inf")
EXTRA_BANDS = {  # (lo, hi, scaled): tiles from the start on maps of 128² and up
    "relicSmall": (13, 70, True), "relicMedium": (40, 140, True), "relicLarge": (140, INF, True),
    "geothermal": (30, 120, True), "mineSite": (60, INF, True), "thornBelt": (20, INF, False),
    "unstableCore": (40, INF, False),
}
FLAT_EXTRAS = ("mineSite", "relicSmall", "relicMedium", "relicLarge", "geothermal")
FLOOD_MARGIN = 2


def band_scale(X, Y):
    side = X if X > Y else Y
    return 1 if side >= 128 else side / 128


def coordinates_for_min_corner(sx, sy, mx, my, o):
    if o == "Cw0":
        return mx, my
    if o == "Cw90":
        return mx, my + sx - 1
    if o == "Cw180":
        return mx + sx - 1, my + sy - 1
    return mx + sy - 1, my


def object_tiles(fps, f):
    """The 2-D tiles of a map-object feature (src/core/features/objects.ts objectTiles)."""
    p = f["params"]
    pl = p["placement"]
    if "area" in pl:
        return [(x, y) for y, x0, x1 in pl["area"] for x in range(x0, x1 + 1)]
    from tbmap import Placement
    t = OBJECT_TEMPLATE[p["kind"]]
    sx, sy = fps[t]["size"][0], fps[t]["size"][1]
    cx, cy = coordinates_for_min_corner(sx, sy, pl["x"], pl["y"], pl["orientation"])
    return footprint_tiles(fps, Placement(t, cx, cy, 0, pl["orientation"], False))


def _extras(rep, h, D, sd, features, fps, X, Y):
    if features is None:
        rep.add("extras.placement", True, "distance bands are generator rules; imported maps keep their objects", na=True)
        return
    extras = [f for f in features if f["kind"] == "mapObject" and f["params"]["kind"] in EXTRA_BANDS]
    if not extras:
        rep.add("extras.placement", True, "no relics, geothermal fields, mine sites, thorn belts or unstable cores", na=True)
        return
    wet = D > WET
    flood = np.zeros((Y, X), bool)
    for y, x in zip(*np.nonzero(wet)):
        flood[max(0, y - FLOOD_MARGIN):y + FLOOD_MARGIN + 1, max(0, x - FLOOD_MARGIN):x + FLOOD_MARGIN + 1] = True
    for f in features:
        if f["kind"] == "lake" and f["params"].get("planned"):
            flood |= polygon_mask(f["params"]["outline"], X, Y)
    scale = band_scale(X, Y)
    bad = 0
    cores = []
    for f in extras:
        k = f["params"]["kind"]
        tiles = object_tiles(fps, f)
        on = [(x, y) for x, y in tiles if 0 <= x < X and 0 <= y < Y]
        problem = len(on) < len(tiles)
        if not problem and k in FLAT_EXTRAS:
            lv = h[on[0][1], on[0][0]]
            problem = any(h[y, x] != lv for x, y in on) or any(flood[y, x] for x, y in on)
        if not problem and f["origin"] == "generated" and on:
            lo, hi, scaled = EXTRA_BANDS[k]
            if scaled:
                lo, hi = lo * scale, hi * scale
            d = min(float(sd[y, x]) for x, y in on)
            problem = d < lo or d > hi
        if not problem and k == "unstableCore" and f["origin"] == "generated":
            cores.append((on, (f["params"].get("core") or {}).get("radius", 2)))
        bad += bool(problem)
    for a in range(len(cores)):
        for b in range(a + 1, len(cores)):
            gap = min(max(abs(ax - bx), abs(ay - by)) for ax, ay in cores[a][0] for bx, by in cores[b][0])
            if gap < max(cores[a][1], cores[b][1]) + 2:
                bad += 1
    rep.add("extras.placement", bad == 0, f"{bad} map objects out of place", bad, 0)


def channel_tiles(tiles, levels, width, X, Y):
    """Bed tiles of a carved channel (src/core/features/route.ts channelTiles): a square of side
    `width` round every route tile, at that tile's level (the lowest where squares overlap)."""
    r = (width - 1) >> 1
    bed = {}
    for k in range(len(levels)):
        x, y, lv = tiles[2 * k], tiles[2 * k + 1], levels[k]
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                nx, ny = x + dx, y + dy
                if 0 <= nx < X and 0 <= ny < Y:
                    i = ny * X + nx
                    if i not in bed or lv < bed[i]:
                        bed[i] = lv
    return bed


def basin_leak(p, h, X, Y):
    """Where water rising in a badwater basin with its outlet blocked leaves it below its rim, or
    None (src/core/validate/playability.ts basinLeak)."""
    rim = p["floor"] + 2
    cx, cy = p["x"] + 1, p["y"] + 1
    blocked = channel_tiles(p["outlet"], p["outletLevels"], p["outletWidth"], X, Y)
    seen = set()
    queue = []
    for y in range(p["y"], p["y"] + 3):
        for x in range(p["x"], p["x"] + 3):
            if 0 <= x < X and 0 <= y < Y:
                seen.add(y * X + x)
                queue.append((x, y))
    q = 0
    while q < len(queue):
        x, y = queue[q]
        q += 1
        for dx, dy in ((0, -1), (-1, 0), (0, 1), (1, 0)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < X and 0 <= ny < Y):
                return (x, y)
            n = ny * X + nx
            if n in seen or n in blocked or h[ny, nx] >= rim:
                continue
            if abs(nx - cx) > 5 or abs(ny - cy) > 5:
                return (nx, ny)
            seen.add(n)
            queue.append((nx, ny))
    return None


def _contained(rep, h, features, X, Y):
    """water.badwater_contained (PLAN §9.5, D57): with its outlet blocked, every planned badwater
    basin holds its water below its rim."""
    if features is None:
        rep.add("water.badwater_contained", True, "needs the map's planned badwater basins (imported maps have none)",
                na=True)
        return
    basins = [f["params"]["plan"] for f in features
              if f["kind"] == "setPiece" and f["params"]["kind"] == "badwaterBasin"
              and f["params"]["plan"].get("mode") == "basin" and isinstance(f["params"]["plan"].get("outlet"), list)]
    if not basins:
        rep.add("water.badwater_contained", True, "no badwater basin with a planned outlet on this map", na=True)
        return
    leaks = [l for l in (basin_leak(p, h, X, Y) for p in basins) if l]
    rep.add("water.badwater_contained", not leaks, f"{len(leaks)} of {len(basins)} badwater basins leak below their rim",
            len(leaks), 0)


SOURCE_TEMPLATES = ("WaterSource", "BadwaterSource")


def sources_in_flow(floor, sources, dam, D):
    """Water sources start rivers (Kyler, 2026-09-25, D171; src/core/analysis/sources.ts): the
    WaterSources and BadwaterSources that stand where water from another source comes down to them.
    Emitters whose tiles touch (8-neighbour) are one group. Water runs down the spill levels, on a
    flat toward the flat's way out, and all through a pool (spill above the floor); a group's water
    goes from its tiles over the settled water (any depth), each step one way water runs. A group
    is inside a flow when a running group's water reaches one of its sources and its own water does
    not reach that group back. Returns (sources, [indices into `sources` flagged])."""
    Y, X = floor.shape
    N = X * Y
    units = []
    for k, s in enumerate(sources):
        cells = [y * X + x for (y, x) in s["tiles"]]
        units.append((k, cells, s["strength"], s.get("template") in SOURCE_TEMPLATES))
    n_sources = sum(1 for u in units if u[3])
    if not n_sources:
        return 0, []
    parent = list(range(len(units)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    owner = {}
    for k, cells, _, _ in units:
        for c in cells:
            if c not in owner:
                owner[c] = k
    for k, cells, _, _ in units:
        for c in cells:
            y, x = divmod(c, X)
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    xx, yy = x + dx, y + dy
                    if not (0 <= xx < X and 0 <= yy < Y):
                        continue
                    o = owner.get(yy * X + xx)
                    if o is None:
                        continue
                    ra, rb = find(o), find(k)
                    if ra != rb:
                        parent[max(ra, rb)] = min(ra, rb)
    by_root = {}
    for k in range(len(units)):
        by_root.setdefault(find(k), []).append(k)
    groups = list(by_root.values())
    spill_a = spill_levels(floor, sources, dam).ravel()
    level = floor.astype(float).ravel() if dam is None else np.where(dam >= 0, floor + dam, floor).astype(float).ravel()
    pool = (spill_a > level).tolist()
    spill = spill_a.tolist()
    depth = D.ravel().tolist()

    def nbrs(c):
        y, x = divmod(c, X)
        return (c - X if y > 0 else -1, c - 1 if x > 0 else -1, c + X if y < Y - 1 else -1, c + 1 if x < X - 1 else -1)

    # which way water runs on a flat: across it and toward its way out (a tile beside lower ground,
    # or a draining map edge), by the steps to it, never back away from it
    emitting = bytearray(N)
    for k, cells, _, _ in units:
        for c in cells:
            emitting[c] = 1
    exit_dist = [-1] * N
    queue = []
    for c in range(N):
        y, x = divmod(c, X)
        ex = (x == 0 or y == 0 or x == X - 1 or y == Y - 1) and not emitting[c]
        if not ex:
            ex = any(n >= 0 and spill[n] < spill[c] for n in nbrs(c))
        if ex:
            exit_dist[c] = 0
            queue.append(c)
    head = 0
    while head < len(queue):
        c = queue[head]
        head += 1
        for n in nbrs(c):
            if n < 0 or exit_dist[n] >= 0 or spill[n] != spill[c]:
                continue
            exit_dist[n] = exit_dist[c] + 1
            queue.append(n)

    def runs(c, n):
        return spill[n] < spill[c] or (spill[n] == spill[c] and ((pool[c] and pool[n]) or exit_dist[n] <= exit_dist[c]))

    reach = []
    for g in groups:
        seen = bytearray(N)
        queue = []
        for k in g:
            for c in units[k][1]:
                if not seen[c]:
                    seen[c] = 1
                    queue.append(c)
        head = 0
        while head < len(queue):
            c = queue[head]
            head += 1
            for n in nbrs(c):
                if n < 0 or seen[n] or not depth[n] > 0 or not runs(c, n):
                    continue
                seen[n] = 1
                queue.append(n)
        reach.append(seen)

    def reaches(a, b, sources_only):
        return any((not sources_only or units[k][3]) and any(reach[a][c] for c in units[k][1]) for k in groups[b])

    running = [any(units[k][2] > 0 for k in g) for g in groups]
    flagged = []
    for b in range(len(groups)):
        if not any(units[k][3] for k in groups[b]):
            continue
        if any(a != b and running[a] and reaches(a, b, True) and not reaches(b, a, False) for a in range(len(groups))):
            flagged.extend(units[k][0] for k in groups[b] if units[k][3])
    return n_sources, sorted(flagged)


def _sources_in_flow(rep, floor, sources, dam, D, profile=None):
    """water.source_in_flow (D171): no water source inside a flow that is already there. In the
    editor's export profile sources go anywhere (D184): the rule is for generated maps."""
    if profile == "export":
        rep.add("water.source_in_flow", True, "sources go anywhere in the editor (D184): the rule is for generated maps", na=True)
        return
    n, flagged = sources_in_flow(floor, sources, dam, D)
    if not n:
        rep.add("water.source_in_flow", True, "no water sources on this map", na=True)
        return
    rep.add("water.source_in_flow", not flagged, f"{len(flagged)} of {n} water sources inside an existing flow",
            len(flagged), 0)


def _outflow(rep, D, sources, features, X, Y):
    """Every source's water reaches a map edge that drains, or a planned lake (needs the features)."""
    if features is None:
        rep.add("water.outflow", True, "needs the map's planned lakes (imported maps have none)", na=True)
        return
    labels, _ = components(D > 0, connectivity=((1, 0), (-1, 0), (0, 1), (0, -1)))
    emitting = np.zeros((Y, X), bool)
    for s in sources:
        for (y, x) in s["tiles"]:
            emitting[y, x] = True
    border = np.zeros((Y, X), bool)
    border[0, :] = border[-1, :] = border[:, 0] = border[:, -1] = True
    drains = set(int(v) for v in labels[border & ~emitting & (labels >= 0)])
    for f in features:
        if f["kind"] == "lake":
            mask = polygon_mask(f["params"]["outline"], X, Y)
            drains |= set(int(v) for v in labels[mask & (labels >= 0)])
    bad = [s for s in sources if s["strength"] > 0 and labels[s["tiles"][0]] >= 0 and int(labels[s["tiles"][0]]) not in drains]
    rep.add("water.outflow", not bad, f"{len(bad)} sources whose water reaches neither an edge nor a planned lake",
            len(bad), 0)
