# FSRP CAD Login Fix

## Exact Cloudflare secret names

Add these under your Cloudflare Pages project as encrypted secrets:

- `CAD_FBI_CODE`
- `CAD_FHP_CODE`
- `CAD_FFW_CODE`
- `CAD_STAFF_CODE`
- `CAD_TOKEN_SECRET` (recommended) or `AUTH_SECRET`

The CAD accepts one or more department codes. You do not have to configure all four departments at once.

## Important

1. Add the secrets to the **Production** environment for your live `pages.dev` or custom domain.
2. Add them to **Preview** too only when testing a preview deployment.
3. Enter the value without quotation marks.
4. Do not add spaces before or after the value. This build trims accidental outer spaces anyway.
5. Save the secrets and start a new deployment. Existing deployments do not receive newly added secrets automatically.
6. Open `/api/cad` on your website. It will safely show which agencies are configured without revealing any passwords.

Example status URL:

`https://your-site.pages.dev/api/cad`

A working response shows `cadReady: true`.
