# FSRP V4 Production Deployment

Upload every file and folder in this package to the root of the GitHub repository.

Cloudflare Pages settings:
- Production branch: main
- Framework preset: None
- Build command: exit 0
- Build output directory: .
- Root directory: blank

The Pages configuration and SITE_SETTINGS KV binding are managed by wrangler.toml.
Never put secret values in GitHub.
