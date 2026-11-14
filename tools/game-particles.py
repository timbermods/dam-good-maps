"""A prefab's particles and lights as the game has them (D178, D496): read from its own files, read-only; numbers only.

Finds a GameObject by name in the game's `resources.assets` (the district center's fire is `DistrictCenterFire`, the
prefab both factions' DistrictCenter blueprints attach under `#Finished` at (1.5, 3.0, 1.5): `TemplateAttachmentsSpec`)
and prints, for it and each child: the Transform's local position, rotation and scale; each ParticleSystem's figures
(the main module, the shape, the emission and every module switched on, with the curves' keys and the gradients'
keys); each ParticleSystemRenderer's material, its shader, the material's saved values and its texture's alpha (its
mean, its peak and its profile out from the middle); and each Light's type, colour, intensity, range and angles.

A player build keeps no type tree, so the layout is Unity 6000.5's, read by structure, and every step checks itself:
each AnimationCurve must end in its pre- and post-infinity modes and its rotation order (4), so a field read out of
place stops the run instead of printing a wrong figure. The particle colours are the game's display values (it
renders in Gamma colour space). A shader's own code is read with `tools/game-water-shader.py --shader` (the fire's is
"Shader Graphs/FireParticles", its pass "Unlit").

    python tools/game-particles.py DistrictCenterFire [--game "C:/Program Files (x86)/Steam/steamapps/common/Timberborn"]
"""
import argparse
import importlib.util
import os
import struct

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_spec = importlib.util.spec_from_file_location("gma", os.path.join(ROOT, "tools", "game-model-albedo.py"))
gma = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gma)
gws = gma.gws

CURVE_STATES = ["Constant", "Curve", "TwoCurves", "TwoConstants"]
GRADIENT_STATES = ["Color", "Gradient", "TwoColors", "TwoGradients", "RandomColor"]
SHAPES = {0: "Sphere", 1: "SphereShell", 2: "Hemisphere", 3: "HemisphereShell", 4: "Cone", 5: "Box", 6: "Mesh",
          7: "ConeShell", 8: "ConeVolume", 9: "ConeVolumeShell", 10: "Circle", 11: "CircleEdge", 12: "SingleSidedEdge",
          13: "MeshRenderer", 14: "SkinnedMeshRenderer", 15: "BoxShell", 16: "BoxEdge", 17: "Donut", 18: "Rectangle",
          19: "Sprite", 20: "SpriteRenderer"}
LIGHT_TYPES = {0: "Spot", 1: "Directional", 2: "Point", 3: "Area (rectangle)", 4: "Area (disc)"}


class P:
    """A ParticleSystem's bytes, read in order."""

    def __init__(self, b):
        self.b, self.p = b, 0

    def align(self):
        self.p = (self.p + 3) & ~3

    def i32(self):
        v = struct.unpack_from("<i", self.b, self.p)[0]
        self.p += 4
        return v

    def f32(self):
        v = struct.unpack_from("<f", self.b, self.p)[0]
        self.p += 4
        return v

    def u16(self):
        v = struct.unpack_from("<H", self.b, self.p)[0]
        self.p += 2
        return v

    def u8(self):
        v = self.b[self.p]
        self.p += 1
        return v

    def flag(self):
        v = self.u8()
        self.align()
        return bool(v)

    def pptr(self):
        v = struct.unpack_from("<iq", self.b, self.p)
        self.p += 12
        return v

    def v3(self):
        return (self.f32(), self.f32(), self.f32())

    def rgba(self):
        return (self.f32(), self.f32(), self.f32(), self.f32())

    def curve(self):
        """An AnimationCurve's keys: (time, value, in slope, out slope)."""
        keys = []
        for _ in range(self.i32()):
            t, v, si, so = self.f32(), self.f32(), self.f32(), self.f32()
            self.i32()  # weighted mode
            self.f32(), self.f32()  # in and out weights
            keys.append((t, v, si, so))
        pre, post, order = self.i32(), self.i32(), self.i32()
        if order != 4 or pre not in range(9) or post not in range(9):
            raise ValueError(f"an AnimationCurve that doesn't end as one at byte {self.p}: the layout is not Unity 6000.5's")
        return keys

    def minmax(self):
        """A MinMaxCurve: its mode, its scalar and min scalar, its curves."""
        state = CURVE_STATES[self.u16()]
        self.align()
        s, ms = self.f32(), self.f32()
        hi, lo = self.curve(), self.curve()
        return {"mode": state, "scalar": s, "minScalar": ms, "curve": hi, "minCurve": lo}

    def gradient(self):
        keys = [self.rgba() for _ in range(8)]
        ctime = [self.u16() / 65535 for _ in range(8)]
        atime = [self.u16() / 65535 for _ in range(8)]
        mode, space, nc, na = self.u8(), self.u8(), self.u8(), self.u8()
        return {"mode": ["Blend", "Fixed", "PerceptualBlend"][mode] if mode < 3 else mode,
                "space": {0: "Gamma", 1: "Linear", 255: "unset"}.get(space, space),
                "colour": [(ctime[i], keys[i][:3]) for i in range(nc)], "alpha": [(atime[i], keys[i][3]) for i in range(na)]}

    def minmax_gradient(self):
        state = GRADIENT_STATES[self.u16()]
        self.align()
        lo, hi = self.rgba(), self.rgba()
        g_hi, g_lo = self.gradient(), self.gradient()
        return {"mode": state, "minColor": lo, "maxColor": hi, "gradient": g_hi, "minGradient": g_lo}


def f(v):
    if isinstance(v, (tuple, list)):
        return "(" + ", ".join(f(x) for x in v) + ")"
    if isinstance(v, float):
        return f"{v:.4g}"
    return str(v)


def say_curve(name, c, unit=""):
    """A MinMaxCurve as plain words: its constant, its range or its keys (time 0–1 of the particle's life or the
    system's duration, value × the scalar)."""
    m = c["mode"]
    if m == "Constant":
        print(f"    {name}: {f(c['scalar'])}{unit}")
    elif m == "TwoConstants":
        lo, hi = sorted((c["minScalar"], c["scalar"]))
        print(f"    {name}: random between {f(lo)} and {f(hi)}{unit}")
    else:
        keys = ", ".join(f"{f(t)}: {f(v)} (slopes {f(si)}, {f(so)})" for t, v, si, so in c["curve"])
        print(f"    {name}: {m}, × {f(c['scalar'])}{unit}, keys (time: value) {keys}")
        if m == "TwoCurves":
            keys = ", ".join(f"{f(t)}: {f(v)}" for t, v, _, _ in c["minCurve"])
            print(f"      its lower curve: {keys}")


def say_gradient(name, g):
    m = g["mode"]
    if m == "Color":
        print(f"    {name}: {f(g['maxColor'])}")
        return
    if m == "TwoColors":
        print(f"    {name}: random between {f(g['minColor'])} and {f(g['maxColor'])}")
        return
    gr = g["gradient"]
    print(f"    {name}: {m} ({gr['mode']}, {gr['space']} colour space)")
    print("      colour keys (time: r, g, b): " + ", ".join(f"{f(t)}: {f(c)}" for t, c in gr["colour"]))
    print("      alpha keys (time: a): " + ", ".join(f"{f(t)}: {f(a)}" for t, a in gr["alpha"]))


def particle_system(b):
    """Reads a ParticleSystem (class 198) in Unity 6000.5's order and prints its figures."""
    r = P(b)
    r.pptr()
    duration, speed = r.f32(), r.f32()
    r.i32(), r.i32(), r.i32()  # stop action, culling mode, ring buffer mode
    r.f32(), r.f32()  # ring buffer loop range
    r.i32()  # emitter velocity mode
    looping, prewarm, play, _ = r.u8(), r.u8(), r.u8(), r.u8()
    r.flag()  # auto random seed
    delay = r.minmax()
    space = r.i32()
    r.pptr()
    scaling = r.i32()
    r.i32()  # random seed
    print(f"    duration {f(duration)} s, looping {bool(looping)}, prewarm {bool(prewarm)}, play on awake {bool(play)}, "
          f"simulation speed {f(speed)}, simulated in {['Local', 'World', 'Custom'][space]} space, scaling "
          f"{['Hierarchy', 'Local', 'Shape'][scaling]}")
    say_curve("start delay", delay, " s")
    # the main module
    r.flag()
    m = {k: r.minmax() for k in ("lifetime", "speed")}
    colour = r.minmax_gradient()
    m.update({k: r.minmax() for k in ("size", "sizeY", "sizeZ", "rotationX", "rotationY", "rotation")})
    r.f32()  # randomize rotation direction
    r.i32()  # gravity source
    most = r.i32()
    r.v3()  # custom emitter velocity
    size3d, rot3d = r.u8(), r.u8()
    r.align()
    gravity = r.minmax()
    print("  main")
    say_curve("start lifetime", m["lifetime"], " s")
    say_curve("start speed", m["speed"], " m/s (tiles a second)")
    say_gradient("start colour", colour)
    say_curve("start size", m["size"], " m" + (" (x; y and z their own)" if size3d else ""))
    if size3d:
        say_curve("start size y", m["sizeY"], " m")
        say_curve("start size z", m["sizeZ"], " m")
    say_curve("start rotation", m["rotation"], " rad")
    say_curve("gravity modifier", gravity)
    print(f"    at most {most} particles")
    # the shape
    on = r.flag()
    kind, angle, length = r.i32(), r.f32(), r.f32()
    r.v3()  # box thickness
    thickness, _ = r.f32(), r.f32()
    pos, rot, scale = r.v3(), r.v3(), r.v3()
    r.i32(), r.i32(), r.f32()  # placement mode, mesh material index, mesh normal offset
    r.i32(), r.f32(), r.minmax()  # mesh spawn: mode, spread, speed
    for _ in range(5):
        r.pptr()
    r.u8(), r.u8(), r.u8()
    r.align()
    r.pptr(), r.i32(), r.f32(), r.i32()  # texture, clip channel, threshold, uv channel
    r.u8(), r.u8(), r.u8()
    r.align()
    rnd_dir, sph_dir, rnd_pos = r.f32(), r.f32(), r.f32()
    radius = r.f32()
    r.i32(), r.f32(), r.minmax()
    arc = r.f32()
    r.i32(), r.f32(), r.minmax()
    print(f"  shape{'' if on else ' (off)'}: {SHAPES.get(kind, kind)}, angle {f(angle)}°, radius {f(radius)} m, "
          f"its thickness {f(thickness)} (1: the whole disc), arc {f(arc)}°, length {f(length)}, at {f(pos)}, turned "
          f"{f(rot)}°, scaled {f(scale)}; random direction {f(rnd_dir)}, spherical {f(sph_dir)}, random position {f(rnd_pos)}")
    # emission
    on = r.flag()
    rate, dist = r.minmax(), r.minmax()
    r.i32()
    bursts = []
    for _ in range(r.i32()):
        t = r.f32()
        bursts.append((t, r.minmax(), r.i32(), r.f32(), r.f32()))
    print(f"  emission{'' if on else ' (off)'}")
    say_curve("rate over time", rate, " a second")
    if dist["scalar"] or dist["mode"] != "Constant":
        say_curve("rate over distance", dist, " a metre")
    for t, count, cycles, interval, chance in bursts:
        say_curve(f"burst at {f(t)} s ({cycles} cycles every {f(interval)} s, probability {f(chance)})", count)

    def module(name, *fields, tail=()):
        on = r.flag()
        got = []
        for kind in fields:
            got.append(r.minmax() if kind == "c" else r.minmax_gradient() if kind == "g" else
                       r.flag() if kind == "b" else r.f32() if kind == "f" else r.i32())
        for kind in tail:
            got.append(r.flag() if kind == "b" else r.f32() if kind == "f" else r.i32())
        return on, got

    on, (size, sy, sz, sep) = module("size", "c", "c", "c", "b")
    if on:
        print("  size over lifetime")
        say_curve("size × (of the start size)", size)
    on, (rx, ry, rz, sep) = module("rotation", "c", "c", "c", "b")
    if on:
        print("  rotation over lifetime")
        say_curve("turning", rz, " rad/s")
    on, (grad,) = module("colour", "g")
    if on:
        print("  colour over lifetime (× the start colour)")
        say_gradient("colour", grad)
    # the texture sheet
    on = r.flag()
    r.i32(), r.i32(), r.f32()
    r.minmax(), r.minmax()
    r.f32(), r.f32()
    tiles = (r.i32(), r.i32())
    r.i32(), r.i32(), r.f32(), r.i32(), r.i32()
    for _ in range(r.i32()):
        r.pptr()
    r.f32(), r.f32()
    if on:
        print(f"  texture sheet: {tiles[0]} × {tiles[1]} tiles")
    on = r.flag()
    vel = [r.minmax() for _ in range(11)]
    world = r.flag()
    if on:
        print(f"  velocity over lifetime ({'world' if world else 'local'} space)")
        for n, c in zip(("x", "y", "z", "orbital x", "orbital y", "orbital z", "offset x", "offset y", "offset z", "radial", "speed ×"), vel):
            say_curve(n, c, "")
    on = r.flag()
    r.i32()
    inherit = r.minmax()
    if on:
        print("  inherit velocity")
        say_curve("share", inherit)
    on = r.flag()
    r.minmax()
    r.f32(), r.f32()
    if on:
        print("  lifetime by emitter speed: on")
    on = r.flag()
    force = [r.minmax() for _ in range(3)]
    world, _ = r.u8(), r.u8()
    r.align()
    if on:
        print(f"  force over lifetime ({'world' if world else 'local'} space)")
        for n, c in zip("xyz", force):
            say_curve(n, c, " m/s²")
    on = r.flag()
    r.minmax()
    r.i32(), r.i32()
    for _ in range(r.i32()):
        r.pptr()
    if on:
        print("  external forces: on")
    on = r.flag()
    lim = [r.minmax() for _ in range(4)]
    sep, world, by_size, by_vel = r.u8(), r.u8(), r.u8(), r.u8()
    dampen = r.f32()
    drag = r.minmax()
    if on:
        print(f"  limit velocity over lifetime: dampen {f(dampen)} (the share of the speed over the limit taken off "
              f"each frame{': none, so the limit does nothing' if dampen == 0 else ''})")
        say_curve("limit", lim[3], " m/s")
        say_curve("drag", drag)
    on = r.flag()
    strength = [r.minmax() for _ in range(3)]
    r.flag()
    freq = r.f32()
    r.flag()
    octaves = r.i32()
    r.f32(), r.f32(), r.i32()
    scroll = r.minmax()
    [r.minmax() for _ in range(3)]
    r.flag()
    amounts = [r.minmax() for _ in range(3)]
    if on:
        print(f"  noise: frequency {f(freq)}, {octaves} octaves")
        say_curve("strength", strength[0])
        say_curve("scroll speed", scroll)
        for n, c in zip(("position", "rotation", "size"), amounts):
            say_curve(f"{n} amount", c)
    on = r.flag()
    [r.minmax() for _ in range(3)]
    r.f32(), r.f32()
    r.flag()
    if on:
        print("  size by speed: on")
    on = r.flag()
    [r.minmax() for _ in range(3)]
    r.flag()
    r.f32(), r.f32()
    if on:
        print("  rotation by speed: on")
    on = r.flag()
    r.minmax_gradient()
    r.f32(), r.f32()
    if on:
        print("  colour by speed: on")
    on = r.flag()
    r.i32(), r.i32(), r.f32()
    r.u8(), r.u8(), r.u8()
    r.align()
    for _ in range(r.i32()):
        r.pptr()
    r.minmax(), r.minmax(), r.minmax()
    r.f32(), r.f32(), r.f32(), r.i32(), r.i32(), r.i32(), r.f32()
    r.u8(), r.u8(), r.u8()
    r.align()
    if on:
        print("  collision: on")
    on = r.flag()
    for _ in range(5):
        r.i32()
    r.f32()
    for _ in range(r.i32()):
        r.pptr()
    if on:
        print("  trigger: on")
    on = r.flag()
    subs = r.i32()
    for _ in range(subs):
        r.pptr(), r.i32(), r.i32(), r.f32()
    if on:
        print(f"  sub-emitters: {subs}")
    on = r.flag()
    ratio = r.f32()
    r.pptr()
    r.u8(), r.u8(), r.u8(), r.u8()
    r.minmax(), r.minmax()
    r.i32()
    print(f"  lights module: {'on, a light for ' + f(ratio) + ' of the particles' if on else 'off'}")
    on = r.flag()
    print(f"  trails: {'on' if on else 'off'}")


def texture_alpha(assets, pid):
    """A texture's colour and alpha, as figures: the colour's range, the alpha's mean and peak, and its mean in rings
    out from the texture's middle (in texture widths)."""
    t = assets.texture(pid, 4)
    a = t[..., 3]
    h, w = a.shape
    yy, xx = np.mgrid[0:h, 0:w]
    rr = np.hypot((yy + 0.5) / h - 0.5, (xx + 0.5) / w - 0.5)
    rings = []
    for r0 in np.arange(0, 0.5, 0.05):
        m = (rr >= r0) & (rr < r0 + 0.05)
        rings.append(f"{r0:.2f}–{r0 + 0.05:.2f}: {a[m].mean():.3f}")
    cy = (a * (yy + 0.5) / h).sum() / a.sum()
    cx = (a * (xx + 0.5) / w).sum() / a.sum()
    rgb = t[..., :3].reshape(-1, 3)
    print(f"      {w} × {h}; colour {f(tuple(rgb.min(0)))} to {f(tuple(rgb.max(0)))}; alpha mean {a.mean():.3f}, peak "
          f"{a.max():.3f}, its centre of mass at ({cx:.2f}, {cy:.2f}) of the texture")
    print("      alpha by distance from the middle (texture widths): " + ", ".join(rings))


def renderer(assets, b):
    """A ParticleSystemRenderer (class 199): its material, shader, values and texture."""
    # its materials: the Renderer's m_Materials, a count and that many references to Materials (class 21)
    for i in range(12, len(b) - 16, 4):
        n = struct.unpack_from("<i", b, i)[0]
        refs = [struct.unpack_from("<iq", b, i + 4 + 12 * k) for k in range(n)] if 0 < n < 8 and i + 4 + 12 * n <= len(b) else []
        if refs and all(fid == 0 and pid in assets.by_id and assets.by_id[pid][3] == 21 for fid, pid in refs):
            name, shader, kw, _, textures, values = gws.read_material(assets.bytes(refs[0][1]))
            print(f"  renderer: material {name}, shader {gma.shader_name_of(assets, shader)!r}, keywords {kw}")
            keep = ("_Tint", "_BaseColor", "_Color", "_EmissionColor", "_SrcBlend", "_DstBlend", "_ZWrite", "_Surface",
                    "_CastShadows", "_SoftParticlesEnabled")
            print("    " + ", ".join(f"{k} {f(values[k] if len(values[k]) > 1 else values[k][0])}" for k in keep if k in values))
            for k, (tp, scale, offset) in textures.items():
                if tp and assets.by_id[tp][3] == 28:
                    tname = gws.Reader(assets.bytes(tp)).str()
                    print(f"    {k}: texture {tname!r}, tiling {f(scale)}")
                    texture_alpha(assets, tp)
            return
    print("  renderer: no material")


def light(b):
    """A Light (class 108): Unity 6000.5's order, its type first (the game's Sun reads 1, Directional)."""
    kind = struct.unpack_from("<i", b, 16)[0]
    colour = struct.unpack_from("<4f", b, 20)
    intensity, rng, spot, inner = struct.unpack_from("<4f", b, 36)
    shadows = struct.unpack_from("<i", b, 60)[0]
    print(f"  light: {LIGHT_TYPES.get(kind, kind)}, colour {f(colour[:3])}, intensity {f(intensity)}, range {f(rng)} m"
          + (f", spot angle {f(spot)}°, inner {f(inner)}°" if kind == 0 else "") + f", shadows {['none', 'hard', 'soft'][shadows]}")


def walk(assets, go, depth=0):
    r = gws.Reader(assets.data, assets.by_id[go][1])
    n = r.u32()
    r.p += 12 * n + 4
    name = r.str()
    print(f"\n{'  ' * depth}{name}")
    for pid in assets.components(go):
        cid = assets.by_id[pid][3]
        b = assets.bytes(pid)
        if cid == 4:
            q = struct.unpack_from("<4f", b, 12)
            pos = struct.unpack_from("<3f", b, 28)
            scale = struct.unpack_from("<3f", b, 40)
            print(f"  at {f(pos)} in its parent, turned (quaternion x, y, z, w) {f(q)}, scaled {f(scale)}")
        elif cid == 198:
            print("  particle system")
            particle_system(b)
        elif cid == 199:
            renderer(assets, b)
        elif cid == 108:
            light(b)
        elif cid == 114:
            script = struct.unpack_from("<iq", b, 16)
            print(f"  a script (MonoScript {script[1]} in file {script[0]})")
    for child in assets.children(go):
        walk(assets, child, depth + 1)


def main():
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("prefabs", nargs="+", help="the prefabs' GameObject names")
    ap.add_argument("--game", default="C:/Program Files (x86)/Steam/steamapps/common/Timberborn")
    args = ap.parse_args()
    assets = gma.Assets(args.game)
    for name in args.prefabs:
        walk(assets, assets.named(1, name))


if __name__ == "__main__":
    main()
