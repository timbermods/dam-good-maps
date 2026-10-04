from pathlib import Path
import difflib
base=Path('src/core/land/hydro.ts').read_text()
after=Path('investigation/river-valley-sheets/local/hydro.after.ts').read_text()
patch='diff --git a/src/core/land/hydro.ts b/src/core/land/hydro.ts\n'+''.join(difflib.unified_diff(base.splitlines(True),after.splitlines(True),fromfile='a/src/core/land/hydro.ts',tofile='b/src/core/land/hydro.ts',n=2))
Path('investigation/river-valley-sheets/adoption.patch').write_text(patch,encoding='utf-8',newline='\n')
