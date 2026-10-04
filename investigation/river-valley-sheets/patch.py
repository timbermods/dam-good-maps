from pathlib import Path
import difflib
import subprocess
BASE="3f16eedeabaaaa5974f09913ff9f0b75d7232baf"
base=subprocess.check_output(['git','show',BASE+':src/core/land/hydro.ts'],text=True)
assert base==Path('src/core/land/hydro.ts').read_text(), 'The branch product source differs from the patch base'
after=Path('investigation/river-valley-sheets/local/hydro.after.ts').read_text()
patch='diff --git a/src/core/land/hydro.ts b/src/core/land/hydro.ts\n'+''.join(difflib.unified_diff(base.splitlines(True),after.splitlines(True),fromfile='a/src/core/land/hydro.ts',tofile='b/src/core/land/hydro.ts',n=2))
# Git accepts empty context lines without a whitespace-only prefix.
patch=patch.replace('\n \n','\n\n')
Path('investigation/river-valley-sheets/adoption.patch').write_text(patch,encoding='utf-8',newline='\n')
