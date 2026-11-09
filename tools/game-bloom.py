"""The game's bloom (D497), read from its own files, read-only, and measured on frames.

The game's post chain is the Volume profile of its `Rendering/Volume` prefab (decompiled `Timberborn.Rendering`
`PostprocessingService`); its Bloom is on at the Medium, High and Ultra presets and off at Low (`GraphicsQualitySystem`
`BloomSetting`; the default preset is High), and `PostprocessingService.UpdateBloom` sets `_bloom.active` from it.
This prints what decides whether that bloom can show:
  - the Bloom component's values (`resources.assets`, the MonoBehaviour named "Bloom" beside "Tonemapping" in the
    profile), laid out as URP 17's `Bloom` serializes them (skipIterations, threshold, intensity, scatter, clamp, tint,
    highQualityFiltering, filter, downscale, maxIterations, dirtTexture, dirtIntensity: each parameter its override flag
    and value; a parameter not overridden takes the default profile's, `globalgamemanagers.assets`);
  - the URP asset's `m_SupportsHDR` and `m_HDRColorBufferPrecision` (`globalgamemanagers.assets`
    "UniversalRenderPipelineAsset", the one asset every quality level uses);
  - the game camera's `m_HDR` (allowHDR) and its UniversalAdditionalCameraData's `m_RenderPostProcessing`
    (`resources.assets`, the GameObject "Camera").
URP turns HDR on when the camera allows it and the asset supports it (`cameraData.isHdrEnabled`), so the scene's colour
target keeps values over 1 for the bloom's prefilter.

With `--frames <glob>` it then runs URP's Gaussian Bloom, at those values, on frames (the probe's in-game shots, or the
editor's captures), as an upper bound of what it adds: each pixel is taken back through the game's post chain
(palette.ts GAME_FINISH: Neutral tonemap, contrast, a grey's curve per channel) to its display value before the grade
(the game renders in Gamma colour space, so its frame holds display values), a saturated channel at the clamp's
ceiling, 2 (the chain reaches 255 from a display value of 1.28); then as the game's compiled programs do (its
`globalgamemanagers.assets` "Hidden/Universal Render Pipeline/Bloom" and "UberPost", read with D3DDisassemble; the
editor's render3d/bloom.ts draws the same): the prefilter on those display values (the clamp, then the soft knee at half
the threshold, `Mathf.GammaToLinearSpace(threshold)` 2.537 taken against display values, so only a pixel brighter than
1.269 feeds it), a half-resolution pyramid of `maxIterations` levels blurred by URP's 9-tap Gaussian, the upsampling's
lerp by the scatter (lerp(0.05, 0.95, scatter)), × the intensity, added to the frame's colour in linear values before
the grade (each pass stores its result's square root and squares what it reads, so what is added is the blurred
prefilter itself; this filters it linearly, a little apart from the game's filtering of the roots).
It prints, per frame, how many pixels pass the knee and how much of the frame the bloom would lift by 1, 2 and 4 luma
(0-255) and by how much at most. Nothing from the game is written anywhere.

    python tools/game-bloom.py [--game "C:/Program Files (x86)/Steam/steamapps/common/Timberborn"]
        [--frames "C:/dgm-probe/shots/*/*-start-start.jpg"] [--top 12]
"""
import argparse
import glob
import importlib.util
import os
import struct

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_spec = importlib.util.spec_from_file_location("gws", os.path.join(ROOT, "tools", "game-water-shader.py"))
gws = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gws)

BLOOM_FIELDS = [("skipIterations", "i"), ("threshold", "f"), ("intensity", "f"), ("scatter", "f"), ("clamp", "f"),
                ("tint", "4f"), ("highQualityFiltering", "b"), ("filter", "i"), ("downscale", "i"), ("maxIterations", "i")]


def objects_by_name(path, class_id=114):
    """name -> (pathID, bytes) of every MonoBehaviour (or other named object) in a serialized file."""
    _, objs = gws.read_objects(path)
    data = open(path, "rb").read()
    out = {}
    for pid, off, size, cid in objs:
        if cid != class_id:
            continue
        b = data[off:off + size]
        try:
            r = gws.Reader(b)
            r.pptr()
            r.p += 4
            r.pptr()
            out.setdefault(r.str(), []).append((pid, b, r.p))
        except (ValueError, UnicodeDecodeError, struct.error):
            pass
    return out, objs, data


def read_bloom(b, p):
    """URP 17 Bloom's serialized fields after the name: VolumeComponent.active, then (override, value) pairs."""
    r = gws.Reader(b, p)
    v = {"active": (r.u32(), True)}
    for name, kind in BLOOM_FIELDS:
        override = r.u32()
        if kind == "f":
            val = r.f32()
        elif kind == "4f":
            val = tuple(round(r.f32(), 4) for _ in range(4))
        else:
            val = r.i32()
        v[name] = (val, bool(override))
    override = r.u32()
    tex = r.pptr()
    r.i32()  # the texture's dimension
    v["dirtTexture"] = ("none" if tex == (0, 0) else tex, bool(override))
    override = r.u32()
    v["dirtIntensity"] = (r.f32(), bool(override))
    return v


def read_settings(game):
    data_dir = os.path.join(game, "Timberborn_Data")
    res, res_objs, res_data = objects_by_name(os.path.join(data_dir, "resources.assets"))
    ggm, _, _ = objects_by_name(os.path.join(data_dir, "globalgamemanagers.assets"))
    if len(res.get("Bloom", [])) != 1 or "Tonemapping" not in res:
        raise ValueError("resources.assets: not one Bloom beside a Tonemapping: not the profile this reads")
    game_bloom = read_bloom(*res["Bloom"][0][1:])
    default_bloom = read_bloom(*ggm["Bloom"][0][1:])
    bloom = {k: (v[0] if v[1] else default_bloom[k][0]) for k, v in game_bloom.items()}
    # the URP asset (URP 17, k_AssetVersion 13): after the name, k_AssetVersion, k_AssetPreviousVersion,
    # m_RendererType, m_RendererData, m_RendererDataList (one), m_DefaultRendererIndex, m_RequireDepthTexture,
    # m_RequireOpaqueTexture, m_OpaqueDownsampling, m_SupportsTerrainHoles, m_SupportsHDR, m_HDRColorBufferPrecision
    _, b, p = ggm["UniversalRenderPipelineAsset"][0]
    r = gws.Reader(b, p)
    version = r.i32()
    r.i32()
    r.i32()
    r.pptr()
    if version != 13 or r.i32() != 1:
        raise ValueError(f"UniversalRenderPipelineAsset version {version}: not the layout this reads")
    r.pptr()
    r.i32()
    depth, opaque, _, _, hdr, precision = (r.u32() for _ in range(6))
    urp = {"m_SupportsHDR": hdr, "m_HDRColorBufferPrecision": ["32 bits (B10G11R11)", "64 bits (R16G16B16A16)"][precision],
           "m_RequireOpaqueTexture": opaque}
    # the camera: Unity 6's Camera, its m_HDR the first of the bools after m_TargetEye
    by_id = {o[0]: o for o in res_objs}
    cams = [o for o in res_objs if o[3] == 20]
    if len(cams) != 1:
        raise ValueError(f"resources.assets: {len(cams)} cameras")
    _, off, size, _ = cams[0]
    cam = res_data[off:off + size]
    hdr_at = 168
    if struct.unpack_from("<i", cam, 164)[0] != 3:  # m_TargetEye: both
        raise ValueError("the camera's layout is not the one this reads")
    go = gws.Reader(res_data, by_id[struct.unpack_from("<q", cam, 4)[0]][1])
    comps = [go.pptr() for _ in range(go.i32())]
    go.u32()
    camera = {"GameObject": go.str(), "m_HDR": cam[hdr_at]}
    for _, pid in comps:
        o = by_id.get(pid)
        if o and o[3] == 114 and o[2] == 180:  # UniversalAdditionalCameraData
            ab = res_data[o[1]:o[1] + o[2]]
            # after the (empty) name: m_RenderShadows, two options, m_CameraType, m_Cameras (0), m_RendererIndex,
            # m_VolumeLayerMask, m_VolumeTrigger, m_VolumeFrameworkUpdateModeOption, m_RenderPostProcessing
            camera["m_RenderPostProcessing"] = struct.unpack_from("<I", ab, 76)[0]
            camera["m_VolumeLayerMask"] = struct.unpack_from("<I", ab, 56)[0]
    return bloom, urp, camera


# --- the post chain (palette.ts GAME_FINISH) and URP's Gaussian bloom ------------------------------------------------

def _curve(x):
    return (x * (0.2 * x + 0.24 * 0.29) + 0.272 * 0.02) / (x * (0.2 * x + 0.29) + 0.272 * 0.3) - 0.02 / 0.3


def _logc(x):
    return np.where(x < 0.011361, 5.301883 * x + 0.092819, 0.244161 * np.log10(np.maximum(5.555556 * x + 0.047996, 1e-6)) + 0.386036)


def _from_logc(x):
    return np.where(x < 5.301883 * 0.011361 + 0.092819, (x - 0.092819) / 5.301883, (10 ** ((x - 0.386036) / 0.244161) - 0.047996) / 5.555556)


def _linear(d):
    """Display values (above 1 too) to linear ones (sRGB's curve)."""
    return np.where(d <= 0.04045, d / 12.92, ((np.maximum(d, 0) + 0.055) / 1.055) ** 2.4)


def _display(c):
    return np.where(c < 0.0031308, c * 12.92, 1.055 * np.maximum(c, 0) ** (1 / 2.4) - 0.055)


def post(lin):
    """Linear values before the grade -> display values after it (a grey's curve, per channel)."""
    white = 1 / _curve(5.3)
    c = np.clip(_curve(lin * 2 ** 0.15 * white) * white, 0, 1)
    c = np.clip(_from_logc((_logc(c) - 0.4135884) * 1.14 + 0.4135884), 0, 1)
    return _display(c)


GAUSS = np.array([0.01621622, 0.05405405, 0.12162162, 0.19459459, 0.22702703, 0.19459459, 0.12162162, 0.05405405, 0.01621622])


def bloom_of(display, s):
    from scipy import ndimage

    def blur(a):
        return ndimage.convolve1d(ndimage.convolve1d(a, GAUSS, axis=0, mode="nearest"), GAUSS, axis=1, mode="nearest")

    def down(a):
        h, w = a.shape[0] // 2 * 2, a.shape[1] // 2 * 2
        a = a[:h, :w]
        return (a[0::2, 0::2] + a[1::2, 0::2] + a[0::2, 1::2] + a[1::2, 1::2]) / 4

    def up(a, shape):
        return ndimage.zoom(a, (shape[0] / a.shape[0], shape[1] / a.shape[1], 1), order=1, mode="nearest")[:shape[0], :shape[1]]

    threshold = s["threshold"]
    knee = threshold / 2
    c = np.minimum(display, s["clamp"])
    bright = c.max(axis=2, keepdims=True)
    soft = np.clip(bright - threshold + knee, 0, 2 * knee)
    soft = soft * soft / (4 * knee + 1e-4)
    mips = [blur(down(c * np.maximum(bright - threshold, soft) / np.maximum(bright, 1e-4)))]
    levels = int(np.clip(np.floor(np.log2(max(mips[0].shape[:2])) - 1), 1, s["maxIterations"]))
    for _ in range(1, levels):
        mips.append(blur(down(mips[-1])))
    scatter = 0.05 + 0.9 * s["scatter"]
    for i in range(levels - 2, -1, -1):
        mips[i] = mips[i] + (up(mips[i + 1], mips[i].shape) - mips[i]) * scatter
    return up(mips[0], display.shape) * s["intensity"]


def measure(paths, s, top):
    from PIL import Image

    # display values before the grade (the game's frame) -> the canvas's codes, and back
    grid = np.linspace(0, s["clamp"], 200001)
    levels = post(_linear(grid)) * 255
    inverse = np.interp(np.arange(256), levels, grid)
    inverse[255] = s["clamp"]
    luma = np.array([0.2126, 0.7152, 0.0722])
    rows = []
    for p in paths:
        a = np.asarray(Image.open(p).convert("RGB"))
        display = inverse[a]
        out = np.clip(np.round(post(_linear(display) + bloom_of(display, s)) * 255), 0, 255)
        d = out @ luma - a.astype(float) @ luma
        knee = (display.max(axis=2) > s["threshold"] / 2).mean()
        rows.append((d.max(), (d >= 1).mean(), (d >= 2).mean(), (d >= 4).mean(), knee, p))
    rows.sort(key=lambda r: -r[0])
    for r in rows[:top]:
        print(f"  +{r[0]:5.1f} at most; lifted >=1: {r[1] * 100:6.3f}%  >=2: {r[2] * 100:6.3f}%  >=4: {r[3] * 100:6.3f}%;"
              f" past the knee {r[4] * 100:6.3f}%  {os.path.basename(r[5])}")
    a = np.array([r[:5] for r in rows])
    print(f"{len(rows)} frames: the most lifted by 2 luma or more {a[:, 2].max() * 100:.3f}% of a frame (median"
          f" {np.median(a[:, 2]) * 100:.3f}%); by 4 or more {a[:, 3].max() * 100:.3f}%; past the knee at most"
          f" {a[:, 4].max() * 100:.3f}%")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--game", default="C:/Program Files (x86)/Steam/steamapps/common/Timberborn")
    ap.add_argument("--frames", help="a glob of frames to measure the bloom on")
    ap.add_argument("--top", type=int, default=12)
    args = ap.parse_args()
    with open(os.path.join(args.game, "Timberborn_Data", "StreamingAssets", "Version.txt")) as f:
        print(f"Timberborn {f.read().strip()}")
    bloom, urp, camera = read_settings(args.game)
    print("Bloom:", ", ".join(f"{k} {round(v, 4) if isinstance(v, float) else v}" for k, v in bloom.items()))
    print("URP asset:", ", ".join(f"{k} {v}" for k, v in urp.items()))
    print("camera:", ", ".join(f"{k} {v}" for k, v in camera.items()))
    # URP: Mathf.GammaToLinearSpace(threshold), which the prefilter then takes against the frame's display values
    th = ((bloom["threshold"] + 0.055) / 1.055) ** 2.4
    s = {"threshold": th, "clamp": bloom["clamp"], "intensity": bloom["intensity"], "scatter": bloom["scatter"],
         "maxIterations": bloom["maxIterations"]}
    grid = np.linspace(0, 2, 200001)
    full = grid[np.argmax(post(_linear(grid)) * 255 >= 254.5)]
    print(f"so: the threshold {th:.3f} against display values before the grade, its soft knee from {th / 2:.3f}"
          f" ({post(_linear(np.array(th / 2))) * 255:.1f} of 255 after the grade, which reaches 255 from a display value of"
          f" {full:.3f}); the clamp at {bloom['clamp']}")
    if args.frames:
        paths = sorted(glob.glob(args.frames, recursive=True))
        if not paths:
            raise SystemExit(f"no frames match {args.frames}")
        measure(paths, s, args.top)


if __name__ == "__main__":
    main()
