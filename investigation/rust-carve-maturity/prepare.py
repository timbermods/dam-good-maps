"""Export this clone's pinned dev inputs to an ignored build workspace; overlay adoption sources."""
import pathlib, subprocess, tarfile, io, shutil
ROOT=pathlib.Path(__file__).resolve().parents[2]
STUDY=ROOT/"investigation/rust-carve-maturity"
BASE="59483c63eb3e687944cbea585fb4f51c2019e7ca"
WORK=STUDY/"local/workspace"
WORK.mkdir(parents=True,exist_ok=True)
paths=["rust", "rust-toolchain.toml", "src", "tools", "tests", "package.json", "package-lock.json", "tsconfig.json", "vitest.config.ts", "vite.config.ts", "investigation/forces-core", "investigation/erupt", "investigation/carve", "investigation/glaciate", "investigation/generative", "investigation/meander/view.ts", "investigation/meander/maps"]
paths.append("public/real-places/data/near-grand-canyon-colorado.json.gz")
tracked=set(subprocess.check_output(["git","ls-tree","--name-only",BASE],cwd=ROOT,text=True).splitlines())
paths=[p for p in paths if p in tracked or p.startswith(("investigation/","public/"))]
archive=subprocess.check_output(["git","archive",BASE,*paths],cwd=ROOT)
with tarfile.open(fileobj=io.BytesIO(archive)) as t:
 t.extractall(WORK,filter="data")
for p in (STUDY/"overlay").rglob("*"):
 if p.is_file():
  dst=WORK/p.relative_to(STUDY/"overlay"); dst.parent.mkdir(parents=True,exist_ok=True); shutil.copyfile(p,dst)
print(WORK)
