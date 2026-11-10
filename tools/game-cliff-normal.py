"""The cliffs' normal map as the game draws it, against ours, offline (D497; docs/progress/3d-view.md, "The cliffs' relief
as the game draws it"): numbers only.

TerrainURP's `Cliff` variant (`_USE_TRIPLANAR_SPLATMAP`, the material every wall of the game's 120 land blocks takes;
read with tools/game-water-shader.py --shader "Shader Graphs/TerrainURP" --keywords
_MAIN_LIGHT_SHADOWS_CASCADE,_ADDITIONAL_LIGHTS,FOG_EXP,_USE_TRIPLANAR_SPLATMAP,_SAMPLE_SPLATMAP,_USELAYERTOOL) lights a
wall through `Cliff_N`: sampled at world × `_Normal_Triplanar_Tile` (0.125) on each axis's plane (zy, xy, xz), each
unpacked as UnpackNormalmapRGorAG (x = r × a, y = g, × 2 − 1, z from them), blended by Shader Graph's whiteout
(t.xy + n's two, |t.z| × n's own) by |n| / Σ|n|, normalised, at full strength; its texture's own sampler: trilinear,
anisotropy 16, no mip bias. A block's wall has its vertex normals square to an axis, so a wall takes that axis's
projection alone. The light is URP's lit model under Gamma (D497): 0.912 × (the ambient probe by the normal, in display
values, + the sun × saturate(n·L) × its shadow).

`--measure` reads the game's `Cliff_N` (read-only, from `resources.assets` with tools/game-water-shader.py's reader;
nothing of it is written anywhere) and prints what src/render3d/cliffNormal.ts makes ours to: its sampler settings, its
slopes' mean and spread by mip, their percentiles, how much of their power is a gradient's, and their power by
wavelength in its first mip (our top).

The judge lights a wall offline as each side's texture lights it, against the flat wall ours drew before: a camera
`--distance` tiles away at `--pitch`, `--rows` pixel rows at 40° (the editor's field of view), each pixel's footprint
on the wall filtered as a GPU's anisotropic filter does (up to 16 taps along its long axis, at the mip of its short
axis, trilinear), the sun 45° up and turned 40° from the camera (the game's), the wall turned so its normal stands
`phi` degrees round from the sun's way. It prints each wall's mean luma (Rec. 709) over the flat wall's, and its
pixels' spread over its mean (the relief a player sees), the game's and ours.

    npx tsx tools/cliff-normal-ours.ts .scratch/cliff-normal/ours.bin
    python tools/game-cliff-normal.py --measure
    python tools/game-cliff-normal.py [--ours .scratch/cliff-normal/ours.bin] [--distance 10,30,60,100] [--pitch 55]
        [--rows 1080] [--phi 0,40,70,80,100] [--game ...]
"""
import argparse
import importlib.util
import math
import os

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_spec = importlib.util.spec_from_file_location("gws", os.path.join(ROOT, "tools", "game-water-shader.py"))
gws = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gws)

#: the day's light (palette.ts GAME_AMBIENT_SH, linear; GAME_LIGHT.sun × 1.1), as tools/game-crowns.py draws it
SH = (np.array([0.7354006, 0.7329619, 0.8423746]), np.array([0.0767676, 0.0853230, 0.2250965]), np.array([-0.0826873, -0.0834494, -0.0492580]))
SUN = np.array([1.1, 1.05875, 0.935])
L709 = np.array([0.2126, 0.7152, 0.0722])
#: the triplanar normal's repeat (tiles) and the bands its power is measured in (cliffNormal.ts GAME_CLIFF_NORMAL)
REPEAT = 8.0
BANDS = [8, 4, 2, 1, 0.5, 0.25, 0.125, 0.0625, 0.03125, 0]


def to_display(c):
    c = np.maximum(c, 0)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def ambient(y):
    return to_display(SH[0] + SH[1] * y[..., None] + SH[2] * (3 * y[..., None] ** 2 - 1))


def game_texture(game):
    """The game's `Cliff_N`: its object's bytes and its stored mips' slopes (2, H, W) each, as its program unpacks them."""
    data = os.path.join(game, "Timberborn_Data")
    _, objects = gws.read_objects(os.path.join(data, "resources.assets"))
    with open(os.path.join(data, "resources.assets"), "rb") as f:
        for o in objects:
            if o[3] != 28:
                continue
            f.seek(o[1])
            b = f.read(o[2])
            try:
                name = gws.read_texture(b)[0]
            except Exception:
                continue
            if name == "Cliff_N":
                mips = gws.texture_mips(b, data, levels=12)
                return b, [np.stack([m[..., 0] / 255 * m[..., 3] / 255 * 2 - 1, m[..., 1] / 255 * 2 - 1]) for m in mips]
    raise KeyError("no Cliff_N")


def box_mips(top):
    out = [top]
    while out[-1].shape[1] > 1:
        b = out[-1]
        out.append(0.25 * (b[:, 0::2, 0::2] + b[:, 1::2, 0::2] + b[:, 0::2, 1::2] + b[:, 1::2, 1::2]))
    return out


def our_texture(path):
    """Ours as written by tools/cliff-normal-ours.ts (RG bytes, read × 2 − 1 as the shader reads them) and its mips as
    the GPU makes them (a box filter)."""
    raw = np.fromfile(path, dtype=np.uint8)
    n = int(round(math.sqrt(raw.size // 2)))
    rg = raw.reshape(n, n, 2).astype(np.float64) / 255 * 2 - 1
    return box_mips(np.stack([rg[..., 0], rg[..., 1]]))


def power_by_band(f):
    n = f.shape[0]
    k = np.fft.fftfreq(n, 1.0 / n)
    kx, ky = np.meshgrid(k, k)
    kk = np.hypot(kx, ky)
    p = np.abs(np.fft.fft2(f - f.mean())) ** 2
    wave = np.where(kk > 0, REPEAT / np.maximum(kk, 1e-9), np.inf)
    total = p[kk > 0].sum()
    return [p[(wave <= BANDS[b]) & (wave > BANDS[b + 1])].sum() / total for b in range(len(BANDS) - 1)]


def measure(b, mips):
    words = np.frombuffer(b[: len(b) // 4 * 4], dtype="<i4")
    # (the texture's settings: filter, anisotropy, mip bias, wrap u, v, w, after its size, format and mip count)
    for i in range(len(words) - 6):
        if words[i] in (0, 1, 2) and 2 < words[i + 1] <= 16 and words[i + 2] == 0 and all(w in (0, 1, 2, 3) for w in words[i + 3:i + 6]):
            print(f"sampler: filter {words[i]} (2 trilinear), anisotropy {words[i + 1]}, mip bias 0, wrap {tuple(words[i + 3:i + 6])} (0 repeat)")
            break
    print(f"{mips[0].shape[1]}², {mips[0].shape[1] / REPEAT:.0f} texels a tile; by mip: size, mean x / y, spread x / y")
    for k, m in enumerate(mips[:9]):
        print(f"  {m.shape[1]:5d}  {m[0].mean():+.4f} / {m[1].mean():+.4f}  {m[0].std():.4f} / {m[1].std():.4f}")
    top = mips[0]
    for ax, name in ((0, "x"), (1, "y")):
        q = np.percentile(top[ax], [1, 5, 25, 50, 75, 95, 99])
        print(f"{name} percentiles 1/5/25/50/75/95/99 %: " + " ".join(f"{v:+.3f}" for v in q))
    n = top.shape[1]
    k = np.fft.fftfreq(n, 1.0 / n)
    kx, ky = np.meshgrid(k, k)
    kk = np.maximum(np.hypot(kx, ky), 1e-9)
    X = np.fft.fft2(top[0] - top[0].mean())
    Y = np.fft.fft2(top[1] - top[1].mean())
    grad = np.abs((X * kx + Y * ky) / kk) ** 2
    curl = np.abs((X * ky - Y * kx) / kk) ** 2
    print(f"a gradient's share of the slopes' power: {grad.sum() / (grad.sum() + curl.sum()):.3f}")
    m1 = mips[1]
    print(f"power by wavelength in its {m1.shape[1]}² mip (tiles {BANDS[:-1]} down):")
    for ax, name in ((0, "x"), (1, "y")):
        print(f"  {name}: " + " ".join(f"{p:.4f}" for p in power_by_band(m1[ax])))


def bilinear(m, u, v):
    s = m.shape[1]
    x = u * s - 0.5
    y = v * s - 0.5
    x0 = np.floor(x).astype(int)
    y0 = np.floor(y).astype(int)
    fx = x - x0
    fy = y - y0
    x0 %= s
    y0 %= s
    x1 = (x0 + 1) % s
    y1 = (y0 + 1) % s
    a = m[:, y0, x0] * (1 - fx) + m[:, y0, x1] * fx
    c = m[:, y1, x0] * (1 - fx) + m[:, y1, x1] * fx
    return a * (1 - fy) + c * fy


def trilinear(mips, u, v, lod):
    lod = max(0.0, lod)
    l0 = min(int(math.floor(lod)), len(mips) - 1)
    l1 = min(l0 + 1, len(mips) - 1)
    f = lod - math.floor(lod)
    return bilinear(mips[l0], u, v) * (1 - f) + bilinear(mips[l1], u, v) * f


def wall(mips, distance, pitch, phi, rows, n=40000, seed=1, flat=False):
    """A wall's pixels' luma: (mean, spread, lod, taps). The camera looks at the wall `beta` = 40 − phi degrees round
    from square (the sun stands 40° round from the camera's back)."""
    rng = np.random.default_rng(seed)
    e = math.radians(pitch)
    beta = math.radians(40 - phi)
    px = 2 * distance * math.tan(math.radians(20)) / rows
    ndv = max(math.cos(e) * abs(math.cos(beta)), 1e-3)
    major = px / ndv
    taps = min(int(math.ceil(major / px - 1e-6)), 16)
    lod = math.log2(major / taps * mips[0].shape[1] / REPEAT)
    du, dv = math.cos(e) * math.sin(beta), math.sin(e)
    ln = math.hypot(du, dv)
    du, dv = du / ln, dv / ln
    u, v = rng.random(n), rng.random(n)
    acc = np.zeros((2, n))
    for k in range(taps):
        o = ((k + 0.5) / taps - 0.5) * major / REPEAT
        acc += trilinear(mips, (u + du * o) % 1, (v + dv * o) % 1, lod)
    tx, ty = acc / taps
    tz = np.sqrt(np.clip(1 - np.minimum(tx * tx + ty * ty, 1), 0, None))
    ph = math.radians(phi)
    up = math.sin(math.radians(45))
    lo, lu = math.cos(math.radians(45)) * math.cos(ph), math.cos(math.radians(45)) * math.sin(ph)
    # (a wall turned from the sun is in its own block's shadow, whatever its relief)
    lit = 1.0 if lo > 1e-6 else 0.0
    out = []
    for side in (1, -1):
        nl = np.full(n, lo) if flat else tz * lo + side * tx * lu + ty * up
        ny = np.zeros(n) if flat else ty
        out.append((0.912 * (ambient(ny) + SUN * (np.clip(nl, 0, 1) * lit)[:, None])) @ L709)
    y = np.concatenate(out)
    return y.mean(), y.std(), lod, taps


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--game", default="C:/Program Files (x86)/Steam/steamapps/common/Timberborn")
    ap.add_argument("--measure", action="store_true", help="print the game's texture's statistics and stop")
    ap.add_argument("--ours", default=os.path.join(ROOT, ".scratch", "cliff-normal", "ours.bin"))
    ap.add_argument("--distance", default="10,30,60,100")
    ap.add_argument("--pitch", type=float, default=55)
    ap.add_argument("--rows", type=int, default=1080)
    ap.add_argument("--phi", default="0,40,70,80,100")
    args = ap.parse_args()
    b, game = game_texture(args.game)
    if args.measure:
        measure(b, game)
        return
    ours = our_texture(args.ours) if os.path.exists(args.ours) else None
    print(f"a wall's mean luma over the flat wall's, and its pixels' spread over their mean (pitch {args.pitch}°, {args.rows} rows)")
    print("phi: the wall's normal from the sun's way (0 square to it, 40 facing the camera, 100 turned from it)")
    for d in (float(x) for x in args.distance.split(",")):
        for phi in (float(x) for x in args.phi.split(",")):
            f = wall(game, d, args.pitch, phi, args.rows, flat=True)
            g = wall(game, d, args.pitch, phi, args.rows)
            line = f"  {d:4.0f} away, phi {phi:3.0f}: lod {g[2]:.2f} ({g[3]} taps)  game {g[0] / f[0]:.3f} spread {g[1] / g[0]:.3f}"
            if ours is not None:
                o = wall(ours, d, args.pitch, phi, args.rows)
                line += f"   ours {o[0] / f[0]:.3f} spread {o[1] / o[0]:.3f}   ours / game {o[0] / g[0]:.3f}"
            print(line)


if __name__ == "__main__":
    main()
