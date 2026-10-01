"""Emit the exact runtime proposal as an adoption patch; do not modify product code."""
from pathlib import Path
import difflib

here = Path(__file__).resolve().parent
before = (here/'local/genome.before.ts').read_text(encoding='utf-8')
after = (here/'local/genome.after.ts').read_text(encoding='utf-8')
patch = ''.join(difflib.unified_diff(before.splitlines(True), after.splitlines(True), fromfile='a/src/core/land/genome.ts', tofile='b/src/core/land/genome.ts'))
# Git accepts empty context lines without their space prefix. Keep the patch itself
# whitespace-clean when it is committed as a file, as well as the proposed source.
patch = '\n'.join(line.rstrip() for line in patch.splitlines()) + '\n'
(here/'adoption.patch').write_text(patch, encoding='utf-8', newline='\n')
