# Optional Always-On Watchdog Worker

The normal Command Suite refreshes while an authorized staff member has the Command Suite open. For ongoing one-minute scans, deploy the included Worker separately.

## 1. Pages project

Add an encrypted Production secret:

```text
WATCHDOG_CRON_TOKEN
```

Generate a value on macOS/Linux:

```bash
openssl rand -hex 32
```

Redeploy the Pages project after saving it.

## 2. Worker project

Use:

```text
workers/watchdog-cron.js
wrangler.watchdog.example.toml
```

Add Worker secrets:

```text
FSRP_SITE_URL
WATCHDOG_CRON_TOKEN
```

`FSRP_SITE_URL` must be the deployed website origin, with no path, such as:

```text
https://florida-state-roleplay.pages.dev
```

The Worker token must exactly match the Pages token.

## 3. Cron schedule

The example uses:

```toml
[triggers]
crons = ["* * * * *"]
```

This runs once per minute.

## 4. Automatic bans

Always-on scanning does not automatically mean automatic bans. Bans remain disabled unless the Pages project also has:

```text
WATCHDOG_AUTO_BAN_ENABLED=true
WATCHDOG_AUTO_BAN_THRESHOLD=95
```

Use review-first mode until the server has collected enough normal-session data to choose reliable thresholds.
