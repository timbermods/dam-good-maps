"""The land's judge with the game's own texture taken out (D497; docs/progress/3d-view.md, "Grass in the game's light").

The pixel judge's land samples (tools/water-pixel-judge.ts --samples) cluster: on the six start shots grass is 160
tiles, 108 of them on riverValley-128-1. The game's ground textures are world-anchored (TerrainURP: `Grass` or
`Desert` at world xz / 16, × `GrassDetailsAlbedo` at world xz / 32, × 2), so at a cluster the game's pixels sit a few
luma over or under its light on the texture's mean, by where the cluster falls on the texture; ours do the same by our
own patterns. This reads the game's textures (read-only, from `resources.assets` with tools/game-water-shader.py's
reader; nothing of them is written anywhere) and, for each grass and dry sample, the texture's luma round the sample
(the half tile a 5 × 5 pixel patch covers at the start shots' distance) over its mean, f. Run the judge with
`--define GROUND_MEANS`, so its second case draws our light on the game's texture means; then per sample

    residual = luma(game) - luma(ours on the means),

and residual = a + k (f - 1) luma(ours on the means) is fitted by kind (k: how much of a texture's variation reaches
the screen through the light, fog and post chain). It prints, per kind and shot, the mean f, the residual, the texture's
part of it and the residual without it: what is left of the gap once the game's texture is taken out, our light
against the game's alone. The game's texture coordinates are world (x, z) = the tile's (x + 0.25, y + 0.25) for the
judge's tile-centre sample (x + 0.5, y + 0.5) less a quarter tile, which correlates best with the game's pixels
(0.58 grass, 0.56 dry; 0.23 or less in any other orientation).

    npx tsx tools/water-pixel-judge.ts --samples --define GROUND_MEANS [--dev ...]
    python tools/land-texture-check.py [.scratch/water-judge/judge-clean-shot.json] [--look standard] [--case formula]
"""
import argparse
import importlib.util
import json
import os

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAME = "C:/Program Files (x86)/Steam/steamapps/common/Timberborn/Timberborn_Data"
LUMA = np.array([0.299, 0.587, 0.114])
#: Texels a side the textures are averaged to (each is 4096²): 16 a tile for the 16-tile repeat.
SIDE = 256


def textures():
    """The game's Grass, Desert and GrassDetailsAlbedo, box-averaged to SIDE², as luma."""
    spec = importlib.util.spec_from_file_location("gws", os.path.join(ROOT, "tools", "game-water-shader.py"))
    gws = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(gws)
    _, objects = gws.read_objects(os.path.join(GAME, "resources.assets"))
    out = {}
    with open(os.path.join(GAME, "resources.assets"), "rb") as f:
        for o in objects:
            if o[3] != 28:
                continue
            f.seek(o[1])
            b = f.read(o[2])
            try:
                name, _, _, kind = gws.read_texture(b)
            except Exception:
                continue
            if name in ("Grass", "Desert", "GrassDetailsAlbedo") and kind == "BC7" and name not in out:
                _, t = gws.texture_texels(b, GAME)
                k = t.shape[0] // SIDE
                out[name] = (t[..., :3].reshape(SIDE, k, SIDE, k, 3).mean(axis=(1, 3)) @ LUMA)
    return out


def box(img, u, v, r):
    n = img.shape[0]
    i, j = int(np.floor(v * n)), int(np.floor(u * n))
    return img[(np.arange(i - r, i + r + 1) % n)[:, None], (np.arange(j - r, j + r + 1) % n)[None, :]].mean()


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("judge", nargs="?", default=os.path.join(ROOT, ".scratch", "water-judge", "judge-clean-shot.json"))
    ap.add_argument("--look", default="standard")
    ap.add_argument("--case", default="formula", help="the judge's case drawn on the game's means (GROUND_MEANS)")
    ap.add_argument("--ours", default="ours", help="the judge's case drawn as the look ships, to compare")
    args = ap.parse_args()
    tex = textures()
    base = {"grass": tex["Grass"], "dry": tex["Desert"]}
    detail = tex["GrassDetailsAlbedo"]
    rows = []
    for key, v in json.load(open(args.judge)).items():
        if not isinstance(v, dict) or not v.get("landSamples") or f"-{args.look}-" not in key:
            continue
        shot = key.split(f"-{args.look}-")[0]
        for s in v["landSamples"]:
            if s["kind"] not in base:
                continue
            x, z = s["p"][0] - 0.25, -s["p"][2] - 0.25
            img = base[s["kind"]]
            f = box(img, x / 16, z / 16, 3) / img.mean() * box(detail, x / 32, z / 32, 2) / detail.mean()
            means = float(np.dot(s["ours"][args.case], LUMA))
            rows.append({"shot": shot, "kind": s["kind"], "f": f, "means": means, "res": float(np.dot(s["game"], LUMA)) - means,
                         "ours": float(np.dot(s["ours"][args.ours], LUMA)) - means})
    print(f"{args.judge}, {args.look}: luma, the game's pixel less ours on the game's means ({args.case})")
    for kind in ("grass", "dry"):
        r = [x for x in rows if x["kind"] == kind]
        if not r:
            continue
        xs = np.array([(x["f"] - 1) * x["means"] for x in r])
        ys = np.array([x["res"] for x in r])
        a, k = np.linalg.lstsq(np.vstack([np.ones_like(xs), xs]).T, ys, rcond=None)[0]
        print(f"  {kind}: residual = {a:.2f} + {k:.3f} (f - 1) luma; correlation {np.corrcoef(xs, ys)[0, 1]:.2f}")
        print(f"    {'shot':26s}    n  mean f  residual  texture's  without it  ours' patterns")
        for shot in sorted({x["shot"] for x in r}) + ["all"]:
            q = [x for x in r if shot == "all" or x["shot"] == shot]
            t = np.mean([k * (x["f"] - 1) * x["means"] for x in q])
            res = np.mean([x["res"] for x in q])
            print(f"    {shot:26s} {len(q):4d}  {np.mean([x['f'] for x in q]):.3f}  {res:8.1f}  {t:9.1f}  {res - t:10.1f}  {np.mean([x['ours'] for x in q]):14.1f}")


if __name__ == "__main__":
    main()
