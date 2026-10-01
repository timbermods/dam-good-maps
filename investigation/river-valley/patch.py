import difflib
from pathlib import Path
root=Path(__file__).resolve().parent
patch=[]
for name in ('src/core/land/genome.ts','src/core/land/hydro.ts'):
    before=(root/'../..'/name).read_text(encoding='utf8').splitlines(keepends=True)
    after=(root/'local/proposed'/name).read_text(encoding='utf8').splitlines(keepends=True)
    patch.append(f'diff --git a/{name} b/{name}\n')
    patch.extend(difflib.unified_diff(before,after,fromfile='a/'+name,tofile='b/'+name,n=4))
# Git accepts an empty context line without its space prefix. Avoid trailing
# whitespace when the patch itself is committed as a reviewable text artifact.
text=''.join(line if line != ' \n' else '\n' for line in patch)
(root/'adoption.patch').write_text(text,encoding='utf8',newline='\n')
print('adoption.patch written (River Valley only; shared lake fix excluded)')
