# Florida State Roleplay Website V4 — Setup

## Upload

Upload every file and folder in this package directly to the root of the GitHub `main` branch. `index.html`, `functions`, `css`, `js`, and `assets` must all be at repository root.

## Cloudflare Pages build settings

- Framework preset: **None**
- Production branch: **main**
- Build command: `exit 0`
- Build output directory: `.`
- Root directory: leave blank

## Why there is no `wrangler.toml`

This package intentionally uses Cloudflare Dashboard-managed bindings. That fixes the message saying bindings are managed through `wrangler.toml`. Add resources in **Workers & Pages → your Pages project → Settings → Bindings**.

An optional `wrangler.example.toml` is included for advanced config-as-code use. Do not rename it until real namespace IDs replace every placeholder.

## Required KV bindings

Create two Workers KV namespaces, then connect them to the Pages project:

| Binding variable | Purpose |
|---|---|
| `SITE_SETTINGS` | Manager content, server status, and presence snapshots |
| `CAD_STATE` | CAD calls, units, reports, records, radio, citations, and warrants |

Redeploy after adding bindings.

## Required encrypted secrets

Add these in **Settings → Variables and Secrets**, with **Encrypt** enabled:

- `ADMIN_TOKEN` — Website Administrator passcode
- `OPERATIONS_TOKEN` — Operations-only status passcode
- `AUTH_SECRET` — random 64-character signing secret
- `CAD_TOKEN_SECRET` — a different random signing secret
- `CAD_FBI_CODE` — FBI CAD login code
- `CAD_FHP_CODE` — FHP CAD login code
- `CAD_FFW_CODE` — FFW CAD login code
- `CAD_STAFF_CODE` — Staff Team CAD login code

Generate signing secrets on macOS with:

```bash
openssl rand -hex 32
```

Run it twice and use different results.

## Optional media uploads

Create an R2 bucket and bind it as `MEDIA_BUCKET`. Without R2, direct URLs and local previews still work, but local `blob:` previews cannot be published to KV.

## Optional live streamer APIs

### YouTube

Add `YOUTUBE_API_KEY`. In Website Manager, add each creator's YouTube Channel ID. The dashboard checks for a current live broadcast and only lights up when the title or description matches one of the FSRP keywords.

### Twitch

Create a Twitch developer application and add:

- `TWITCH_CLIENT_ID`
- `TWITCH_CLIENT_SECRET`

Enter each creator's Twitch username in Website Manager.

### TikTok

TikTok creators are controlled with the Manager **Manual Live** switch. The official TikTok LIVE embed requires separate TikTok approval and an approved website domain, so the package does not scrape TikTok or use an unofficial detector.

## Waiting music

The maintenance and service-recovery screens include original browser-generated ambient music. Visitors must press **Play Waiting Music** once because browsers block unrequested audio. You may also provide your own direct MP3, WAV, or OGG URL in Manager.

## Manager roles

- **Admin:** can publish the complete website and upload to R2.
- **Operations:** can publish only Server Status.
- **Local Preview:** saves changes only in that browser.

## CAD notes

The CAD is for FBI, FHP, FFW, and Staff Team. CIV and Fire Department are not whitelisted CAD agencies. Bodycam and dashcam require HTTPS and browser permission. Recordings download locally and are not uploaded automatically.
