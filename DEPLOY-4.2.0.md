# Deploy FSRP Operations Platform 4.2.0

## Main Pages website

Upload the repository contents with these files at the root:

```text
index.html
404.html
_headers
_routes.json
wrangler.toml
assets/
css/
js/
functions/
```

Cloudflare Pages:

```text
Production branch: main
Framework preset: None
Build command: exit 0
Build output directory: .
Root directory: blank
```

The existing `SITE_SETTINGS` KV binding remains in `wrangler.toml`. CAD, Staff Operations, Command Suite, Community Suite, and Watchdog use separate keys inside that one KV namespace.

## Main required Production secrets

```text
ADMIN_TOKEN
OPERATIONS_TOKEN
CAD_TOKEN_SECRET
CAD_FBI_CODE
CAD_FHP_CODE
CAD_OCSO_CODE
CAD_FFW_CODE
CAD_STAFF_CODE
STAFF_PANEL_CODE
STAFF_SUPERVISOR_CODE
STAFF_HR_CODE
STAFF_SESSION_SECRET
```

## Recommended integrations

```text
ERLC_SERVER_KEY
RADIO_WORKER_URL
RADIO_SESSION_SECRET
DISCORD_BOT_TOKEN
DISCORD_GUILD_ID
```

## Optional integrations

```text
TURN_KEY_ID
TURN_API_TOKEN
ROBLOX_OAUTH_CLIENT_ID
ROBLOX_OAUTH_CLIENT_SECRET
ROBLOX_OAUTH_REDIRECT_URI
VERIFICATION_LINK_SECRET
DISCORD_VERIFIED_ROLE_ID
MEDIA_BUCKET
YOUTUBE_API_KEY
TWITCH_CLIENT_ID
TWITCH_CLIENT_SECRET
```

Discord webhook names are listed in `FSRP-OPERATIONS-SECRETS-WORKSHEET.txt`.

## Setup check

After deployment open:

```text
https://YOUR-DOMAIN/api/platform-readiness
```

It reports only true/false readiness and missing variable names. It never displays secret values.

## Optional Workers

- Live radio: `wrangler.radio.toml`
- Discord bot: `wrangler.discord.example.toml`
- Scheduled community automation: `wrangler.automation.example.toml`
- Always-on Watchdog: `wrangler.watchdog.example.toml`

Each is deployed separately so a failure in an optional Worker cannot take down the public website.
