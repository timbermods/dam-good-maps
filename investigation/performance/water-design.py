"""A small schematic of a design decision, not a product capture or measured result."""
from pathlib import Path
import math
from PIL import Image, ImageDraw

frames = []
W, H = 820, 330
for frame in range(96):
    t = frame / 95
    # Rising bank, then a cut; identical final terrain and settled water on both sides.
    motion = math.sin(math.pi * t) ** 2
    ground = [3, 3 + 2 * motion, 2 - 2 * motion, 2, 3, 3]
    image = Image.new('RGB', (W, H), '#152224')
    draw = ImageDraw.Draw(image)
    draw.text((15, 9), 'DESIGN PROPOSAL: schematic, not measured product footage', fill='#f0eada')
    for offset, follow, title in [(0, False, 'A: retain the old water plane'), (410, True, 'B: visual bank contact while land moves')]:
        draw.text((offset + 15, 38), title, fill='#f0eada')
        left, unit, bottom = offset + 22, 59, 280
        # Continuous proposed visual plane/clipping. Nothing changes the solver or export.
        old_plane = 4
        surface = [max(0, old_plane + (g - initial) * 0.55) if follow else old_plane for g, initial in zip(ground, [3, 3, 2, 2, 3, 3])]
        for k, g in enumerate(ground):
            x = left + k * unit
            z = bottom - g * 31
            draw.rectangle((x, z, x + unit, bottom), fill='#89734a')
            draw.line((x, z, x + unit, z), fill='#bdb47c', width=3)
            top = bottom - surface[k] * 31
            if follow:
                top2 = bottom - surface[min(k + 1, len(ground) - 1)] * 31
                if min(top, top2) < z - 3:
                    draw.polygon([(x, min(top, z - 3)), (x + unit, min(top2, z - 3)),
                                  (x + unit, z - 3), (x, z - 3)], fill='#287d99')
                draw.line((x, min(top, z - 3), x + unit, min(top2, z - 3)), fill='#83d3e5', width=3)
            elif top < z - 3:
                draw.rectangle((x, top, x + unit - 1, z - 3), fill='#287d99')
            elif not follow:
                draw.line((x, top, x + unit, top), fill='#83d3e5', width=3)
            if not follow and top < z:
                draw.line((x, top, x + unit, top), fill='#83d3e5', width=3)
        draw.text((offset + 15, 304), 'Same final terrain / water / objects. Choice B needs adoption approval.', fill='#cbd5cf')
    frames.append(image)
path = Path(__file__).with_name('water-design.gif')
frames[0].save(path, save_all=True, append_images=frames[1:], duration=45, loop=0, optimize=True, disposal=2)
print(path, path.stat().st_size, 'bytes')
