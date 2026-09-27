# Legacy Hosting Panel

Customer control panel for Legacy Hosting. The production build is static and talks to `LH-API` through `VITE_API_URL`.

## Development

```bash
pnpm install
pnpm dev
```

## Release artifacts

Tags named `v*` run verification and place the immutable archive in `LH-Releases/LH-Panel`. Its SHA-256 checksum is stored separately in `LH-Releases/LH-Panel/SHA256`.

The archive contains the service-owned Nginx, deploy, rollback, and verification scripts. On `ams3-panel-01`, deploy it as root with:

```bash
ops/scripts/deploy-release.sh ARCHIVE CHECKSUM VERSION
```

Releases are stored below `/opt/legacy-hosting/panel/releases`; the active static build is exposed through `/var/www/legacy-hosting-panel`. The Panel does not require PM2.
