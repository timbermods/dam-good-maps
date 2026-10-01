"""Prepare an adoption diff in memory; never write product files."""
import difflib
from pathlib import Path
here = Path(__file__).parent
root = here.parent.parent
body = (here/'round2.ts').read_text().split('/** Investigation adapter only:')[0]
body = body.replace('../../src/core/land/genome', './genome')
body = body.replace('../../src/core/spec/mapspec', '../spec/mapspec')
body = body.replace('../../src/core/math/rng', '../math/rng')
body = body.replace('../../src/core/land/num', './num')
body = body.rstrip()+'\n'
module = 'src/core/land/lakeBasin.ts'
patch = f'diff --git a/{module} b/{module}\nnew file mode 100644\n'
patch += ''.join(difflib.unified_diff([],body.splitlines(True),fromfile='/dev/null',tofile='b/'+module))
name = 'src/core/gen/generate.ts'
before = (root/name).read_text()
after = before.replace('import { makeField } from "../land/field";',
    'import { makeField } from "../land/field";\nimport { shapeLakeBasin } from "../land/lakeBasin";')
anchor = '      leanGenome(g, specIn.settings, W, H, seed, genomes, specIn.designedFor);'
assert before.count(anchor)==1 and after!=before
after = after.replace(anchor,anchor+"\n      if (!opts.context && opts.intentions === undefined && !specIn.intentions?.length && specIn.archetype === 'lakeBasin' && specIn.colonies.count === 1 && specIn.colonies.mod === 'none' && !specIn.setPieces.length && !specIn.constraints.keep.length && !specIn.constraints.keepOut.length)\n        shapeLakeBasin(g, specIn.settings, W, H, seed, genomes, specIn.designedFor);")
patch += f'diff --git a/{name} b/{name}\n'
patch += ''.join(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='a/'+name,tofile='b/'+name))
(here/'adoption.patch').write_text(patch)
print('Prepared default Normal Lake Basin adoption diff; product files untouched.')
