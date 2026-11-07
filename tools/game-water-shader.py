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


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--game", default="C:/Program Files (x86)/Steam/steamapps/common/Timberborn")
    ap.add_argument("--keywords", default=DEFAULT_KEYWORDS)
    ap.add_argument("--out", default=os.path.join(ROOT, "investigation", "water-shader", "local"))
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
        materials = []
        for o in objects:
            if o[3] == 21:
                try:
                    materials.append(read_material(read(o)))
                except (ValueError, UnicodeDecodeError, struct.error):
                    pass
        for shader_name in SHADERS:
            tag = struct.pack("<I", len(shader_name)) + shader_name.encode()
            found = [(o, b) for o in objects if o[3] == 48 for b in [read(o)] if tag in b]
            if len(found) != 1:
                raise ValueError(f"{shader_name}: {len(found)} shader objects")
            (path_id, _, _, _), b = found[0]
            form_end = b.index(tag)
            keywords = string_vector_with(b, "_CALCULATE_OUTFLOWS", form_end)
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
            short = shader_name.split("_")[-1].lower()
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
                    raise ValueError(f"{shader_name} {stage}: {len(chosen)} variants match {sorted(want)}")
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
                    print(f"material {material[0][0]}: keywords {material[0][2]}")
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
