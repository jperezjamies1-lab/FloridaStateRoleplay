# Florida State Roleplay — Setup

This site is one static `index.html` plus Cloudflare Pages Functions in
`/functions`. Deploy it to Cloudflare Pages as-is, then configure the
bindings and secrets below **before** using the Admin panel — nothing
saves globally until these exist.

## 1. Create a KV namespace

In the Cloudflare dashboard: Workers & Pages → KV → Create namespace, e.g.
`fsrp-site-settings`. Then in your Pages project → Settings → Functions →
KV namespace bindings, add:

| Variable name    | KV namespace          |
|-------------------|------------------------|
| `SITE_SETTINGS`   | the namespace you made |

This single namespace stores: the full site state (website settings, theme,
ticker, staff roster, channel links, social links, announcements, server
status — everything the Admin panel edits), the live-counts cache, and the
login rate-limit counters. No D1 database is needed for this project's
scale; KV is simpler and is what the original `settings.js` file already
expected.

## 2. Set secrets

Settings → Environment variables → add these as **secrets** (encrypted),
not plain variables:

| Secret               | Required? | Purpose                                             |
|-----------------------|-----------|------------------------------------------------------|
| `ADMIN_TOKEN`          | **Yes**   | The Admin passcode. Full access to every panel.       |
| `OPERATIONS_TOKEN`     | Optional  | A separate passcode for Session Operations staff — can only publish Server Status, nothing else. |
| `DISCORD_BOT_TOKEN`    | Optional  | Enables automatic Discord member/online counts.       |
| `DISCORD_GUILD_ID`     | Optional  | Your Discord server (guild) ID. Required alongside the bot token. |
| `YOUTUBE_API_KEY`      | Optional  | Enables automatic YouTube subscriber/video counts.     |
| `YOUTUBE_CHANNEL_ID`   | Optional  | Your channel's ID (starts with `UC...`), not the @handle. |
| `ROBLOX_GROUP_ID`      | Optional  | Enables automatic Roblox group member counts. Public API, no key needed — just the numeric group ID. |

If you skip the Discord/YouTube/Roblox secrets, those platforms simply show
"not configured" instead of a live count — the site still works, and admins
can leave the fields blank without errors. TikTok and Instagram have no
public counts API available without an approved developer app, so their
follower numbers are always entered manually in the Social & Live panel.

**Discord specifically works before the bot is added, too.** The Join
Discord button always opens `discord.gg/fosrp` regardless of any of this.
For the live member count, the site tries two independent sources:
1. The Discord bot (`DISCORD_BOT_TOKEN` + `DISCORD_GUILD_ID`) — the
   authoritative source once configured.
2. If the bot isn't set up yet, it automatically falls back to Discord's
   public invite-preview API, which needs no bot in the server at all. This
   gives a real (not fake) member/online count immediately.
3. If neither is available, the card clearly shows "Not Connected" — never
   a placeholder number.

Once you add the bot secrets, the card automatically switches to the
bot-verified count on its next refresh. Nothing else needs to change.

**Getting a Discord bot token:** Discord Developer Portal → New Application
→ Bot → Reset Token. Invite the bot to your server with the
`View Server Insights` permission (no elevated permissions needed — it only
reads member counts).

**Getting your Discord guild ID:** enable Developer Mode in Discord
(User Settings → Advanced), then right-click your server icon → Copy
Server ID.

**Getting a YouTube API key:** Google Cloud Console → APIs & Services →
Credentials → Create API key, then enable the "YouTube Data API v3" for
that project.

## 3. Deploy

Push this project to Cloudflare Pages (Git integration or direct upload).
No build step is required — the output directory is the project root.

## 4. First login

Open the site → the small lock icon in the footer → enter the `ADMIN_TOKEN`
value you set as a secret. That's the same string used for both unlocking
the panel and authorizing saves, so there's nothing else to configure.

## What changed from the previous patch

The prior version's cloud-sync script had a corrupted block (an HTML
fragment had been pasted into the middle of the JavaScript), which broke
it with a syntax error — that is very likely why saves weren't reaching
the server before. This version:

- Fixes that corruption and replaces it with a generic sync layer: any
  `fsrp_`-prefixed value saved in the browser is automatically pushed to
  `/api/settings`, so every Save button in the panel — Website Settings,
  Server Status, Theme, Top Bulletin, Staff Roster, Channels, Social & Live,
  Announcements, custom sections — now persists for every visitor, not just
  the browser that saved it.
- Replaces the client-side passcode hash (crackable offline, since the hash
  shipped in the page source) with server-side verification against your
  `ADMIN_TOKEN`/`OPERATIONS_TOKEN` secrets, with real rate-limiting.
- Adds automatic Discord/Roblox/YouTube counts via `/api/counts` (cached
  5 minutes) instead of manually-typed follower numbers. TikTok stays
  manual since it has no public API.
- Removes the placeholder "CONNECT ACCOUNT" wording; social cards now show
  real link/connection state.
- Fixes a duplicate-settings bug: YouTube/TikTok/Roblox links previously
  had two separate storage locations (Website Settings vs. Social & Live),
  so editing one didn't update the other. They now share one source of
  truth — edit from either tab, every button updates.
- Adds a full Announcements system (title, description, image, up to two
  buttons, priority, pinned) that publishes into the existing Community
  News section, keeping the original three cards as a fallback until you
  publish your first announcement.
