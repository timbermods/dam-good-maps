"""Keep the short report's supporting seed table, not generated terrain arrays."""
import csv, json, sys
from pathlib import Path
here=Path(__file__).parent
mode=sys.argv[1]
local=here/'local'/mode
rows=sorted((json.loads(s) for s in (local/'measures.jsonl').read_text().splitlines()),key=lambda r:(r['size'],r['seed']))
diagnostics={(r['size'],r['seed']):r for r in json.loads((local/'diagnostics.json').read_text())}
columns=['size','seed','absolutes','all_three','promise','standout','readable_water','central_feeders','first_land_ms','first_water_ms','final_ms','settle_days','settles','shown','changed_tiles','lake_share','largest_lake_share','lake_fill','centre_offset','feeding_heads','linked_heads','river_roots','dry_course_in_lake','dry_course_outside_lake','thin_water_outside_lakes','failures','composition_misses','cause']
with (here/f'{mode}.csv').open('w',newline='',encoding='utf-8') as f:
    w=csv.DictWriter(f,fieldnames=columns);w.writeheader()
    for r in rows:
        d=diagnostics[r['size'],r['seed']]; c=d['composition']; main=c.get('main') or {}; o=r['outcomes'] or {};sig=o.get('signature') or {};e=c['evidence']
        causes=[]
        if not r['ok']:
            if 'water.source_in_flow' in r['failedChecks']:causes.append('fixed badwater hollow reached by another source; shared generator stops on the shown land')
            elif 'water.settles' in r['failedChecks']:causes.append('lake still moving at six days; shared repair cannot settle within its cut cap')
            elif any('straight' in s for s in r['failedChecks']):causes.append('outlet repair / channel leaves ruler-straight water banks; shared straightness guard still fails')
            else:causes.append('shared mine room proof does not yield two placed sites; repeated mine failures consume the remaining starts (audit 96/14)')
        if not o.get('promise') and r['ok']:
            if main.get('fill',1)<.75:causes.append('underfilled planned lake (known M9b fix); fixed-size/off-centre basins amplify the miss')
            elif sig.get('bigLake',0)<.04:causes.append('basin scale: small fixed-tile bowls, more per map rather than one substantial catchment')
            else:causes.append('river/floodplain water outweighs scattered lakes; thin outside water=%d (known floodplain fix)'%e['thinOutside'])
        if not o.get('water') and r['ok']:
            if e['riverRoots']>1:causes.append('separately draining river/lake branches (%d planned edge outlets)'%e['riverRoots'])
            if e['dryCourseInLake']:causes.append('dry samples inside planned lakes=%d; underfill/channel-in-lake gap (known M9b fixes)'%e['dryCourseInLake'])
            if any('near clean water' in s for s in o.get('story',{}).get('why',[])):causes.append('off-centre catchment leaves distant dry land')
            if e['dryCourseOutsideLake']:causes.append('dry outside-course samples=%d; compare course and water in local map, including thin flow and blocked courses'%e['dryCourseOutsideLake'])
        if c['reasons']:causes.append('theme composition: '+'; '.join(c['reasons']))
        w.writerow(dict(zip(columns,[r['size'],r['seed'],r['ok'],r['ok'] and o.get('met',False),o.get('promise',False),o.get('standout',False),o.get('water',False),r['ok'] and c['strongPromise'],r['ms']['firstLook'],r['ms']['water'],r['ms']['final'],r['settleTicks']/768,r['settles'],r['shown'],r['changed'],sig.get('lakeShare'),sig.get('bigLake'),main.get('fill'),main.get('offset'),main.get('feedingHeads'),main.get('linkedHeads'),e['riverRoots'],e['dryCourseInLake'],e['dryCourseOutsideLake'],e['thinOutside'],'; '.join(d['causes']),'; '.join(c['reasons']),'; '.join(causes)])))
(here/f'{mode}-summary.json').write_text((local/'summary.json').read_text(),encoding='utf-8')
