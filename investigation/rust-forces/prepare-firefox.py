"""Isolated diagnostic copy; never patch the shared Playwright installation.

Apply only the two upstream v1.63 Runtime debugger settings to the cached v1.58
browser. This holds the Firefox executable/JIT build constant for a causal test.
"""
import hashlib, json, pathlib, shutil, sys, zipfile

here = pathlib.Path(__file__).resolve().parent
source, destination = (pathlib.Path(p).resolve() for p in sys.argv[1:3])
assert destination.is_relative_to(here / 'local'), 'Destination must stay in ignored local/'
assert source != destination
if not destination.exists():
    shutil.copytree(source, destination)
archive = destination / 'omni.ja'
entry_name = 'chrome/juggler/content/content/Runtime.js'
needle = b'this._debugger = new Debugger();'
addition = needle + b'\n    this._debugger.allowUnobservedWasm = true;\n    this._debugger.allowUnobservedAsmJS = true;'
digest = lambda data: hashlib.sha256(data).hexdigest()
original = archive.read_bytes()
with zipfile.ZipFile(archive) as z:
    runtime = z.read(entry_name)
    if b'allowUnobservedWasm' not in runtime:
        assert runtime.count(needle) == 1
        temporary = destination / 'omni.profile.ja'
        with zipfile.ZipFile(temporary, 'w') as out:
            out.comment = z.comment
            for entry in z.infolist():
                data = z.read(entry)
                out.writestr(entry, data.replace(needle, addition) if entry.filename == entry_name else data)
        # Close the original archive before replacement on Windows.
    else:
        temporary = None
if temporary:
    temporary.replace(archive)
with zipfile.ZipFile(archive) as z:
    patched = z.read(entry_name)
assert patched.count(b'allowUnobservedWasm = true') == 1
assert patched.count(b'allowUnobservedAsmJS = true') == 1
with zipfile.ZipFile(source / 'omni.ja') as z:
    source_runtime = z.read(entry_name)
evidence = {'source': str(source), 'destination': str(destination),
            'executableSha256': digest((source / 'firefox.exe').read_bytes()),
            'sourceArchiveSha256': digest((source / 'omni.ja').read_bytes()),
            'diagnosticArchiveSha256': digest(archive.read_bytes()),
            'sourceRuntimeSha256': digest(source_runtime),
            'diagnosticRuntimeSha256': digest(patched),
            'upstream': 'https://github.com/microsoft/playwright/blob/v1.63.0/browser_patches/firefox/juggler/content/Runtime.js'}
assert digest((destination / 'firefox.exe').read_bytes()) == evidence['executableSha256']
(here / 'local/profiles').mkdir(parents=True, exist_ok=True)
(here / 'local/profiles/firefox-diagnostic-copy.json').write_text(json.dumps(evidence, indent=2)+'\n')
print(destination / 'firefox.exe')
