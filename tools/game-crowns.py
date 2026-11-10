"""The grown plants as the game draws them, against ours, offline (D135, D178, D496): numbers only.

Each plant is drawn alone on level grass, in the game's light by day, from the start shots' camera (the pixel judge's
`--objects`, tools/water-pixel-judge.ts), turned through a full circle, and sampled as the judge samples it: its crown's
middle and its side across the sun's way, a 3 x 3 patch of the shot's pixels each, and its whole crown.

The game's side is its grown model (Timbermesh, `resources.assets`, read as tools/game-model-albedo.py reads it) drawn as
its VegetationURP ForwardLit program draws it (disassembled with tools/game-water-shader.py --shader "Shader
Graphs/VegetationURP"): the albedo is saturate(vertex colour) x `_MainTex`, cut where the texture's alpha is under 0.5
(the program's own constant, alpha to coverage under MSAA), at the mip the shot's pixel takes; its normal is the
vertex normal through the tangent frame by `_BumpMap`; where the plant shows its yield (`--yield`: decompiled
`Timberborn.Gathering` `GatherableModel` sets `_EnableDetail` 1 on a gatherable's grown model while its yield stands:
the bush's berries, the pine's resin), `_DetailMap` at uv2 is laid over it by its alpha, flat, opaque wherever it is,
and added again as emission at half its colour (`_DetailUseColor` and `_DetailColorBoost` 0). The light is URP's lit
model at metallic and smoothness 0 in display values (palette.ts GAME_LIGHT, GAME_AMBIENT_SH, GAME_ENV), the sun
shadowed by the plant itself (a depth map from the sun, its alpha cut too, 0.03 a texel). Ours: the triangles
tools/crown-models.ts writes, flat colours, in the same light.

    npx tsx tools/crown-models.ts .scratch/crowns/ours.json
    python tools/game-crowns.py [--ours .scratch/crowns/ours.json] [--species Pine,Birch,Oak,BlueberryBush]
        [--no-yield] [--no-shadows] [--no-bump] [--rotations 16] [--yaw -30 --pitch 55 --px 0.045] [--game ...]
"""
import argparse
import importlib.util
import json
import math
import os

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_spec = importlib.util.spec_from_file_location("gma", os.path.join(ROOT, "tools", "game-model-albedo.py"))
gma = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gma)

L709 = np.array([0.2126, 0.7152, 0.0722])
#: the day's light (palette.ts GAME_AMBIENT_SH, linear; GAME_ENV; GAME_LIGHT.sun), and the grass's texture mean
SH = (np.array([0.7354006, 0.7329619, 0.8423746]), np.array([0.0767676, 0.0853230, 0.2250965]), np.array([-0.0826873, -0.0834494, -0.0492580]))
ENV = {"up": np.array([0.414, 0.504, 0.632]), "side": np.array([0.397, 0.47, 0.54]), "down": np.array([0.328, 0.374, 0.368])}
SUN = np.array([1.1, 1.05875, 0.935])
GRASS = np.array([74.2, 80.6, 27.4]) / 255
#: the judge's crowns (water-pixel-judge.ts CROWNS): the middle's height and the crown's reach
CROWNS = {"Pine": (1.95, 0.55), "Birch": (1.22, 0.48), "Oak": (1.62, 0.8), "BlueberryBush": (0.2, 0.5)}
GAME = {"Pine": "PineMature", "Birch": "BirchMature", "Oak": "OakMature", "BlueberryBush": "BlueberryBushMature"}
#: the grown models whose yield the start shots show (their blueprints' GatherableSpec; GatherableModel)
YIELDS = {"Pine", "BlueberryBush"}


def to_display(c):
    c = np.maximum(c, 0)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def shade(alb, n, v, L, lit, emission=None):
    """URP's lit model at metallic 0 and smoothness 0, in display values (VegetationURP's ForwardLit)."""
    y = n[:, 1:2]
    ambient = to_display(SH[0] + SH[1] * y + SH[2] * (3 * y * y - 1))
    nl = np.clip((n * L).sum(-1, keepdims=True), 0, 1) * lit[:, None]
    out = alb * 0.96 * (ambient + SUN * nl)
    rd = 2 * (n * v).sum(-1, keepdims=True) * n - v
    ry = rd[:, 1:2]
    env = np.where(ry >= 0, ENV["side"] + (ENV["up"] - ENV["side"]) * ry, ENV["side"] + (ENV["down"] - ENV["side"]) * -ry)
    h = v + L
    h /= np.linalg.norm(h, axis=-1, keepdims=True)
    lh = np.clip((L * h).sum(-1, keepdims=True), 0, 1)
    out += env * 0.5 * 0.04 + 0.04 / (1.00001 ** 2 * np.maximum(0.1, lh * lh) * 6.0) * SUN * nl
    return out if emission is None else out + emission


def pyramid(tex):
    out = [tex]
    while out[-1].shape[0] > 1 and out[-1].shape[1] > 1:
        t = out[-1]
        out.append(0.25 * (t[0::2, 0::2] + t[1::2, 0::2] + t[0::2, 1::2] + t[1::2, 1::2]))
    return out


def sample(pyr, uv, level):
    """Bilinear, wrapping, at a mip level."""
    t = pyr[int(np.clip(round(level), 0, len(pyr) - 1))]
    h, w, _ = t.shape
    x = np.mod(uv[:, 0], 1) * w - 0.5
    y = np.mod(uv[:, 1], 1) * h - 0.5
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = (x - x0)[:, None], (y - y0)[:, None]
    g = lambda yy, xx: t[np.mod(yy, h), np.mod(xx, w)]
    return g(y0, x0) * (1 - fx) * (1 - fy) + g(y0, x0 + 1) * fx * (1 - fy) + g(y0 + 1, x0) * (1 - fx) * fy + g(y0 + 1, x0 + 1) * fx * fy


def density(pos, uv, size):
    """Texels per world unit, per triangle."""
    a, b, c = pos[:, 0], pos[:, 1], pos[:, 2]
    world = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)
    u = uv * size
    tex = 0.5 * np.abs((u[:, 1, 0] - u[:, 0, 0]) * (u[:, 2, 1] - u[:, 0, 1]) - (u[:, 2, 0] - u[:, 0, 0]) * (u[:, 1, 1] - u[:, 0, 1]))
    return np.sqrt(tex / np.maximum(world, 1e-9))


class Mesh:
    """Triangles (t, 3, ...): pos, nrm, col; the game's also uv, tan, uv2 and its textures' pyramids."""

    def __init__(self, pos, nrm, col, **kw):
        self.pos, self.nrm, self.col = pos, nrm, col
        self.uv = kw.get("uv")
        self.tan = kw.get("tan")
        self.uv2 = kw.get("uv2")
        self.tex = pyramid(kw["tex"]) if kw.get("tex") is not None else None
        self.bump = pyramid(kw["bump"]) if kw.get("bump") is not None else None
        self.detail = pyramid(kw["detail"]) if kw.get("detail") is not None else None
        self.dens = density(pos, self.uv, kw["tex"].shape[0]) if self.tex is not None else None
        self.dens2 = density(pos, self.uv2, kw["detail"].shape[0]) if self.detail is not None else None

    def turned(self, angle, width=1.0, height=1.0):
        c, s = math.cos(angle), math.sin(angle)
        R = np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
        M = R @ np.diag([width, height, width])
        m = Mesh.__new__(Mesh)
        m.__dict__.update(self.__dict__)
        m.pos = self.pos @ M.T
        n = self.nrm @ (R @ np.diag([1 / width, 1 / height, 1 / width])).T
        m.nrm = n / np.linalg.norm(n, axis=-1, keepdims=True)
        if self.tan is not None:
            t = self.tan[..., :3] @ M.T
            m.tan = np.concatenate([t / np.maximum(np.linalg.norm(t, axis=-1, keepdims=True), 1e-9), self.tan[..., 3:]], -1)
        k = 1 / math.sqrt(width * height)
        m.dens = None if self.dens is None else self.dens * k
        m.dens2 = None if self.dens2 is None else self.dens2 * k
        return m


def level(dens, px):
    return math.log2(max(dens * px, 1.0))


def frame(forward):
    f = forward / np.linalg.norm(forward)
    r = np.cross(f, [0.0, 1.0, 0.0])
    r /= np.linalg.norm(r)
    return f, r, np.cross(r, f)


def raster(mesh, view, centre, half, res, px, cull=True):
    """An orthographic raster along the view's f: the nearest fragment the alpha cut keeps, per pixel (its depth, its
    triangle and barycentrics)."""
    f, r, u = view
    depth = np.full((res, res), np.inf)
    tid = np.full((res, res), -1)
    bary = np.zeros((res, res, 3))
    P = mesh.pos - centre
    sx = (P @ r + half) / (2 * half) * res
    sy = (half - P @ u) / (2 * half) * res
    sz = P @ f
    for t in range(len(P)):
        if cull and np.cross(mesh.pos[t, 1] - mesh.pos[t, 0], mesh.pos[t, 2] - mesh.pos[t, 0]) @ f >= 0:
            continue
        x, y, z = sx[t], sy[t], sz[t]
        x0, x1 = max(int(np.floor(x.min())), 0), min(int(np.ceil(x.max())), res - 1)
        y0, y1 = max(int(np.floor(y.min())), 0), min(int(np.ceil(y.max())), res - 1)
        d = (y[1] - y[2]) * (x[0] - x[2]) + (x[2] - x[1]) * (y[0] - y[2])
        if x0 > x1 or y0 > y1 or abs(d) < 1e-12:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        w0 = ((y[1] - y[2]) * (gx - x[2]) + (x[2] - x[1]) * (gy - y[2])) / d
        w1 = ((y[2] - y[0]) * (gx - x[2]) + (x[0] - x[2]) * (gy - y[2])) / d
        w2 = 1 - w0 - w1
        zz = w0 * z[0] + w1 * z[1] + w2 * z[2]
        sub = depth[y0:y1 + 1, x0:x1 + 1]
        ok = (w0 >= 0) & (w1 >= 0) & (w2 >= 0) & (zz < sub)
        if not ok.any():
            continue
        if mesh.tex is not None:
            iy, ix = np.nonzero(ok)
            W = np.stack([w0[iy, ix], w1[iy, ix], w2[iy, ix]], -1)
            a = sample(mesh.tex, W @ mesh.uv[t], level(mesh.dens[t], px))[:, 3]
            if mesh.detail is not None:
                a = np.maximum(a, sample(mesh.detail, W @ mesh.uv2[t], level(mesh.dens2[t], px))[:, 3])
            drop = a < 0.5
            ok[iy[drop], ix[drop]] = False
        sub[ok] = zz[ok]
        tid[y0:y1 + 1, x0:x1 + 1][ok] = t
        bary[y0:y1 + 1, x0:x1 + 1][ok] = np.stack([w0, w1, w2], -1)[ok]
    return depth, tid, bary


def surface(mesh, t, W, px, bump=True):
    """Albedo, normal and emission of the fragments (triangle t, barycentrics W)."""
    n = np.einsum("pk,pkd->pd", W, mesh.nrm[t])
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    col = np.clip(np.einsum("pk,pkd->pd", W, mesh.col[t]), 0, 1)
    if mesh.tex is None:
        return col, n, None
    alb = np.zeros_like(col)
    emission = np.zeros_like(col)
    for k in np.unique(t):
        s = t == k
        uv = W[s] @ mesh.uv[k]
        lv = level(mesh.dens[k], px)
        alb[s] = col[s] * sample(mesh.tex, uv, lv)[:, :3]
        flat = np.zeros(s.sum())
        if mesh.detail is not None:
            d = sample(mesh.detail, W[s] @ mesh.uv2[k], level(mesh.dens2[k], px))
            a = np.clip(d[:, 3:], 0, 1)
            alb[s] = alb[s] + (d[:, :3] - alb[s]) * a
            emission[s] = d[:, :3] * a * 0.5
            flat = a[:, 0]
            # (an emission of 0.1 or more pulls the albedo a quarter toward a quarter of it)
            strong = (np.linalg.norm(emission[s], axis=-1) >= 0.1)[:, None]
            alb[s] = np.where(strong, np.clip(alb[s] + 0.25 * (emission[s] * 0.25 - alb[s]), 0, 1), alb[s])
        if bump and mesh.bump is not None:
            b = sample(mesh.bump, uv, lv)
            x = b[:, 0] * b[:, 3] * 2 - 1
            y = b[:, 1] * 2 - 1
            z = np.sqrt(np.clip(1 - np.minimum(x * x + y * y, 1), 0, 1))
            x, y, z = x * (1 - flat), y * (1 - flat), z + (1 - z) * flat
            T = np.einsum("pk,kd->pd", W[s], mesh.tan[k, :, :3])
            T /= np.maximum(np.linalg.norm(T, axis=-1, keepdims=True), 1e-9)
            N = n[s]
            B = np.cross(N, T) * (np.sign(mesh.tan[k, 0, 3]) or 1.0)
            m = x[:, None] * T + y[:, None] * B + z[:, None] * N
            n[s] = m / np.linalg.norm(m, axis=-1, keepdims=True)
    return alb, n, emission


def render(mesh, view, L, res, half, centre, px, shadows=True, bump=True):
    """The plant on level grass at y 0 in the game's light: display RGB (res²), where the plant is, and the plant's
    fragments' albedo, normal and sun (for the split into albedo and light)."""
    f, r, u = view
    _, tid, bary = raster(mesh, view, centre, half, res, px)
    sun_view = frame(-L)
    s_half, s_texel = half * 1.6, 0.03
    s_res = int(2 * s_half / s_texel)
    s_depth = raster(mesh, sun_view, centre, s_half, s_res, s_texel, cull=False)[0] if shadows else None

    def lit_at(p):
        if not shadows:
            return np.ones(len(p))
        q = p - centre
        sf, sr, su = sun_view
        x = ((q @ sr + s_half) / (2 * s_half) * s_res).astype(int).clip(0, s_res - 1)
        y = ((s_half - q @ su) / (2 * s_half) * s_res).astype(int).clip(0, s_res - 1)
        return (q @ sf <= s_depth[y, x] + 0.04).astype(float)

    gx, gy = np.meshgrid(np.arange(res) + 0.5, np.arange(res) + 0.5)
    o = centre + (gx / res * 2 * half - half)[..., None] * r + (half - gy / res * 2 * half)[..., None] * u
    img = np.zeros((res, res, 3))
    plant = tid >= 0
    g = o[~plant] + (-o[~plant][:, 1] / f[1])[:, None] * f
    # (the ground's albedo × its diffuse share 0.912, TerrainURP's at _Metallic 0.05)
    img[~plant] = shade(np.tile(GRASS * 0.912 / 0.96, (len(g), 1)), np.tile([0.0, 1.0, 0.0], (len(g), 1)), np.tile(-f, (len(g), 1)), L, lit_at(g))
    iy, ix = np.nonzero(plant)
    t, W = tid[iy, ix], bary[iy, ix]
    p = np.einsum("pk,pkd->pd", W, mesh.pos[t])
    alb, n, emission = surface(mesh, t, W, px, bump)
    lit = lit_at(p)
    img[iy, ix] = shade(alb, n, np.tile(-f, (len(t), 1)), L, lit, emission)
    albedo = np.full((res, res, 3), np.nan)
    albedo[iy, ix] = alb
    return img, plant, albedo


def judge(mesh, species, yaw, pitch, px, rotations, shadows=True, bump=True, ss=4):
    """The judge's samples over a full turn: each point's luma, its share of plant, and its albedo and light factor
    (luma over the albedo's) where it is plant; the whole crown's area (world units², as seen), luma and albedo."""
    cy, reach = CROWNS[species]
    cp = math.cos(pitch)
    to_eye = np.array([math.sin(yaw) * cp, math.sin(pitch), math.cos(yaw) * cp])
    # the sun turns with the camera (light.ts sunOfYaw), 45° up
    toward = -yaw + math.pi + math.radians(40)
    sun = (math.sin(toward), math.cos(toward))
    L = np.array([sun[0], 1.0, -sun[1]]) * math.sqrt(0.5)
    across = np.array([sun[1], 0.0, sun[0]])
    if across @ np.array([to_eye[0], 0, to_eye[2]]) < 0:
        across = -across
    half = 1.6 if species != "BlueberryBush" else 0.9
    res = int(2 * half / (px / ss))
    centre = np.array([0.0, cy, 0.0])
    view = frame(-to_eye)
    acc = {}
    for k in range(rotations):
        img, plant, albedo = render(mesh.turned(2 * math.pi * k / rotations), view, L, res, half, centre, px, shadows, bump)
        luma = img @ L709
        a_luma = albedo @ L709
        points = [("middle", centre), ("side", centre + across * reach * 0.6)]
        if species == "Birch":
            # (the judge's birch bark: its trunk under the crown, 0.4 up, 0.05 toward the camera)
            points.append(("bark", np.array([0.0, 0.4, 0.0]) + np.array([to_eye[0], 0, to_eye[2]]) / math.hypot(to_eye[0], to_eye[2]) * 0.05))
        for name, p in points:
            q = p - centre
            x = int((q @ view[1] + half) / (2 * half) * res)
            y = int((half - q @ view[2]) / (2 * half) * res)
            w = int(round(1.5 * ss))
            sl = (slice(y - w, y + w), slice(x - w, x + w))
            acc.setdefault(name, []).append(luma[sl].mean())
            acc.setdefault(name + " plant", []).append(plant[sl].mean())
            m = plant[sl]
            if m.any():
                acc.setdefault(name + " albedo", []).append(a_luma[sl][m].mean())
                acc.setdefault(name + " light", []).append((luma[sl][m] / a_luma[sl][m]).mean())
        acc.setdefault("area", []).append(plant.sum() * (2 * half / res) ** 2)
        acc.setdefault("crown", []).append(luma[plant].mean())
        acc.setdefault("crown albedo", []).append(a_luma[plant].mean())
    return {k: float(np.mean(v)) for k, v in acc.items()}


def game_mesh(assets, model, show_yield=True):
    node = assets.timbermesh(assets.named(1, model))[0]
    pr = node["props"]
    mat, idx = node["meshes"][0]
    tri = idx.reshape(-1, 3)
    # Unity's left-handed space to ours (z south): mirrored, so the winding turns (two corners swapped); the model stands
    # on its tile's corner, so its tile's middle to the origin
    flip = np.array([1.0, 1.0, -1.0])
    sw = [0, 2, 1]
    pos = (pr["position"][tri] * flip - np.array([0.5, 0.0, -0.5]))[:, sw]
    nrm = (pr["normal"][tri] * flip)[:, sw]
    tan = pr["tangent"][tri].copy()
    tan[..., :3] *= flip
    tan[..., 3] *= -1
    _, _, _, _, textures, _ = gma.gws.read_material(assets.bytes(assets.named(21, mat)))
    get = lambda name: assets.texture(textures[name][0], 4) if textures.get(name, (0,))[0] else None
    detail = get("_DetailMap") if show_yield and "uv2" in pr else None
    return Mesh(pos, nrm, np.clip(pr["color"][tri][..., :3], 0, 1)[:, sw], uv=pr["uv0"][tri][:, sw], tan=tan[:, sw],
                uv2=pr["uv2"][tri][:, sw] if detail is not None else None, tex=get("_MainTex"), bump=get("_BumpMap"), detail=detail)


def our_mesh(d):
    return Mesh(*(np.array(d[k]).reshape(-1, 3, 3) for k in ("pos", "nrm", "col")))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--ours", default=os.path.join(ROOT, ".scratch", "crowns", "ours.json"))
    ap.add_argument("--species", default="Pine,Birch,Oak,BlueberryBush")
    ap.add_argument("--looks", default="standard,high")
    ap.add_argument("--yaw", type=float, default=-30, help="the camera's turn (degrees, the renderer's)")
    ap.add_argument("--pitch", type=float, default=55)
    ap.add_argument("--px", type=float, default=0.045, help="world units a shot's pixel covers at the plant")
    ap.add_argument("--rotations", type=int, default=16)
    ap.add_argument("--no-yield", action="store_true", help="the grown models without their yield shown")
    ap.add_argument("--no-shadows", action="store_true")
    ap.add_argument("--no-bump", action="store_true")
    ap.add_argument("--game", default="C:/Program Files (x86)/Steam/steamapps/common/Timberborn")
    args = ap.parse_args()
    ours = json.load(open(args.ours))
    assets = gma.Assets(args.game)
    yaw, pitch = math.radians(args.yaw), math.radians(args.pitch)
    kw = dict(shadows=not args.no_shadows)
    print("species        side      middle (plant, albedo, light)    side (plant, albedo, light)      side/mid  crown (albedo)   area   ours / the game's: middle, side, crown, area")
    for sp in args.species.split(","):
        rows = {"game": judge(game_mesh(assets, GAME[sp], sp in YIELDS and not args.no_yield), sp, yaw, pitch, args.px, args.rotations, bump=not args.no_bump, **kw)}
        for look in args.looks.split(","):
            # (High's three variants, as its forest picks them by place)
            keys = [k for k in ours if k.startswith(f"{look}:{sp}")]
            runs = [judge(our_mesh(ours[k]), sp, yaw, pitch, args.px, max(4, args.rotations // len(keys)), **kw) for k in keys]
            rows[look] = {k: float(np.mean([r[k] for r in runs if k in r])) for k in runs[0]}
        g = rows["game"]
        for name, v in rows.items():
            rel = "" if name == "game" else f"   {v['middle'] / g['middle']:.3f}, {v['side'] / g['side']:.3f}, {v['crown'] / g['crown']:.3f}, {v['area'] / g['area']:.2f}"
            pt = lambda s: f"{v[s] * 255:5.1f} ({v[s + ' plant'] * 100:3.0f} %, {v.get(s + ' albedo', float('nan')):.3f}, {v.get(s + ' light', float('nan')):.2f})"
            print(f"{sp:14s} {name:9s} {pt('middle')}   {pt('side')}   {v['side'] / v['middle']:.3f}    {v['crown'] * 255:5.1f} ({v['crown albedo']:.3f})  {v['area']:.2f}{rel}")
            if "bark" in v:
                print(f"{'':14s} {'':9s} bark {pt('bark')}" + ("" if name == "game" else f"   ours / the game's {v['bark'] / g['bark']:.3f}"))


if __name__ == "__main__":
    main()
