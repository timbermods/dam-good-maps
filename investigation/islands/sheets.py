"""Small committed sheets; full-resolution seed pictures stay in local/."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 12)
title_font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 20)
for mode in ['before', 'after']:
    sheet = Image.new('RGB', (1244, 1008), '#faf8f2')
    draw = ImageDraw.Draw(sheet)
    draw.text((8, 5), f'Islands — {mode} | seeds 1–20 | yellow = start', font=title_font, fill='#232d30')
    for block, size in enumerate([96, 128, 256]):
        y0 = 36 + block * 324
        draw.text((8, y0), f'{size} × {size}', font=title_font, fill='#232d30')
        for seed in range(1, 21):
            x = 4 + ((seed-1) % 10) * 124
            y = y0 + 25 + ((seed-1) // 10) * 148
            im = Image.open(HERE / 'local' / mode / f'{size}-{seed}.png').convert('RGB')
            im = im.resize((120, 120), Image.Resampling.BILINEAR)
            sheet.paste(im, (x, y+16))
            draw.text((x+2,y), f'Islands {seed}', font=font, fill='#364441')
    dest = HERE / f'{mode}.png'
    sheet.quantize(colors=128, dither=Image.Dither.NONE).save(dest, optimize=True)
    assert dest.stat().st_size < 1_000_000
    print(f'{dest.name}: {dest.stat().st_size} bytes')
