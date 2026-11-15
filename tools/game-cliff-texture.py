"""The game's cliff rock, read from its own files (D497; docs/progress/3d-view.md, "The cliff face as the game draws
it"), against ours. Timberborn's cliffs are TerrainURP's `Cliff` variant: `CliffDetail` (albedo) triplanar at world ×
`_Albedo_Triplanar_Tile` 0.45 and `Cliff_N` (normal) at × `_Normal_Triplanar_Tile` 0.125, whiteout-blended at full
strength, × the height gradient. This prints the `Cliff` material's values and each texture's statistics: the
albedo's mean, spread over its mean, percentiles, power by wavelength (tiles) and hue; the normal's slopes' spread by
mip and power by wavelength. Read-only, numbers only: no texel is written anywhere.

`--ours <prefix>` sets ours (`tools/rock-texture.ts`'s `<prefix>-0.bin` and `-4.bin`, materials.ts `ROCK`) beside it.

    python tools/game-cliff-texture.py [--game "C:/Program Files (x86)/Steam/steamapps/common/Timberborn"] [--ours .scratch/rock]
"""
import argparse
import importlib.util
import os

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LUMA = np.array([0.299, 0.587, 0.114])
BANDS = (4, 2, 1, 0.5, 0.25, 0.125, 0.0625, 0.03125, 0)
#: Our rock layer: tiles across (materials.ts ROCK.tiles) and its size.
OURS_TILES, OURS_SIZE = 4, 1024


def bands(field, repeat):
    """The share of a tiling field's power by wavelength (`BANDS`, tiles; one repeat `repeat` tiles across)."""
    h, w = field.shape
    p = np.abs(np.fft.fft2(field - field.mean())) ** 2
    k = np.sqrt((np.fft.fftfreq(h)[:, None] * h) ** 2 + (np.fft.fftfreq(w)[None, :] * w) ** 2)
    wave = repeat / np.maximum(k, 1e-9)
    return [p[(wave <= BANDS[i]) & (wave > BANDS[i + 1])].sum() / p.sum() for i in range(len(BANDS) - 1)]


def row(label, values, fmt="{:.3f}"):
    print(f"  {label:34s} " + " ".join(fmt.format(v) for v in values))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--game", default="C:/Program Files (x86)/Steam/steamapps/common/Timberborn")
    ap.add_argument("--ours", help="tools/rock-texture.ts's output prefix")
    args = ap.parse_args()
    data = os.path.join(args.game, "Timberborn_Data")
    spec = importlib.util.spec_from_file_location("gws", os.path.join(ROOT, "tools", "game-water-shader.py"))
    gws = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(gws)
    path = os.path.join(data, "resources.assets")
    _, objects = gws.read_objects(path)
    f = open(path, "rb")

    def read(o):
        f.seek(o[1])
        return f.read(o[2])

    textures = {}
    for o in objects:
        if o[3] == 21:
            try:
                m = gws.read_material(read(o))
            except Exception:
                continue
            if m[0] == "Cliff":
                v = m[5]
                print(f"Cliff material: {' '.join(m[2])}; albedo tile {v['_Albedo_Triplanar_Tile'][0]:.3g}, normal tile "
                      f"{v['_Normal_Triplanar_Tile'][0]:.3g}, normal strength {v['_Normalmap_Strength'][0]:.3g}, gradient "
                      f"{gws.fmt(v['_SplatGradientMin'][:3])} to {gws.fmt(v['_SplatGradientMax'][:3])}")
        elif o[3] == 28:
            try:
                name = gws.read_texture(read(o))[0]
            except Exception:
                continue
            if name in ("CliffDetail", "Cliff_N") and name not in textures:
                textures[name] = read(o)

    print("albedo (CliffDetail, a repeat every 2.22 tiles; ours every 4)")
    _, t = gws.texture_texels(textures["CliffDetail"], data)
    y = t[..., :3] @ LUMA
    hue_axis = np.array([-0.361, 0.003, 0.933])
    game = {"spread": y.std() / y.mean(), "pct": np.percentile(y, [1, 5, 25, 50, 75, 95, 99]) / y.mean(),
            "bands": bands(y, 1 / 0.45), "hue": ((t[..., :3] / np.maximum(y[..., None], 1)) @ hue_axis).std()}
    print(f"  mean {gws.fmt(t[..., :3].reshape(-1, 3).mean(0))} of 255")
    ours = None
    if args.ours:
        a = np.fromfile(args.ours + "-0.bin", dtype=np.uint8).reshape(OURS_SIZE, OURS_SIZE, 4).astype(float) / 255
        L = a[..., 0] * 2
        ours = {"spread": L.std() / L.mean(), "pct": np.percentile(L, [1, 5, 25, 50, 75, 95, 99]) / L.mean(),
                "bands": bands(L, OURS_TILES), "hue": ((a[..., 1] - 0.5) * 0.25).std()}
    for key, label in (("spread", "spread over the mean"), ("pct", "1/5/25/50/75/95/99 % over the mean"),
                       ("bands", "power by wavelength " + "/".join(f"{b:g}" for b in BANDS)), ("hue", "hue's spread")):
        row("game: " + label, np.atleast_1d(game[key]))
        if ours:
            row("ours", np.atleast_1d(ours[key]))

    print("normal (Cliff_N, a repeat every 8 tiles; ours every 4)")
    mips = gws.texture_mips(textures["Cliff_N"], data, levels=5)
    sx, sy = mips[0][..., 3] / 255 * 2 - 1, mips[0][..., 1] / 255 * 2 - 1
    row("game: slopes' spread, top", [sx.std(), sy.std()])
    row("game: at 16 texels a tile (mip 4)", [(mips[4][..., 3] / 255 * 2 - 1).std(), (mips[4][..., 1] / 255 * 2 - 1).std()])
    row("game: across, by wavelength", bands(sx, 8))
    if args.ours:
        b = np.fromfile(args.ours + "-4.bin", dtype=np.uint8).reshape(OURS_SIZE >> 4, OURS_SIZE >> 4, 4).astype(float) / 255
        ox = a[..., 2] * 2 - 1
        row("ours: slopes' spread, top", [ox.std(), (a[..., 3] * 2 - 1).std()])
        row("ours: at 16 texels a tile (mip 4)", [(b[..., 2] * 2 - 1).std(), (b[..., 3] * 2 - 1).std()])
        row("ours: across, by wavelength", bands(ox, OURS_TILES))


if __name__ == "__main__":
    main()
