"""Render the ignored 128-square batch grids; write one contact sheet under 1 MB."""
from pathlib import Path
from io import BytesIO
from PIL import Image, ImageDraw, ImageFont

folder = Path(__file__).resolve().parent
grids = folder.parent / "local" / "round2-grids"
themes = ["any", "riverValley", "canyon", "highlands", "lakeBasin", "delta", "islands"]
names = ["Any", "River Valley", "Canyon", "Highlands", "Lake Basin", "Delta", "Islands"]
font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 11)
tiles = {}
for theme in themes:
    for seed in range(1, 31):
        data = (grids / f"{theme}-{seed}.grid").read_bytes()
        assert len(data) == 128 * 128 * 2
        heights, water = data[:16384], data[16384:]
        lo, hi = min(heights), max(heights)
        rgb = bytearray(16384 * 3)
        # Same colour/light arithmetic as FirstLook; settled-water mask, north up.
        for y in range(128):
            for x in range(128):
                i = y * 128 + x
                t = (heights[i] - lo) / max(1, hi - lo)
                se = heights[(y - 1) * 128 + x + 1] if y > 0 and x < 127 else heights[i]
                shade = max(-0.25, min(0.25, (heights[i] - se) * 0.08))
                base = [70, 120, 190] if water[i] else [120 + 90*t, 140 + 70*t, 90 + 60*t]
                j = ((127 - y) * 128 + x) * 3
                rgb[j:j+3] = bytes(min(255, int(v * (1+shade) + 0.5)) for v in base)
        tiles[(theme, seed)] = Image.frombytes("RGB", (128, 128), bytes(rgb))

for size in [128, 112, 96, 80]:
    cell, row = size + 8, size + 24
    sheet = Image.new("RGB", (cell * 7 + 8, row * 30 + 38), (28, 34, 29))
    draw = ImageDraw.Draw(sheet)
    draw.text((8, 9), "Generation speed, Round 2 | 128-square maps, seeds 1-30 | settled water | north up", fill="white", font=font)
    for col, (theme, name) in enumerate(zip(themes, names)):
        for seed in range(1, 31):
            x, y = 8 + col*cell, 32 + (seed-1)*row
            draw.text((x, y), f"{name} {seed}", fill="white", font=font)
            tile = tiles[(theme, seed)].resize((size, size), Image.Resampling.NEAREST)
            sheet.paste(tile, (x, y+18))
    out = BytesIO()
    sheet.quantize(colors=128, dither=Image.Dither.NONE).save(out, format="PNG", optimize=True)
    if out.tell() < 1_000_000:
        (folder / "contact-sheet.png").write_bytes(out.getvalue())
        # A partial capture is easier to inspect than vertically compressing all 30 rows.
        sheet.crop((0, 0, sheet.width, row*7+38)).save(grids.parent / "round2-sheet-preview.png")
        print(f"210 labelled maps, {size}px tiles; {out.tell()} bytes")
        break
else:
    raise RuntimeError("Contact sheet exceeds 1 MB")
