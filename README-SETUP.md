# FSRP V3 Cloudflare Setup

This project is designed for Cloudflare Pages with Pages Functions, one KV namespace, and an optional R2 bucket.

## 1. Deploy the repository

Cloudflare Pages settings:

- Framework preset: **None**
- Build command: leave empty
- Build output directory: `.`
- Production branch: your approved production branch, normally `main`
- Preview branch while testing: `v3-final`

The included `wrangler.toml` already preserves the existing `SITE_SETTINGS` KV namespace binding.

## 2. Required KV binding

Binding name:

```text
SITE_SETTINGS
```

This stores:

- published V3 content
- server-status data
- count API cache and last-known-good values
- rate-limit records
- optional R2 asset metadata index

Do not store uploaded image, video, or audio bytes in KV.

## 3. Environment variables and secrets

Open Cloudflare Pages → your project → Settings → Variables and Secrets.

### Required secret

```text
ADMIN_TOKEN
```

Use a long unique passphrase. It unlocks the complete Website Manager and authorizes content and R2 writes.

### Optional operations secret

```text
OPERATIONS_TOKEN
```

This gives Session Operations limited access to publish server-status information only.

### Optional public count integrations

```text
DISCORD_BOT_TOKEN
DISCORD_GUILD_ID
PRESENCE_SYNC_TOKEN
ROBLOX_GROUP_ID=219522276
YOUTUBE_API_KEY
YOUTUBE_CHANNEL_ID=UCapQbvZpNgdIwbFh09WNKOw
```

Notes:

- The Discord invite fallback can provide approximate server totals even without a bot token when the invite is public.
- Discord totals are not the same as reliable per-member presence.
- `DISCORD_BOT_TOKEN` must remain a Cloudflare secret and must never appear in client JavaScript or GitHub.
- YouTube requires a Google API key with YouTube Data API v3 access.
- Missing integrations safely display an unavailable state.

## 4. Optional R2 Asset Library

Create an R2 bucket, then bind it to the Pages project using:

```text
MEDIA_BUCKET
```

The Manager supports PNG, JPG/JPEG, WEBP, GIF, SVG, MP4, WEBM, MP3, WAV, and OGG files up to 15 MB per upload.

The R2 object is served through:

```text
/api/media?key=<object-key>
```

R2 stores the file bytes. KV stores only the searchable asset metadata.

Do not add a nonexistent bucket to `wrangler.toml`; configure the binding in Cloudflare after creating the bucket.

## 5. Publish content

1. Open the deployed website.
2. Go to **Website Manager**.
3. Enter `ADMIN_TOKEN`.
4. Edit content and review it in the live preview.
5. Export a JSON backup.
6. Press **Publish to Cloud**.
7. Refresh a public page in a private browser window to verify the published result.

The application uses these V3 storage keys inside the Cloud settings object:

```text
fsrp_v3_content
fsrp_v3_status
```

The backend still permits the earlier status key for compatibility:

```text
fsrp_website_manual_status_v1
```

## 6. Staff presence limitation

The public Chain of Command supports:

- Online
- Idle
- Do Not Disturb
- Offline
- Status Unavailable

`Status Unavailable` is the safe default. Cloudflare Pages Functions cannot maintain a persistent Discord Gateway connection by themselves. Reliable live individual presence requires a separate always-on Discord bot or worker that listens to Gateway presence updates.

V3 includes a secure bridge endpoint for that bot:

```text
PUT /api/presence
x-presence-token: <PRESENCE_SYNC_TOKEN>
content-type: application/json

{"members":[{"discordUserId":"123456789012345678","status":"online"}]}
```

Accepted live values are `online`, `idle`, `dnd`, and `offline`. Snapshots expire after ten minutes, and the public site ignores data older than five minutes. The browser polls safely every 90 seconds and pauses when the tab is hidden.

Do not mark a member `Offline` merely because Discord failed to return a status.

## 7. Security checklist

- Keep all tokens in Cloudflare Secrets.
- Do not commit `.env` files or bot tokens.
- Use different Admin and Operations passcodes.
- Rotate a token immediately if it is exposed.
- Restrict Cloudflare project access to trusted owners.
- Export backups before large updates.
- Test Manager authorization after every backend change.

## 8. Test before deployment

```bash
npm test
```

Then manually check:

- desktop and phone navigation
- search and notifications
- every public route
- Manager login and Local Preview
- publishing and refresh persistence
- status editing with Operations access
- R2 upload if configured
- no broken images or browser console errors
