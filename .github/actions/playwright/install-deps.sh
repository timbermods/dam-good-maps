#!/usr/bin/env bash
# Installs the system libraries Playwright's browsers need (`npx playwright install-deps <browsers>`), and survives
# a mirror that does not answer. The runner's apt reads a mirror list (/etc/apt/apt-mirrors.txt) whose first entry is
# azure.archive.ubuntu.com; on 2026-11-11 that name stopped resolving for hours and every browser job died here.
# Three tries: after a failed one the Azure mirror is taken off the list, so apt goes to archive.ubuntu.com and
# security.ubuntu.com, and the next try waits a little longer. What each name resolves to is printed, for the log.
#
# The downloaded .deb files are kept in ~/.cache/apt-archives, which action.yml saves with the browsers: apt's archive
# folder is pointed there (an apt.conf.d file, written before the install) and apt is told to keep what it downloads. A
# job that restores the cache finds every package on disk, so `apt-get update` is the only mirror traffic and the install
# takes seconds on any mirror (on 2026-11-18 one slow mirror spent 21.6 minutes downloading them). apt runs as root, so
# when the script ends the folder goes back to the runner user, who has to read it to save the cache.
set -u
ARCHIVES="$HOME/.cache/apt-archives"
mkdir -p "$ARCHIVES/partial"
trap 'sudo chown -R "$(id -u):$(id -g)" "$ARCHIVES"' EXIT
sudo tee /etc/apt/apt.conf.d/99dgm-archive-cache >/dev/null <<EOF
Dir::Cache::Archives "$ARCHIVES";
APT::Keep-Downloaded-Packages "true";
EOF
for try in 1 2 3; do
  if npx playwright install-deps "$@"; then exit 0; fi
  echo "::warning::playwright install-deps failed (try $try of 3)"
  for host in azure.archive.ubuntu.com archive.ubuntu.com security.ubuntu.com; do
    echo "$host -> $(getent hosts "$host" | head -1 || true)"
  done
  if [ -f /etc/apt/apt-mirrors.txt ]; then
    sudo sed -i '/azure\.archive\.ubuntu\.com/d' /etc/apt/apt-mirrors.txt
    echo "mirror list now:"; cat /etc/apt/apt-mirrors.txt
  fi
  sleep $((try * 20))
done
echo "::error::the system libraries could not be installed after three tries"
exit 1
