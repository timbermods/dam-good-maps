"""A model's albedo as the game draws it (D178, D496): read from its own files, read-only; numbers only.

Timberborn's models are Timbermesh: a component on the model's GameObject (`resources.assets`) holding a zlib-packed
protobuf `Model` (decompiled `Timberborn.TimbermeshDTO`): nodes, each with its vertex properties (position, normal,
colour, uv0, ...) and meshes (indices and a material's name). This finds a model by its GameObject's name, reads its
triangles, and gives the albedo its shader multiplies the light by, per material, area-weighted over its triangles:
  - EnvironmentURP (buildings, landmarks, ruins; its ForwardLit program read with tools/game-water-shader.py):
    2 × `_DetailAlbedoMap` (unset: Unity's "grey", so × 1) × saturate(vertex colour) × lerp(`_MainTex`, `_MainTex` ×
    `_Color`, `_ColorMask`.r) (`_ColorMask` unset: "white", so `_MainTex` × `_Color`);
  - VegetationURP (plants, `_EnableDetail` 0): saturate(vertex colour) × `_MainTex`.
Both are URP's lit model (their ForwardLit programs): the albedo × (1 − metallic) × 0.96 × (the ambient probe by the
normal, in display values, × EnvironmentURP's `_AmbientOcclusion` + the sun × n·L × its shadow), with the environment's
reflection and the sun's highlight by the smoothness; VegetationURP has no occlusion term, and its `_MetallicGlossMap`
defaults to "black" (metallic and smoothness 0). Each material's occlusion, metallic and smoothness are printed too.
The texture is sampled at 36 points spread over each triangle (its top mip, raw: the game renders in Gamma colour space). Each
material's albedo is printed whole and split by vertex colour, and by its texels' hue where they are bluer than they
are green (a bush's berries), with each part's share of the area. `--above 0.3,0.5` also gives each vertex-colour part's
albedo over only its texels lighter than each luminance (Rec. 709, of the texel): a bark's light part without the dark
marks a model of ours draws as geometry of its own (the birch's).

    python tools/game-model-albedo.py StartingLocation.Model BlueberryBushMature RuinColumnH3 [--above 0.3] [--game ...]
"""
import argparse
import os
import struct
import zlib

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
import importlib.util  # noqa: E402

_spec = importlib.util.spec_from_file_location("gws", os.path.join(ROOT, "tools", "game-water-shader.py"))
gws = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gws)


def _varint(b, p):
    v = s = 0
    while True:
        x = b[p]
        p += 1
        v |= (x & 0x7F) << s
        s += 7
        if x < 0x80:
            return v, p


def _fields(b):
    p, out = 0, []
    while p < len(b):
        k, p = _varint(b, p)
        f, w = k >> 3, k & 7
        if w == 0:
            v, p = _varint(b, p)
        elif w == 2:
            n, p = _varint(b, p)
            v = b[p:p + n]
            p += n
        elif w == 5:
            v = struct.unpack_from("<f", b, p)[0]
            p += 4
        elif w == 1:
            v = struct.unpack_from("<d", b, p)[0]
            p += 8
        else:
            raise ValueError(f"protobuf wire type {w}")
        out.append((f, v))
    return out


def _packed(b):
    p, out = 0, []
    while p < len(b):
        v, p = _varint(b, p)
        out.append(v)
    return out


SCALAR = {1: ("u1", 1), 2: ("<u4", 4), 3: ("<i4", 4), 4: ("<f4", 4), 5: ("<f8", 8)}


def read_timbermesh(raw):
    """[(name, parent, scale (3), {property: array (n, dim)}, [(material, indices)])] of a Timbermesh Model."""
    nodes = []
    for f, v in _fields(raw):
        if f != 3:
            continue
        node = {"parent": -1, "name": "", "scale": [1.0, 1.0, 1.0], "props": {}, "meshes": []}
        for nf, nv in _fields(v):
            if nf == 1:
                node["parent"] = nv - (1 << 64) if nv >= 1 << 63 else nv
            elif nf == 2:
                node["name"] = nv.decode()
            elif nf == 5:
                sc = dict(_fields(nv))
                node["scale"] = [sc.get(1, 0.0), sc.get(2, 0.0), sc.get(3, 0.0)]
            elif nf == 7:
                pr = dict(_fields(nv))
                if 4 not in pr:
                    continue
                kind, size = SCALAR[pr[2]]
                dim = pr[3]
                node["props"][pr[1].decode()] = np.frombuffer(pr[4], dtype=kind).reshape(-1, dim).astype(np.float64)
            elif nf == 8:
                me = dict(_fields(nv))
                node["meshes"].append((me.get(2, b"").decode(), np.array(_packed(me.get(1, b"")), dtype=np.int64)))
        nodes.append(node)
    return nodes


class Assets:
    def __init__(self, game):
        self.dir = os.path.join(game, "Timberborn_Data")
        self.path = os.path.join(self.dir, "resources.assets")
        _, self.objs = gws.read_objects(self.path)
        self.data = open(self.path, "rb").read()
        self.by_id = {o[0]: o for o in self.objs}
        self._textures = {}

    def bytes(self, pid):
        _, off, size, _ = self.by_id[pid]
        return self.data[off:off + size]

    def named(self, class_id, name):
        for pid, off, size, cid in self.objs:
            if cid != class_id:
                continue
            try:
                if class_id == 1:
                    r = gws.Reader(self.data, off)
                    n = r.u32()
                    r.p += 12 * n + 4
                    got = r.str()
                else:
                    got = gws.Reader(self.data, off).str()
            except (ValueError, UnicodeDecodeError, struct.error):
                continue
            if got == name:
                return pid
        raise KeyError(f"no object of class {class_id} named {name}")

    def components(self, go):
        r = gws.Reader(self.bytes(go))
        return [r.pptr()[1] for _ in range(r.u32())]

    def children(self, go):
        for pid in self.components(go):
            if self.by_id[pid][3] == 4:
                r = gws.Reader(self.bytes(pid))
                r.pptr()
                r.p += 40
                kids = [r.pptr()[1] for _ in range(r.u32())]
                return [struct.unpack_from("<q", self.bytes(k), 4)[0] for k in kids]
        return []

    def timbermesh(self, go):
        """The model's Timbermesh: on the GameObject or the nearest child that has one."""
        queue = [go]
        while queue:
            g = queue.pop(0)
            for pid in self.components(g):
                if self.by_id[pid][3] != 114:
                    continue
                b = self.bytes(pid)
                r = gws.Reader(b)
                r.pptr()
                r.p += 4
                r.pptr()
                r.str()
                n = r.u32()
                if n > 8 and b[r.p:r.p + 2] == b"\x78\x9c":
                    return read_timbermesh(zlib.decompress(b[r.p:r.p + n]))
            queue.extend(self.children(g))
        raise KeyError("no Timbermesh under this GameObject")

    def texture(self, pid, channels=3):
        """A texture's top mip, 0-1, its first `channels` channels (4 for its alpha too)."""
        if pid not in self._textures:
            self._textures[pid] = gws.texture_texels(self.bytes(pid), self.dir)[1] / 255.0
        return self._textures[pid][..., :channels]


def shader_name_of(assets, pid):
    """A Shader's name: its parsed form starts with its properties, its name after them, so the name is found as the
    'Shader Graphs/...' string in its first bytes."""
    b = assets.bytes(pid)[:400000]
    i = b.find(b"Shader Graphs/")
    return b[i:b.index(b"\0", i)].decode() if i >= 0 else ""


_g = [(i, j) for i in range(8) for j in range(8 - i)]
#: barycentric sample points over a triangle (a grid of 36, at the cells' centres)
BARY = np.array([[(i + 1 / 3) / 8, (j + 1 / 3) / 8, 1 - (i + j + 2 / 3) / 8] for i, j in _g])


def albedo(assets, model):
    nodes = assets.timbermesh(assets.named(1, model))
    out = {}
    for k, node in enumerate(nodes):
        pos = node["props"].get("position")
        if pos is None or not node["meshes"]:
            continue
        scale = np.array(node["scale"])
        p = k
        while nodes[p]["parent"] >= 0:
            p = nodes[p]["parent"]
            scale = scale * np.array(nodes[p]["scale"])
        pos = pos * scale
        col = np.clip(node["props"].get("color", np.ones((len(pos), 4)))[:, :3], 0, 1)
        uv = node["props"].get("uv0", np.zeros((len(pos), 2)))
        for mat, idx in node["meshes"]:
            tri = idx.reshape(-1, 3)
            a, b, c = pos[tri[:, 0]], pos[tri[:, 1]], pos[tri[:, 2]]
            area = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)
            mpid = assets.named(21, mat)
            _, shader_pid, _, _, textures, values = gws.read_material(assets.bytes(mpid))
            shader = shader_name_of(assets, shader_pid)
            # each triangle sampled at BARY points spread over it, each carrying its share of the area
            u_at = np.einsum("sk,tkd->tsd", BARY, uv[tri]).reshape(-1, 2)
            vc = np.einsum("sk,tkd->tsd", BARY, col[tri]).reshape(-1, 3)
            area = np.repeat(area / len(BARY), len(BARY))

            def sample(pid, channels=3):
                t = assets.texture(pid, channels)
                h, w, _ = t.shape
                return t[(np.mod(u_at[:, 1], 1) * h).astype(int).clip(0, h - 1), (np.mod(u_at[:, 0], 1) * w).astype(int).clip(0, w - 1)]

            tex = textures.get("_MainTex", (0,))[0]
            texel = sample(tex) if tex else np.ones((len(u_at), 3))
            if "EnvironmentURP" in shader:
                tint = np.array(values.get("_Color", (1, 1, 1, 1))[:3])
                mask_pid = textures.get("_ColorMask", (0,))[0]
                mask = sample(mask_pid)[:, :1] if mask_pid else 1.0
                if textures.get("_DetailAlbedoMap", (0,))[0]:
                    raise ValueError(f"{mat}: a detail albedo map, which this does not read")
                alb = vc * (texel + mask * (texel * tint - texel))
                # what multiplies its ambient (the indirect light: the SH and the environment's reflection) and its
                # surface: `_AmbientOcclusion`'s r (unset: "white", none), `_MetallicGlossMap`'s r and a (unset: "black")
                ao_pid = textures.get("_AmbientOcclusion", (0,))[0]
                ao = np.minimum(sample(ao_pid)[:, 0], 1.0) if ao_pid else np.ones(len(u_at))
                mg_pid = textures.get("_MetallicGlossMap", (0,))[0]
                mg = sample(mg_pid, 4) if mg_pid else np.zeros((len(u_at), 4))
                metal, smooth = mg[:, 0], mg[:, 3]
            elif "VegetationURP" in shader:
                # (no occlusion term; `_MetallicGlossMap` unset on the trees and bushes: "black", metallic and smoothness 0)
                alb = vc * texel
                mg_pid = textures.get("_MetallicGlossMap", (0,))[0]
                mg = sample(mg_pid, 4) if mg_pid else np.zeros((len(u_at), 4))
                ao, metal, smooth = np.ones(len(u_at)), mg[:, 0], mg[:, 3]
            else:
                raise ValueError(f"{mat}: shader {shader!r}, not one this reads")
            out.setdefault(mat, []).append((area, alb, vc, texel, ao, metal, smooth))
    return out


def report(model, parts, above=()):
    print(f"\n{model}")
    for mat, chunks in parts.items():
        area = np.concatenate([c[0] for c in chunks])
        alb = np.concatenate([c[1] for c in chunks])
        vc = np.concatenate([c[2] for c in chunks])
        tex = np.concatenate([c[3] for c in chunks])
        ao, metal, smooth = (np.concatenate([c[k] for c in chunks]) for k in (4, 5, 6))
        tot = area.sum()
        mean = (alb * area[:, None]).sum(0) / tot
        tmean = (tex * area[:, None]).sum(0) / tot
        print(f"  {mat}: albedo {fmt(mean)} (texture {fmt(tmean)}), area {tot:.3f}")
        # the occlusion as the ambient takes it: the albedo-weighted mean (the ambient's light over the material, its
        # occlusion applied, over its light without it), and the surface's metallic and smoothness, area-weighted
        lum = alb @ np.array([0.2126, 0.7152, 0.0722])
        print(f"    occlusion {(ao * area).sum() / tot:.3f} (albedo-weighted {(ao * lum * area).sum() / max((lum * area).sum(), 1e-9):.3f}),"
              f" metallic {(metal * area).sum() / tot:.3f}, smoothness {(smooth * area).sum() / tot:.3f}")
        keys = np.round(vc / 0.02) * 0.02
        groups = {}
        for i, k in enumerate(map(tuple, keys)):
            groups.setdefault(k, []).append(i)
        for k, ids in sorted(groups.items(), key=lambda kv: -area[kv[1]].sum())[:8]:
            a = area[ids]
            print(f"    vertex colour {fmt(k)}: {a.sum() / tot * 100:5.1f} % of the area, albedo {fmt((alb[ids] * a[:, None]).sum(0) / a.sum())}")
            lum = tex[ids] @ np.array([0.2126, 0.7152, 0.0722])
            for t in above:
                light = np.array(ids)[lum > t]
                if len(light):
                    b = area[light]
                    print(f"      texels above {t}: {b.sum() / a.sum() * 100:5.1f} % of it, albedo {fmt((alb[light] * b[:, None]).sum(0) / b.sum())}")
        blue = tex[:, 2] > tex[:, 1] + 0.04
        if blue.any():
            a = area[blue]
            print(f"    bluer texels: {a.sum() / tot * 100:5.1f} % of the area, albedo {fmt((alb[blue] * a[:, None]).sum(0) / a.sum())}")


def fmt(v):
    return "(" + ", ".join(f"{x:.3f}" for x in v) + ")"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("models", nargs="+", help="the models' GameObject names")
    ap.add_argument("--above", default="", help="luminances: each part's albedo over its texels lighter than each")
    ap.add_argument("--game", default="C:/Program Files (x86)/Steam/steamapps/common/Timberborn")
    args = ap.parse_args()
    assets = Assets(args.game)
    for m in args.models:
        report(m, albedo(assets, m), [float(t) for t in args.above.split(",") if t])


if __name__ == "__main__":
    main()
