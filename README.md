# Legacy Hosting Panel

Customer control panel for Legacy Hosting. The production build is static and talks to `LH-API` through `VITE_API_URL`.

During the SSO migration, an authorization request that needs the existing passkey login redirects to Panel with `sso_interaction`. After authentication, Panel asks the API for a one-time ticket and POSTs it to the completion endpoint under the exact `VITE_SSO_ISSUER` origin. SSO and OIDC client secrets remain server-side.

Normal sign-in can start the API-hosted OIDC Authorization Code Flow with PKCE. The static Panel validates the authorization origin before navigation; LH-API owns state, nonce, code exchange, ID-token validation, and the resulting HttpOnly Panel session. The existing passkey button remains available during parallel migration.

Sign-out first revokes the HttpOnly Panel session and then follows the API-provided URL only when it matches the configured SSO issuer origin. SSO ends its own browser session and uses signed back-channel logout tokens to revoke remaining Panel and Hub sessions.

## Development

```bash
pnpm install
pnpm dev
```

## Release artifacts

Tags named `v*` run verification and place the immutable archive in `LH-Releases/LH-Panel`. Its SHA-256 checksum is stored in `SHA256`, and its detached Ed25519 signature is stored in `SIGNATURES`. A release fails closed when `RELEASE_SIGNING_PRIVATE_KEY_B64` is unavailable.

The archive contains the service-owned Nginx, deploy, rollback, and verification scripts. On `ams3-panel-01`, deploy it as root with:

```bash
ops/scripts/deploy-release.sh ARCHIVE CHECKSUM SIGNATURE VERSION
```

Releases are stored below `/opt/legacy-hosting/panel/releases`; the active static build is exposed through `/var/www/legacy-hosting-panel`. The Panel does not require PM2.
