"""The game's water shader, read from its own files (D496, D497): Timberborn's water is drawn by the Shader Graph
shaders "Shader Graphs/PhysicalWaterURP_Opaque" (every tile in play, `WaterMesh.GetWaterMaterial`) and
"_Transparent" (only while a tool hides the water). This reads them, read-only, from `resources.assets`, takes the
D3D11 programs of their forward pass ("ForwardLit") for one keyword variant, disassembles the vertex and pixel
programs with Windows' d3dcompiler_47 `D3DDisassemble`, and writes each to `investigation/water-shader/local/`
(gitignored: the game's own code stays out of git). Every `cb#[n].xyzw` and `t#` the disassembly reads is named at
the end of its line from the program's parameter tables, and the run prints the `UnityPerMaterial` layout with the
water material's saved values, so each slot can be read by name.

The variant defaults to the one the game draws in play: the material's own keyword `_CALCULATE_OUTFLOWS`,
`_HIGH_QUALITY_WATER_ENABLED` (the game's water quality setting, on from Medium up), URP's `_ADDITIONAL_LIGHTS`,
`_MAIN_LIGHT_SHADOWS_CASCADE` and `_SHADOWS_SOFT`, and `FOG_EXP` (the game's sky sets an exponential fog). The
shadow and fog keywords change only URP's shadow and fog code, not the water's own terms.

    python tools/game-water-shader.py [--game "C:/Program Files (x86)/Steam/steamapps/common/Timberborn"]
        [--keywords _CALCULATE_OUTFLOWS,_HIGH_QUALITY_WATER_ENABLED,...] [--out investigation/water-shader/local]
        [--shader "Shader Graphs/TerrainURP" --keywords _MAIN_LIGHT_SHADOWS_CASCADE,_SHADOWS_SOFT,FOG_EXP]

`--shader` reads another Shader Graph the same way (the terrain's, D497), its ForwardLit pass for `--keywords` (its
other keywords off), and prints every material that uses it with its saved values; on a variant that doesn't match it
lists the keyword sets the pass has.

How a Unity 6 player stores a shader (no type tree in a player build, so the layout is read by structure and every
step checks itself): the Shader object holds its parsed form (properties, passes, keyword names) and then, per
graphics API, an LZ4 block of programs. The block starts with a table of (offset, length, segment) entries; an
entry is either a program (a prefix with its keywords, then a DXBC container) or the program's own parameter table
(names, constant-buffer offsets, texture and sampler slots). Each pass keeps, per program stage, a list of
(entry index, keyword indices, requirements, GPU program type) for its variants, the entry index of each variant's
parameter table, and a table of parameters common to all its variants, which names by index into the pass's map
of names.
"""
import argparse
import ctypes
import os
import re
import struct
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHADERS = ["Shader Graphs/PhysicalWaterURP_Opaque", "Shader Graphs/PhysicalWaterURP_Transparent"]
DEFAULT_KEYWORDS = "_CALCULATE_OUTFLOWS,_HIGH_QUALITY_WATER_ENABLED,_ADDITIONAL_LIGHTS,_MAIN_LIGHT_SHADOWS_CASCADE,_SHADOWS_SOFT,FOG_EXP"
D3D11 = 4  # Unity's ShaderCompilerPlatform for Direct3D 11
GPU_TYPES = {15: "vs_4_0", 16: "vs_5_0", 17: "ps_4_0", 18: "ps_5_0"}
PARAM_MAGIC = 202012090


def u32(b, p):
    return struct.unpack_from("<I", b, p)[0]


def i32(b, p):
    return struct.unpack_from("<i", b, p)[0]


def f32(b, p):
    return struct.unpack_from("<f", b, p)[0]


class Reader:
    def __init__(self, b, p=0):
        self.b = b
        self.p = p

    def u32(self):
        v = u32(self.b, self.p)
        self.p += 4
        return v

    def i32(self):
        v = i32(self.b, self.p)
        self.p += 4
        return v

    def i64(self):
        v = struct.unpack_from("<q", self.b, self.p)[0]
        self.p += 8
        return v

    def f32(self):
        v = f32(self.b, self.p)
        self.p += 4
        return v

    def str(self):
        n = self.u32()
        if n > 4096:
            raise ValueError(f"string of {n} bytes at {self.p - 4}: not a string")
        v = self.b[self.p:self.p + n].decode("utf-8")
        self.p += (n + 3) & ~3
        return v

    def pptr(self):
        return self.i32(), self.i64()


# --- the serialized file -------------------------------------------------------------------------------------

def read_objects(path):
    """(pathID, file offset, size, classID) of every object in a Unity 6 serialized file (format 22 and up)."""
    with open(path, "rb") as f:
        head = f.read(0x30)
        version = struct.unpack_from(">I", head, 8)[0]
        if version < 22:
            raise ValueError(f"serialized file format {version}: this reads 22 and up")
        meta_size, _, data_offset = struct.unpack_from(">IQQ", head, 0x14)
        meta = f.read(meta_size)
    unity = meta[:meta.index(b"\0")].decode()
    r = Reader(meta, len(unity) + 1)
    r.u32()  # target platform
    if meta[r.p]:
        raise ValueError("this file has type trees: read it with a type-tree reader instead")
    r.p += 1
    types = []
    for _ in range(r.i32()):
        class_id = r.i32()
        r.p += 1  # stripped
        script = struct.unpack_from("<h", meta, r.p)[0]
        r.p += 2
        r.p += 32 if class_id == 114 or script >= 0 else 16
        types.append(class_id)
    count = r.i32()
    r.p = (r.p + 3) & ~3
    objects = []
    for _ in range(count):
        path_id, start, size, type_index = struct.unpack_from("<qqIi", meta, r.p)
        r.p += 24
        objects.append((path_id, data_offset + start, size, types[type_index]))
    return unity, objects


# --- LZ4 -----------------------------------------------------------------------------------------------------

def lz4_block(src, out_len):
    dst = bytearray()
    i, n = 0, len(src)
    while i < n:
        token = src[i]
        i += 1
        lit = token >> 4
        if lit == 15:
            while True:
                x = src[i]
                i += 1
                lit += x
                if x != 255:
                    break
        dst += src[i:i + lit]
        i += lit
        if i >= n:
            break
        offset = src[i] | (src[i + 1] << 8)
        i += 2
        length = token & 15
        if length == 15:
            while True:
                x = src[i]
                i += 1
                length += x
                if x != 255:
                    break
        length += 4
        s = len(dst) - offset
        if offset >= length:
            dst += dst[s:s + length]
        else:
            for k in range(length):
                dst.append(dst[s + k])
    if len(dst) != out_len:
        raise ValueError(f"LZ4: {len(dst)} bytes out, {out_len} expected")
    return bytes(dst)


# --- the shader ----------------------------------------------------------------------------------------------

def find_blob_tables(b, after):
    """The per-platform tables after the parsed form: platforms, offsets, compressed and decompressed lengths
    (each a vector per platform), then the compressed blob. Found by structure, checked by its sums."""
    for p in range(after, len(b) - 64, 4):
        try:
            r = Reader(b, p)
            n = r.u32()
            if not 1 <= n <= 16:
                continue
            platforms = [r.u32() for _ in range(n)]
            if any(x > 64 for x in platforms):
                continue
            tables = []
            for _ in range(3):
                if r.u32() != n:
                    raise ValueError
                rows = []
                for _ in range(n):
                    m = r.u32()
                    if m > 64:
                        raise ValueError
                    rows.append([r.u32() for _ in range(m)])
                tables.append(rows)
            offsets, compressed, decompressed = tables
            blob_len = r.u32()
            if not all(len(offsets[k]) == len(compressed[k]) == len(decompressed[k]) for k in range(n)):
                continue
            ends = [o + c for k in range(n) for o, c in zip(offsets[k], compressed[k])]
            if not ends or max(ends) != blob_len or r.p + blob_len > len(b):
                continue
            return platforms, offsets, compressed, decompressed, b[r.p:r.p + blob_len]
        except (ValueError, struct.error):
            continue
    raise ValueError("no compressed program blob found after the parsed form")


def string_vector_with(b, needle, end):
    """The vector of strings (the shader's keyword names) that holds `needle`, found by walking back from it."""
    at = b.rfind(struct.pack("<I", len(needle)) + needle.encode(), 0, end)
    if at < 0:
        raise ValueError(f"{needle} not in the parsed form")
    for start in range(at - 4, max(0, at - 8192), -4):
        try:
            r = Reader(b, start)
            n = r.u32()
            if not 1 <= n <= 1024:
                continue
            names = [r.str() for _ in range(n)]
            if needle in names and all(re.fullmatch(r"[A-Z0-9_]+", s) for s in names):
                return names
        except (ValueError, UnicodeDecodeError, struct.error):
            continue
    raise ValueError("keyword names not found")


def name_maps(b, end):
    """Each pass's map of parameter names to indices (it starts with $Globals); its pass name follows it."""
    maps = []
    p = 0
    while p < end:
        if u32(b, p + 4) == 8 and b[p + 8:p + 16] == b"$Globals":
            try:
                r = Reader(b, p)
                n = r.u32()
                m = {}
                for _ in range(n):
                    k = r.str()
                    m[r.i32()] = k
                r.u32()  # the pass's type
                maps.append((p, r.p, m, r.str()))
                p = r.p
                continue
            except (ValueError, UnicodeDecodeError, struct.error):
                pass
        p += 4
    return maps


def try_program(b, p, n_entries, n_keywords):
    """A pass's program for one stage, if one starts at p: its variants and their parameter-table entries."""
    r = Reader(b, p)
    if r.u32() != 0:  # editor-only sub-programs: none in a player build
        return None
    outer = r.u32()
    if not 1 <= outer <= 8:
        return None
    lists = []
    for _ in range(outer):
        n = r.u32()
        if n > 4096:
            return None
        variants = []
        for _ in range(n):
            entry = r.u32()
            k = r.u32()
            if entry >= n_entries or k > n_keywords:
                return None
            keywords = list(struct.unpack_from(f"<{k}H", b, r.p))
            r.p += (2 * k + 3) & ~3
            if any(x >= n_keywords for x in keywords):
                return None
            r.i64()  # requirements
            gpu = b[r.p]
            r.p += 4
            if gpu not in GPU_TYPES:
                return None
            variants.append((entry, keywords, gpu))
        lists.append(variants)
    if not any(lists) or r.u32() != outer:
        return None
    params = []
    for variants in lists:
        if r.u32() != len(variants):
            return None
        params.append([r.u32() for _ in variants])
    return [(v[0], v[1], v[2], q) for variants, ps in zip(lists, params) for v, q in zip(variants, ps)], r.p


def common_parameters(b, p, names):
    """The parameters every variant of a program shares (Unity's SerializedProgramParameters, names by index)."""
    r = Reader(b, p)
    out = {"cbs": {}, "textures": {}, "bindings": {}}

    def recs(n, k):
        return [[r.i32() for _ in range(k)] for _ in range(n)]

    recs(r.u32(), 4)  # vectors outside a buffer
    recs(r.u32(), 4)  # matrices outside a buffer
    for name, index, sampler, packed in recs(r.u32(), 4):
        out["textures"][index] = (names[name], sampler, (packed >> 8) & 0xFF)
    recs(r.u32(), 3)  # buffers
    for _ in range(r.u32()):
        name = names[r.i32()]
        params = []
        for _ in range(r.u32()):  # matrices: name, offset, array size, type | rows << 8
            n, off, arr, packed = (r.i32() for _ in range(4))
            params.append((names[n], off, (packed >> 8) & 0xFF, 4, max(arr, 1)))
        for _ in range(r.u32()):  # vectors: name, offset, array size, type | columns << 8
            n, off, arr, packed = (r.i32() for _ in range(4))
            params.append((names[n], off, 1, (packed >> 8) & 0xFF, max(arr, 1)))
        if r.u32() != 0:
            raise ValueError(f"{name}: struct parameters, which this does not read")
        size = r.u32()
        r.u32()  # partial
        out["cbs"][name] = (size, params)
    for name, index, _ in recs(r.u32(), 3):
        out["bindings"][index] = names[name]
    return out


def variant_parameters(entry):
    """A variant's own parameter table (the blob entry): buffers with their named slots, then the bindings."""
    r = Reader(entry)
    if r.u32() != PARAM_MAGIC:
        raise ValueError("not a parameter table")
    out = {"cbs": {}, "textures": {}, "bindings": {}, "samplers": {}}
    for _ in range(r.u32()):
        name = r.str()
        size = r.u32()
        params = []
        for _ in range(r.u32()):
            n = r.str()
            _, rows, cols, _, arr, off = (r.i32() for _ in range(6))
            params.append((n, off, rows, cols, max(arr, 1)))
        if r.u32() != 0:
            raise ValueError(f"{name}: struct parameters, which this does not read")
        if name:
            out["cbs"][name] = (size, params)
    for _ in range(r.u32()):
        name = r.str()
        kind = r.u32()
        if kind == 0:
            index, sampler, packed = r.i32(), r.i32(), r.i32()
            out["textures"][index] = (name, sampler, packed >> 1)
        elif kind == 1:
            index, _ = r.i32(), r.i32()
            out["bindings"][index] = name
        elif kind == 4:
            index, state = r.i32(), r.i32()
            out["samplers"][index] = state
        else:
            raise ValueError(f"binding kind {kind} ({name}), which this does not read")
    if r.p != len(entry):
        raise ValueError(f"parameter table: {len(entry) - r.p} bytes left over")
    return out


def merge(common, variant):
    out = {"textures": {**common["textures"], **variant["textures"]},
           "bindings": {**common["bindings"], **variant["bindings"]},
           "samplers": variant["samplers"], "cbs": {}}
    for name in set(common["cbs"]) | set(variant["cbs"]):
        size, a = common["cbs"].get(name, (0, []))
        size2, c = variant["cbs"].get(name, (0, []))
        out["cbs"][name] = (max(size, size2), sorted(a + c, key=lambda x: x[1]))
    return out


# --- disassembly ---------------------------------------------------------------------------------------------

def d3d_disassemble(code):
    dll = ctypes.WinDLL(os.path.join(os.environ.get("SystemRoot", "C:/Windows"), "System32", "d3dcompiler_47.dll"))
    out = ctypes.c_void_p()
    hr = dll.D3DDisassemble(ctypes.c_char_p(code), ctypes.c_size_t(len(code)), ctypes.c_uint(0), None, ctypes.byref(out))
    if hr != 0:
        raise OSError(f"D3DDisassemble failed: 0x{hr & 0xFFFFFFFF:08x}")
    vtable = ctypes.cast(out, ctypes.POINTER(ctypes.POINTER(ctypes.c_void_p))).contents
    release = ctypes.WINFUNCTYPE(ctypes.c_ulong, ctypes.c_void_p)(vtable[2])
    pointer = ctypes.WINFUNCTYPE(ctypes.c_void_p, ctypes.c_void_p)(vtable[3])
    size = ctypes.WINFUNCTYPE(ctypes.c_size_t, ctypes.c_void_p)(vtable[4])
    text = ctypes.string_at(pointer(out), size(out)).decode("latin-1").rstrip("\0")
    release(out)
    return text


def dxbc(entry):
    at = entry.find(b"DXBC")
    if at < 0:
        raise ValueError("no DXBC container in the program entry")
    return entry[at:at + u32(entry, at + 24)]


def slot_names(params):
    """cb register -> {byte offset: name} and t register -> name."""
    cbs = {}
    for reg, name in params["bindings"].items():
        size, ps = params["cbs"].get(name, (0, []))
        m = {}
        for n, off, rows, cols, arr in ps:
            for a in range(arr):
                for row in range(rows):
                    for c in range(cols):
                        m[off + a * rows * 16 + row * 16 + c * 4] = (n + (f"[{a}]" if arr > 1 else "") + (f".{row}" if rows > 1 else "")
                                                                     + ("" if cols == 1 else "." + "xyzw"[c]))
        cbs[reg] = (name, m)
    return cbs


def annotate(text, params):
    cbs = slot_names(params)
    textures = params["textures"]

    def names(line):
        found = []
        for reg, idx, sw in re.findall(r"cb(\d+)\[(\d+)\]\.([xyzw]+)", line):
            name, m = cbs.get(int(reg), (f"cb{reg}", {}))
            for c in dict.fromkeys(sw):
                n = m.get(int(idx) * 16 + "xyzw".index(c) * 4, f"{name}+{int(idx) * 16 + 'xyzw'.index(c) * 4}")
                found.append(n)
        for reg in re.findall(r"\bt(\d+)\b", line):
            if int(reg) in textures:
                found.append(textures[int(reg)][0])
        return list(dict.fromkeys(found))

    out = []
    for line in text.splitlines():
        if line.startswith("//") or not line.strip():
            out.append(line)
            continue
        n = names(line)
        out.append(line + ("  // " + ", ".join(n) if n else ""))
    return "\n".join(out) + "\n"


# --- the material --------------------------------------------------------------------------------------------

def read_material(b):
    r = Reader(b)
    name = r.str()
    shader = r.pptr()[1]
    valid = [r.str() for _ in range(r.u32())]
    invalid = [r.str() for _ in range(r.u32())]
    r.u32()  # lightmap flags
    r.p += 4  # instancing, double-sided GI
    r.i32()  # render queue
    for _ in range(r.u32()):
        r.str(), r.str()
    for _ in range(r.u32()):
        r.str()
    textures = {}
    for _ in range(r.u32()):
        n = r.str()
        path = r.pptr()[1]
        textures[n] = (path, (r.f32(), r.f32()), (r.f32(), r.f32()))
    values = {}
    for _ in range(r.u32()):
        n = r.str()
        values[n] = (r.i32(),)
    for _ in range(r.u32()):
        n = r.str()
        values[n] = (r.f32(),)
    for _ in range(r.u32()):
        n = r.str()
        values[n] = tuple(r.f32() for _ in range(4))
    return name, shader, valid, invalid, textures, values


TEXTURE_FORMATS = {1: "Alpha8", 3: "RGB24", 4: "RGBA32", 5: "ARGB32", 10: "DXT1", 12: "DXT5", 17: "RGBAHalf", 20: "RGBAFloat",
                   24: "BC6H", 25: "BC7", 26: "BC4", 27: "BC5", 63: "R8"}


def read_texture(b):
    """A Texture2D's name, size and format (the layout tools/game-sky.ts reads)."""
    r = Reader(b)
    name = r.str()
    w, h, _, _, fmt_ = (i32(b, r.p + k) for k in (4, 8, 12, 16, 20))
    return name, w, h, TEXTURE_FORMATS.get(fmt_, f"format {fmt_}")


def fmt(v):
    return "(" + ", ".join(f"{x:.4g}" for x in v) + ")" if len(v) > 1 else f"{v[0]:.4g}"


# --- the flow's textures, measured (Q9 P5): numbers only, never the texels -------------------------------------

#: The textures the flow carries that ours stand in for (`src/render3d/waterTextures.ts`), and the tiles one repeat
#: covers (`_MainTexTiling` 0.06: a repeat every 1 / 0.06 tiles).
FLOW_TEXTURES = ("PhysicalWaterAlbedo", "Water_N")
REPEAT_TILES = 1 / 0.06
#: Badwater's (Q9 P9): its pattern, carried by the flow at the albedo's coordinates (x: the base colour's lerp from
#: `_Base_Contamination_Color_A` to `_B`; y: the emissive detail's pattern; z: the sources' emission pattern), the still
#: detail albedo it is overlaid with (P6, `_DetailAlbedoTexTiling` 0.015) and the noise that picks the detail colour
#: between `_Detail_Contamination_Color_A` and `_B` (t10 at (xz + 0.25 T) × 0.2).
BADWATER_TEXTURES = {"WaterContaminationAlbedoEmissionSource": 1 / 0.06, "PhysicalWaterDetailAlbedo": 1 / 0.015, "PerlinNoise3": 1 / 0.2}


def texture_texels(b, data_dir):
    """A BC7 (or R8) Texture2D's top mip as an RGBA array (H, W, 4), read raw (the game renders in Gamma colour space,
    so a texture's stored values are what its shader multiplies): its texels from the stream file beside the assets
    (`resources.assets.resS`), decoded by Pillow's BCn decoder (format 7); an R8 texture's one channel in all four."""
    import numpy as np
    from PIL import Image
    r = Reader(b)
    name = r.str()
    w, h, size, _, fmt_ = (i32(b, r.p + k) for k in (4, 8, 12, 16, 20))
    kind = TEXTURE_FORMATS.get(fmt_)
    if kind not in ("BC7", "R8"):
        raise ValueError(f"{name}: format {fmt_}, not BC7 or R8")
    tag = b"resources.assets.resS"
    at = b.index(tag)
    offset = struct.unpack_from("<Q", b, at - 16)[0]
    top = max(1, (w + 3) // 4) * max(1, (h + 3) // 4) * 16 if kind == "BC7" else w * h
    with open(os.path.join(data_dir, "resources.assets.resS"), "rb") as f:
        f.seek(offset)
        raw = f.read(top)
    if len(raw) != top or size < top:
        raise ValueError(f"{name}: {len(raw)} of {top} bytes read")
    if kind == "R8":
        v = np.frombuffer(raw, dtype=np.uint8).reshape(h, w).astype(np.float64)
        return name, np.repeat(v[..., None], 4, axis=2)
    return name, np.asarray(Image.frombytes("RGBA", (w, h), raw, "bcn", 7), dtype=np.float64)


def feature_scale(field, repeat=REPEAT_TILES):
    """The dominant feature scale of a tiling field (H, W), in tiles: the wavelength at the radially averaged power
    spectrum's centroid (power-weighted mean of the spatial frequency, the mean removed), and the autocorrelation's
    half-width (the shift, averaged over four directions, at which it first falls to a half)."""
    import numpy as np
    f = field - field.mean()
    n = f.shape[0]
    p = np.abs(np.fft.fft2(f)) ** 2
    ky = np.fft.fftfreq(n)[:, None] * n
    kx = np.fft.fftfreq(f.shape[1])[None, :] * f.shape[1]
    k = np.sqrt(kx * kx + ky * ky)
    keep = k > 0
    centroid = (p[keep] * k[keep]).sum() / p[keep].sum()
    ac = np.real(np.fft.ifft2(p))
    ac /= ac[0, 0]
    half = []
    for dy, dx in ((0, 1), (1, 0), (1, 1), (1, -1)):
        step = (dy * dy + dx * dx) ** 0.5
        for s in range(1, n // 2):
            if ac[(dy * s) % n, (dx * s) % f.shape[1]] < 0.5:
                half.append(s * step)
                break
    return repeat / centroid, repeat * float(np.mean(half)) / n


def measure_flow_textures(read, objects, data_dir, preview=None):
    """Prints what `src/render3d/waterTextures.ts` generates its own textures to: each flow texture's mean, spread
    (standard deviation) and 5th/50th/95th percentiles per channel on display values (0-255), and its dominant
    feature scale in tiles; for the normal map the unpacked normal's slopes (x × a, y; × 2 − 1, as the shader unpacks
    it, ps 438-446). Numbers only: no texel leaves this function."""
    import numpy as np
    textures = {}
    for o in objects:
        if o[3] != 28:
            continue
        b = read(o)
        try:
            name = Reader(b).str()
        except (ValueError, UnicodeDecodeError, struct.error):
            continue
        if (name in FLOW_TEXTURES or name in BADWATER_TEXTURES or name == "DepthGradients") and name not in textures:
            textures[name] = b
    # the depth ramp P4 multiplies clean water's colour by (R × 2) and P9 the contaminated colour by (G), sampled at
    # (depth / `_MaxDepth` 5, 0.5) with bilinear filtering: its values at depths in levels, raw (0-255)
    _, t = texture_texels(textures["DepthGradients"], data_dir)
    row = t[t.shape[0] // 2]
    print("\nDepthGradients at (depth / 5, 0.5), raw:")
    for d in (0, 0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5):
        x = min(max(d / 5 * row.shape[0] - 0.5, 0), row.shape[0] - 1)
        i = min(int(x), row.shape[0] - 2)
        v = row[i] + (row[i + 1] - row[i]) * (x - i)
        print(f"  {d:>4} levels: R {v[0]:6.1f}  G {v[1]:6.1f}")
    for name in FLOW_TEXTURES:
        if name not in textures:
            raise ValueError(f"{name}: not found")
        _, t = texture_texels(textures[name], data_dir)
        h, w = t.shape[:2]
        print(f"\n{name}: {w}x{h} BC7, one repeat {REPEAT_TILES:.2f} tiles ({w / REPEAT_TILES:.0f} texels a tile)")
        q = lambda v: "/".join(f"{x:.1f}" for x in np.percentile(v, (5, 50, 95)))
        if name == "Water_N":
            nx = (t[..., 0] * t[..., 3] / 255) / 255 * 2 - 1
            ny = t[..., 1] / 255 * 2 - 1
            for label, v in (("x", nx), ("y", ny)):
                print(f"  slope {label}: mean {v.mean():+.4f}, spread {v.std():.4f}, 5/50/95% {'/'.join(f'{x:+.3f}' for x in np.percentile(v, (5, 50, 95)))}")
            s = np.sqrt(nx * nx + ny * ny)
            print(f"  |xy| mean {s.mean():.4f}, 95% {np.percentile(s, 95):.4f}")
            for label, v in (("x", nx), ("y", ny)):
                c, a = feature_scale(v)
                print(f"  slope {label} feature scale: spectrum centroid {c:.3f} tiles, autocorrelation half-width {a:.3f} tiles")
            print(f"  channels r/b/a: mean {t[..., 0].mean():.1f}/{t[..., 2].mean():.1f}/{t[..., 3].mean():.1f}")
        else:
            for k, ch in enumerate("rgb"):
                print(f"  {ch}: mean {t[..., k].mean():.1f}, spread {t[..., k].std():.1f}, 5/50/95% {q(t[..., k])}")
            lum = t[..., :3] @ np.array([0.2126, 0.7152, 0.0722])
            print(f"  luma: mean {lum.mean():.1f}, spread {lum.std():.1f}, 5/50/95% {q(lum)}; a mean {t[..., 3].mean():.1f}")
            print(f"  r-g, r-b correlation {np.corrcoef(t[..., 0].ravel(), t[..., 1].ravel())[0, 1]:.3f}, "
                  f"{np.corrcoef(t[..., 0].ravel(), t[..., 2].ravel())[0, 1]:.3f}")
            c, a = feature_scale(lum)
            print(f"  luma feature scale: spectrum centroid {c:.3f} tiles, autocorrelation half-width {a:.3f} tiles")
            # its colour's principal components: ours draws two fields along the first two
            rgb = t[..., :3].reshape(-1, 3)
            cov = np.cov(rgb.T)
            vals, vecs = np.linalg.eigh(cov)
            print(f"  covariance: {' '.join(f'{v:.1f}' for v in cov.ravel())}")
            for k in (2, 1, 0):
                e = vecs[:, k] * (1 if vecs[:, k].sum() >= 0 else -1)
                score = (rgb - rgb.mean(0)) @ e
                c, a = feature_scale(score.reshape(h, w))
                print(f"  component {3 - k}: spread {vals[k] ** 0.5:.2f} along ({', '.join(f'{x:+.3f}' for x in e)}), "
                      f"5/50/95% {'/'.join(f'{x:+.1f}' for x in np.percentile(score, (5, 50, 95)))}, "
                      f"spectrum centroid {c:.3f} tiles, autocorrelation half-width {a:.3f} tiles")
    measure_badwater_textures(textures, data_dir, preview)


def measure_badwater_textures(textures, data_dir, preview=None):
    """Prints what `src/render3d/waterTextures.ts` generates badwater's pattern to (Q9 P9): per channel of the game's
    `WaterContaminationAlbedoEmissionSource` its mean, spread, percentiles, a ten-bin histogram (the share of texels in
    each tenth of 0-255), its feature scale in tiles and the channels' correlations; the detail albedo's and the noise's
    means and spreads (the overlay and the detail colour's lerp take only those). Numbers only; `preview` (a folder,
    gitignored) also gets a crop of the pattern for the eye, never committed."""
    import numpy as np
    q = lambda v, ps=(5, 25, 50, 75, 95): "/".join(f"{x:.1f}" for x in np.percentile(v, ps))
    for name, repeat in BADWATER_TEXTURES.items():
        if name not in textures:
            raise ValueError(f"{name}: not found")
        _, t = texture_texels(textures[name], data_dir)
        h, w = t.shape[:2]
        print(f"\n{name}: {w}x{h}, one repeat {repeat:.2f} tiles ({w / repeat:.0f} texels a tile)")
        chans = "rgba" if name == "WaterContaminationAlbedoEmissionSource" else ("rgb" if name == "PhysicalWaterDetailAlbedo" else "r")
        for k, ch in enumerate(chans):
            v = t[..., k]
            hist = np.histogram(v, bins=10, range=(0, 256))[0] / v.size
            c, a = feature_scale(v, repeat)
            print(f"  {ch}: mean {v.mean():.1f}, spread {v.std():.1f}, 5/25/50/75/95% {q(v)}")
            print(f"     histogram by tenths {' '.join(f'{x:.3f}' for x in hist)}")
            print(f"     feature scale: spectrum centroid {c:.3f} tiles, autocorrelation half-width {a:.3f} tiles")
        if name == "WaterContaminationAlbedoEmissionSource":
            cc = np.corrcoef(t[..., :4].reshape(-1, 4).T)
            print(f"  correlations r-g {cc[0, 1]:.3f}, r-b {cc[0, 2]:.3f}, g-b {cc[1, 2]:.3f}, r-a {cc[0, 3]:.3f}")
            g = t[..., 1]
            pts = (1, 5, 10, 25, 50, 60, 65, 70, 75, 80, 85, 90, 95, 97, 98, 99)
            for k, ch in enumerate("rg"):
                print(f"  {ch} percentiles {'/'.join(map(str, pts))}: {'/'.join(f'{x:.0f}' for x in np.percentile(t[..., k], pts))}")
            print(f"  g at 0: {(g == 0).mean():.3f} of the texels")
            for th in (32, 64, 128, 192):
                print(f"  g over {th}: {(g > th).mean():.3f} of the texels")
            # the emission's network: the dark cells its bright lines close (g under 32, joined across the wrap) and
            # their size; and how much of each channel's spread is broad (left after a blur over a quarter of a tile)
            from scipy import ndimage
            lab, n = ndimage.label(np.tile(g < 32, (2, 2)))
            areas = np.bincount(lab.ravel())[1:]
            # (the plane tiled 2 × 2, so a cell across the wrap is whole once; cells of 0.02 square tiles or more, the
            # specks inside them left out)
            cells = areas / (w / repeat) ** 2
            cells = cells[cells >= 0.02]
            print(f"  g's dark cells: {len(cells) / 4:.0f} a repeat, mean area {cells.mean():.3f} square tiles "
                  f"(a {2 * (cells.mean() / np.pi) ** 0.5:.2f}-tile disc), median {np.median(cells):.3f}")
            for k, ch in enumerate("rg"):
                broad = ndimage.gaussian_filter(t[..., k], sigma=0.25 * w / repeat, mode="wrap")
                print(f"  {ch} after a blur over 0.25 tile: spread {broad.std():.1f} ({broad.std() / t[..., k].std():.2f} of it)")
            if preview:
                from PIL import Image
                os.makedirs(preview, exist_ok=True)
                for k, ch in enumerate("rgb"):
                    Image.fromarray(t[:512, :512, k].astype(np.uint8)).save(os.path.join(preview, f"badwater-pattern-{ch}-crop.png"))


#: The ground's contamination pattern (TerrainURP's `_ContaminationTexture`, the `Grass` material's "SoilContamination",
#: D154, D334): sampled at world xz × `_ProjectionUVScale` (1 / `WorldTiling.HorizontalTileSize` 16) × the material's
#: `_Contamination_Scale` 4, so one repeat is 4 tiles.
SOIL_TEXTURE = ("SoilContamination", 4.0)


def measure_soil_texture(read, objects, data_dir, preview=None):
    """Prints what `src/render3d/soilTexture.ts` generates the ground's contamination pattern to: the game's
    `SoilContamination` texture's alpha (the share of the pattern's colour laid over the ground, TerrainURP:
    lerp(albedo, rgb × `_Contamination_Color`, weight × a)) by its mean, percentiles and histogram; its colour where the
    alpha is high and the alpha-weighted mean (what the ground takes on average); the alpha's feature scale; and the
    network's shape: the share of texels over a half, the width of its strokes (twice the distance to the edge, at the
    strokes' middle) and the size of the cells they close. Numbers only; `preview` (a folder, gitignored) also gets a
    crop for the eye, never committed."""
    import numpy as np
    from scipy import ndimage
    name, repeat = SOIL_TEXTURE
    t = None
    for o in objects:
        if o[3] != 28:
            continue
        b = read(o)
        try:
            if Reader(b).str() == name:
                _, t = texture_texels(b, data_dir)
                break
        except (ValueError, UnicodeDecodeError, struct.error):
            continue
    if t is None:
        raise ValueError(f"{name}: not found")
    h, w = t.shape[:2]
    tpt = w / repeat
    q = lambda v, ps=(5, 25, 50, 75, 95): "/".join(f"{x:.1f}" for x in np.percentile(v, ps))
    a = t[..., 3]
    print(f"\n{name}: {w}x{h}, one repeat {repeat:.2f} tiles ({tpt:.0f} texels a tile)")
    print(f"  a: mean {a.mean():.1f}, spread {a.std():.1f}, 5/25/50/75/95% {q(a)}")
    pts = (50, 60, 70, 75, 80, 85, 90, 95, 97, 99)
    print(f"  a percentiles {'/'.join(map(str, pts))}: {'/'.join(f'{x:.0f}' for x in np.percentile(a, pts))}")
    print(f"     histogram by tenths {' '.join(f'{x:.3f}' for x in np.histogram(a, bins=10, range=(0, 256))[0] / a.size)}")
    for th in (8, 32, 64, 128, 192, 240):
        print(f"  a over {th}: {(a > th).mean():.3f} of the texels")
    wa = a / 255
    for k, ch in enumerate("rgb"):
        v = t[..., k]
        print(f"  {ch}: mean {v.mean():.1f}; alpha-weighted mean {(v * wa).sum() / wa.sum():.1f}; where a > 128 "
              f"{v[a > 128].mean():.1f} (spread {v[a > 128].std():.1f}); where a < 8 {v[a < 8].mean():.1f}")
    c, ah = feature_scale(a, repeat)
    print(f"  a feature scale: spectrum centroid {c:.3f} tiles, autocorrelation half-width {ah:.3f} tiles")
    m = np.tile(a > 128, (2, 2))
    dist = ndimage.distance_transform_edt(m)
    ridge = (dist == ndimage.maximum_filter(dist, size=3)) & m
    widths = 2 * dist[ridge] / tpt
    print(f"  strokes (a over 128): width at their middle 5/25/50/75/95% {q(widths)} tiles")
    lab, n = ndimage.label(~m)
    cells = np.bincount(lab.ravel())[1:] / tpt ** 2
    cells = cells[cells >= 0.002]
    print(f"  cells they close: {len(cells) / 4:.0f} a repeat, mean area {cells.mean():.3f} square tiles, "
          f"median {np.median(cells):.3f}, 5/95% {np.percentile(cells, 5):.3f}/{np.percentile(cells, 95):.3f}")
    lab2, n2 = ndimage.label(m)
    print(f"  strokes' pieces: {n2 / 4:.0f} a repeat (one joined network if 1)")
    if preview:
        from PIL import Image
        os.makedirs(preview, exist_ok=True)
        Image.fromarray(a.astype(np.uint8)).save(os.path.join(preview, "soil-contamination-a.png"))
        Image.fromarray(t[..., :3].astype(np.uint8)).save(os.path.join(preview, "soil-contamination-rgb.png"))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--game", default="C:/Program Files (x86)/Steam/steamapps/common/Timberborn")
    ap.add_argument("--keywords", default=DEFAULT_KEYWORDS)
    ap.add_argument("--shader", action="append", help="another Shader Graph to read (its full name), in place of the water's")
    ap.add_argument("--out", default=os.path.join(ROOT, "investigation", "water-shader", "local"))
    ap.add_argument("--textures", action="store_true", help="measure the flow's and badwater's textures (Q9 P5, P9) and stop")
    ap.add_argument("--soil", action="store_true", help="measure the ground's contamination pattern (TerrainURP, D154) and stop")
    ap.add_argument("--preview", action="store_true", help="with --textures or --soil: also write crops of the pattern to --out (gitignored)")
    args = ap.parse_args()
    want = set(k for k in args.keywords.split(",") if k)
    data = os.path.join(args.game, "Timberborn_Data")
    with open(os.path.join(data, "StreamingAssets", "Version.txt"), encoding="utf-8") as f:
        version = f.read().strip()
    assets = os.path.join(data, "resources.assets")
    unity, objects = read_objects(assets)
    os.makedirs(args.out, exist_ok=True)
    print(f"Timberborn {version} (Unity {unity}), {assets}")
    print(f"variant: {', '.join(sorted(want))}")
    with open(assets, "rb") as f:
        def read(o):
            f.seek(o[1])
            return f.read(o[2])

        by_path = {o[0]: o for o in objects}
        if args.soil:
            measure_soil_texture(read, objects, data, args.out if args.preview else None)
            return 0
        if args.textures:
            measure_flow_textures(read, objects, data, args.out if args.preview else None)
            return 0
        materials = []
        for o in objects:
            if o[3] == 21:
                try:
                    materials.append(read_material(read(o)))
                except (ValueError, UnicodeDecodeError, struct.error):
                    pass
        for shader_name in args.shader or SHADERS:
            tag = struct.pack("<I", len(shader_name)) + shader_name.encode()
            found = [(o, b) for o in objects if o[3] == 48 for b in [read(o)] if tag in b]
            if len(found) != 1:
                raise ValueError(f"{shader_name}: {len(found)} shader objects")
            (path_id, _, _, _), b = found[0]
            form_end = b.index(tag)
            keywords = None
            for anchor in ["_CALCULATE_OUTFLOWS", "_MAIN_LIGHT_SHADOWS_CASCADE", "FOG_EXP", *sorted(want)]:
                try:
                    keywords = string_vector_with(b, anchor, form_end)
                    break
                except ValueError:
                    continue
            if keywords is None:
                raise ValueError(f"{shader_name}: its keyword names not found")
            platforms, offsets, compressed, decompressed, blob = find_blob_tables(b, form_end)
            k = platforms.index(D3D11)
            segments = [lz4_block(blob[o:o + c], d) for o, c, d in zip(offsets[k], compressed[k], decompressed[k])]
            table = segments[0]
            entries = [struct.unpack_from("<III", table, 4 + 12 * i) for i in range(u32(table, 0))]
            entry = lambda i: segments[entries[i][2]][entries[i][0]:entries[i][0] + entries[i][1]]
            maps = name_maps(b, form_end)
            forward = [m for m in maps if m[3] == "ForwardLit"]
            if len(forward) != 1:
                raise ValueError(f"{shader_name}: {len(forward)} ForwardLit passes")
            start, after_map, names, _ = forward[0]
            stop = min([m[0] for m in maps if m[0] > start] + [form_end])
            short = shader_name.split("_")[-1].lower() if shader_name in SHADERS else re.sub(r"[^a-z0-9]+", "-", shader_name.split("/")[-1].lower())
            print(f"\n== {shader_name} (pathID {path_id}): {len(entries)} blob entries, "
                  f"{len(keywords)} keywords, ForwardLit's names at {start}")
            p = after_map
            stages = []
            while p < stop:
                r = try_program(b, p, len(entries), len(keywords))
                if r:
                    stages.append((p, r[0], r[1]))
                    p = r[1]
                else:
                    p += 4
            for _, variants, common_at in stages:
                stage = "vs" if variants[0][2] in (15, 16) else "ps"
                chosen = [v for v in variants if {keywords[x] for x in v[1]} == want & {keywords[x] for v2 in variants for x in v2[1]}]
                if len(chosen) != 1:
                    sets = sorted({" ".join(sorted(keywords[x] for x in v[1])) for v in variants})
                    raise ValueError(f"{shader_name} {stage}: {len(chosen)} variants match {sorted(want)}; its sets:\n  " + "\n  ".join(sets))
                program, kw, gpu, param_entry = chosen[0]
                params = merge(common_parameters(b, common_at, names), variant_parameters(entry(param_entry)))
                text = annotate(d3d_disassemble(dxbc(entry(program))), params)
                path = os.path.join(args.out, f"{short}-forward-{stage}.asm")
                with open(path, "w", encoding="utf-8") as out:
                    out.write(f"// Timberborn {version}: {shader_name}, ForwardLit, {GPU_TYPES[gpu]}, "
                              f"blob entry {program}, keywords {' '.join(keywords[x] for x in kw)}\n")
                    for reg, cb in sorted(params["bindings"].items()):
                        out.write(f"// cb{reg} = {cb}\n")
                    for reg, (n, s, dim) in sorted(params["textures"].items()):
                        out.write(f"// t{reg} = {n}" + (f" (sampler s{s})" if s >= 0 else "") + "\n")
                    for reg, state in sorted(params["samplers"].items()):
                        out.write(f"// s{reg} = inline sampler, state 0x{state:x}\n")
                    out.write(text)
                print(f"\n{stage}: {len(variants)} variants; entry {program} -> {os.path.relpath(path, ROOT)}")
                material = [m for m in materials if m[1] == path_id]
                values = material[0][5] if material else {}
                if material and stage == "vs":
                    for m in material:
                        print(f"material {m[0]}: keywords {m[2]}")
                if len(material) > 1 and stage == "ps":
                    for m in material[1:]:
                        print(f"material {m[0]}'s values: " + ", ".join(f"{n} {fmt(v)}" for n, v in sorted(m[5].items())))
                reg = [r for r, n in params["bindings"].items() if n == "UnityPerMaterial"]
                if reg:
                    size, ps = params["cbs"]["UnityPerMaterial"]
                    print(f"UnityPerMaterial = cb{reg[0]} ({size} bytes), the slots this program reads, the material's values:")
                    for n, off, rows, cols, arr in ps:
                        v = values.get(n)
                        slot = f"cb{reg[0]}[{off // 16}].{'xyzw'[(off % 16) // 4:(off % 16) // 4 + cols]}"
                        print(f"  {slot:<13} {n:<36} {fmt(v[:cols]) if v else '(not saved)'}")
                print("textures:")
                for t, (n, s, _) in sorted(params["textures"].items()):
                    m = material[0][4].get(n) if material else None
                    extra = "set by the game or URP"
                    if m and m[0] in by_path and by_path[m[0]][3] == 28:
                        tname, w, h, tf = read_texture(read(by_path[m[0]]))
                        extra = f'"{tname}" (pathID {m[0]}), {w}x{h} {tf}'
                    print(f"  t{t:<3} {n:<36} {extra}")


if __name__ == "__main__":
    sys.exit(main())
