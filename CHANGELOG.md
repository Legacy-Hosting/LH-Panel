# Changelog

## 1.1.3 — 2026-10-06

- Normalize package-manager lock metadata for clean, reproducible Linux release builds.
- Check that CI leaves release inputs unchanged and report changed paths when the release clean-worktree gate fails.
- Include the separate-process hostname fixes and dependency security update from 1.1.2, whose release build was blocked before signing or deployment.

## 1.1.2 — 2026-10-06

- Explain full-hostname requirements for additional public Web/API processes.
- Report saved settings separately from incomplete DNS/proxy setup and provide retry guidance.
- Display actionable errors for unconnected Cloudflare zones, hostname conflicts and shared-alias misuse.
- Add desktop/mobile regression coverage for separate-hostname edits and provisioning warnings.
- Update the transitive build dependency `source-map-js` to 1.2.2 to resolve GHSA-68fv-2mgg-jv7q and pass the release security gate.
