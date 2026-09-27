#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -ne 0 || $# -ne 1 || ! $1 =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$ ]]; then
  echo "Usage as root: $0 VERSION" >&2
  exit 2
fi
base=/opt/legacy-hosting/panel
target="$base/releases/$1"
if [[ ! -f $target/dist/index.html ]]; then
  echo "Panel release does not exist: $target" >&2
  exit 1
fi
current=$(readlink -f "$base/current" 2>/dev/null || true)
if [[ -n $current && $current == "$base/releases/"* && -d $current ]]; then
  ln -sfn "$current" "$base/previous"
fi
ln -sfn "$target" "$base/current"
ln -sfn "$base/current/dist" /var/www/legacy-hosting-panel
nginx -t
systemctl reload nginx
curl --fail --silent --show-error --retry 5 --retry-delay 2 \
  --resolve panel.legacyhosting.xyz:443:127.0.0.1 \
  https://panel.legacyhosting.xyz/ >/dev/null
printf '%s\n' "$1" > "$base/current-release"
echo "LH-Panel rolled back to $1."
