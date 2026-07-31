# FSRP Setup

Use `DEPLOY-4.2.0.md` as the main deployment guide.

The most important rules are:

1. Put `index.html`, `functions`, `js`, `css`, `assets`, `_headers`, `_routes.json`, and `wrangler.toml` at the repository root.
2. Keep secret values only in Cloudflare Production secrets.
3. The main website uses the existing `SITE_SETTINGS` KV namespace. Separate CAD, Staff, Command Suite, and Community Suite KV namespaces are not required.
4. Deploy `wrangler.radio.toml`, `wrangler.discord.example.toml`, `wrangler.automation.example.toml`, and `wrangler.watchdog.example.toml` only for the optional Workers you plan to use.
5. Test `/api/platform-readiness` after every secret or binding change and redeploy Pages.
