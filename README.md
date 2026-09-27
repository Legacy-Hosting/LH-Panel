# Legacy Hosting Panel

Customer control panel for Legacy Hosting. The production build is static and talks to `LH-API` through `VITE_API_URL`.

During the SSO migration, an authorization request that needs the existing passkey login redirects to Panel with `sso_interaction`. After authentication, Panel asks the API for a one-time ticket and POSTs it to the completion endpoint under the exact `VITE_SSO_ISSUER` origin. SSO and OIDC client secrets remain server-side.

Normal sign-in can start the API-hosted OIDC Authorization Code Flow with PKCE. The static Panel validates the authorization origin before navigation; LH-API owns state, nonce, code exchange, ID-token validation, and the resulting HttpOnly Panel session. The existing passkey button remains available during parallel migration.

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
