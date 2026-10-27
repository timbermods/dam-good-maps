"""Emit only source changes, against the pinned dev commit. No generated Wasm or other artifacts."""
import pathlib, subprocess, difflib, json
BASE="ac5a8b224483f87ab7917565d036d6c9c695d986"
def emit(study,base,changed):
 root=study.parents[1];work=study/"local/workspace";output=[]
 for name in sorted(changed):
  result=subprocess.run(["git","show",f"{base}:{name}"],cwd=root,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
  old=result.stdout.decode("utf-8").splitlines(keepends=True) if result.returncode==0 else []
  new=(work/name).read_text(encoding="utf-8").splitlines(keepends=True)
  output.append(f"diff --git a/{name} b/{name}\n")
  if not old:output.append("new file mode 100644\n")
  output.extend(difflib.unified_diff(old,new,fromfile=f"a/{name}" if old else "/dev/null",tofile=f"b/{name}"))
 # Git accepts blank context lines without the space marker; keep the committed patch whitespace-clean.
 (study/"adoption.patch").write_text("".join(output).replace("\n \n","\n\n"),encoding="utf-8",newline="\n")
if __name__=="__main__":
 study=pathlib.Path(__file__).resolve().parent
 emit(study,BASE,set(json.loads((study/"local/changed.json").read_text(encoding="utf-8"))))
