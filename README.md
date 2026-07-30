# Florida State Roleplay Community Hub V3

A performance-first rebuild of the official Florida State Roleplay website for Cloudflare Pages.

V3 keeps the existing public content and Cloudflare backend, but replaces the oversized single-file page with a modular, responsive community platform. The public site loads immediately from local defaults, then hydrates saved Cloudflare KV content in the background so a slow API cannot hold the whole page hostage.

## What is included

- Cinematic homepage with editable hero, notice bar, official links, live status summary, departments, and calls to action
- Integrated desktop and mobile navigation
- Global search and keyboard command palette
- Notification center generated from published announcements and events
- Rich announcements with optional image, pinning, expiration, and up to two action buttons
- Community Hub with overview, announcements, events, and timeline views
- Mission Control server-status page with honest unavailable states
- Department directory with filters and editable emblems, links, descriptions, and requirements
- Community Platform page preserving the earlier systems, onboarding, and FAQ experience in a cleaner layout
- Chain of Command with rank filters, staff profiles, and five honest presence states
- Marketplace, Rules, and Support pages
- Browser-based Manager panel for routine content updates
- Page visibility controls and maintenance mode
- Automatic browser/cloud migration of the previous V2 hero, links, status, announcements, media, and staff roster when no V3 save exists
- JSON backup/export and restore/import
- Optional Cloudflare R2 media library with upload, copy URL, preview, and delete controls
- Optional UI sounds with a remembered mute and volume preference
- Cloudflare Functions for authentication, content storage, public counts, and media
- Original project preserved in the full backup package under `legacy/`

## Performance changes

The former homepage was roughly 775 KB and more than 10,000 lines before images and other resources were loaded. V3 uses small focused files, no giant inline base64 image payloads, no recurring `setInterval` loops, and no external font dependency. Heavy manager tools are not needed for normal visitors, and Cloudflare content hydration runs after the initial interface is visible.

## Project structure

```text
index.html                 Main V3 application shell
404.html                   Branded not-found page
assets/brand/              Local FSRP and department artwork
css/                       Modular visual system and responsive layouts
js/                        Store, router, UI modules, Manager, search, sounds
functions/api/             Cloudflare Pages Functions
functions/lib/             Shared server helpers
legacy/                    Original project backup (full backup package only)
test_site.mjs              Dependency-free structural test suite
wrangler.toml              Existing Pages + SITE_SETTINGS KV configuration
```

## Local preview

Any static server works. From the project folder:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

The public interface and Local Preview Manager work without Cloudflare. Live Functions, publishing, counts, and R2 uploads require a Cloudflare Pages deployment.

## Testing

```bash
npm test
```

The test suite verifies file references, JavaScript syntax, structural requirements, performance safeguards, Cloudflare storage keys, and other release checks without installing third-party packages.

## Manager access

Open **Website Manager** from the navigation.

- **Cloud manager:** enter the server-side `ADMIN_TOKEN` or `OPERATIONS_TOKEN` configured in Cloudflare.
- **Local Preview Mode:** review and edit content in the browser without cloud publishing.
- Use **Export Backup** before major content changes.
- Local data-image previews cannot be published to KV. Upload the file to R2 first, then use the returned URL.

## Data honesty

V3 never invents member counts, player counts, sessions, events, or staff presence. Missing information is shown as `Unavailable` or `Status Unavailable`.

Per-member Discord presence is not available through a normal one-time REST request. True live staff presence requires a persistent Discord Gateway integration. V3 includes a protected `/api/presence` bridge that an always-on bot can update using `PRESENCE_SYNC_TOKEN`. Until that bridge receives a fresh snapshot, the public site defaults to `Status Unavailable` rather than falsely showing everyone offline.

## Deployment

See [README-SETUP.md](README-SETUP.md) and [DEPLOY-CHECKLIST.md](DEPLOY-CHECKLIST.md).
