"""A contact sheet of the whole Real places gallery (Kyler, 2026-09-25): every place's card picture
(the 3D overview tools/places-thumbs.ts draws), in the gallery's order, each labelled with its title,
landform and size; a quantized PNG under 1 MB for docs/sheets/, and with --html a local page with
both pictures of every place, for Kyler to say which should go.

    python tools/places-sheet.py docs/sheets/real-places.png "Real places, second round"
    python tools/places-sheet.py docs/sheets/real-places.png "Real places, second round" --html C:/dgm-workshop/places
"""
import html
import json
import os
import shutil
import sys

from PIL import Image, ImageDraw, ImageFont

PLACES = "public/real-places"


def font(size, bold=False):
    for name in (("arialbd.ttf", "segoeuib.ttf", "DejaVuSans-Bold.ttf") if bold else ("arial.ttf", "segoeui.ttf", "DejaVuSans.ttf")):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def fit(draw, text, f, width):
    while draw.textlength(text, font=f) > width and len(text) > 3:
        text = text[:-2].rstrip() + "…"
    return text


def sheet(places, tile, cols, title):
    label = 30
    gap = 6
    head = 40
    rows = (len(places) + cols - 1) // cols
    img = Image.new("RGB", (gap + cols * (tile + gap), head + rows * (tile + label + gap)), (245, 240, 230))
    d = ImageDraw.Draw(img)
    d.text((gap, 10), title, fill=(40, 40, 40), font=font(18, True))
    small = font(11, True)
    tiny = font(10)
    for k, p in enumerate(places):
        x = gap + (k % cols) * (tile + gap)
        y = head + (k // cols) * (tile + label + gap)
        pic = Image.open(os.path.join(PLACES, p["image"])).convert("RGB").resize((tile, tile), Image.LANCZOS)
        img.paste(pic, (x, y))
        d.text((x, y + tile + 2), fit(d, f"{k + 1}. {p['name']}", small, tile), fill=(20, 20, 20), font=small)
        d.text((x, y + tile + 16), fit(d, f"{p['familyName']} · {p['size']}²", tiny, tile), fill=(90, 90, 90), font=tiny)
    return img


def main():
    args = [a for a in sys.argv[1:]]
    html_dir = None
    if "--html" in args:
        i = args.index("--html")
        html_dir = args[i + 1]
        del args[i : i + 2]
    dst, title = args[0], args[1] if len(args) > 1 else "Real places"
    with open(os.path.join(PLACES, "index.json"), encoding="utf-8") as f:
        index = json.load(f)
    places = index["places"]
    # the largest tiles that keep the PNG under 1 MB
    for tile, cols in ((128, 12), (112, 13), (96, 15), (80, 18)):
        img = sheet(places, tile, cols, f"{title}: {len(places)} places, 3D overviews in the gallery's order")
        q = img.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        q.save(dst, optimize=True)
        if os.path.getsize(dst) < 1_000_000:
            break
    print(f"{dst}: {len(places)} places, {tile} px tiles, {os.path.getsize(dst) // 1024} KB")

    if html_dir:
        os.makedirs(os.path.join(html_dir, "sheet"), exist_ok=True)
        cells = []
        for k, p in enumerate(places):
            for key in ("image", "topImage"):
                shutil.copyfile(os.path.join(PLACES, p[key]), os.path.join(html_dir, "sheet", os.path.basename(p[key])))
            cells.append(
                f'<figure><div class="pics"><img src="sheet/{os.path.basename(p["image"])}" alt="" loading="lazy">'
                f'<img src="sheet/{os.path.basename(p["topImage"])}" alt="" loading="lazy"></div>'
                f"<figcaption><strong>{k + 1}. {html.escape(p['name'])}</strong><br>{html.escape(p['familyName'])} · {p['size']}×{p['size']} · {p['metres']} m per tile"
                f"<br><span>{html.escape(p['surveyName'])}</span></figcaption></figure>"
            )
        page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Real places: the whole gallery</title>
<style>body{{font:14px/1.45 system-ui,sans-serif;margin:24px;background:#f4f1ea;color:#222}}h1{{font-size:1.4rem}}p{{max-width:75ch}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px}}figure{{margin:0;background:#fffaf0;border:1px solid #d8cfbd;border-radius:8px;overflow:hidden}}
.pics{{display:grid;grid-template-columns:1fr 1fr;gap:2px;background:#d8cfbd}}.pics img{{display:block;width:100%;aspect-ratio:1}}figcaption{{padding:8px 10px}}figcaption span{{color:#777;font-size:12px}}</style></head>
<body><h1>Real places: the whole gallery</h1>
<p>{len(places)} places in the gallery's order, each as its card shows it: the 3D overview, and the map from above turned to match. Say which should go by number or title.</p>
<div class="grid">{"".join(cells)}</div></body></html>
"""
        with open(os.path.join(html_dir, "sheet.html"), "w", encoding="utf-8") as f:
            f.write(page)
        print(f"{os.path.join(html_dir, 'sheet.html')}: {len(places)} places")


if __name__ == "__main__":
    main()
