#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -ne 0 || $# -ne 4 ]]; then
  echo "Usage as root: $0 ARCHIVE CHECKSUM SIGNATURE VERSION" >&2
  exit 2
fi
version=$4
if [[ ! $version =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$ ]]; then
  echo "Invalid Panel release version" >&2
  exit 1
fi
verifier=/usr/local/lib/legacy-hosting-ops/verify-release-artifact.sh
public_key=/etc/legacy-hosting/release-keys/lh-panel.pub
if [[ ! -x $verifier || ! -r $public_key ]]; then
  echo "Panel release verifier or pinned public key is not installed" >&2
  exit 1
fi
"$verifier" "$public_key" "$1" "$2" "$3"
archive=$(readlink -f "$1")

base=/opt/legacy-hosting/panel
release="$base/releases/$version"
if [[ -e $release ]]; then
  echo "Panel release already exists: $release" >&2
  exit 1
fi
for certificate_file in fullchain.pem privkey.pem; do
  if [[ ! -r /etc/letsencrypt/live/panel.legacyhosting.xyz/$certificate_file ]]; then
    echo "Missing TLS certificate file for panel.legacyhosting.xyz" >&2
    exit 1
  fi
done
install -d -m 0755 "$base/releases" /var/www
staging=$(mktemp -d "$base/releases/.staging-${version}.XXXXXX")
trap 'rm -rf -- "$staging"' EXIT
tar -xzf "$archive" --no-same-owner --strip-components=1 -C "$staging"
for path in dist/index.html ops/nginx/panel.legacyhosting.xyz.conf; do
  if [[ ! -e "$staging/$path" ]]; then
    echo "Panel release is missing $path" >&2
    exit 1
  fi
done
chown -R root:root "$staging"
chmod 0755 "$staging"
mv "$staging" "$release"
trap - EXIT

previous=
if [[ -L $base/current ]]; then
  previous=$(readlink -f "$base/current" 2>/dev/null || true)
  if [[ -n $previous && $previous == "$base/releases/"* && -d $previous ]]; then
    ln -sfn "$previous" "$base/previous"
  else
    echo "Current Panel symlink points outside the release directory" >&2
    exit 1
  fi
elif [[ -e $base/current ]]; then
  echo "$base/current must be a release symlink" >&2
  exit 1
fi
ln -sfn "$release" "$base/current"
ln -sfn "$base/current/dist" /var/www/legacy-hosting-panel

rollback_on_error() {
  if [[ -n $previous && -d $previous ]]; then
    ln -sfn "$previous" "$base/current"
    ln -sfn "$base/current/dist" /var/www/legacy-hosting-panel
  else
    rm -f -- "$base/current" /var/www/legacy-hosting-panel
  fi
}
trap rollback_on_error ERR
install -m 0644 "$release/ops/nginx/panel.legacyhosting.xyz.conf" \
  /etc/nginx/sites-available/panel.legacyhosting.xyz.conf
ln -sfn /etc/nginx/sites-available/panel.legacyhosting.xyz.conf \
  /etc/nginx/sites-enabled/panel.legacyhosting.xyz.conf
nginx -t
systemctl reload nginx
curl --fail --silent --show-error --retry 5 --retry-delay 2 \
  --resolve panel.legacyhosting.xyz:443:127.0.0.1 \
  https://panel.legacyhosting.xyz/ >/dev/null
trap - ERR

printf '%s\n' "$version" > "$base/current-release"
echo "LH-Panel $version deployed and verified."
