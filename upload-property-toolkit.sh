#!/usr/bin/env bash
set -euo pipefail
# Run from the root of cardopoli/enricopolicardo.com after placing this script beside property-toolkit-conversation.zip.
if [[ ! -d .git || ! -f assets/js/directory.js || ! -f admin/config.json ]]; then
  echo 'Run this from the root of the enricopolicardo.com Git repository.' >&2
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo 'Working tree has uncommitted changes. Commit or stash them first.' >&2
  exit 1
fi
ZIP="${1:-property-toolkit-conversation.zip}"
[[ -f "$ZIP" ]] || { echo "Cannot find $ZIP" >&2; exit 1; }
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
unzip -q "$ZIP" -d "$TMP"
# Apply against the current repository, stopping if any patch context conflicts.
git apply --check "$TMP/export/property-toolkit.patch"
git apply "$TMP/export/property-toolkit.patch"
git diff --check
python3 -m json.tool admin/config.json >/dev/null
node --check assets/js/directory.js
python3 - "$PWD/tools/property-toolkit.html" <<'PY'
import sys
from html.parser import HTMLParser
class Check(HTMLParser):
    pass
Check().feed(open(sys.argv[1], encoding='utf-8').read())
print('HTML parser check passed')
PY
git add admin/config.json assets/js/directory.js index.html tools/property-toolkit.html
git commit -m 'Add property toolkit and integrate directory and CMS'
git push origin HEAD
printf '\nPublished commit: '
git rev-parse --short HEAD
