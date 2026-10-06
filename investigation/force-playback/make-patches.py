"""Package only the changed owner files; never writes product files."""
from pathlib import Path
import difflib
import re

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
WORK = HERE / "local" / "work"
PARTS = {
    "renderer": ["src/render3d/entityGeometry.ts", "src/render3d/entities3d.ts", "src/render3d/renderer.ts", "tests/unit/entityGeometry.test.ts"],
    "page": ["src/editor/session/mirror.ts", "src/editor/forces/useForceRun.tsx"],
    "worker": ["src/worker/session.ts", "src/worker/generator.worker.ts", "tests/unit/forcePlaybackTransport.test.ts"],
}
for owner, paths in PARTS.items():
    patch = ""
    for name in paths:
        original = ROOT / name
        before = original.read_text(encoding="utf-8") if original.exists() else ""
        after = (WORK / name).read_text(encoding="utf-8")
        if name.endswith("generator.worker.ts") and "playbackProfile" in after:
            after, count = re.subn(r'  forceAdvance: \(steps: number\) => \{\n.*?\n  \},', '  forceAdvance: (steps: number) => sendFrame(ed.forceAdvance(steps, true)),', after, count=1, flags=re.S)
            if count != 1:
                raise RuntimeError("profiling wrapper was not removed")
        patch += "".join(difflib.unified_diff(before.splitlines(keepends=True), after.splitlines(keepends=True), fromfile="a/" + name if original.exists() else "/dev/null", tofile="b/" + name))
    (HERE / f"{owner}.patch").write_text(patch, encoding="utf-8", newline="\n")
    print(owner, len(patch.encode("utf-8")), "bytes")
