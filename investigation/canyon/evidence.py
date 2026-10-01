"""Keep small decision evidence in git; regenerate the full maps with run.cjs."""
import csv
import difflib
import json
from pathlib import Path

here = Path(__file__).resolve().parent
root = here.parent.parent
causes = {
    (96, 4): 'Cliff run 29 is long enough, but only 19.3% of its course (23.1% required); broad 3.8-tile cleared floor and settled lake reaches interrupt the near-bank walls.',
    (96, 9): 'Two independent drainage systems: main exits south, spring/2 west; spring/3 joins the latter. The larger-volume system holds only 49% of wet tiles. Planned water already missed the story screen.',
    (96, 16): 'Declared main route is bypassed after settling: dry at (38,9), floor 9, with 12 consecutive dry course samples; main wet share 77% and clean-water reach 34%. Routing/description mismatch is shared.',
    (96, 17): 'D171 source removal drops the main and other rivers after land display; only spring/2 survives (plus the excluded start spring). Its cliff run is 7. Shared dropRivers leaves the old valley without its river.',
    (96, 18): 'Source removal leaves two independent spring routes to the west edge and an excluded start spring; dominant water holds 46%. Shared source removal/routing fragments the final story; no planned outcome was recorded on this capped last attempt.',
    (128, 2): 'No inflow drawn: main and spring/1 drain separately from spring/2. Main-volume system holds 60%; 8 dry course samples of spring/2 lie inside lake outlines. The broad floor (3.9) and lakes break the cliff run into 24 (11.3%).',
    (128, 9): 'No inflow; five heads each carry 1.19, below the shared incision gate 1.2. Canyon incision 4.94 is unused. Narrow shallow courses and lakes leave only 31 cliff samples (13.2%).',
    (128, 10): 'Clean water is concentrated in the southern land, leaving broad dry uplands: only 33% of dry land lies within the shared 0.14-side reach. No river was removed. The planned story already missed; the capped screen was exhausted. This is the shared reach heuristic, not a disconnected network.',
    (128, 11): 'No inflow; each river carries 1.0, so Canyon incision 4.33 is unused. Longest cliff run 31 (18.6%) misses the share line. Retaining an inflow resolves this in the prototype.',
    (128, 12): 'Source removal drops the main and leaves two spring routes with independent south-edge exits. The dominant system holds 64%. Planned water was readable; shared source removal invalidates that reading.',
    (128, 14): 'Shared routing/description mismatch: spring/1 declares a main-river join but its settled water bypasses much of that path; 54 dry samples (46 consecutive), starting at (74,67), floor 5. Its course wet share is 39%.',
    (128, 15): 'Source removal drops the main, retaining spring/1 and spring/2 as independent south-edge routes; clean-water reach falls to 33%. The planned story was readable. Shared source-removal/start-spring handling.',
    (128, 17): 'No inflow; four heads carry 1.02, so Canyon incision 7.76 is unused. Cliff run 34 (16.3%) misses the share line. The prototype changes the opening but still leaves a fragmented water system.',
    (256, 11): 'Width-blind shared signature: 8.4-wide main plus 2.5 floor puts nominal walls beyond radius 6. Main cliff run 1 becomes 36 at radius 12; production signature instead selects a tributary run of 24, below 29 required.',
    (256, 12): 'Width-blind shared signature and interruptions by side channels/lakes: main width 7.7, measured run 31 (6.8%); radius-12 diagnostic finds 79. Do not narrow the map to pass a fixed-radius measurement.',
    (256, 14): 'Shared source removal drops the main; spring/1 and spring/5 occupy one system, spring/2,3,4 another. Main-volume system has only 29% of wet tiles and two rivers never join it. Planned story was readable.',
    (256, 15): 'Long course with interrupted near-bank cliffs: run 59 (13.6%) just below 14.1% required. Radius-12 diagnostic finds a 90-sample main run. No inflow at baseline; prototype retains one but the near-bank signature still misses.',
    (256, 16): 'Wide main (7.8) outside the fixed near-bank scan and lower tributary/lake breaks: main run 8 becomes 69 at radius 12; production selects a tributary run 16. Shared width-blind signature.',
    (256, 18): 'Long, branching course through lake/floodplain reaches: near-bank run 62 (7.3%) below 14.1%; radius-12 main run 104. Shared fixed-radius signature under-reads broader cliffs; the near-bank stretches also genuinely break.',
}
after_extra = {
    (96, 9): 'The requested inflow is not retained in the final spring-fed layout. Two independent drainage systems remain, with two rivers outside the dominant system (55% of wet tiles). The shared fallback/routing still fragments the story.',
    (96, 15): 'New prototype miss: the longer edge-fed main gives a cliff run of 22, only 14.4% of the course (23.1% required). The old spring-fed run was 23, 41.8%. The retained inflow does not establish cliffs for enough of its longer course.',
    (128, 2): 'The requested inflow cannot be traced on the capped last attempt, so the shared planner falls back to three spring-fed routes; no river is dropped. Independent systems hold only 49% in the dominant one, and the near-bank cliff signature misses. A minimum inflow prior is not an exact-count guarantee.',
    (128, 17): 'Changed opening still misses the near-bank cliff share and leaves two water systems (dominant share 63%). Retaining an inflow alone does not guarantee it survives shared source removal.',
    (256, 15): 'The stronger edge-fed main reaches width 8.4, moving its walls beyond the fixed near-bank scan over many reaches. Production signature reads 26 samples (6.8%), below both length and share lines. The changed layout remains a promise miss; radius-12 evidence above belongs to baseline only.',
    (256, 18): 'New readable-water miss on a changed opening: shared source removal drops the main, leaving two independent south-edge spring systems (dominant share 54%, two separate rivers). The cliff signature also still misses.',
}
columns = ['phase','size','seed','validator_pass','all_three','promise','standout','readable_water','land_ms','cpu_land_ms','water_ms','shown','changed_tiles','cliff_run','cliff_share','main_water_share','water_reach','main_wet','least_wet','logs','berries_near','mines_walked','level_land','farmland','bed_min','cause']
rows = []
for phase in ('before', 'after'):
    for size in (96, 128, 256):
        folder = here / 'local' / phase
        measures = [json.loads(l) for l in (folder / f'measures-{size}.jsonl').read_text().splitlines()]
        assert len(measures) == 20 and len({m['seed'] for m in measures}) == 20
        for m in sorted(measures, key=lambda m: m['seed']):
            d = json.loads((folder / f"{size}-{m['seed']}.json").read_text())
            o, s, w = d['outcomes'], d['outcomes']['signature'], d['outcomes']['story']
            failed = not (m['ok'] and o['met'])
            key = size, m['seed']
            cause = (after_extra.get(key, causes.get(key)) if phase == 'after' else causes.get(key)) if failed else ''
            assert cause is not None, f'Missing diagnosis: {phase} {key}'
            rows.append([phase,size,m['seed'],m['ok'],m['ok'] and o['met'],o['promise'],bool(o['standout']),w['readable'],m['ms']['land'],m['cpu']['land'],m['ms']['water'],m['shown'],m['changed'],s['canyon'],s['canyonShare'],w['mainShare'],w['reach'],w['mainWet'],w['leastWet'],m['walk']['logs'],m['bushesNear'],m['mines']['walked'],m['walk']['level'],m['walk']['farmland'],m['heights']['bedMin'],cause])
with (here / 'AUDIT.csv').open('w', newline='', encoding='utf-8') as f:
    writer = csv.writer(f)
    writer.writerow(columns)
    writer.writerows(rows)

# Produce an adoption patch without ever editing product code.
file = root / 'src/core/land/genome.ts'
original = file.read_text(encoding='utf-8')
end = '\n}\n\nexport type { Settings };'
assert original.count(end) == 1
addition = '\n  // Canyon keeps a main inflow when Rivers permits it: its incision needs a river, not only small springs.\n  if (g.theme === "canyon" && s.water.rivers > 0) g.hydro.inflows = Math.max(1, g.hydro.inflows);\n'
modified = original.replace(end, addition + end)
patch = ''.join(difflib.unified_diff(original.splitlines(keepends=True), modified.splitlines(keepends=True), fromfile='a/src/core/land/genome.ts', tofile='b/src/core/land/genome.ts', n=1))
(here / 'adoption.patch').write_text(patch, encoding='utf-8', newline='\n')
