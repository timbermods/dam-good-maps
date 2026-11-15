#!/usr/bin/env bash
# Releases a tagged, green commit of dev into main (CLAUDE.md "Deploying"; docs/HANDOFF.md §7).
#
#   tools/release.sh <tag> <dev commit> <PR body file> [<preview branch>] [--go]
#
# Without --go it checks the commit and prints each step. With --go it:
#   1. pushes release/<name> at the commit and opens a PR into main;
#   2. waits for every pull_request run on the release branch (the full CI, and the connection tests);
#   3. makes the annotated tag at the commit and pushes it (its push runs release-assets.yml: the GitHub Release, with the
#      MCP server's two installs attached), then merges the PR as a merge commit;
#   4. watches the deploy of main (build, deploy, live check);
#   5. republishes the preview from <preview branch>, if one is given (a deploy of main drops /preview/).
# If the live check fails it stops and says how to revert the release merge on main.
# A run that stopped part-way is run again with the same arguments: it takes up the open release PR and the tag where
# they are already at the commit, and waits again for the runs still going.
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
tagged=""
if git rev-parse -q --verify "refs/tags/$tag" > /dev/null; then
  [ "$(git rev-parse "refs/tags/$tag^{commit}")" = "$commit" ] || { echo "the tag $tag exists already, on another commit"; exit 1; }
  tagged=1; echo "the tag $tag is on ${commit:0:7} already: taken up"
fi
# A completed green CI run on the commit lets the release go straight on. Otherwise (no run, a run that was cancelled by
# a newer push to dev, one still going) there is no result yet: the release PR into main runs the full CI, and the tag is
# pushed only after its checks pass. A run that completed red stops the release.
runs=$(gh api "repos/$repo/commits/$commit/check-runs" --paginate --jq '.check_runs[] | "\(.name)=\(.status)/\(.conclusion)"' | paste -sd' ' -)
echo "check runs: ${runs:-none}"
red=$(gh api "repos/$repo/commits/$commit/check-runs" --paginate --jq '.check_runs[] | select(.status == "completed" and (.conclusion | IN("success","skipped","neutral","cancelled") | not)) | .name' | wc -l)
[ "$red" = 0 ] || { echo "CI is red on ${commit:0:7}: release a green commit"; exit 1; }
open=$(gh api "repos/$repo/commits/$commit/check-runs" --paginate --jq '.check_runs[] | select(.status != "completed" or .conclusion == "cancelled") | .name' | wc -l)
done_ok=$(gh api "repos/$repo/commits/$commit/check-runs" --paginate --jq '.check_runs[] | select(.status == "completed" and (.conclusion | IN("success","skipped","neutral"))) | .name' | wc -l)
if [ "$open" = 0 ] && [ "$done_ok" -gt 0 ]; then
  echo "the commit has a completed green CI run"
else
  echo "no completed green CI run on ${commit:0:7} (none, cancelled or still running): the release PR's checks decide, and the tag is pushed after they pass"
fi

say "1. Release branch and PR into main"
run git push origin "$commit:refs/heads/$branch"
pr=""
if [ -n "$go" ]; then
  # (a run that stopped after opening the PR finds it again; only an open PR whose head is this commit counts)
  pr=$(gh pr list -R "$repo" --base main --head "$branch" --state open --json number,headRefOid --jq "[.[] | select(.headRefOid == \"$commit\") | .number][0] // empty")
  if [ -n "$pr" ]; then
    echo "PR #$pr is open at ${commit:0:7} already: taken up"
  else
    url=$(gh pr create -R "$repo" --base main --head "$branch" --title "Release: $tag" --body-file "$body")
    pr=${url##*/}; echo "PR #$pr: $url"
  fi
else
  echo "+ gh pr create --base main --head $branch --title \"Release: $tag\" --body-file $body"
fi

say "2. Wait for every pull_request run on $branch (the full CI, and the connection tests)"
# (by the runs themselves: `gh pr checks --watch` passed on the first jobs that skip at once, before CI ran, so #616, #651
# and #653 merged within 10 s of opening, 2026-10-29)
# (the run's own conclusion decides, not the watch: on a loaded machine `gh run watch` can end by itself with the run
# still going or green, and the Nightly of places-water-done was read as failed that way, 2026-11-15)
passed() {
  local c
  for _ in $(seq 1 40); do
    gh run watch "$1" -R "$repo" --interval 60 --exit-status < /dev/null > /dev/null 2>&1 && return 0
    c=$(gh run view "$1" -R "$repo" --json status,conclusion --jq '"\(.status) \(.conclusion)"' < /dev/null 2> /dev/null) || c=""
    case "$c" in "completed success") return 0 ;; completed*) return 1 ;; esac
    sleep 30
  done
  return 1
}
runs() { gh run list -R "$repo" --branch "$branch" --event pull_request --commit "$commit" --json databaseId,workflowName --jq '.[] | "\(.databaseId) \(.workflowName)"'; }
if [ -n "$go" ]; then
  # (the list taken whole first: grep stopping at its first match would cut the pipe, and under pipefail that reads as no CI
  # run)
  for _ in $(seq 1 30); do sleep 20; grep -q ' CI$' <<< "$(runs)" && break; done
  grep -q ' CI$' <<< "$(runs)" || { echo "no CI run on the PR after 10 minutes: not tagged, not merged"; exit 1; }
  # (the other workflows register within seconds of CI)
  sleep 30
  failed=""
  while read -r id name; do
    echo "waiting for $name (run $id)"
    # (< /dev/null: the loop's own list is on stdin, and a run skipped there would be a release not waited for)
    passed "$id" || failed="$failed; $name (run $id)"
  done <<< "$(runs)"
  [ -z "$failed" ] || { echo "the PR's runs failed${failed#;}: not tagged, not merged"; exit 1; }
else
  echo "+ gh run watch --exit-status, each pull_request run on $branch at ${commit:0:7}"
fi

say "3. Tag, then merge as a merge commit"
[ -n "$tagged" ] || run git tag -a "$tag" "$commit" -m "$tag"
run git push origin "refs/tags/$tag"
if [ -n "$go" ]; then
  gh pr merge "$pr" -R "$repo" --merge
  merge=$(gh pr view "$pr" -R "$repo" --json mergeCommit --jq .mergeCommit.oid)
  echo "merged as ${merge:0:7}"
else
  echo "+ gh pr merge <pr> --merge"
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
