"""Calibrated targets and thresholds. Every number comes from investigation/calibration.json
(19 official + 9 workshop maps) or from the game rules in investigation/notes/*.md; the comment
says which. PLAN.md carries the same table for the website."""

# ---- game rules (notes/blocks_and_placement.md, water_and_soil.md, navigation_ruins_entities.md)
MAX_TERRAIN_HEIGHT = 16          # editor limit; every official map tops out at exactly 16
PUMP_REACH = 2                   # Folktails WaterPump pipe depth below its base
MOISTURE_MAX_REACH = 16          # tiles from a >=3-wide clean water body at bank level
BADWATER_SOIL_REACH = 7          # soil contamination reach from water with contamination >= 0.5
DRINK_PER_BEAVER_DAY = 0.424     # map water (blocks) per beaver per day, Normal/Hard
EVAPORATION_WIDE = 0.0535        # blocks per day on water >= 3 wide
RESOURCE_BUILDING_RANGE = 20     # walk steps from a gatherer/lumberjack/scavenger

# ---- difficulty: what the first days demand (official medians define Normal)
DIFFICULTY = {
    # The start requirements (PLAN.md §5.6, D85, Kyler 2026-09-24, amended by D153 and D164): water
    # without stairs within 12/20/28 tiles' walk over the map's own ground and slopes (the workshop
    # study: official median 13, p90 20.4), starting wood 120/80/40 logs of grown trees (D164: the
    # old 60/40/20 trees at 2 logs a tree) and living bushes 40/30/20 within 20 tiles' walk; targets with an
    # advisory warning: badwater at least 30/15/8 (official nearest badwater median 14.8, p25 10),
    # ruins 20/15/12.
    "easy":   {"water_dist": 12, "wood_r20": 120, "bushes_r20": 40, "badwater_min": 30, "ruin_min": 20,
               "drought_days": 4, "colony": 40},
    "normal": {"water_dist": 20, "wood_r20": 80, "bushes_r20": 30, "badwater_min": 15, "ruin_min": 15,
               "drought_days": 9, "colony": 50},
    "hard":   {"water_dist": 28, "wood_r20": 40, "bushes_r20": 20, "badwater_min": 8, "ruin_min": 12,
               "drought_days": 30, "colony": 50},
}


def reservoir_needed(difficulty: str) -> float:
    """Water (blocks) a colony of `colony` beavers needs to drink through the worst drought,
    plus evaporation off a 2-deep reservoir of that volume (notes/water_and_soil.md, Q7)."""
    d = DIFFICULTY[difficulty]
    days = d["drought_days"] + 0.5
    drink = d["colony"] * DRINK_PER_BEAVER_DAY * days
    area = drink / 2.0
    return round(drink + area * EVAPORATION_WIDE * days, 0)


# ---- density by map size. Small official maps are packed far denser than 256x256 ones, so rates
# are interpolated in log(area) between the official size-class medians (calibration.json
# aggregates official_small / _medium / _large / _max; small = 50x50 and 100x50).
SIZE_ANCHORS = (3750, 16384, 36864, 65536)
DENSITY = {
    "scrap_per_1k_tiles": (840, 705, 236, 235),       # official-baselines.json class medians (Nomads,
    "trees_per_10k": (1715, 1061, 544, 559),          # Oasis and each rate's clear outliers left out)
    "bushes_per_10k": (265, 92, 40, 44),
    "water_strength_per_10k": (5.0, 2.2, 1.2, 1.1),   # official 8.5/1.5/1.0/1.1; floor of ~2 on small maps keeps rivers visible
    "ruin_field_columns": (19, 32, 39, 42),
    "basins_ge20": (1.5, 4, 15.5, 15),                 # natural basins of 20+ tiles per map (Lakes and basins)
}


def density(key: str, area: int) -> float:
    import math
    xs = [math.log(a) for a in SIZE_ANCHORS]
    ys = DENSITY[key]
    x = math.log(max(area, 1))
    if x <= xs[0]:
        return ys[0]
    for i in range(1, len(xs)):
        if x <= xs[i]:
            t = (x - xs[i - 1]) / (xs[i] - xs[i - 1])
            return ys[i - 1] + t * (ys[i] - ys[i - 1])
    return ys[-1]


# ---- start area (official medians; p10 in comments)
START = {
    # tiles walkable from the start through map slopes, for Buildable land = Normal (PLAN §5.2;
    # Tight 750, Generous 2500; official min 765, p10 1007, median 1296)
    "reach_min_tiles": 1300,
    "reach_by_buildable_land": {"tight": 750, "normal": 1300, "generous": 2500},
    "pad_radius": 6,                 # levelled bench around the district center
    "clear_radius": 3,               # nothing placed within this Chebyshev distance of the start centre
}

# ---- water (official per-10k-tile medians; workshop maps run 3-6x wetter)
WATER = {
    "strength_per_10k": 2.2,         # official median 1.2, p90 4.6; workshop median 6.7
    "source_strength": 0.5,          # official: 105 of 170 sources are 0.5
    "badwater_ratio": 0.5,           # badwater : clean strength, official median 0.65
    "max_water_share": 0.35,         # official p90 0.40 of the map under water
}

# ---- forests and berries
FOREST = {
    "trees_per_10k": 800,            # official median 606 (p90 1196), workshop 1126
    "living_share": 0.4,             # official median 0.33, workshop 0.39 (alive only on moist soil)
    "grove_median": 10,              # official median cluster 10 trees, largest ~180
    "grove_cap": 120,
    "species": {"Pine": 0.47, "Birch": 0.27, "Oak": 0.20, "Succulent": 0.06},   # official counts
    "young_share": 0.35,             # share of living trees stored as saplings (Growable < 1)
    "near_start": {"radius": 18, "min_living": 40},
}
BUSHES = {
    "bushes_per_10k": 60,            # official median 44, workshop 228
    "patch_median": 20,              # official median patch 38 on big maps
    "near_start": {"radius": 16, "min_bushes": 48},
}

# ---- ruins (calibration "ruins"; official aggregates)
RUINS = {
    "scrap_per_1k_tiles": 280,       # official median 281 (p10 152, p90 724)
    "height_shares": {"H1": 0.284, "H2": 0.221, "H3": 0.163, "H4": 0.1,     # official-baselines.json
                      "H5": 0.084, "H6": 0.06, "H7": 0.038, "H8": 0.05},      # (Nomads, Oasis left out)
    "field_columns": [20, 25, 30, 38, 45, 55, 70],   # official field size median 38, max per map median 58
    "singles_share": 0.05,           # official: 97% of columns sit in fields of >= 10
    "center_bias": 0.35,             # mild lean of tall columns inward (official Spearman median -0.06, p10 -0.39)
    "hole_share": 0.05,              # gives fill ~0.56 of the bounding box, holes ~9% (official medians)
    "compactness": 2.0,
    "min_start_dist": 22,            # official nearest ruin to start: p10 22, median 45
    "min_field_spacing": 18,         # official median spacing 58 on big maps; small maps pack closer
}


def shared_json():
    """The values PLAN.md §5–§11 and src/core/gen/calibrated.ts must share (checked by
    tests/contract/calibrated.test.ts)."""
    return {
        "difficulty": DIFFICULTY,
        "reservoir_needed": {d: reservoir_needed(d) for d in DIFFICULTY},
        "reach_by_buildable_land": START["reach_by_buildable_land"],
        "size_anchors": list(SIZE_ANCHORS),
        "density": {k: list(v) for k, v in DENSITY.items()},
        "ruin_height_shares": [RUINS["height_shares"][f"H{k}"] for k in range(1, 9)],
    }


if __name__ == "__main__":
    import json
    print(json.dumps(shared_json()))
