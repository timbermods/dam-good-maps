"""Validate a .timber map: everything the game needs to load it without dropping objects, plus
playability rules calibrated on the official maps. A map passes only if every check passes.

    python prototype/validate.py out/*.timber [--difficulty normal] [--profile export] [--json] [--load-only] [--quiet]

--load-only runs the load and design checks only (file, terrain, placement, slopes, start), as the
TypeScript generator's M1 acceptance asks (ROADMAP M1); --quiet prints one line per file. The design
checks include terrain.edge_wall (no edge walls, Kyler 2026-09-25); water.source_in_flow (D171)
needs the settled water, so it runs with the playability checks.

A map "<stem>.timber" with a project file "<stem>.damgoodmaps.json" beside it (the website's
download, gzip JSON) is checked with its spec's thresholds and its planned lakes, as the website's
`generate` profile does; any other map with the defaults for --difficulty, as an import.
--profile export checks a map as the editor's export does: sources go anywhere (D184), so
water.source_in_flow does not apply.
A check that does not apply to the map is reported as passing with "na"; the one advisory check
(plants.drought) never fails the map.

Check ids and thresholds are documented in PLAN.md ("Validation"); the evidence behind them is
in investigation/notes/*.md and investigation/REPORT.md.
"""
from __future__ import annotations

import io
import json
import os
import re
import sys
from dataclasses import dataclass, field

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from analysis import (N4, by_template, distance_from, is_dead, placement,  # noqa: E402
                      saved_water)
from tbmap import GAME_VERSION, TimberMap  # noqa: E402

FOOTPRINTS = os.path.join(os.path.dirname(HERE), "investigation", "notes", "footprints.json")
LIMITS = {"min_size": 4, "max_size": 256, "layers": 23, "editor_max_height": 16,
          "game_max_height": 22, "max_object_z": 33, "support_distance": 3}
COMMON_NATURAL = {"Pine", "Birch", "Oak", "Succulent", "BlueberryBush"}
ORIENTATIONS = {"Cw0", "Cw90", "Cw180", "Cw270"}
GUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
OCC = {"Floor": 1, "Bottom": 2, "Top": 4, "Corners": 8, "Path": 16, "Middle": 32, "All": 63}
# templates whose ground blocks must sit on the first (lowest) terrain column
CONTINUOUS = {"WaterSource", "BadwaterSource", "WaterSeep", "BadwaterSeep", "Aquifer", "BadtideDrain",
              "GeothermalField", "UndergroundRuins"}
REQUIRED_COMPONENTS = {
    **{f"RuinColumnH{k}": ("RuinModels", "Yielder:Ruin") for k in range(1, 9)},
    "WaterSource": ("WaterSource",), "BadwaterSource": ("WaterSource",), "Aquifer": ("WaterSource",),
    "BadtideDrain": ("WaterSource",), "WaterSeep": ("WaterSource", "WaterDepthStrengthModifier"),
    "BadwaterSeep": ("WaterSource", "WaterDepthStrengthModifier"),
    "UnstableCore": ("UnstableCore",), "ReservePile": ("FixedStockpile",), "ReserveTank": ("FixedStockpile",),
    "ReserveWarehouse": ("FixedStockpile",),
}
ROT = {"Cw0": lambda x, y: (x, y), "Cw90": lambda x, y: (y, -x),
       "Cw180": lambda x, y: (-x, -y), "Cw270": lambda x, y: (-y, x)}
SLOPE_HIGH = {"Cw0": (0, -1), "Cw90": (-1, 0), "Cw180": (0, 1), "Cw270": (1, 0)}      # (dx, dy)
START_ENTRANCE = {"Cw0": (1, -1), "Cw90": (-1, -1), "Cw180": (-1, 1), "Cw270": (1, 1)}  # tile offset


@dataclass
class Check:
    id: str
    ok: bool
    detail: str = ""
    value: object = None
    limit: object = None
    na: bool = False
    advisory: bool = False
    approx: str = ""        # why the result is only approximate (the water a steady state cannot show)


@dataclass
class Report:
    path: str
    checks: list = field(default_factory=list)

    def add(self, id, ok, detail="", value=None, limit=None, na=False, advisory=False):
        self.checks.append(Check(id, bool(ok), detail, value, limit, bool(na), bool(advisory)))

    @property
    def passed(self):
        return all(c.ok or c.advisory for c in self.checks)

    def failures(self):
        return [c for c in self.checks if not c.ok and not c.advisory]


def load_footprints():
    with open(FOOTPRINTS, encoding="utf-8") as f:
        d = json.load(f)
    out = {}
    for name, spec in d.items():
        if name.startswith("_"):
            continue
        blocks = []
        for x, y, z, desc in spec["blocks"]:
            parts = desc.split(":")
            below, occ = parts[0], parts[1]
            flags = 0
            for o in occ.split("|"):
                flags |= OCC.get(o, 0)
            blocks.append((x, y, z, below, flags, "OAB" in parts, any(p.startswith("stack") for p in parts)))
        out[name] = {"size": spec["size"], "blocks": blocks, "flippable": spec.get("flippable") in (True, "True"),
                     "overridable": spec.get("overridable") in (True, "True")}
    return out


def world_blocks(fp, p):
    """Occupied cells of an entity: Coordinates + R(F(local)) (see notes/blocks_and_placement.md)."""
    sx = fp["size"][0]
    rot = ROT[p.orientation]
    out = []
    for x, y, z, below, flags, oab, stack in fp["blocks"]:
        if p.flipped and fp["flippable"]:
            x = sx - 1 - x
        dx, dy = rot(x, y)
        out.append((p.x + dx, p.y + dy, p.z + z, below, flags, oab, stack, z))
    return out


# ---------------------------------------------------------------------------------------------

def check_file(m: TimberMap, rep: Report, raw_zip: dict):
    X, Y = m.size_x, m.size_y
    rep.add("file.size", LIMITS["min_size"] <= X <= LIMITS["max_size"] and LIMITS["min_size"] <= Y <= LIMITS["max_size"],
            f"{X}x{Y}", (X, Y), "4..256")
    rep.add("file.layers", m.layers == LIMITS["layers"], f"{m.layers} voxel layers", m.layers, 23)
    ver_ok = m.game_version.startswith("1.1.") and raw_zip.get("version.txt", "").strip() == m.game_version
    rep.add("file.version", ver_ok, f"{m.game_version} (generator writes {GAME_VERSION})", m.game_version, "1.1.x")
    s = m.singletons
    need = ("MapSize", "TerrainMap", "WaterMapNew", "SoilMoistureSimulator", "SoilContaminationSimulator",
            "WaterEvaporationMap")
    missing = [k for k in need if k not in s]
    rep.add("file.singletons", not missing, "missing " + ", ".join(missing) if missing else "all present")
    if not missing:
        lv = s["WaterMapNew"]["Levels"]
        n = lv * X * Y
        # each array is read with its own size field (water Levels, the soil simulators' Size,
        # evaporation Levels; the soil and evaporation ones default to 1): 0.6 maps store one
        # soil slot beside two water levels
        soil_n = s["SoilMoistureSimulator"].get("Size", 1) * X * Y
        dirt_n = s["SoilContaminationSimulator"].get("Size", 1) * X * Y
        evap_n = s["WaterEvaporationMap"].get("Levels", 1) * X * Y
        lens = {
            "WaterColumns": (len(s["WaterMapNew"]["WaterColumns"]["Array"].split(" ")), n),
            "ColumnOutflows": (len(s["WaterMapNew"]["ColumnOutflows"]["Array"].split(" ")), n),
            "MoistureLevels": (len(s["SoilMoistureSimulator"]["MoistureLevels"]["Array"].split(" ")), soil_n),
            "ContaminationLevels": (len(s["SoilContaminationSimulator"]["ContaminationLevels"]["Array"].split(" ")), dirt_n),
            "ContaminationCandidates": (len(s["SoilContaminationSimulator"]["ContaminationCandidates"]["Array"].split(" ")), dirt_n),
            "EvaporationModifiers": (len(s["WaterEvaporationMap"]["EvaporationModifiers"]["Array"].split(" ")), evap_n),
        }
        bad = {k: v for k, (v, want) in lens.items() if v != want}
        rep.add("file.arrays", not bad and lv >= m.water_levels(),
                f"levels {lv} (terrain needs {m.water_levels()}), wrong lengths: {bad}" if bad or lv < m.water_levels() else "consistent")
    md = m.metadata or {}
    rep.add("file.metadata", md.get("Width") == X and md.get("Height") == Y, f"{md.get('Width')}x{md.get('Height')}")
    thumb_ok = False
    if m.thumbnail:
        try:
            from PIL import Image
            thumb_ok = Image.open(io.BytesIO(m.thumbnail)).size == (960, 540)
        except Exception:
            thumb_ok = False
    rep.add("file.thumbnail", thumb_ok, "960x540 JPEG" if thumb_ok else "missing or wrong size")


def check_terrain(m: TimberMap, rep: Report):
    h = m.surface()
    # up to 22 (D172 (1), after probe run 20260925-tall); the in-game map editor edits only up to 16
    rep.add("terrain.max_height", h.max() <= LIMITS["game_max_height"],
            f"highest column {h.max()} (game limit 22; the in-game map editor edits up to 16)", int(h.max()), 22)
    rep.add("terrain.top_layer_free", not m.voxels[-1].any(), "layer 22 must stay empty")
    # design: the water model covers one floor per tile (caves and overhangs are approximated on
    # the top surface); imported maps report it as information
    multi = int((m.floors() > 1).sum())
    rep.add("terrain.single_floor", multi == 0, f"{multi} columns with caves or overhangs", multi, 0)
    # a principle (D151, extending D111): no wall raised along a map edge to hold water
    Y, X = h.shape
    if X < 2 * (EDGE_BAND + EDGE_INSIDE) or Y < 2 * (EDGE_BAND + EDGE_INSIDE):
        rep.add("terrain.edge_wall", True, "the map is too small for an edge wall", na=True)
    else:
        shares = edge_walls(h)
        worst = max(shares.values())
        walled = [e for e, s in shares.items() if s >= EDGE_SHARE]
        rep.add("terrain.edge_wall", not walled,
                f"walled edges: {', '.join(walled)}" if walled else f"no edge wall (most walled edge {worst:.0%})",
                round(worst, 2), EDGE_SHARE)


# ---- edge walls (src/core/analysis/edges.ts): along each edge, the outer two tiles against the
# highest of the next three; a tile is walled when the band stands 2+ levels above them, an edge when
# 60% of its tiles are
EDGE_BAND = 2
EDGE_INSIDE = 3
EDGE_RISE = 2
EDGE_SHARE = 0.6


def edge_walls(h: np.ndarray) -> dict:
    """The share of walled tiles on each edge: south (y = 0), north (y = H - 1), west, east."""
    hi = h.astype(np.int32)
    profiles = {"south": hi, "north": hi[::-1, :], "west": hi.T, "east": hi.T[::-1, :]}
    out = {}
    for name, p in profiles.items():
        band = p[:EDGE_BAND, :].max(axis=0)
        inside = p[EDGE_BAND:EDGE_BAND + EDGE_INSIDE, :].max(axis=0)
        out[name] = float(np.count_nonzero(band - inside >= EDGE_RISE)) / p.shape[1]
    return out


def terrain_unsupported(m: TimberMap, object_tops=()) -> int:
    """Voxels the game deletes on load: solid voxels not reachable from z=0 by going up or by at
    most 3 sideways steps through solid voxels since the last upward step. The top of a
    stackable object (natural overhang, badtide drain body) also supports the voxel above it."""
    v = m.voxels.astype(bool)
    if (m.floors() <= 1).all():
        return 0                                  # plain heightmap: every column stands on z=0
    Z, Y, X = v.shape
    best = np.full(v.shape, 99, dtype=np.int16)   # fewest sideways steps used
    from collections import deque
    q = deque()
    for y, x in zip(*np.nonzero(v[0])):
        best[0, y, x] = 0
        q.append((0, y, x))
    for (x, y, z) in object_tops:
        if z + 1 < Z and v[z + 1, y, x]:
            best[z + 1, y, x] = 0
            q.append((z + 1, y, x))
    while q:
        z, y, x = q.popleft()
        s = best[z, y, x]
        if z + 1 < Z and v[z + 1, y, x] and best[z + 1, y, x] > 0:
            best[z + 1, y, x] = 0
            q.appendleft((z + 1, y, x))
        if s < LIMITS["support_distance"]:
            for dy, dx in N4:
                yy, xx = y + dy, x + dx
                if 0 <= yy < Y and 0 <= xx < X and v[z, yy, xx] and best[z, yy, xx] > s + 1:
                    best[z, yy, xx] = s + 1
                    q.append((z, yy, xx))
    return int((v & (best == 99)).sum())


def check_entities(m: TimberMap, rep: Report, fps: dict):
    """Emulates the game's load-time BlockValidator: every problem here is an object the game
    would delete or a load that would fail."""
    X, Y = m.size_x, m.size_y
    v = m.voxels.astype(bool)
    Z = v.shape[0]
    first_col = first_column_top(v)

    def solid(x, y, z):
        return z < 0 or (z < Z and v[z, y, x])

    ids, problems = set(), []
    unknown, bad_enum, missing_comp, dup = [], [], [], 0
    occupied = {}                 # (x, y, z) -> flags
    below_claims = set()          # (x, y) columns claimed by OccupyAllBelow
    base_cells = {}               # (x, y, z) -> entity index, for OAB checks
    placements = []
    for i, e in enumerate(m.entities):
        if e["Id"] in ids or not GUID.match(e["Id"]):
            dup += 1
        ids.add(e["Id"])
        t = e["Template"]
        if t not in fps or (t in ("Maple", "ChestnutTree", "Mangrove", "Dandelion", "CoffeeBush")):
            unknown.append(t)
            continue
        bo = e["Components"].get("BlockObject", {})
        if bo.get("Orientation", "Cw0") not in ORIENTATIONS:
            bad_enum.append(t)
            continue
        for c in REQUIRED_COMPONENTS.get(t, ()):
            if c not in e["Components"]:
                missing_comp.append(f"{t}.{c}")
        p = placement(e)
        fp = fps[t]
        placements.append((i, t, p, fp))
    rep.add("entities.templates", not unknown, f"unknown or faction-only: {sorted(set(unknown))}" if unknown else "all common templates")
    rep.add("entities.enums", not bad_enum, f"bad orientation on {bad_enum[:5]}" if bad_enum else "ok")
    rep.add("entities.components", not missing_comp, f"missing {sorted(set(missing_comp))[:6]}" if missing_comp else "required components present")
    rep.add("entities.ids", dup == 0, f"{dup} duplicate or malformed ids", dup, 0)

    # load order: z ascending (the game also sorts by occupation, file order breaks ties)
    placements.sort(key=lambda r: r[2].z)
    start_cells = set()
    for i, t, p, fp in placements:
        cells = world_blocks(fp, p)
        why = None
        for (x, y, z, below, flags, oab, stack, lz) in cells:
            if flags == 0:
                continue                  # e.g. the Aquifer's empty plus-shape corners
            if not (0 <= x < X and 0 <= y < Y) or z >= LIMITS["max_object_z"]:
                why = "outside the map"
                break
            if solid(x, y, z):
                why = f"inside terrain at ({x},{y},{z})"
                break
            if flags & occupied.get((x, y, z), 0):
                why = f"overlaps another object at ({x},{y},{z})"
                break
            if below == "G" and not solid(x, y, z - 1):
                why = f"floating at ({x},{y},{z})"
                break
            if below == "GS" and not solid(x, y, z - 1) and (x, y, z - 1) not in stackable_tops:
                why = f"floating at ({x},{y},{z})"
                break
            if below == "Air" and (solid(x, y, z) or solid(x, y, z - 1) and lz == 0):
                why = f"slope top not in air at ({x},{y},{z})"
                break
            if oab and any((x, y, zz) in base_cells for zz in range(0, z)):
                why = f"object below an OccupyAllBelow block at ({x},{y})"
                break
            if t in CONTINUOUS and below == "G" and z != first_col[y, x]:
                why = f"not on the first terrain column at ({x},{y})"
                break
        if why:
            problems.append(f"{t} at ({p.x},{p.y},{p.z}): {why}")
            continue
        for (x, y, z, below, flags, oab, stack, lz) in cells:
            if flags == 0:
                continue
            if t == "StartingLocation":
                start_cells.add((x, y, z))
                continue
            occupied[(x, y, z)] = occupied.get((x, y, z), 0) | flags
            base_cells[(x, y, z)] = i
            if stack:
                stackable_tops.add((x, y, z))
            if oab:
                below_claims.add((x, y))
    overlap_start = [c for c in start_cells if c in occupied]
    rep.add("entities.placement", not problems, "; ".join(problems[:6]) + (f" (+{len(problems) - 6} more)" if len(problems) > 6 else "")
            if problems else "every object would load", len(problems), 0)
    rep.add("start.clear", not overlap_start, f"{len(overlap_start)} start cells covered by objects" if overlap_start else "nothing overlaps the start")
    return occupied


stackable_tops: set = set()


def first_column_top(v: np.ndarray) -> np.ndarray:
    """Height of the contiguous solid run starting at z=0 (0 when voxel 0 is air)."""
    run = np.cumprod(v, axis=0)
    return run.sum(axis=0)


def check_slopes(m: TimberMap, rep: Report, ents):
    h = m.surface()
    bad = []
    slopes = {(placement(e).x, placement(e).y): placement(e) for e in ents.get("Slope", [])}
    for (x, y), p in slopes.items():
        dx, dy = SLOPE_HIGH[p.orientation]
        hx, hy, lx, ly = x + dx, y + dy, x - dx, y - dy
        inb = lambda a, b: 0 <= a < m.size_x and 0 <= b < m.size_y
        high_ok = inb(hx, hy) and h[hy, hx] == p.z + 1
        low_ok = inb(lx, ly) and (h[ly, lx] == p.z or ((lx, ly) in slopes and slopes[(lx, ly)].z == p.z - 1))
        if not (high_ok and low_ok):
            bad.append(f"({x},{y},{p.z}) {p.orientation}")
    rep.add("slopes.connect", not bad, f"slopes that do not join a 1-voxel step: {bad[:5]}" if bad else f"{len(slopes)} slopes join level z to z+1",
            len(bad), 0)


def check_start(m: TimberMap, rep: Report, ents, occupied):
    starts = ents.get("StartingLocation", [])
    rep.add("start.count", len(starts) == 1, f"{len(starts)} StartingLocation(s)", len(starts), 1)
    if len(starts) != 1:
        return None
    p = placement(starts[0])
    h = m.surface()
    fp_cells = [(p.x + a, p.y + b) for a, b in [ROT[p.orientation](x, y) for x in range(3) for y in range(3)]]
    flat = all(0 <= x < m.size_x and 0 <= y < m.size_y and h[y, x] == p.z for x, y in fp_cells)
    rep.add("start.flat", flat, "3x3 district center footprint is flat ground at the start level" if flat else "footprint is not flat")
    ex, ey = START_ENTRANCE[p.orientation]
    ex, ey = p.x + ex, p.y + ey
    ent_ok = 0 <= ex < m.size_x and 0 <= ey < m.size_y and h[ey, ex] == p.z and not any(
        (ex, ey, z) in occupied for z in range(p.z, p.z + 2))
    rep.add("start.entrance", ent_ok, f"entrance tile ({ex},{ey}) must be free ground at level {p.z} or no beavers spawn")
    cx = sum(x for x, _ in fp_cells) / 9
    cy = sum(y for _, y in fp_cells) / 9
    return int(round(cx)), int(round(cy)), p.z


# ---------------------------------------------------------------------------------------------

def load_project(path):
    """The spec and features of '<stem>.damgoodmaps.json' beside a map, or (None, None)."""
    import gzip
    stem = path[:-len(".timber")] if path.endswith(".timber") else path
    proj = stem + ".damgoodmaps.json"
    if not os.path.exists(proj):
        return None, None
    with open(proj, "rb") as f:
        raw = f.read()
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    doc = json.loads(raw.decode("utf-8"))
    return doc.get("spec"), doc.get("features")


def validate(path, difficulty="normal", water=None, load_only=False, profile=None) -> Report:
    import zipfile
    rep = Report(path)
    with zipfile.ZipFile(path) as z:
        raw = {"version.txt": z.read("version.txt").decode("utf-8-sig") if "version.txt" in z.namelist() else ""}
    m = TimberMap.read(path)
    fps = load_footprints()
    spec, features = load_project(path)
    stackable_tops.clear()
    check_file(m, rep, raw)
    check_terrain(m, rep)
    occupied = check_entities(m, rep, fps)
    unsupported = terrain_unsupported(m, stackable_tops)
    rep.add("terrain.supported", unsupported == 0, f"{unsupported} voxels float more than 3 tiles from support", unsupported, 0)
    ents = by_template(m)
    check_slopes(m, rep, ents)
    start = check_start(m, rep, ents, occupied)
    if load_only:
        return rep
    from playability import check_playability
    check_playability(m, rep, fps, difficulty, spec, features, water, profile)
    return rep


def _jsonable(d):
    """Plain JSON values: numpy numbers as Python numbers, non-finite floats and tuples as text."""
    out = {}
    for k, v in d.items():
        if isinstance(v, (np.integer,)):
            v = int(v)
        elif isinstance(v, (float, np.floating)):
            v = float(v) if np.isfinite(v) else str(float(v))
        elif isinstance(v, (tuple, list)):
            v = str(v)
        out[k] = v
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    difficulty = "normal"
    if "--difficulty" in sys.argv:
        difficulty = sys.argv[sys.argv.index("--difficulty") + 1]
        args = [a for a in args if a != difficulty]
    profile = None
    if "--profile" in sys.argv:
        profile = sys.argv[sys.argv.index("--profile") + 1]
        args = [a for a in args if a != profile]
    all_ok = True
    load_only = "--load-only" in sys.argv
    for path in args:
        rep = validate(path, difficulty, load_only=load_only, profile=profile)
        all_ok &= rep.passed
        if "--quiet" in sys.argv:
            bad = [c.id for c in rep.failures()]
            print(f"{'PASS' if rep.passed else 'FAIL'}  {path}" + (f"  ({', '.join(bad)})" if bad else ""))
            continue
        if "--json" in sys.argv:
            print(json.dumps({"path": path, "passed": rep.passed, "checks": [_jsonable(c.__dict__) for c in rep.checks]}))
            continue
        print(f"{'PASS' if rep.passed else 'FAIL'}  {path}")
        for c in rep.checks:
            mark = "na " if c.na else "~  " if c.approx else "ok " if c.ok else "adv" if c.advisory else "BAD"
            print(f"   {mark} {c.id:28s} {c.detail}")
    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    main()
