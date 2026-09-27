#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${LH_ROLLBACK_TEST_CONTAINER:-} != 1 || ${EUID} -ne 0 ]]; then
  echo "Run only as root inside the isolated rollback test container" >&2
  exit 2
fi

repository_root=$(cd "$(dirname "$0")/.." && pwd)
base=/opt/legacy-hosting/panel
fake_bin=$(mktemp -d)
trap 'rm -rf -- "$fake_bin"' EXIT
export PATH="$fake_bin:$PATH"

cat > "$fake_bin/curl" <<'SCRIPT'
#!/usr/bin/env bash
if [[ ${FAIL_ROLLBACK:-0} == 1 ]]; then
  exit 1
fi
exit 0
SCRIPT
for command in nginx systemctl; do
  cat > "$fake_bin/$command" <<'SCRIPT'
#!/usr/bin/env bash
exit 0
SCRIPT
done
chmod 0755 "$fake_bin"/*

for version in 1.0.0 1.1.0; do
  release="$base/releases/$version"
  mkdir -p "$release/dist"
  printf '%s\n' "$version" > "$release/dist/index.html"
done
mkdir -p /var/www
ln -s "$base/releases/1.1.0" "$base/current"
ln -s "$base/releases/1.0.0" "$base/previous"
ln -s "$base/current/dist" /var/www/legacy-hosting-panel
printf '1.1.0\n' > "$base/current-release"

if FAIL_ROLLBACK=1 bash "$repository_root/ops/scripts/rollback-release.sh" 1.0.0 >/dev/null 2>&1; then
  echo "Failed Panel rollback unexpectedly succeeded" >&2
  exit 1
fi
[[ $(readlink -f "$base/current") == "$base/releases/1.1.0" ]]
[[ $(readlink -f /var/www/legacy-hosting-panel) == "$base/releases/1.1.0/dist" ]]
[[ $(cat "$base/current-release") == 1.1.0 ]]

bash "$repository_root/ops/scripts/rollback-release.sh" 1.0.0
[[ $(readlink -f "$base/current") == "$base/releases/1.0.0" ]]
[[ $(readlink -f "$base/previous") == "$base/releases/1.1.0" ]]
[[ $(readlink -f /var/www/legacy-hosting-panel) == "$base/releases/1.0.0/dist" ]]
[[ $(cat "$base/current-release") == 1.0.0 ]]

printf '9.9.9\n' > "$base/current-release"
if bash "$repository_root/ops/scripts/verify-release.sh" >/dev/null 2>&1; then
  echo "Panel verification accepted a stale release marker" >&2
  exit 1
fi
printf '1.0.0\n' > "$base/current-release"
bash "$repository_root/ops/scripts/verify-release.sh"

echo "Panel transactional rollback integration test passed"
