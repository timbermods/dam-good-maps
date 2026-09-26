#!/usr/bin/env bash
# Releases a tagged, green commit of dev into main (CLAUDE.md "Deploying"; docs/HANDOFF.md §7).
#
#   tools/release.sh <tag> <dev commit> <PR body file> [<preview branch>] [--go]
#
# Without --go it checks the commit and prints each step. With --go it:
#   1. makes the annotated tag at the commit and pushes it;
#   2. pushes release/<name> at the tag and opens a PR into main;
#   3. waits for the PR's checks, then merges it as a merge commit;
#   4. watches the deploy of main (build, deploy, live check);
#   5. republishes the preview from <preview branch>, if one is given (a deploy of main drops /preview/).
# If the live check fails it stops and says how to revert the release merge on main.
# Afterwards: record the release in docs/STATUS.md, the step's progress log and the Progress log issue (#57).
set -euo pipefail

repo=timbermods/dam-good-maps
tag=${1:?tag}; commit=${2:?dev commit}; body=${3:?PR body file}
preview=""; go=""
for a in "${@:4}"; do if [ "$a" = "--go" ]; then go=1; else preview=$a; fi; done
name=${tag%-done}; branch=release/$name

say() { printf '\n== %s\n' "$*"; }
run() { printf '+ %s\n' "$*"; if [ -n "$go" ]; then "$@"; fi; }

git fetch -q origin --tags
commit=$(git rev-parse --verify "$commit^{commit}")
say "Checks on $tag at ${commit:0:7}"
git merge-base --is-ancestor "$commit" origin/dev || { echo "not on dev: $commit"; exit 1; }
[ -f "$body" ] || { echo "no PR body file: $body"; exit 1; }
if git rev-parse -q --verify "refs/tags/$tag" > /dev/null; then echo "the tag $tag exists already"; exit 1; fi
runs=$(gh api "repos/$repo/commits/$commit/check-runs" --jq '[.check_runs[] | "\(.name)=\(.status)/\(.conclusion)"] | join(" ")')
echo "check runs: ${runs:-none}"
bad=$(gh api "repos/$repo/commits/$commit/check-runs" --jq '[.check_runs[] | select(.status != "completed" or (.conclusion | IN("success","skipped","neutral") | not))] | length')
[ -n "$runs" ] && [ "$bad" = 0 ] || { echo "CI isn't green on ${commit:0:7}: release a green commit"; exit 1; }

say "1. Tag"
run git tag -a "$tag" "$commit" -m "$tag"
run git push origin "refs/tags/$tag"

say "2. Release branch and PR into main"
run git push origin "$commit:refs/heads/$branch"
pr=""
if [ -n "$go" ]; then
  url=$(gh pr create -R "$repo" --base main --head "$branch" --title "Release: $tag" --body-file "$body")
  pr=${url##*/}; echo "PR #$pr: $url"
else
  echo "+ gh pr create --base main --head $branch --title \"Release: $tag\" --body-file $body"
fi

say "3. Wait for the PR's checks, then merge as a merge commit"
if [ -n "$go" ]; then
  for _ in $(seq 1 30); do gh pr checks "$pr" -R "$repo" > /dev/null 2>&1 && break; sleep 20; done
  gh pr checks "$pr" -R "$repo" --watch --interval 30 || { echo "the PR's checks failed: not merged"; exit 1; }
  gh pr merge "$pr" -R "$repo" --merge
  merge=$(gh pr view "$pr" -R "$repo" --json mergeCommit --jq .mergeCommit.oid)
  echo "merged as ${merge:0:7}"
else
  echo "+ gh pr checks <pr> --watch; gh pr merge <pr> --merge"
fi

say "4. Watch the deploy of main (build, deploy, live check)"
if [ -n "$go" ]; then
  id=""
  for _ in $(seq 1 30); do
    id=$(gh run list -R "$repo" --workflow deploy.yml --branch main --commit "$merge" --limit 1 --json databaseId --jq '.[0].databaseId // empty')
    [ -n "$id" ] && break; sleep 20
  done
  [ -n "$id" ] || { echo "no deploy run for ${merge:0:7}"; exit 1; }
  if ! gh run watch "$id" -R "$repo" --interval 30 --exit-status; then
    echo "THE DEPLOY OR THE LIVE CHECK FAILED (run $id). Revert the release merge on main:"
    echo "  git fetch origin && git checkout -B revert-$name origin/main && git revert -m 1 ${merge:0:7} --no-edit"
    echo "  then open a PR into main, merge it as a merge commit, confirm the old site is back, and report."
    exit 1
  fi
  echo "deployed; the live check passed (run $id)"
else
  echo "+ gh run watch <deploy run of the merge commit> --exit-status"
fi

if [ -n "$preview" ]; then
  say "5. Republish the preview from $preview"
  run gh workflow run deploy.yml -R "$repo" --ref main -f "preview_ref=$preview"
  echo "then watch it and check https://timbermods.github.io/dam-good-maps/preview/"
fi
say "Done. Record it in docs/STATUS.md, the progress log and #57."
