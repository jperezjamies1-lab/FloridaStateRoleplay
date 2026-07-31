# Emergency Maintenance Reset

The website now ignores old maintenance settings unless both of these values are explicitly enabled in the current Manager:

- `maintenance.enabled = true`
- `maintenance.publicLockConfirmed = true`

Old Cloudflare KV content does not contain the new confirmation value, so it can no longer trap the public website.

## Immediate bypass

Open either of these URLs:

- `https://YOUR-DOMAIN/#manager`
- `https://YOUR-DOMAIN/?maintenance=off`

The maintenance screen also includes a **Continue to Website** button.

## Turn maintenance off permanently

1. Open Manager.
2. Go to **Theme & Sound**.
3. Set **Maintenance mode** to **Off**.
4. Set **Confirm public lock** to **No — keep website open**.
5. Select **Publish to Cloud**.

## Cloudflare cache

After deploying this fixed package, create a new deployment and force-refresh the page with `Command + Shift + R`.
