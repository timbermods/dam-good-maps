"""The Real places review sheet (Kyler, 2026-09-26): every place in the gallery, numbered in the
gallery's order, with its title and both card pictures (the 3D overview and the map from above), as
JPEG pages Kyler can read on a phone and answer with the numbers to drop. Under each title: the
place's notes (D245: what would sink a player who goes straight to the game), and the groves grown
for the starting-logs floor with their dead trees apart (pending #82). The places no longer in the
gallery come after the numbered grid, with the reason each went, so the numbers are only the
gallery's.

    python tools/places-review.py docs/sheets/real-places-review
    python tools/places-review.py docs/sheets/real-places-review --changed-since 04e90ef
    python tools/places-review.py <dir> --per-page 30

--changed-since <git ref> marks each card whose place changed since that commit: "new land" (made
from another survey row), "new heights" (the same land, another height mapping), "new water" (the
same row, its sources or start changed), "more trees" (the same data, a different map: the
starting-logs floor's groves), "was <title>" (renamed). Each page stays under 800 KB (the JPEG
quality is lowered until it does). Run it again after Kyler's drops, and after the pictures change
(npm run places:thumbs).
"""
import gzip
import io
import json
import math
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

PLACES = "public/real-places"
SELECTION = "tools/places/selection.json"
LIMIT = 800_000

# the page, in pixels: two columns, sized so a phone shows a page at about its own width
COLS = 2
GAP = 16
PIC = 240
CELL = 2 * PIC + 8
LINE_H = 26
WIDTH = GAP + COLS * (CELL + GAP)
INK = (28, 28, 28)
SOFT = (95, 90, 80)
PAPER = (246, 242, 234)
CARD = (255, 251, 243)
LINE = (216, 207, 189)
NOTE = (190, 110, 0)
DEAD = (120, 95, 70)
TAG = {"new land": (178, 70, 30), "new heights": (150, 90, 20), "new water": (30, 100, 170), "more trees": (40, 120, 50), "was": (110, 110, 110)}


def font(size, bold=False):
    for name in (("arialbd.ttf", "segoeuib.ttf", "DejaVuSans-Bold.ttf") if bold else ("arial.ttf", "segoeui.ttf", "DejaVuSans.ttf")):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def fitted(draw, text, width, size, smallest, bold=True):
    """The text at the largest size from `size` down to `smallest` that fits, else cut short."""
    for s in range(size, smallest - 1, -2):
        f = font(s, bold)
        if draw.textlength(text, font=f) <= width:
            return text, f
    f = font(smallest, bold)
    while draw.textlength(text, font=f) > width and len(text) > 3:
        text = text[:-2].rstrip() + "…"
    return text, f


def wrap(draw, text, f, width):
    lines, line = [], ""
    for word in text.split():
        trial = f"{line} {word}".strip()
        if draw.textlength(trial, font=f) <= width or not line:
            line = trial
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, check=True).stdout


def changes(ref, places):
    """Each place's change since `ref`, by its survey row: new land, new water, or a new title."""
    old = json.loads(git("show", f"{ref}:{SELECTION}").decode("utf-8"))
    by_row = {p["row"]: p for p in old["places"]}
    patch = lambda row: row.rsplit("-", 2)[0]
    by_patch = {patch(p["row"]): p for p in old["places"]}
    old_index = {p["id"]: p for p in json.loads(git("show", f"{ref}:{PLACES}/index.json").decode("utf-8"))["places"]}
    out = {}
    for p in places:
        data = json.loads(gzip.open(os.path.join(PLACES, p["data"])).read())
        before = by_row.get(data["survey"])
        if not before:
            out[p["id"]] = ("new heights", "new heights") if patch(data["survey"]) in by_patch else ("new land", "new land")
            continue
        try:
            was = json.loads(gzip.decompress(git("show", f"{ref}:{PLACES}/data/{before['id']}.json.gz")))
        except subprocess.CalledProcessError:
            was = None
        tags = []
        if was is None or was["sources"] != data["sources"] or was["start"] != data["start"]:
            tags.append(("new water", "new water"))
        elif old_index.get(before["id"], {}).get("sha256") != p["sha256"]:
            tags.append(("more trees", "more trees"))
        if before["name"] != p["name"]:
            tags.append(("was", f"was {before['name']}"))
        if tags:
            out[p["id"]] = tags[0] if len(tags) == 1 else (tags[0][0], " · ".join(t[1] for t in tags))
    return out


def lines_of(p, tag):
    """The lines under a card's title: its notes, the floor's groves, what changed."""
    out = [("note", n) for n in p.get("notes", [])]
    t = p.get("floorTrees")
    if t:
        out.append(("floor", t))
    if tag:
        out.append(("tag", tag))
    return out


def head_of(p, tag):
    return 84 + LINE_H * len(lines_of(p, tag)) + 6


def card(draw, img, p, k, x, y, head, height, tag):
    draw.rounded_rectangle((x, y, x + CELL, y + height - 10), radius=10, fill=CARD, outline=LINE)
    num = f"{k + 1}"
    nf = font(40, True)
    draw.text((x + 12, y + 8), num, fill=INK, font=nf)
    left = x + 22 + draw.textlength(num, font=nf)
    text, tf = fitted(draw, p["name"], x + CELL - 10 - left, 34, 24)
    draw.text((left, y + 13), text, fill=INK, font=tf)
    info = f"{p['familyName']} · {p['size']}² · {p['metres']} m a tile"
    draw.text((x + 12, y + 56), info, fill=SOFT, font=font(22))
    ly = y + 84
    for kind, v in lines_of(p, tag):
        if kind == "note":
            draw.ellipse((x + 14, ly + 7, x + 26, ly + 19), fill=NOTE)
            words, wf = fitted(draw, v, CELL - 44, 22, 18)
            draw.text((x + 34, ly), words, fill=NOTE, font=wf)
        elif kind == "floor":
            first = f"Groves for the starting logs: {v['trees']} trees"
            f = font(21)
            draw.text((x + 12, ly), first, fill=SOFT, font=f)
            if v["dead"]:
                draw.text((x + 12 + draw.textlength(first, font=f), ly), f", {v['dead']} dead", fill=DEAD, font=font(21, True))
        else:
            kind2, words = v
            words, wf = fitted(draw, words, CELL - 24, 22, 18)
            draw.text((x + 12, ly), words, fill=TAG[kind2], font=wf)
        ly += LINE_H
    for j, key in enumerate(("image", "topImage")):
        pic = Image.open(os.path.join(PLACES, p[key])).convert("RGB").resize((PIC, PIC), Image.LANCZOS)
        img.paste(pic, (x + 2 + j * (PIC + 4), y + head))


# the checks a dropped place failed, in plain words
PLAIN = {
    "resources.mine_site": "no flat dry ground for a mine site",
    "start.water": "no start with water a pump reaches",
    "start.wood": "too little wood near the start",
    "start.food": "too few berry bushes near the start",
    "start.log_floor": "under the starting-logs floor",
    "water.settles": "the water does not settle",
    "water.outflow": "its water never leaves the map",
}


def plain(d):
    """A dropped place's reason in plain words: the rule that took it, and what failed."""
    why = sorted({words for check, words in PLAIN.items() if check in d["reason"]})
    rule = "the starting-logs floor" if "(D224" in d["reason"] else "rivers, not floods" if "(D214)" in d["reason"] else "the rebuild"
    return f"{d['name']} ({rule}): {'; '.join(why) if why else d['reason']}"


def page(places, first, count, pages, number, title, tags, gone):
    rows = [places[i : i + COLS] for i in range(0, len(places), COLS)]
    heads = [max(head_of(p, tags.get(p["id"])) for p in r) for r in rows]
    probe = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    body = font(24)
    notes = []
    if gone is not None:
        notes.append(("Not in the gallery", font(30, True)))
        for g in gone or ["None"]:
            for line in wrap(probe, g, body, WIDTH - 2 * GAP - 20):
                notes.append((line, body))
    top = 150
    grid = sum(hd + PIC + 26 for hd in heads)
    height = top + grid + (40 + 34 * len(notes) if notes else 0) + GAP
    img = Image.new("RGB", (WIDTH, height), PAPER)
    d = ImageDraw.Draw(img)
    d.text((GAP, 16), title, fill=INK, font=font(38, True))
    d.text((GAP, 66), f"Page {number} of {pages}: places {first + 1}–{first + len(places)} of {count}. Reply with the numbers to drop.", fill=INK, font=font(26))
    d.text((GAP, 104), "Each card: the 3D overview, and the map from above turned to match. Amber: what would sink a player who goes straight in.", fill=SOFT, font=font(20))
    y = top
    for r, (row, hd) in enumerate(zip(rows, heads)):
        for c, p in enumerate(row):
            card(d, img, p, first + r * COLS + c, GAP + c * (CELL + GAP), y, hd, hd + PIC + 26, tags.get(p["id"]))
        y += hd + PIC + 26
    y += 20
    for line, f in notes:
        d.text((GAP + 10, y), line, fill=INK, font=f)
        y += 34
    return img


def save(img, path):
    for q in range(82, 30, -4):
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=q, optimize=True, progressive=True)
        if buf.tell() < LIMIT:
            break
    with open(path, "wb") as f:
        f.write(buf.getvalue())
    return q, buf.tell()


def main():
    args = sys.argv[1:]
    opt = lambda name, default=None: args[args.index(name) + 1] if name in args else default
    dst = args[0]
    per = int(opt("--per-page", 30))
    ref = opt("--changed-since")
    with open(os.path.join(PLACES, "index.json"), encoding="utf-8") as f:
        index = json.load(f)
    with open(SELECTION, encoding="utf-8") as f:
        dropped = json.load(f)["dropped"]
    places = index["places"]
    tags = changes(ref, places) if ref else {}
    gone = [plain(d) for d in dropped]
    if not gone:
        gone.append("None: every place is kept on its own land (D245).")
    os.makedirs(dst, exist_ok=True)
    for f in os.listdir(dst):
        if f.startswith("page-") and f.endswith(".jpg"):
            os.remove(os.path.join(dst, f))
    pages = math.ceil(len(places) / per)
    for n in range(pages):
        chunk = places[n * per : (n + 1) * per]
        img = page(chunk, n * per, len(places), pages, n + 1, "Real places: which should go?", tags, gone if n == pages - 1 else None)
        path = os.path.join(dst, f"page-{n + 1}.jpg")
        q, size = save(img, path)
        print(f"{path}: places {n * per + 1}–{n * per + len(chunk)}, {img.width}×{img.height}, quality {q}, {size // 1024} KB")
    if tags:
        print(f"{len(tags)} places marked as changed since {ref}")


if __name__ == "__main__":
    main()
