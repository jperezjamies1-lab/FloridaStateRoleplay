# FSRP Staff Command Suite 4.0.0

The Staff Command Suite is an original Florida State Roleplay system. It is inspired by common roleplay-management workflows, but it does not copy proprietary Melonly, Ducky, Sonoran, or Anchor CAD code or layouts.

## Access flow

1. Open `#staff-ops`.
2. Sign in using a Staff Operations account or shared role code.
3. Open `#command-suite`.
4. The same signed eight-hour Staff Operations session is used automatically.

No extra Command Suite password is required.

## Panels

### Live Staff Overlay

- Reads the official ER:LC player roster through `ERLC_SERVER_KEY`.
- Syncs the staff member's Roblox username, callsign, team, permission, street, building, and postal.
- Opens a compact external pop-out window with quick moderation buttons.
- The overlay is external. It does not inject into, modify, or exploit Roblox/ER:LC.
- Browser pop-outs are not guaranteed to stay above Roblox. Use the operating system's window controls or a second display/device.

### ER:LC Mod Panel

Role permissions:

- Staff: private message, warning, refresh.
- Supervisor: Staff actions plus heal, kick, jail, wanted, and unwanted.
- HR: Supervisor actions plus ban and unban.
- Admin: all actions plus permission commands and raw ER:LC commands.

All actions:

- Run server-side through the official ER:LC command endpoint.
- Are saved to `SITE_SETTINGS` under `fsrp_command_suite_v1`.
- Can be delivered to Discord.
- Are recorded in the permanent Command Suite audit log.

### FSRP Watchdog

Watchdog uses evidence-first review. It can compare:

- Large location jumps between official API snapshots.
- Rapid kill-log bursts.
- Dangerous staff commands used by a player not present in the API staff list.
- Staff-submitted screenshots and descriptions.

Important limitations:

- ER:LC does not provide a direct `flying`, `flinging`, or `passenger driving` field.
- The vehicle list does not expose which seat a player occupies.
- A respawn, teleport by staff, API delay, or game bug can resemble cheating.
- One signal creates a review alert, not an automatic punishment.

### Optional high-confidence automatic ban

Automatic bans are OFF by default.

To enable them, add these encrypted Production variables:

```text
WATCHDOG_AUTO_BAN_ENABLED=true
WATCHDOG_AUTO_BAN_THRESHOLD=95
```

The backend only attempts an automatic ban when all of these are true:

1. The combined score reaches the threshold.
2. At least two different signal categories exist.
3. One signal is a strong kill-burst or command-abuse signal.
4. The player is not recognized in the official ER:LC staff lists.
5. `WATCHDOG_AUTO_BAN_ENABLED` is exactly `true`.

Keep review-first mode until thresholds have been tested on real sessions.

### Always-on Watchdog

The website includes an optional separate Worker:

```text
workers/watchdog-cron.js
wrangler.watchdog.example.toml
```

It can call the Watchdog once per minute even when no staff browser is open.

Pages project secret:

```text
WATCHDOG_CRON_TOKEN=<long random value>
```

Worker secrets:

```text
FSRP_SITE_URL=https://your-domain.example
WATCHDOG_CRON_TOKEN=<same long random value>
```

Deploy the Worker separately using `wrangler.watchdog.example.toml`. Do not replace the Pages project's `wrangler.toml` with it.

### Community Automation

Community automation is managed through the Community Management Suite. It supports application workflows, review queues, Discord delivery, role assignment, giveaways, verification, and analytics.

## Required existing settings

```text
SITE_SETTINGS KV binding
STAFF_SESSION_SECRET
STAFF_PANEL_CODE
STAFF_SUPERVISOR_CODE
STAFF_HR_CODE
ERLC_SERVER_KEY
```

`ADMIN_TOKEN` can also provide Admin Staff Operations access.

## Optional Discord webhooks

```text
DISCORD_MODERATION_WEBHOOK
DISCORD_WATCHDOG_WEBHOOK
```

When a specific webhook is missing, `DISCORD_STAFF_WEBHOOK` is used as the fallback.

## Screenshot evidence

Watchdog screenshot evidence uses the existing Staff Operations upload endpoint. Permanent uploads require:

```text
MEDIA_BUCKET
```

Without R2, local preview can display a temporary image but cannot preserve it after refresh.

## Storage keys

No new KV namespace is required.

```text
fsrp_staff_operations_v1  Staff Operations
fsrp_cad_state_v2         CAD / MDT
fsrp_command_suite_v1     Command Suite, Watchdog, moderation audit
```
