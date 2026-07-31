# FSRP V4 Deployment Checklist

- [ ] All package contents uploaded directly to GitHub repository root
- [ ] Production branch is `main`
- [ ] Framework preset is None
- [ ] Build command is `exit 0`
- [ ] Build output directory is `.`
- [ ] Root directory is blank
- [ ] Active `wrangler.toml` is absent unless real IDs were added intentionally
- [ ] KV binding `SITE_SETTINGS` connected
- [ ] KV binding `CAD_STATE` connected
- [ ] `ADMIN_TOKEN`, `OPERATIONS_TOKEN`, and `AUTH_SECRET` added as encrypted secrets
- [ ] `CAD_TOKEN_SECRET` and four department CAD codes added as encrypted secrets
- [ ] Optional `MEDIA_BUCKET` R2 binding connected
- [ ] Optional YouTube/Twitch API secrets added
- [ ] New Cloudflare deployment completed after bindings/secrets were saved
- [ ] Browser force-refreshed with Command + Shift + R
- [ ] Manager login tested
- [ ] CAD login tested
- [ ] Maintenance mode confirmed Off unless intentionally enabled
