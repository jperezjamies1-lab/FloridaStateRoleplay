# FSRP V3 Deployment Checklist

## Before uploading

- [ ] Keep a copy of the current production ZIP or Git commit.
- [ ] Run `npm test` and confirm every test passes.
- [ ] Confirm `wrangler.toml` still points to the correct `SITE_SETTINGS` namespace.
- [ ] Confirm no token, passcode, API key, or bot secret exists in the files.
- [ ] Review official links in the Manager or `js/config.js`.

## Cloudflare preview

- [ ] Deploy V3 to the `v3-final` preview branch first.
- [ ] Add `ADMIN_TOKEN` to the preview environment.
- [ ] Add `OPERATIONS_TOKEN` when limited status access is needed.
- [ ] Confirm `SITE_SETTINGS` is bound in Preview and Production.
- [ ] Bind optional `MEDIA_BUCKET` R2 storage if browser uploads are needed.
- [ ] Add optional public count variables.
- [ ] Add `PRESENCE_SYNC_TOKEN` only when connecting an always-on Discord Gateway bot.

## Manual QA

- [ ] Home loads without waiting on the API.
- [ ] Navigation never wraps or overlaps.
- [ ] Mobile drawer opens, closes, and returns focus correctly.
- [ ] Search opens with `/` or Ctrl/Command + K and returns useful results.
- [ ] Notification center appears inside the header and marks items read locally.
- [ ] Community tabs work.
- [ ] Server Status uses honest unavailable states.
- [ ] Department filters work.
- [ ] Chain of Command rank filters and counts work.
- [ ] Unknown staff presence says `Status Unavailable`, not `Offline`.
- [ ] Marketplace, Rules, Support, and Manager routes work.
- [ ] Manager Local Preview edits render immediately.
- [ ] Admin publishing survives a page refresh.
- [ ] Operations access cannot publish unrelated website content.
- [ ] Backup export/import works.
- [ ] R2 upload, copy URL, and delete work when configured.
- [ ] Page visibility and maintenance mode behave correctly.
- [ ] Announcement images and action buttons use safe URLs and work correctly.
- [ ] No broken images, horizontal overflow, or console errors.

## Production release

- [ ] Export a final JSON content backup.
- [ ] Approve the preview deployment.
- [ ] Merge or upload the deployment package to the production branch.
- [ ] Verify production Cloudflare bindings and secrets.
- [ ] Purge Cloudflare cache only if stale files remain.
- [ ] Test production in a private browser window and on a phone.
