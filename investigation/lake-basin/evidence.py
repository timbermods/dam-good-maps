"""Extract compact shared evidence; full maps and traces stay ignored."""
import json, sys
from pathlib import Path
here = Path(__file__).parent
newer = Path(sys.argv[1]) / 'investigation/lake-basin/local'
read = lambda p: json.loads(p.read_text())
trace = read(here/'local/evidence/trace.json')
audit = next(json.loads(s) for s in (here/'local/baseline/measures.jsonl').read_text().splitlines()
             if json.loads(s)['size'] == 96 and json.loads(s)['seed'] == 14)
proof = read(newer/'source-proof/96-13.json')
source = next(c for c in proof['checks'] if c['id'] == 'water.source_in_flow')
x,y = source['where']['tiles'][0]
emitter = next(e for e in proof['emitters'] if y*96+x in e['cells'])
current = read(newer/'evidence-current/96-14.json')
result = {
    'auditBase': 'da46492225cecc57530a7ffe21a5a30f0d89cc73',
    'newerCore': '65b759d013d8bf6c2aeec6341a202f8dbe5152ce',
    'historicalMinePair': {
        'size':96,'seed':14,'attemptFailures':audit['failures'],'finalFailures':audit['failedChecks'],
        'attempts':audit['attempts'],'settles':audit['settles'],
        'roomProofs':[t for t in trace if t['kind']=='roomMap'],
        'placementCalls':sum(t['kind']=='mine' for t in trace),
        'nullPlacements':sum(t['kind']=='mine' and t['result'] is None for t in trace),
        'newerCoreBlockingFailures':[c for c in current['checks'] if not c['ok'] and c['severity']=='error'],
        'caution':'Mine access permits one-level steps; reachable:false alone is not a failed absolute.'},
    'fixedBadwaterReached': {
        'size':96,'seed':13,'settled':proof['settled'],'ticks':proof['ticks'],
        'check':source,'emitter':emitter,
        'terminalBranch':'src/core/gen/generate.ts:1840-1849 at newerCore',
        'otherFailingSeeds':[[128,19],[256,11]]},
}
(here/'shared-evidence.json').write_text(json.dumps(result,indent=2)+'\n')
