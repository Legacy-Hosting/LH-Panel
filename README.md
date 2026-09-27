# Legacy Hosting Panel

Customer control panel for Legacy Hosting. The production build is static and talks to `LH-API` through `VITE_API_URL`.

## Development

```bash
pnpm install
pnpm dev
```

## Release artifacts

Tags named `v*` run verification and place the immutable archive in `LH-Releases/LH-Panel`. Its SHA-256 checksum is stored separately in `LH-Releases/LH-Panel/SHA256`.
