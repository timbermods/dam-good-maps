#!/usr/bin/env python3
"""Resolve a merge conflict that sits only in docs/decisions/*.md, decision by decision.

Look and other PRs amend their own decision line ("- **D496** ..."), so they conflict with dev only in those files, on
lines the other side never touched. Git sees two edits near each other; this tool sees two different decisions.

  python tools/mergedecisions.py
      During a conflicted `git merge origin/dev` (HEAD = the branch, MERGE_HEAD = dev): resolves every conflicted file,
      stages it, writes the merge message into .git/MERGE_MSG and prints it. Then `git commit --no-edit`.
  python tools/mergedecisions.py --base <ref> --ours <ref> --theirs <ref> [--write]
      The same on explicit refs (ours = the branch, theirs = dev), outside a merge: prints what it would do, and
      changes nothing unless --write (which writes the files into the working tree, not staged).
  python tools/mergedecisions.py --check <merge commit>
      Re-runs the resolution from the merge's parents and their merge base. Exit 0 only if the merge changed, beyond
      git's own automatic merge, nothing outside docs/decisions/*.md, and each such file equals what the tool makes.

For each file it takes theirs' text (dev's) and puts in the decisions that ours (the branch) changed or added.
It refuses, exit 1 and one line per file, writing nothing, when:
  - both sides changed the same decision (differently);
  - a decision was added or removed where the tool cannot place it (it must follow a decision that is still there), or
    a decision moved between places or reordered on one side while the other changed it too;
  - the two sides have more than one merge base (a criss-cross merge);
  - the lines that are not decisions (headings, prose, tables) were changed differently by the two sides
    (changed by one side only, that side's are kept);
  - any conflicted file is outside docs/decisions/ (or was added or deleted on one side).
Decisions added on both sides after the same decision are both kept, in decision-number order.

Python 3, standard library only. Tested by tests/unit/mergedecisions.test.ts.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys

TAG = "decisions merged by tools/mergedecisions.py"
DECISION_FILE = re.compile(r"^docs/decisions/[^/]+\.md$")
DECISION_LINE = re.compile(r"^- \*\*D(\d+)(?!\d)")


class Refuse(Exception):
    """The reason, in one line."""


# ---------------------------------------------------------------------------------------------------- git


def git(*args: str, check: bool = True) -> bytes:
    r = subprocess.run(["git", *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if check and r.returncode != 0:
        raise SystemExit("git %s: %s" % (" ".join(args), r.stderr.decode("utf-8", "replace").strip()))
    return r.stdout if r.returncode == 0 else b""


def git_ok(*args: str) -> bool:
    return subprocess.run(["git", *args], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0


def blob(ref: str, path: str) -> bytes | None:
    r = subprocess.run(["git", "show", "%s:%s" % (ref, path)], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    return r.stdout if r.returncode == 0 else None


def rev(ref: str) -> str:
    out = git("rev-parse", "--verify", "--quiet", ref + "^{commit}", check=False).decode().strip()
    if not out:
        raise SystemExit("not a commit: " + ref)
    return out


def merge_base(a: str, b: str) -> str:
    bases = git("merge-base", "--all", a, b, check=False).decode().split()
    if not bases:
        raise Refuse("the two sides have no merge base")
    if len(bases) > 1:
        raise Refuse("the two sides have %d merge bases (a criss-cross merge), which a decision-wise merge cannot place" % len(bases))
    return bases[0]


def conflicted_files(base: str, ours: str, theirs: str) -> list[str]:
    """The paths git's own merge of ours and theirs leaves conflicted (no files are touched)."""
    r = subprocess.run(
        ["git", "merge-tree", "--write-tree", "--name-only", "-z", "--no-messages", "--merge-base=" + base, ours, theirs],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if r.returncode not in (0, 1):
        raise SystemExit("git merge-tree: " + r.stderr.decode("utf-8", "replace").strip())
    names: list[str] = []
    for name in r.stdout.decode("utf-8").split("\0")[1:]:  # the tree id, then the paths, then an empty field
        if not name:
            break
        names.append(name)
    return names


# ---------------------------------------------------------------------------------------------------- the merge


def key(line: str) -> int | None:
    m = DECISION_LINE.match(line)
    return int(m.group(1)) if m else None


class Version:
    """One side's file: its lines, its decisions by number, and where each sits among the other lines."""

    def __init__(self, name: str, text: str):
        self.name = name
        self.lines = text.split("\n")
        self.keys = [key(l) for l in self.lines]
        self.by_key: dict[int, str] = {}
        self.pos: dict[int, int] = {}  # decision -> how many non-decision lines come before it
        self.order: list[int] = []
        others = 0
        for l, k in zip(self.lines, self.keys):
            if k is None:
                others += 1
                continue
            if k in self.by_key:
                raise Refuse("D%d is in %s twice" % (k, name))
            self.by_key[k] = l
            self.pos[k] = others
            self.order.append(k)
        self.others = [l for l, k in zip(self.lines, self.keys) if k is None]


def moved(ref: Version, ver: Version) -> set[int]:
    """The decisions both have that sit among other lines, or in an order, that the other does not."""
    common = [k for k in ver.order if k in ref.by_key]
    rank = {k: i for i, k in enumerate(k for k in ref.order if k in ver.by_key)}
    return {k for i, k in enumerate(common) if ver.pos[k] != ref.pos[k] or rank[k] != i}


def merge_text(base: str, ours: str, theirs: str) -> str:
    """Theirs' file, with ours' changed and added decisions put in. Raises Refuse."""
    B, O, T = Version("base", base), Version("ours", ours), Version("theirs", theirs)

    # The lines that are not decisions: identical, or changed by one side only.
    if O.others == T.others or O.others == B.others:
        skeleton, other = T, O
    elif T.others == B.others:
        skeleton, other = O, T
    else:
        raise Refuse("lines that are not decisions (headings, prose, tables) were changed differently by both sides")

    # No decision moved between places, or reordered, on the side whose layout is not used; and none moved on the
    # side whose layout is used (where the layouts can be compared) that the other side changed.
    ref = B if other.others == B.others else skeleton
    for k in sorted(moved(ref, other)):
        raise Refuse("D%d moved to another place" % k)
    if skeleton.others == B.others:
        for k in sorted(moved(B, skeleton)):
            if other.by_key.get(k) != B.by_key.get(k):
                raise Refuse("D%d was moved on one side and changed on the other" % k)

    # Each decision: the same on both sides, or changed (added, amended, removed) by one side only.
    result: dict[int, str | None] = {}
    for k in sorted(set(B.by_key) | set(O.by_key) | set(T.by_key)):
        b, o, t = B.by_key.get(k), O.by_key.get(k), T.by_key.get(k)
        if o == t:
            result[k] = o
        elif o == b:
            result[k] = t
        elif t == b:
            result[k] = o
        else:
            raise Refuse("both sides changed D%d" % k)

    # The skeleton side's file, with the decisions' results in place.
    out: list[tuple[int | None, str]] = []
    for l, k in zip(skeleton.lines, skeleton.keys):
        if k is None:
            out.append((None, l))
        elif result[k] is not None:
            out.append((k, result[k]))  # type: ignore[arg-type]

    # Decisions only the other side has (added): after the decision they follow there, in number order.
    for i, k in enumerate(other.keys):
        if k is None or k in skeleton.by_key or result[k] is None:
            continue
        prev = other.keys[i - 1] if i > 0 else None
        if prev is None:
            raise Refuse("D%d was added where it follows no decision" % k)
        at = next((j for j, (kk, _) in enumerate(out) if kk == prev), None)
        if at is None:
            raise Refuse("D%d was added after D%d, which the other side removed" % (k, prev))
        at += 1
        while at < len(out) and out[at][0] is not None and out[at][0] not in B.by_key and out[at][0] < k:
            at += 1
        out.insert(at, (k, result[k]))  # type: ignore[arg-type]

    return "\n".join(l for _, l in out)


# ---------------------------------------------------------------------------------------------------- modes


def decode(path: str, data: bytes | None, side: str) -> str:
    if data is None:
        raise Refuse("added or deleted on one side (%s lacks it)" % side)
    return data.decode("utf-8")


def resolve_file(path: str, base: str, ours: str, theirs: str) -> bytes:
    if not DECISION_FILE.match(path):
        raise Refuse("conflict outside docs/decisions/")
    return merge_text(
        decode(path, blob(base, path), "base"), decode(path, blob(ours, path), "ours"), decode(path, blob(theirs, path), "theirs")
    ).encode("utf-8")


def changed_decisions(base: str, ours: str, path: str, resolved: bytes) -> list[str]:
    """Which decisions the branch brought in, for the message."""
    b = Version("base", decode(path, blob(base, path), "base"))
    o = Version("ours", decode(path, blob(ours, path), "ours"))
    return ["D%d" % k for k in o.order if o.by_key[k] != b.by_key.get(k)]


def run_merge(base: str, ours: str, theirs: str, write: bool, stage: bool) -> int:
    files = conflicted_files(base, ours, theirs) if not stage else [
        p for p in git("diff", "--name-only", "--diff-filter=U", "-z").decode("utf-8").split("\0") if p
    ]
    if not files:
        print("no conflicted files; nothing to do")
        return 0
    results: dict[str, bytes] = {}
    refused = False
    for path in files:
        try:
            results[path] = resolve_file(path, base, ours, theirs)
        except Refuse as e:
            refused = True
            print("%s: refused: %s" % (path, e))
    if refused:
        return 1
    notes = []
    for path, data in results.items():
        if write or stage:
            with open(path, "wb") as f:
                f.write(data)
        if stage:
            git("add", "--", path)
        notes.append("%s: %s" % (path, ", ".join(changed_decisions(base, ours, path, data)) or "no decision changed"))
        print("%s: resolved" % path)
    first = "Merge dev into the branch"
    if stage:
        merge_msg = git("rev-parse", "--git-path", "MERGE_MSG").decode().strip()
        try:
            with open(merge_msg, encoding="utf-8") as f:
                first = f.readline().rstrip("\n") or first
        except OSError:
            pass
    message = "%s\n\n%s (%s)\n" % (first, TAG, "; ".join(notes))
    if stage:
        with open(merge_msg, "w", encoding="utf-8", newline="\n") as f:
            f.write(message)
    print("\nMerge commit message (git commit --no-edit uses it):\n\n" + message)
    return 0


def run_check(commit: str) -> int:
    merge = rev(commit)
    parents = git("rev-list", "--parents", "-n", "1", merge).decode().split()[1:]
    if len(parents) != 2:
        print("%s: not a merge of two parents" % commit)
        return 1
    ours, theirs = parents
    base = merge_base(ours, theirs)
    # what the merge changed beyond git's own automatic merge (conflicted files, resolved by hand or tool)
    by_hand = git("diff-tree", "--remerge-diff", "-r", "--name-only", "--no-commit-id", "-z", merge, check=False)
    if not by_hand and not git_ok("diff-tree", "--remerge-diff", "-r", "--name-only", merge):
        by_hand = git("diff-tree", "--cc", "-r", "--name-only", "--no-commit-id", "-z", merge)  # git older than 2.36
    files = [p for p in by_hand.decode("utf-8").split("\0") if p]
    outside = [p for p in files if not DECISION_FILE.match(p)]
    if outside:
        print("%s: the merge touches files outside docs/decisions/: %s" % (commit, ", ".join(outside)))
        return 1
    failed = False
    for path in files:
        try:
            expected = resolve_file(path, base, ours, theirs)
        except Refuse as e:
            failed = True
            print("%s: the tool refuses it: %s" % (path, e))
            continue
        if blob(merge, path) != expected:
            failed = True
            print("%s: differs from what the tool makes of the merge's parents" % path)
    if failed:
        return 1
    print("ok: %s changed only docs/decisions/ (%d file%s), each as the tool makes it" % (commit, len(files), "" if len(files) == 1 else "s"))
    return 0


def run_texts() -> int:
    out = []
    for c in json.load(sys.stdin):
        try:
            out.append({"text": merge_text(c["base"], c["ours"], c["theirs"])})
        except Refuse as e:
            out.append({"refused": str(e)})
    json.dump(out, sys.stdout)
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Resolve docs/decisions/*.md merge conflicts decision by decision.")
    ap.add_argument("--base")
    ap.add_argument("--ours", help="the branch")
    ap.add_argument("--theirs", help="dev")
    ap.add_argument("--write", action="store_true", help="with explicit refs: write the resolved files into the working tree")
    ap.add_argument("--check", metavar="MERGE_COMMIT")
    ap.add_argument("--texts", action="store_true", help="for the tests: read [{base, ours, theirs}] as JSON on stdin, print [{text}|{refused}]")
    a = ap.parse_args()
    if a.texts:
        return run_texts()
    os.chdir(git("rev-parse", "--show-toplevel").decode().strip())
    if a.check:
        if a.base or a.ours or a.theirs or a.write:
            ap.error("--check takes only a merge commit")
        try:
            return run_check(a.check)
        except Refuse as e:
            print("%s: %s" % (a.check, e))
            return 1
    given = [x for x in (a.base, a.ours, a.theirs) if x]
    if given and len(given) != 3:
        ap.error("--base, --ours and --theirs go together")
    if given:
        return run_merge(rev(a.base), rev(a.ours), rev(a.theirs), a.write, False)
    if a.write:
        ap.error("--write is for explicit refs; in a merge the files are always written and staged")
    if not git_ok("rev-parse", "-q", "--verify", "MERGE_HEAD"):
        print("not in a merge: run `git merge origin/dev` first, or pass --base, --ours and --theirs")
        return 2
    try:
        base = merge_base("HEAD", "MERGE_HEAD")
    except Refuse as e:
        print(e)
        return 1
    return run_merge(base, rev("HEAD"), rev("MERGE_HEAD"), True, True)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except BrokenPipeError:
        sys.exit(1)
