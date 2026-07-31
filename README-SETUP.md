# Florida State Roleplay V3 Enhanced — Setup Guide

## 1. Upload the package

Extract the ZIP. Upload every file and folder inside it directly to the root of the GitHub repository. Do not upload the ZIP itself and do not place the files inside an extra folder.

The root should visibly contain:

- `index.html`
- `wrangler.toml`
- `_headers`
- `_routes.json`
- `assets/`
- `css/`
- `js/`
- `functions/`

## 2. Cloudflare Pages settings

Use:

```text
Production branch: main
Framework preset: None
Build command: exit 0
Build output directory: .
Root directory: blank
```

The included `wrangler.toml` preserves the working V3 KV namespace:

```text
SITE_SETTINGS → d5253d8c54c54cb19f08b3bc3b61e90e
```

The CAD stores its data under `fsrp_cad_state_v2` inside that same namespace. A separate `CAD_STATE` binding is optional and is not required.

## 3. Variables and encrypted secrets

Open the Cloudflare Pages project and add encrypted secrets.

### Website Manager

```text
ADMIN_TOKEN
OPERATIONS_TOKEN
```

`ADMIN_TOKEN` unlocks the complete Website Manager. `OPERATIONS_TOKEN` only allows operational status publishing.

Optional:

```text
AUTH_SECRET
```

When `AUTH_SECRET` is missing, this build signs Manager sessions using the existing Admin/Operations secret. A separate random `AUTH_SECRET` is still recommended.

### Roleplay CAD

```text
CAD_FBI_CODE
CAD_FHP_CODE
CAD_OCSO_CODE
CAD_FFW_CODE
CAD_STAFF_CODE
```

For official live ER:LC server synchronization, also add:

```text
ERLC_SERVER_KEY
```

Get the key from your ER:LC private server settings after purchasing the ER:LC API server pack. Keep it encrypted in Cloudflare Production; never place it in GitHub or browser JavaScript.

These are the private department login codes members type into the CAD.

Optional:

```text
CAD_TOKEN_SECRET
```

When `CAD_TOKEN_SECRET` is missing, the CAD securely falls back to `AUTH_SECRET`, `ADMIN_TOKEN`, or `OPERATIONS_TOKEN` for session signing.

### Streamer Live Dashboard

YouTube automatic LIVE detection:

```text
YOUTUBE_API_KEY
```

Twitch automatic LIVE detection:

```text
TWITCH_CLIENT_ID
TWITCH_CLIENT_SECRET
```

TikTok uses the Manager's Manual Live switch unless an approved TikTok integration is connected.

### Optional staff presence sync

```text
PRESENCE_SYNC_TOKEN
```

## 4. Maintenance mode

Maintenance starts disabled. It only blocks the public website when both settings are true:

```text
Maintenance Mode: On
Confirm Public Lock: Yes
```

The safety version is `3`. Any old cloud or browser setting with an earlier safety version is automatically changed to maintenance off.

Emergency access:

```text
https://YOUR-DOMAIN/?maintenance=off
https://YOUR-DOMAIN/#manager
```

The maintenance screen also has a permanent **Continue to Website** button.

## 5. First deployment check

After Cloudflare finishes:

1. Open the site in an incognito/private window.
2. Confirm the cinematic intro appears.
3. Confirm the intro finishes and the home page opens.
4. Confirm the moving ticker appears.
5. Open Staff and verify no code appears as text.
6. Open Roleplay CAD and confirm the login panel appears.
7. Open `#manager` and test Local Preview Mode.
8. Sign in using the Admin token and publish one harmless change.

## 6. Do not publish secrets

Never place real tokens or department codes in GitHub, `index.html`, JavaScript, screenshots, or public documents.
