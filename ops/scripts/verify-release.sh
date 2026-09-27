#!/usr/bin/env bash
set -Eeuo pipefail

base=/opt/legacy-hosting/panel
test -L "$base/current"
test -f "$base/current-release"
test -f /var/www/legacy-hosting-panel/index.html
current_release=$(readlink -f "$base/current")
recorded_release=$(cat "$base/current-release")
if [[ $recorded_release != "$(basename "$current_release")" ]]; then
  echo "Panel current-release marker does not match the current symlink" >&2
  exit 1
fi
if [[ $current_release != "$base/releases/"* ]]; then
  echo "Panel current symlink points outside the release directory" >&2
  exit 1
fi
nginx -t
curl --fail --silent --show-error \
  --resolve panel.legacyhosting.xyz:443:127.0.0.1 \
  https://panel.legacyhosting.xyz/ >/dev/null
echo "LH-Panel release verification passed for $(cat "$base/current-release")."
